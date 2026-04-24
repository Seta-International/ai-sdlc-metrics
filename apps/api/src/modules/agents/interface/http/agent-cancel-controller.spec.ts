import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentCancelController } from './agent-cancel-controller'
import type { JwtService } from '../../../../common/auth/jwt.service'
import type { ActiveTurnRegistry, TurnEntry } from '../../application/services/active-turn-registry'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type {
  CrossPodCancelService,
  CrossPodCancelResult,
} from '../../infrastructure/cross-pod-cancel'

const TENANT_ID = 'tid-001'
const USER_ID = 'uid-owner'
const OTHER_USER_ID = 'uid-other'
const TRACE_ID = 'trace-abc-123'

function makeJwtService(session: object | null = { sub: USER_ID, tid: TENANT_ID, roles: [] }) {
  return {
    verify: vi.fn().mockResolvedValue(session),
  } as unknown as JwtService
}

function makeTurnEntry(userId: string = USER_ID): TurnEntry {
  return {
    userId,
    userCancelController: new AbortController(),
    systemAbortController: new AbortController(),
    turnAbortSignal: new AbortController().signal,
    usageAccumulator: {
      input_tokens: 0,
      output_tokens: 0,
      input_cached_read: 0,
      input_cached_write: 0,
      output_reasoning: 0,
    },
    heartbeatTimer: null as never,
  }
}

function makeRegistry(entry?: TurnEntry) {
  return {
    getEntry: vi.fn().mockReturnValue(entry),
    cancel: vi.fn().mockReturnValue('ok'),
    register: vi.fn(),
    unregister: vi.fn(),
  } as unknown as ActiveTurnRegistry
}

function makeKernelQuery(canDo = false) {
  return {
    canDo: vi.fn().mockResolvedValue(canDo),
  } as unknown as KernelQueryFacade
}

function makeAuditFacade() {
  return {
    recordEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as KernelAuditFacade
}

function makeCrossPodCancelService(status: CrossPodCancelResult['status'] = 'not_found') {
  return {
    forwardIfNeeded: vi.fn().mockResolvedValue({ status }),
  } as unknown as CrossPodCancelService
}

function makeCookieHeader(token: string) {
  return `_future_session=${token}; other=val`
}

function makeReq(cookieHeader?: string) {
  return {
    headers: { cookie: cookieHeader },
  }
}

function makeRes() {
  const res = {
    status: vi.fn(),
    send: vi.fn(),
  }
  res.status.mockReturnValue(res)
  res.send.mockReturnValue(res)
  return res
}

describe('AgentCancelController', () => {
  let jwtService: JwtService
  let registry: ActiveTurnRegistry
  let kernelQuery: KernelQueryFacade
  let auditFacade: KernelAuditFacade
  let crossPodCancelService: CrossPodCancelService
  let controller: AgentCancelController

  beforeEach(() => {
    vi.clearAllMocks()
    jwtService = makeJwtService()
    registry = makeRegistry(makeTurnEntry(USER_ID))
    kernelQuery = makeKernelQuery(false)
    auditFacade = makeAuditFacade()
    crossPodCancelService = makeCrossPodCancelService('not_found')
    controller = new AgentCancelController(
      jwtService,
      registry,
      kernelQuery,
      auditFacade,
      crossPodCancelService,
    )
  })

  it('returns 401 if no cookie header is present', async () => {
    const req = makeReq(undefined)
    const res = makeRes()

    await controller.cancelTurn(req as never, res as never, TRACE_ID)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.send).toHaveBeenCalledWith({ message: 'Unauthorized' })
  })

  it('returns 401 if JWT is invalid', async () => {
    jwtService = makeJwtService(null)
    controller = new AgentCancelController(
      jwtService,
      registry,
      kernelQuery,
      auditFacade,
      crossPodCancelService,
    )

    const req = makeReq(makeCookieHeader('bad-token'))
    const res = makeRes()

    await controller.cancelTurn(req as never, res as never, TRACE_ID)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.send).toHaveBeenCalledWith({ message: 'Unauthorized' })
  })

  it('returns 404 for unknown traceId', async () => {
    registry = makeRegistry(undefined)
    controller = new AgentCancelController(
      jwtService,
      registry,
      kernelQuery,
      auditFacade,
      crossPodCancelService,
    )

    const req = makeReq(makeCookieHeader('valid-token'))
    const res = makeRes()

    await controller.cancelTurn(req as never, res as never, 'unknown-trace')

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.send).toHaveBeenCalledWith({ message: 'Turn not found' })
  })

  it('self-cancel (same userId) calls activeTurnRegistry.cancel and returns 200', async () => {
    const req = makeReq(makeCookieHeader('valid-token'))
    const res = makeRes()

    await controller.cancelTurn(req as never, res as never, TRACE_ID)

    expect(registry.cancel).toHaveBeenCalledWith(TRACE_ID)
    expect(res.send).toHaveBeenCalledWith({ cancelled: true })
  })

  it('cross-user cancel without permission returns 403 and records denial audit event', async () => {
    jwtService = makeJwtService({ sub: OTHER_USER_ID, tid: TENANT_ID, roles: [] })
    registry = makeRegistry(makeTurnEntry(USER_ID))
    kernelQuery = makeKernelQuery(false)
    controller = new AgentCancelController(
      jwtService,
      registry,
      kernelQuery,
      auditFacade,
      crossPodCancelService,
    )

    const req = makeReq(makeCookieHeader('valid-token'))
    const res = makeRes()

    await controller.cancelTurn(req as never, res as never, TRACE_ID)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.send).toHaveBeenCalledWith({ message: 'Forbidden' })
    expect(registry.cancel).not.toHaveBeenCalled()
    expect(auditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.turn_force_stopped_attempt_denied',
      }),
    )
  })

  it('cross-user cancel with canDo(agent.force_stop_turn) calls cancel and emits audit event', async () => {
    jwtService = makeJwtService({ sub: OTHER_USER_ID, tid: TENANT_ID, roles: [] })
    registry = makeRegistry(makeTurnEntry(USER_ID))
    kernelQuery = makeKernelQuery(true)
    controller = new AgentCancelController(
      jwtService,
      registry,
      kernelQuery,
      auditFacade,
      crossPodCancelService,
    )

    const req = makeReq(makeCookieHeader('valid-token'))
    const res = makeRes()

    await controller.cancelTurn(req as never, res as never, TRACE_ID)

    expect(registry.cancel).toHaveBeenCalledWith(TRACE_ID)
    expect(auditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: OTHER_USER_ID,
        eventType: 'agent.turn_force_stopped',
        module: 'agents',
        subjectId: TRACE_ID,
        payload: expect.objectContaining({ cancelled_by: expect.any(String) }),
      }),
    )
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true }))
  })

  it('already cancelled turn (not found in registry) returns 404 idempotently', async () => {
    registry = makeRegistry(undefined)
    controller = new AgentCancelController(
      jwtService,
      registry,
      kernelQuery,
      auditFacade,
      crossPodCancelService,
    )

    const req = makeReq(makeCookieHeader('valid-token'))
    const res = makeRes()

    await controller.cancelTurn(req as never, res as never, TRACE_ID)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.send).toHaveBeenCalledWith({ message: 'Turn not found' })
  })

  describe('cross-pod forwarding branch (entry not on this pod)', () => {
    it('forwardIfNeeded returns forwarded → 200 with { cancelled: true, eventual: false }', async () => {
      registry = makeRegistry(undefined)
      crossPodCancelService = makeCrossPodCancelService('forwarded')
      controller = new AgentCancelController(
        jwtService,
        registry,
        kernelQuery,
        auditFacade,
        crossPodCancelService,
      )

      const req = makeReq(makeCookieHeader('valid-token'))
      const res = makeRes()

      await controller.cancelTurn(req as never, res as never, TRACE_ID)

      expect(crossPodCancelService.forwardIfNeeded).toHaveBeenCalledWith(TRACE_ID)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.send).toHaveBeenCalledWith({ cancelled: true, eventual: false })
    })

    it('forwardIfNeeded returns eventual → 202 with { cancelled: true, eventual: true }', async () => {
      registry = makeRegistry(undefined)
      crossPodCancelService = makeCrossPodCancelService('eventual')
      controller = new AgentCancelController(
        jwtService,
        registry,
        kernelQuery,
        auditFacade,
        crossPodCancelService,
      )

      const req = makeReq(makeCookieHeader('valid-token'))
      const res = makeRes()

      await controller.cancelTurn(req as never, res as never, TRACE_ID)

      expect(crossPodCancelService.forwardIfNeeded).toHaveBeenCalledWith(TRACE_ID)
      expect(res.status).toHaveBeenCalledWith(202)
      expect(res.send).toHaveBeenCalledWith({ cancelled: true, eventual: true })
    })

    it('forwardIfNeeded returns not_found → 404', async () => {
      registry = makeRegistry(undefined)
      crossPodCancelService = makeCrossPodCancelService('not_found')
      controller = new AgentCancelController(
        jwtService,
        registry,
        kernelQuery,
        auditFacade,
        crossPodCancelService,
      )

      const req = makeReq(makeCookieHeader('valid-token'))
      const res = makeRes()

      await controller.cancelTurn(req as never, res as never, TRACE_ID)

      expect(crossPodCancelService.forwardIfNeeded).toHaveBeenCalledWith(TRACE_ID)
      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.send).toHaveBeenCalledWith({ message: 'Turn not found' })
    })
  })

  describe('platform_admin cancel branch', () => {
    const PLATFORM_ADMIN_ID = 'uid-platform-admin'

    it('platform_admin with admin.turn.force_stop permission succeeds, calls cancel and records audit event', async () => {
      jwtService = makeJwtService({
        sub: PLATFORM_ADMIN_ID,
        tid: TENANT_ID,
        roles: ['platform_admin'],
      })
      registry = makeRegistry(makeTurnEntry(USER_ID))
      kernelQuery = makeKernelQuery(true)
      controller = new AgentCancelController(
        jwtService,
        registry,
        kernelQuery,
        auditFacade,
        crossPodCancelService,
      )

      const req = makeReq(makeCookieHeader('valid-token'))
      const res = makeRes()

      await controller.cancelTurn(req as never, res as never, TRACE_ID)

      expect(kernelQuery.canDo).toHaveBeenCalledWith(PLATFORM_ADMIN_ID, 'admin.turn.force_stop', {
        tenantId: TENANT_ID,
      })
      expect(registry.cancel).toHaveBeenCalledWith(TRACE_ID)
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.turn_force_stopped',
          payload: expect.objectContaining({ cancelled_by: expect.any(String) }),
        }),
      )
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true }))
    })

    it('platform_admin without admin.turn.force_stop permission returns 403 and records denial audit event', async () => {
      jwtService = makeJwtService({
        sub: PLATFORM_ADMIN_ID,
        tid: TENANT_ID,
        roles: ['platform_admin'],
      })
      registry = makeRegistry(makeTurnEntry(USER_ID))
      kernelQuery = makeKernelQuery(false)
      controller = new AgentCancelController(
        jwtService,
        registry,
        kernelQuery,
        auditFacade,
        crossPodCancelService,
      )

      const req = makeReq(makeCookieHeader('valid-token'))
      const res = makeRes()

      await controller.cancelTurn(req as never, res as never, TRACE_ID)

      expect(kernelQuery.canDo).toHaveBeenCalledWith(PLATFORM_ADMIN_ID, 'admin.turn.force_stop', {
        tenantId: TENANT_ID,
      })
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.send).toHaveBeenCalledWith({ message: 'Forbidden' })
      expect(registry.cancel).not.toHaveBeenCalled()
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.turn_force_stopped_attempt_denied',
        }),
      )
    })
  })
})
