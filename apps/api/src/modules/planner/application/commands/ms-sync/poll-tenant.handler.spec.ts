import { describe, expect, it, vi } from 'vitest'
import { PollTenantCommand } from './poll-tenant.command'
import { PollTenantHandler } from './poll-tenant.handler'
import { MsLinkedGroupEntity } from '../../../domain/entities/ms-linked-group.entity'
import {
  GraphAuthError,
  GraphQuotaError,
  GraphServerError,
  GraphThrottledError,
} from '../../../infrastructure/ms-graph/errors'
import { MS_SYNC_CREDENTIAL_INVALIDATED_EVENT } from '@future/event-contracts'

function makeGroup(
  overrides: Partial<{ syncEnabled: boolean; backfillingAt: Date | null }> = {},
): MsLinkedGroupEntity {
  return MsLinkedGroupEntity.reconstitute({
    id: 'g1',
    tenantId: 't1',
    msGroupId: 'ms-g1',
    displayName: 'Test Group',
    linkedByActorId: 'a1',
    linkedAt: new Date(),
    syncEnabled: overrides.syncEnabled ?? true,
    backfillingAt: overrides.backfillingAt ?? null,
    backfillJobId: null,
    unlinkedAt: null,
  })
}

function makeHandler(overrides: {
  credStatus?: string | null
  groups?: MsLinkedGroupEntity[]
}): PollTenantHandler {
  const identityFacade = {
    getGraphCredential: vi
      .fn()
      .mockResolvedValue(
        overrides.credStatus !== undefined
          ? overrides.credStatus === null
            ? null
            : { status: overrides.credStatus }
          : { status: 'active' },
      ),
  }
  const groupRepo = {
    listActiveForTenant: vi.fn().mockResolvedValue(overrides.groups ?? []),
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return new PollTenantHandler(
    groupRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    identityFacade as any,
    {} as any,
    {} as any,
    { publish: vi.fn() } as any,
  )
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

describe('PollTenantHandler', () => {
  it('skips when credential status is not active', async () => {
    const handler = makeHandler({ credStatus: 'invalid' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupRepo = (handler as any).groupRepo
    await handler.execute(new PollTenantCommand('t1'))
    expect(groupRepo.listActiveForTenant).not.toHaveBeenCalled()
  })

  it('skips back-filling groups', async () => {
    const group = makeGroup({ backfillingAt: new Date() })
    const handler = makeHandler({ groups: [group] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = vi.spyOn(handler as any, 'pollGroup').mockResolvedValue(undefined)
    await handler.execute(new PollTenantCommand('t1'))
    expect(spy).not.toHaveBeenCalled()
  })

  it('iterates active groups and delegates to pollGroup', async () => {
    const group = makeGroup()
    const handler = makeHandler({ groups: [group] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = vi.spyOn(handler as any, 'pollGroup').mockResolvedValue(undefined)
    await handler.execute(new PollTenantCommand('t1'))
    expect(spy).toHaveBeenCalledWith('t1', group)
  })

  it('lists group plans, calls PlanIngestor per plan, detects archived plans', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graph = { getAllPages: vi.fn() as any }
    const ingestor = { ingestPlan: vi.fn() }
    const planRepo = { listByContainer: vi.fn(), markArchived: vi.fn() }
    const syncStateRepo = { findByMsPlanId: vi.fn().mockResolvedValue(null) }
    const identityFacade = {
      getGraphCredential: vi.fn().mockResolvedValue({ status: 'active' }),
    }
    const groupRepo = {
      listActiveForTenant: vi.fn().mockResolvedValue([makeGroup()]),
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const handler = new PollTenantHandler(
      groupRepo as any,
      syncStateRepo as any,
      graph as any,
      ingestor as any,
      planRepo as any,
      identityFacade as any,
      {} as any,
      {} as any,
      { publish: vi.fn() } as any,
    )
    /* eslint-enable @typescript-eslint/no-explicit-any */

    graph.getAllPages.mockResolvedValue([
      { id: 'ms-plan-1', title: 'Plan A' },
      { id: 'ms-plan-2', title: 'Plan B' },
    ])
    ingestor.ingestPlan.mockResolvedValue(undefined)
    planRepo.listByContainer.mockResolvedValue([
      { id: 'local-1', msPlanId: 'ms-plan-1' },
      { id: 'local-2', msPlanId: 'ms-plan-2' },
      { id: 'local-3', msPlanId: 'ms-plan-gone' },
    ])

    await handler.execute(new PollTenantCommand('t1'))

    expect(ingestor.ingestPlan).toHaveBeenCalledWith({
      tenantId: 't1',
      msPlanId: 'ms-plan-1',
      origin: 'ms-sync-pull',
    })
    expect(ingestor.ingestPlan).toHaveBeenCalledWith({
      tenantId: 't1',
      msPlanId: 'ms-plan-2',
      origin: 'ms-sync-pull',
    })
    expect(planRepo.markArchived).toHaveBeenCalledWith('local-3', { origin: 'ms-sync-pull' })
  })

  describe('handlePollError', () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    function makeErrorHandler(overrides: {
      error: Error
      syncStateRepoExtra?: Record<string, ReturnType<typeof vi.fn>>
      conflictRepoInsert?: ReturnType<typeof vi.fn>
      credentialFacade?: { invalidateCredential: ReturnType<typeof vi.fn> }
      eventBus?: { publish: ReturnType<typeof vi.fn> }
    }) {
      const identityFacade = {
        getGraphCredential: vi.fn().mockResolvedValue({ status: 'active' }),
      }
      const groupRepo = {
        listActiveForTenant: vi.fn().mockResolvedValue([makeGroup()]),
      }
      const graph = { getAllPages: vi.fn().mockRejectedValue(overrides.error) }
      const syncStateRepo = {
        findByMsPlanId: vi.fn().mockResolvedValue(null),
        pauseAllPlansForGroup: vi.fn().mockResolvedValue(undefined),
        incrementErrorCountForGroup: vi.fn().mockResolvedValue(undefined),
        maxConsecutiveErrorCountForGroup: vi.fn().mockResolvedValue(0),
        ...(overrides.syncStateRepoExtra ?? {}),
      }
      const conflictRepo = {
        insert: overrides.conflictRepoInsert ?? vi.fn().mockResolvedValue(undefined),
      }
      const credentialFacade = overrides.credentialFacade ?? {
        invalidateCredential: vi.fn().mockResolvedValue(undefined),
      }
      const eventBus = overrides.eventBus ?? { publish: vi.fn() }

      const handler = new PollTenantHandler(
        groupRepo as any,
        syncStateRepo as any,
        graph as any,
        {} as any,
        {} as any,
        identityFacade as any,
        credentialFacade as any,
        conflictRepo as any,
        eventBus as any,
      )
      return { handler, syncStateRepo, conflictRepo, credentialFacade, eventBus }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    it("429: sets pollPausedUntil across the group's plans per Retry-After", async () => {
      const { handler, syncStateRepo } = makeErrorHandler({
        error: new GraphThrottledError('Too many requests', {}, 30),
      })
      await handler.execute(new PollTenantCommand('t1'))
      expect(syncStateRepo.pauseAllPlansForGroup).toHaveBeenCalledWith('t1', 'g1', expect.any(Date))
      const pauseUntil = syncStateRepo.pauseAllPlansForGroup.mock.calls[0][2] as Date
      expect(pauseUntil.getTime()).toBeGreaterThan(Date.now() + 29_000)
    })

    it('401: marks credential invalid and emits event', async () => {
      const credentialFacade = { invalidateCredential: vi.fn().mockResolvedValue(undefined) }
      const eventBus = { publish: vi.fn() }
      const { handler } = makeErrorHandler({
        error: new GraphAuthError('Unauthorized', 401, {}),
        credentialFacade,
        eventBus,
      })
      await handler.execute(new PollTenantCommand('t1'))
      expect(credentialFacade.invalidateCredential).toHaveBeenCalledWith('t1', expect.any(String))
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: MS_SYNC_CREDENTIAL_INVALIDATED_EVENT }),
      )
    })

    it('403 with MaximumPlannerPlans: writes ms_sync_conflict', async () => {
      const conflictInsert = vi.fn().mockResolvedValue(undefined)
      const { handler } = makeErrorHandler({
        error: new GraphQuotaError('Quota exceeded', {}, 'MaximumPlannerPlans'),
        conflictRepoInsert: conflictInsert,
      })
      await handler.execute(new PollTenantCommand('t1'))
      expect(conflictInsert).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'push_403_quota' }),
      )
    })

    it('5xx: increments error count; after 10 errors pauses plans for an hour', async () => {
      const syncStateRepoExtra = {
        maxConsecutiveErrorCountForGroup: vi.fn().mockResolvedValue(10),
        incrementErrorCountForGroup: vi.fn().mockResolvedValue(undefined),
        pauseAllPlansForGroup: vi.fn().mockResolvedValue(undefined),
      }
      const { handler, syncStateRepo } = makeErrorHandler({
        error: new GraphServerError('Internal server error', 500, {}),
        syncStateRepoExtra,
      })
      await handler.execute(new PollTenantCommand('t1'))
      expect(syncStateRepo.incrementErrorCountForGroup).toHaveBeenCalledWith(
        't1',
        'g1',
        expect.any(String),
      )
      expect(syncStateRepo.pauseAllPlansForGroup).toHaveBeenCalledWith('t1', 'g1', expect.any(Date))
    })

    it('poll skips plans whose pollPausedUntil is in the future', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const graph = {
        getAllPages: vi.fn().mockResolvedValue([{ id: 'ms-plan-1', title: 'Plan A' }]) as any,
      }
      const syncStateRepo = {
        findByMsPlanId: vi
          .fn()
          .mockResolvedValue({ pollPausedUntil: new Date(Date.now() + 600_000) }),
      }
      const ingestor = { ingestPlan: vi.fn() }
      const planRepo = { listByContainer: vi.fn().mockResolvedValue([]) }
      const identityFacade = {
        getGraphCredential: vi.fn().mockResolvedValue({ status: 'active' }),
      }
      const groupRepo = {
        listActiveForTenant: vi.fn().mockResolvedValue([makeGroup()]),
      }

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const handler = new PollTenantHandler(
        groupRepo as any,
        syncStateRepo as any,
        graph as any,
        ingestor as any,
        planRepo as any,
        identityFacade as any,
        {} as any,
        {} as any,
        { publish: vi.fn() } as any,
      )
      /* eslint-enable @typescript-eslint/no-explicit-any */

      await handler.execute(new PollTenantCommand('t1'))
      expect(ingestor.ingestPlan).not.toHaveBeenCalled()
    })
  })
})
