import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uuidv7 } from 'uuidv7'
import { PlannerRouterService } from './planner-router.service'
import { plannerRouter } from './planner.router'
import { ConnectMsSyncCommand } from '../../application/commands/ms-sync/connect-ms-sync.command'
import { DisconnectMsSyncCommand } from '../../application/commands/ms-sync/disconnect-ms-sync.command'
import { LinkMsGroupCommand } from '../../application/commands/ms-sync/link-ms-group.command'
import { UnlinkMsGroupCommand } from '../../application/commands/ms-sync/unlink-ms-group.command'
import { MintMsRosterCommand } from '../../application/commands/ms-sync/mint-ms-roster.command'
import { LinkExistingRosterCommand } from '../../application/commands/ms-sync/link-existing-roster.command'
import { UnlinkRosterCommand } from '../../application/commands/ms-sync/unlink-roster.command'
import { GetGraphCredentialQuery } from '../../../identity/application/queries/get-graph-credential.query'
import { ListAvailableGroupsQuery } from '../../application/queries/ms-sync/list-available-groups.query'
import { ListLinkedGroupsQuery } from '../../application/queries/ms-sync/list-linked-groups.query'
import { ListLinkedRostersQuery } from '../../application/queries/ms-sync/list-linked-rosters.query'
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

    const adminQueryFacade: Pick<AdminQueryFacade, 'isPlannerEnabled' | 'getPlannerViewFlags'> = {
      isPlannerEnabled: vi.fn().mockResolvedValue(true),
      getPlannerViewFlags: vi.fn().mockResolvedValue({
        viewsEnabled: true,
        gridEnabled: true,
        scheduleEnabled: true,
        chartsEnabled: true,
        trendsEnabled: true,
        personalEnabled: true,
        msSyncEnabled: true,
        msSyncAttachmentsEnabled: true,
        msSyncRostersEnabled: true,
      }),
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

  it('planner.msSync.groups.listAvailable dispatches ListAvailableGroupsQuery', async () => {
    queryBus.execute.mockResolvedValue([
      { externalGroupId: 'g1', displayName: 'Marketing', memberCount: 5 },
    ])

    const caller = plannerRouter.createCaller(makeCtx())
    const result = await caller.msSync.groups.listAvailable({ tenantId: TENANT_ID })

    expect(queryBus.execute).toHaveBeenCalledOnce()
    const dispatched = queryBus.execute.mock.calls[0][0]
    expect(dispatched).toBeInstanceOf(ListAvailableGroupsQuery)
    expect(dispatched.tenantId).toBe(TENANT_ID)
    expect(result).toEqual([{ externalGroupId: 'g1', displayName: 'Marketing', memberCount: 5 }])
  })

  it('planner.msSync.groups.link dispatches LinkMsGroupCommand and returns IDs', async () => {
    commandBus.execute.mockResolvedValue({
      id: 'linked-id-1',
      displayName: 'Marketing',
      backfillJobId: 'job-abc',
    })

    const caller = plannerRouter.createCaller(makeCtx())
    const result = await caller.msSync.groups.link({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      msGroupId: 'aad-group-uuid-1',
    })

    expect(commandBus.execute).toHaveBeenCalledOnce()
    const dispatched = commandBus.execute.mock.calls[0][0]
    expect(dispatched).toBeInstanceOf(LinkMsGroupCommand)
    expect(dispatched.msGroupId).toBe('aad-group-uuid-1')
    expect(result).toEqual({ linkedGroupId: 'linked-id-1', backfillJobId: 'job-abc' })
  })

  it('planner.msSync.groups.unlink dispatches UnlinkMsGroupCommand', async () => {
    commandBus.execute.mockResolvedValue(undefined)

    const caller = plannerRouter.createCaller(makeCtx())
    await caller.msSync.groups.unlink({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      msGroupId: 'aad-group-uuid-2',
    })

    expect(commandBus.execute).toHaveBeenCalledOnce()
    const dispatched = commandBus.execute.mock.calls[0][0]
    expect(dispatched).toBeInstanceOf(UnlinkMsGroupCommand)
    expect(dispatched.msGroupId).toBe('aad-group-uuid-2')
    expect(dispatched.tenantId).toBe(TENANT_ID)
    expect(dispatched.actorId).toBe(ACTOR_ID)
  })

  it('planner.msSync.groups.listLinked dispatches ListLinkedGroupsQuery', async () => {
    const now = new Date('2026-04-25T10:00:00Z')
    queryBus.execute.mockResolvedValue([
      {
        id: 'grp-id-1',
        msGroupId: 'g1',
        displayName: 'Marketing',
        syncEnabled: true,
        backfillingAt: null,
        planCount: 3,
        lastPolledAt: now,
        lastError: null,
      },
    ])

    const caller = plannerRouter.createCaller(makeCtx())
    const result = await caller.msSync.groups.listLinked({ tenantId: TENANT_ID })

    expect(queryBus.execute).toHaveBeenCalledOnce()
    const dispatched = queryBus.execute.mock.calls[0][0]
    expect(dispatched).toBeInstanceOf(ListLinkedGroupsQuery)
    expect(dispatched.tenantId).toBe(TENANT_ID)
    expect(result).toHaveLength(1)
    expect(result[0].msGroupId).toBe('g1')
    expect(result[0].planCount).toBe(3)
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

  it('planner.msSync.rosters.listLinked dispatches ListLinkedRostersQuery', async () => {
    queryBus.execute.mockResolvedValue([
      {
        id: 'roster-id-1',
        msRosterId: 'r1',
        displayName: 'Test',
        syncEnabled: true,
        mintedByFutureAt: null,
        unlinkedAt: null,
      },
    ])

    const caller = plannerRouter.createCaller(makeCtx())
    const result = await caller.msSync.rosters.listLinked({ tenantId: TENANT_ID })

    const dispatched = queryBus.execute.mock.calls[0][0]
    expect(dispatched).toBeInstanceOf(ListLinkedRostersQuery)
    expect(dispatched.tenantId).toBe(TENANT_ID)
    expect(result).toHaveLength(1)
    expect(result[0].msRosterId).toBe('r1')
  })

  it('planner.msSync.rosters.mint dispatches MintMsRosterCommand', async () => {
    commandBus.execute.mockResolvedValue({ msRosterId: 'r1', localId: 'local-1' })

    const caller = plannerRouter.createCaller(makeCtx())
    const result = await caller.msSync.rosters.mint({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      displayName: 'My Roster',
      initialMemberActorIds: [],
    })

    const dispatched = commandBus.execute.mock.calls[0][0]
    expect(dispatched).toBeInstanceOf(MintMsRosterCommand)
    expect(dispatched.displayName).toBe('My Roster')
    expect(result).toEqual({ msRosterId: 'r1', localId: 'local-1' })
  })

  it('planner.msSync.rosters.linkExisting dispatches LinkExistingRosterCommand', async () => {
    commandBus.execute.mockResolvedValue(undefined)

    const caller = plannerRouter.createCaller(makeCtx())
    await caller.msSync.rosters.linkExisting({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      msRosterId: 'roster-abc',
    })

    const dispatched = commandBus.execute.mock.calls[0][0]
    expect(dispatched).toBeInstanceOf(LinkExistingRosterCommand)
    expect(dispatched.msRosterId).toBe('roster-abc')
    expect(dispatched.tenantId).toBe(TENANT_ID)
  })

  it('planner.msSync.rosters.unlink dispatches UnlinkRosterCommand', async () => {
    commandBus.execute.mockResolvedValue(undefined)

    const caller = plannerRouter.createCaller(makeCtx())
    await caller.msSync.rosters.unlink({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      msRosterId: 'roster-xyz',
    })

    const dispatched = commandBus.execute.mock.calls[0][0]
    expect(dispatched).toBeInstanceOf(UnlinkRosterCommand)
    expect(dispatched.msRosterId).toBe('roster-xyz')
  })

  it('planner.msSync.flags returns msSyncAttachmentsEnabled and msSyncRostersEnabled', async () => {
    const caller = plannerRouter.createCaller(makeCtx())
    const result = await caller.msSync.flags({ tenantId: TENANT_ID })

    expect(result).toEqual({
      msSyncAttachmentsEnabled: true,
      msSyncRostersEnabled: true,
    })
  })
})
