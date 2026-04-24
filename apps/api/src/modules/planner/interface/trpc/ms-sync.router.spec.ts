import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uuidv7 } from 'uuidv7'
import { PlannerRouterService } from './planner-router.service'
import { plannerRouter } from './planner.router'
import { ConnectMsSyncCommand } from '../../application/commands/ms-sync/connect-ms-sync.command'
import { DisconnectMsSyncCommand } from '../../application/commands/ms-sync/disconnect-ms-sync.command'
import { GetGraphCredentialQuery } from '../../../identity/application/queries/get-graph-credential.query'
import type { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'

const TENANT_ID = '01900000-0000-7fff-8000-000000005001'
const ACTOR_ID = uuidv7()

function makeCtx() {
  return {
    req: { headers: {} },
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
  }
}

describe('msSyncRouter — unit (mocked command/query bus)', () => {
  let commandBus: { execute: ReturnType<typeof vi.fn> }
  let queryBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    commandBus = { execute: vi.fn() }
    queryBus = { execute: vi.fn() }

    const adminQueryFacade: Pick<AdminQueryFacade, 'isPlannerEnabled'> = {
      isPlannerEnabled: vi.fn().mockResolvedValue(true),
    }

    const svc = new PlannerRouterService(
      commandBus as never,
      queryBus as never,
      adminQueryFacade as AdminQueryFacade,
    )
    svc.onModuleInit()
  })

  it('planner.msSync.connect dispatches ConnectMsSyncCommand', async () => {
    commandBus.execute.mockResolvedValue(undefined)
    const caller = plannerRouter.createCaller(makeCtx())

    await caller.msSync.connect({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      tenantAdId: '01900000-0000-7000-8000-00000000aa01',
      clientId: '01900000-0000-7000-8000-00000000bb01',
      clientSecret: 'secret-value',
    })

    expect(commandBus.execute).toHaveBeenCalledOnce()
    const dispatched = commandBus.execute.mock.calls[0][0] as ConnectMsSyncCommand
    expect(dispatched).toBeInstanceOf(ConnectMsSyncCommand)
    expect(dispatched.tenantId).toBe(TENANT_ID)
    expect(dispatched.actorId).toBe(ACTOR_ID)
    expect(dispatched.input).toEqual({
      tenantAdId: '01900000-0000-7000-8000-00000000aa01',
      clientId: '01900000-0000-7000-8000-00000000bb01',
      clientSecret: 'secret-value',
    })
  })

  it('planner.msSync.connect -> status returns connected active shape', async () => {
    commandBus.execute.mockResolvedValue(undefined)
    queryBus.execute.mockResolvedValue({
      tenantId: TENANT_ID,
      clientId: '01900000-0000-7000-8000-00000000bb10',
      clientSecretRef: 'secret-ref',
      tenantAdId: '01900000-0000-7000-8000-00000000aa10',
      scopes: ['https://graph.microsoft.com/.default'],
      status: 'active',
      consentedAt: new Date('2026-04-24T08:00:00.000Z'),
      lastValidatedAt: new Date('2026-04-24T08:01:00.000Z'),
      lastError: null,
    })

    const caller = plannerRouter.createCaller(makeCtx())
    await caller.msSync.connect({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      tenantAdId: '01900000-0000-7000-8000-00000000aa10',
      clientId: '01900000-0000-7000-8000-00000000bb10',
      clientSecret: 'secret-value',
    })
    const status = await caller.msSync.status({ tenantId: TENANT_ID })

    const dispatched = commandBus.execute.mock.calls[0][0] as ConnectMsSyncCommand
    expect(dispatched).toBeInstanceOf(ConnectMsSyncCommand)
    expect(status).toEqual({
      connected: true,
      status: 'active',
      tenantAdId: '01900000-0000-7000-8000-00000000aa10',
      clientId: '01900000-0000-7000-8000-00000000bb10',
      connectedAt: '2026-04-24T08:00:00.000Z',
      lastError: null,
    })
  })

  it('planner.msSync.status returns mapped sync status DTO', async () => {
    queryBus.execute.mockResolvedValue({
      tenantId: TENANT_ID,
      clientId: '01900000-0000-7000-8000-00000000bb02',
      clientSecretRef: 'secret-ref',
      tenantAdId: '01900000-0000-7000-8000-00000000aa02',
      scopes: ['https://graph.microsoft.com/.default'],
      status: 'active',
      consentedAt: new Date('2026-04-24T06:30:00.000Z'),
      lastValidatedAt: new Date('2026-04-24T06:31:00.000Z'),
      lastError: null,
    })

    const caller = plannerRouter.createCaller(makeCtx())
    const result = await caller.msSync.status({ tenantId: TENANT_ID })

    expect(queryBus.execute).toHaveBeenCalledOnce()
    const dispatched = queryBus.execute.mock.calls[0][0] as GetGraphCredentialQuery
    expect(dispatched).toBeInstanceOf(GetGraphCredentialQuery)
    expect(dispatched.tenantId).toBe(TENANT_ID)
    expect(result).toEqual({
      connected: true,
      status: 'active',
      tenantAdId: '01900000-0000-7000-8000-00000000aa02',
      clientId: '01900000-0000-7000-8000-00000000bb02',
      connectedAt: '2026-04-24T06:30:00.000Z',
      lastError: null,
    })
  })

  it('planner.msSync.status returns disconnected shape when no credential exists', async () => {
    queryBus.execute.mockResolvedValue(null)

    const caller = plannerRouter.createCaller(makeCtx())
    const result = await caller.msSync.status({ tenantId: TENANT_ID })

    expect(result).toEqual({
      connected: false,
      status: null,
      tenantAdId: null,
      clientId: null,
      connectedAt: null,
      lastError: null,
    })
  })

  it('planner.msSync.disconnect.pause and destroy dispatch DisconnectMsSyncCommand with modes', async () => {
    commandBus.execute.mockResolvedValue(undefined)
    const caller = plannerRouter.createCaller(makeCtx())

    await caller.msSync.disconnect.pause({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    })
    await caller.msSync.disconnect.destroy({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    })

    expect(commandBus.execute).toHaveBeenCalledTimes(2)
    const pause = commandBus.execute.mock.calls[0][0] as DisconnectMsSyncCommand
    const destroy = commandBus.execute.mock.calls[1][0] as DisconnectMsSyncCommand
    expect(pause).toBeInstanceOf(DisconnectMsSyncCommand)
    expect(destroy).toBeInstanceOf(DisconnectMsSyncCommand)
    expect(pause.mode).toBe('pause')
    expect(destroy.mode).toBe('destroy')
  })

  it('planner.msSync.disconnect.pause -> status returns paused', async () => {
    commandBus.execute.mockResolvedValue(undefined)
    queryBus.execute.mockResolvedValue({
      tenantId: TENANT_ID,
      clientId: '01900000-0000-7000-8000-00000000bb03',
      clientSecretRef: 'secret-ref',
      tenantAdId: '01900000-0000-7000-8000-00000000aa03',
      scopes: ['https://graph.microsoft.com/.default'],
      status: 'paused',
      consentedAt: new Date('2026-04-24T07:00:00.000Z'),
      lastValidatedAt: new Date('2026-04-24T07:01:00.000Z'),
      lastError: null,
    })

    const caller = plannerRouter.createCaller(makeCtx())

    await caller.msSync.disconnect.pause({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    })
    const status = await caller.msSync.status({ tenantId: TENANT_ID })

    const dispatched = commandBus.execute.mock.calls[0][0] as DisconnectMsSyncCommand
    expect(dispatched.mode).toBe('pause')
    expect(status).toEqual({
      connected: true,
      status: 'paused',
      tenantAdId: '01900000-0000-7000-8000-00000000aa03',
      clientId: '01900000-0000-7000-8000-00000000bb03',
      connectedAt: '2026-04-24T07:00:00.000Z',
      lastError: null,
    })
  })

  it('planner.msSync.disconnect.destroy -> status returns connected=false', async () => {
    commandBus.execute.mockResolvedValue(undefined)
    queryBus.execute.mockResolvedValue(null)

    const caller = plannerRouter.createCaller(makeCtx())

    await caller.msSync.disconnect.destroy({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
    })
    const status = await caller.msSync.status({ tenantId: TENANT_ID })

    const dispatched = commandBus.execute.mock.calls[0][0] as DisconnectMsSyncCommand
    expect(dispatched.mode).toBe('destroy')
    expect(status).toEqual({
      connected: false,
      status: null,
      tenantAdId: null,
      clientId: null,
      connectedAt: null,
      lastError: null,
    })
  })
})
