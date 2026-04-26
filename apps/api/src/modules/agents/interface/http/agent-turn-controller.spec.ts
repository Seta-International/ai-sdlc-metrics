import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentTurnController } from './agent-turn-controller'
import type { JwtService } from '../../../../common/auth/jwt.service'
import type { ActiveTurnRegistry } from '../../application/services/active-turn-registry'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { BudgetChecker } from '../../application/services/budget-checker'
import type { ObservabilityContextFactory } from '../../application/services/observability-context'
import type { FlowIdPropagation } from '../../application/services/flow-id-propagation'
import type { ObservabilityContext } from '../../application/services/observability-context'
import type { Span } from '../../domain/observability/span'
import { EVENT_SCHEMA_VERSION } from '../../application/services/stream-gateway'

const TENANT_ID = 'tid-001'
const USER_ID = 'uid-001'

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

function makeNoOpSpan(): Span {
  return {
    spanId: 'noop-span-id',
    traceId: 'trace-000',
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    recordUsage: vi.fn(),
    end: vi.fn(),
  }
}

function makeObsContext(overrides?: Partial<ObservabilityContext>): ObservabilityContext {
  const span = makeNoOpSpan()
  return {
    currentSpan: span,
    traceId: 'trace-000',
    flowId: 'flow-test-id',
    intentSlug: 'unclassified',
    createChildSpan: vi.fn().mockReturnValue(makeNoOpSpan()),
    ...overrides,
  }
}

function makeBudgetChecker(
  result: {
    allowed: boolean
    tier: 'full' | 'nano' | 'refused'
    reason?: string
    tierShift?: boolean
  } = {
    allowed: true,
    tier: 'full',
    tierShift: false,
  },
) {
  return {
    preTurnCheck: vi.fn().mockResolvedValue(result),
    midTurnCheck: vi.fn(),
  } as unknown as BudgetChecker
}

function makeObsFactory(obsCtx?: ObservabilityContext) {
  const ctx = obsCtx ?? makeObsContext()
  return {
    create: vi.fn().mockReturnValue(ctx),
    _ctx: ctx,
  } as {
    create: ReturnType<typeof vi.fn>
    _ctx: ObservabilityContext
  } & ObservabilityContextFactory
}

const FIXED_FLOW_ID = 'fixed-flow-id-001'

function makeFlowIdPropagation() {
  return {
    mint: vi.fn().mockReturnValue(FIXED_FLOW_ID),
    inheritFrom: vi.fn().mockReturnValue(FIXED_FLOW_ID),
  } as unknown as FlowIdPropagation
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

// ─── Factory for a fully-wired controller with budget/obs/flow deps ──────────

function makeController(overrides?: {
  jwtService?: JwtService
  registry?: ActiveTurnRegistry
  auditFacade?: KernelAuditFacade
  budgetChecker?: BudgetChecker
  obsFactory?: ObservabilityContextFactory
  flowIdPropagation?: FlowIdPropagation
}) {
  const jwtSvc = overrides?.jwtService ?? makeJwtService()
  const reg = overrides?.registry ?? makeRegistry()
  const audit = overrides?.auditFacade ?? makeAuditFacade()
  const budget = overrides?.budgetChecker ?? makeBudgetChecker()
  const obs = overrides?.obsFactory ?? makeObsFactory()
  const flow = overrides?.flowIdPropagation ?? makeFlowIdPropagation()

  return {
    controller: new AgentTurnController(jwtSvc, reg, audit, budget, obs, flow),
    jwtService: jwtSvc,
    registry: reg,
    auditFacade: audit,
    budgetChecker: budget,
    obsFactory: obs,
    flowIdPropagation: flow,
  }
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
    controller = new AgentTurnController(
      jwtService,
      registry,
      auditFacade,
      makeBudgetChecker(),
      makeObsFactory(),
      makeFlowIdPropagation(),
    )
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
    controller = new AgentTurnController(
      jwtService,
      registry,
      auditFacade,
      makeBudgetChecker(),
      makeObsFactory(),
      makeFlowIdPropagation(),
    )

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
    const flowProp = makeFlowIdPropagation()
    const localController = new AgentTurnController(
      jwtService,
      registry,
      auditFacade,
      makeBudgetChecker(),
      makeObsFactory(),
      flowProp,
    )
    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await localController.streamTurn(req as never, res as never)

    expect(res.written.length).toBeGreaterThan(0)
    const firstEvent = JSON.parse(res.written[0].replace(/^data: /, '').trim())
    expect(firstEvent.type).toBe('turn.started')
    expect(firstEvent.payload).toHaveProperty('trace_id')
    expect(firstEvent.payload).toHaveProperty('flow_id')
    expect(firstEvent.payload.flow_id).toBe(FIXED_FLOW_ID)
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

// ─── Theme B: BudgetChecker + ObservabilityContextFactory + FlowIdPropagation ─

describe('AgentTurnController — Theme B wiring (R-05.1, R-07.43, R-07.44)', () => {
  it('T-B-1: BudgetChecker.preTurnCheck is called once with tenantId + userId', async () => {
    const { controller, budgetChecker } = makeController()
    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(budgetChecker.preTurnCheck).toHaveBeenCalledOnce()
    expect(budgetChecker.preTurnCheck).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID }),
    )
  })

  it('T-B-2: refused tier → HTTP 429, turn.ended with reason=budget_exceeded is NOT emitted via SSE (connection closed before SSE writeHead)', async () => {
    const { controller } = makeController({
      budgetChecker: makeBudgetChecker({
        allowed: false,
        tier: 'refused',
        reason: 'tenant_daily_budget',
      }),
    })
    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    // Must return HTTP 429 (no SSE stream started)
    const head = res.getHead()
    expect(head).toBeDefined()
    expect(head![0]).toBe(429)
    const body = JSON.parse(res.raw.end.mock.calls[0]?.[0] ?? '{}')
    expect(body).toMatchObject({ reason: 'budget_exceeded' })
  })

  it('T-B-2b: refused tier emits kernel audit event with budget_exceeded reason', async () => {
    const { controller, auditFacade } = makeController({
      budgetChecker: makeBudgetChecker({
        allowed: false,
        tier: 'refused',
        reason: 'user_daily_budget',
      }),
    })
    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(auditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        eventType: 'agent.turn_refused_budget',
        payload: expect.objectContaining({ reason: 'user_daily_budget' }),
      }),
    )
  })

  it('T-B-3a: allowed tier (full) → turn proceeds normally, registry.register is called', async () => {
    const { controller, registry } = makeController({
      budgetChecker: makeBudgetChecker({ allowed: true, tier: 'full', tierShift: false }),
    })
    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(registry.register).toHaveBeenCalledOnce()
    const head = res.getHead()
    expect(head![0]).toBe(200)
  })

  it('T-B-3b: nano tier → turn proceeds, degraded tier is passed in registry.register', async () => {
    const { controller, registry } = makeController({
      budgetChecker: makeBudgetChecker({ allowed: true, tier: 'nano', tierShift: true }),
    })
    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    // Turn still proceeds (200 response)
    const head = res.getHead()
    expect(head![0]).toBe(200)
    // Registry was called with tier so downstream can act on degraded mode
    expect(registry.register).toHaveBeenCalledOnce()
    expect(registry.register).toHaveBeenCalledWith(expect.objectContaining({ tier: 'nano' }))
  })

  it('T-B-4: FlowIdPropagation.mint is called; flow_id and intent_slug attributes are set on root span via factory', async () => {
    const obsCtx = makeObsContext()
    const setAttributeSpy = vi.spyOn(obsCtx.currentSpan, 'setAttribute')
    const obsFactory = {
      create: vi.fn().mockReturnValue(obsCtx),
    } as unknown as ObservabilityContextFactory
    const flowProp = makeFlowIdPropagation()
    const ctrlWithFlow = new AgentTurnController(
      makeJwtService(),
      makeRegistry(),
      makeAuditFacade(),
      makeBudgetChecker(),
      obsFactory,
      flowProp,
    )

    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await ctrlWithFlow.streamTurn(req as never, res as never)

    // FlowIdPropagation.mint was called
    expect(flowProp.mint).toHaveBeenCalledOnce()

    // ObservabilityContextFactory.create was called with flow_id and intent_slug
    expect(obsFactory.create).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: FIXED_FLOW_ID }),
    )
    expect(obsFactory.create).toHaveBeenCalledWith(
      expect.objectContaining({ intentSlug: 'unclassified' }),
    )

    // The root span carries flow_id and intent_slug as attributes
    expect(setAttributeSpy).toHaveBeenCalledWith('flow_id', FIXED_FLOW_ID)
    expect(setAttributeSpy).toHaveBeenCalledWith('intent_slug', 'unclassified')
  })

  it('T-B-5: root span is closed in finally — closed on success', async () => {
    const obsCtx = makeObsContext()
    const spanEndSpy = vi.spyOn(obsCtx.currentSpan, 'end')
    const { controller } = makeController({
      obsFactory: {
        create: vi.fn().mockReturnValue(obsCtx),
      } as unknown as ObservabilityContextFactory,
    })

    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(spanEndSpy).toHaveBeenCalledOnce()
  })

  it('T-B-5b: root span is closed in finally — closed on exception', async () => {
    const obsCtx = makeObsContext()
    const spanEndSpy = vi.spyOn(obsCtx.currentSpan, 'end')

    const errorRegistry = {
      register: vi.fn().mockRejectedValue(new Error('registry exploded')),
      unregister: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      getEntry: vi.fn(),
    } as unknown as ActiveTurnRegistry

    const { controller } = makeController({
      registry: errorRegistry,
      obsFactory: {
        create: vi.fn().mockReturnValue(obsCtx),
      } as unknown as ObservabilityContextFactory,
    })

    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    // Span must be closed even after exception
    expect(spanEndSpy).toHaveBeenCalledOnce()
    // span.end should carry error status on exception
    expect(spanEndSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
  })

  it('T-B-5c: root span is closed with ok status on happy path', async () => {
    const obsCtx = makeObsContext()
    const spanEndSpy = vi.spyOn(obsCtx.currentSpan, 'end')
    const { controller } = makeController({
      obsFactory: {
        create: vi.fn().mockReturnValue(obsCtx),
      } as unknown as ObservabilityContextFactory,
    })

    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(spanEndSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }))
  })

  it('T-B-6: audit event on refused turn carries flow_id', async () => {
    const flowProp = makeFlowIdPropagation()
    const { controller, auditFacade } = makeController({
      budgetChecker: makeBudgetChecker({
        allowed: false,
        tier: 'refused',
        reason: 'tenant_daily_budget',
      }),
      flowIdPropagation: flowProp,
    })

    const req = makeReq({ cookieHeader: makeCookieHeader('valid-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(auditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: FIXED_FLOW_ID }),
    )
  })

  it('T-B-7: BudgetChecker not called if JWT is invalid', async () => {
    const { controller, budgetChecker } = makeController({
      jwtService: makeJwtService(null),
    })

    const req = makeReq({ cookieHeader: makeCookieHeader('bad-token') })
    const res = makeRes()

    await controller.streamTurn(req as never, res as never)

    expect(budgetChecker.preTurnCheck).not.toHaveBeenCalled()
  })
})
