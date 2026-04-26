import { describe, expect, it, vi } from 'vitest'
import { PollTenantCommand } from './poll-tenant.command'
import { PollTenantHandler } from './poll-tenant.handler'
import { MsLinkedGroupEntity } from '../../../domain/entities/ms-linked-group.entity'

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
    const identityFacade = {
      getGraphCredential: vi.fn().mockResolvedValue({ status: 'active' }),
    }
    const groupRepo = {
      listActiveForTenant: vi.fn().mockResolvedValue([makeGroup()]),
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const handler = new PollTenantHandler(
      groupRepo as any,
      {} as any,
      graph as any,
      ingestor as any,
      planRepo as any,
      identityFacade as any,
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
})
