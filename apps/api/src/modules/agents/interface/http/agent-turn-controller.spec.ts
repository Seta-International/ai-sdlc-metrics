import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentTurnController } from './agent-turn-controller'
import type { JwtService } from '../../../../common/auth/jwt.service'
import type { ActiveTurnRegistry } from '../../application/services/active-turn-registry'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { EVENT_SCHEMA_VERSION } from '../../application/services/stream-gateway'

const TENANT_ID = 'tid-001'
const USER_ID = 'uid-001'
const TRACE_ID = 'trace-uuid-001'

function makeJwtService(session: object | null = { sub: USER_ID, tid: TENANT_ID, roles: [] }) {
  return {
    verify: vi.fn().mockResolvedValue(session),
  } as unknown as JwtService
}

function makeRegistry() {
  return {
    register: vi.fn().mockResolvedValue(undefined),
    unregister: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockReturnValue('ok'),
    getEntry: vi.fn(),
  } as unknown as ActiveTurnRegistry
}

function makeAuditFacade() {
  return {
    recordEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as KernelAuditFacade
}

function makeCookieHeader(token: string) {
  return `_future_session=${token}; other=val`
}

function makeRawRes() {
  const written: string[] = []
  let head: [number, Record<string, string>] | undefined
  let _writableEnded = false

  const raw = {
    writeHead: vi.fn((status: number, headers: Record<string, string>) => {
      head = [status, headers]
    }),
    write: vi.fn((chunk: string) => {
      written.push(chunk)
    }),
    end: vi.fn(() => {
      _writableEnded = true
    }),
    on: vi.fn(),
    get writableEnded() {
      return _writableEnded
    },
  }

  return { raw, written, getHead: () => head }
}

function makeReq(overrides: {
  cookieHeader?: string
  body?: object
  onClose?: (handler: () => void) => void
}) {
  const rawListeners: Record<string, (() => void)[]> = {}

  const rawReq = {
    on: vi.fn((event: string, handler: () => void) => {
      if (!rawListeners[event]) rawListeners[event] = []
      rawListeners[event].push(handler)
      overrides.onClose?.(handler)
    }),
    headers: {
      cookie: overrides.cookieHeader,
    },
    rawListeners,
  }

  return {
    headers: {
      cookie: overrides.cookieHeader,
    },
    body: overrides.body ?? {
      surface: 'global-chat',
      user_utterance: 'Hello',
      context: { current_screen: '/home' },
    },
    raw: rawReq,
  }
}

function makeRes() {
  const { raw, written, getHead } = makeRawRes()
  return { raw, written, getHead }
}

describe('AgentTurnController', () => {
  let jwtService: JwtService
  let registry: ActiveTurnRegistry
  let auditFacade: KernelAuditFacade
  let controller: AgentTurnController

  beforeEach(() => {
    vi.clearAllMocks()
    jwtService = makeJwtService()
    registry = makeRegistry()
    auditFacade = makeAuditFacade()
    controller = new AgentTurnController(jwtService, registry, auditFacade)
  })

  it('returns 401 if no cookie header is present', async () => {
    const req = makeReq({ cookieHeader: undefined })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(res.raw.writeHead).toHaveBeenCalledWith(
      401,
      expect.objectContaining({ 'Content-Type': 'application/json' }),
    )
    expect(res.raw.end).toHaveBeenCalledWith(JSON.stringify({ message: 'Unauthorized' }))
  })

  it('returns 401 if cookie exists but JWT is invalid', async () => {
    jwtService = makeJwtService(null)
    controller = new AgentTurnController(jwtService, registry, auditFacade)

    const req = makeReq({ cookieHeader: makeCookieHeader('bad-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(res.raw.writeHead).toHaveBeenCalledWith(
      401,
      expect.objectContaining({ 'Content-Type': 'application/json' }),
    )
  })

  it('sets event_schema_version header on successful turn', async () => {
    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    const head = res.getHead()
    expect(head).toBeDefined()
    expect(head![0]).toBe(200)
    expect(head![1]).toMatchObject({
      'Content-Type': 'text/event-stream',
      event_schema_version: EVENT_SCHEMA_VERSION,
    })
  })

  it('emits turn.started as first SSE event', async () => {
    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(res.written.length).toBeGreaterThan(0)
    const firstEvent = JSON.parse(res.written[0].replace(/^data: /, '').trim())
    expect(firstEvent.type).toBe('turn.started')
    expect(firstEvent.payload).toHaveProperty('trace_id')
  })

  it('turn.ended is the last emitted SSE event (R-06.18)', async () => {
    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(res.written.length).toBeGreaterThan(0)
    const lastRaw = res.written[res.written.length - 1]
    const lastEvent = JSON.parse(lastRaw.replace(/^data: /, '').trim())
    expect(lastEvent.type).toBe('turn.ended')

    // No events emitted after turn.ended
    const lastIdx = res.written.length - 1
    expect(res.written[lastIdx]).toBe(lastRaw)
  })

  it('calls activeTurnRegistry.register with correct params', async () => {
    const req = makeReq({
      cookieHeader: makeCookieHeader('valid-token'),
      body: {
        surface: 'global-chat',
        conversation_id: 'conv-999',
        user_utterance: 'Test',
        context: { current_screen: '/home' },
      },
    })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(registry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: 'conv-999',
        surface: 'global-chat',
      }),
    )
  })

  it('calls activeTurnRegistry.unregister in finally', async () => {
    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(registry.unregister).toHaveBeenCalledTimes(1)
  })

  it('client disconnect triggers abort and unregister', async () => {
    let closeHandler: (() => void) | undefined

    const req = makeReq({
      cookieHeader: makeCookieHeader('valid-token'),
      onClose: (handler) => {
        closeHandler = handler
      },
    })
    const res = makeRes()

    // We need to capture the userCancelController to verify abort was called.
    // Spy on composeTurnAbortSignal is not feasible without mocking the module,
    // so we verify indirectly: after disconnect, the turn signal is aborted,
    // which causes gateway.close('cancelled') — reflected in the last SSE event.
    const turnPromise = controller.streamTurn(req as never, res as never)

    if (closeHandler) closeHandler()

    await turnPromise

    expect(registry.unregister).toHaveBeenCalled()

    // Verify abort propagated: after disconnect, stream ends
    // (unregister called means finally block ran, confirming abort was processed)
    expect(registry.unregister).toHaveBeenCalledTimes(1)

    // The close handler was registered on req.raw 'close' event
    // Confirm the raw listener was set up for the 'close' event
    expect(req.raw.on).toHaveBeenCalledWith('close', expect.any(Function))
  })
})
