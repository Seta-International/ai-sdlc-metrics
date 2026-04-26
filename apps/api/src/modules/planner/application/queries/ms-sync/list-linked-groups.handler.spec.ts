import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListLinkedGroupsHandler } from './list-linked-groups.handler'
import { ListLinkedGroupsQuery } from './list-linked-groups.query'
import { MsLinkedGroupEntity } from '../../../domain/entities/ms-linked-group.entity'
import { MsPlanSyncStateEntity } from '../../../domain/entities/ms-plan-sync-state.entity'

const TENANT_ID = '01900000-0000-7fff-8000-000000005001'

function makeGroup(msGroupId: string): MsLinkedGroupEntity {
  return MsLinkedGroupEntity.create({
    id: `grp-${msGroupId}`,
    tenantId: TENANT_ID,
    msGroupId,
    displayName: `Group ${msGroupId}`,
    linkedByActorId: 'actor-1',
  })
}

function makeSyncState(
  planId: string,
  lastPolledAt: Date | null,
  lastErrorMessage: string | null,
): MsPlanSyncStateEntity {
  return MsPlanSyncStateEntity.reconstitute({
    planId,
    tenantId: TENANT_ID,
    msPlanId: `ms-${planId}`,
    msPlanEtag: null,
    lastPolledAt,
    lastSuccessfulPollAt: null,
    consecutiveErrorCount: lastErrorMessage ? 1 : 0,
    lastErrorCode: lastErrorMessage ? 'ERR' : null,
    lastErrorMessage,
    pollPausedUntil: null,
  })
}

describe('ListLinkedGroupsHandler', () => {
  let groupRepo: { listForTenant: ReturnType<typeof vi.fn> }
  let planRepo: { findByTenantId: ReturnType<typeof vi.fn> }
  let syncRepo: { listForTenant: ReturnType<typeof vi.fn> }
  let handler: ListLinkedGroupsHandler

  beforeEach(() => {
    groupRepo = { listForTenant: vi.fn() }
    planRepo = { findByTenantId: vi.fn() }
    syncRepo = { listForTenant: vi.fn() }
    handler = new ListLinkedGroupsHandler(groupRepo as never, planRepo as never, syncRepo as never)
  })

  it('returns linked groups with planCount=0 when no plans exist', async () => {
    groupRepo.listForTenant.mockResolvedValue([makeGroup('g1')])
    planRepo.findByTenantId.mockResolvedValue([])
    syncRepo.listForTenant.mockResolvedValue([])

    const result = await handler.execute(new ListLinkedGroupsQuery(TENANT_ID))

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'grp-g1',
      msGroupId: 'g1',
      displayName: 'Group g1',
      syncEnabled: true,
      planCount: 0,
      lastPolledAt: null,
      lastError: null,
    })
  })

  it('counts ms_group plans per linked group', async () => {
    groupRepo.listForTenant.mockResolvedValue([makeGroup('g1'), makeGroup('g2')])
    planRepo.findByTenantId.mockResolvedValue([
      { id: 'p1', container: { type: 'ms_group', externalId: 'g1' }, deletedAt: null },
      { id: 'p2', container: { type: 'ms_group', externalId: 'g1' }, deletedAt: null },
      { id: 'p3', container: { type: 'ms_group', externalId: 'g2' }, deletedAt: null },
      { id: 'p4', container: { type: 'future_only' }, deletedAt: null },
    ])
    syncRepo.listForTenant.mockResolvedValue([])

    const result = await handler.execute(new ListLinkedGroupsQuery(TENANT_ID))

    const g1 = result.find((r) => r.msGroupId === 'g1')!
    const g2 = result.find((r) => r.msGroupId === 'g2')!
    expect(g1.planCount).toBe(2)
    expect(g2.planCount).toBe(1)
  })

  it('excludes deleted plans from planCount', async () => {
    groupRepo.listForTenant.mockResolvedValue([makeGroup('g1')])
    planRepo.findByTenantId.mockResolvedValue([
      { id: 'p1', container: { type: 'ms_group', externalId: 'g1' }, deletedAt: new Date() },
      { id: 'p2', container: { type: 'ms_group', externalId: 'g1' }, deletedAt: null },
    ])
    syncRepo.listForTenant.mockResolvedValue([])

    const result = await handler.execute(new ListLinkedGroupsQuery(TENANT_ID))

    expect(result[0].planCount).toBe(1)
  })

  it('returns max lastPolledAt across all plans for a group', async () => {
    const earlier = new Date('2026-04-01T10:00:00Z')
    const later = new Date('2026-04-02T10:00:00Z')

    groupRepo.listForTenant.mockResolvedValue([makeGroup('g1')])
    planRepo.findByTenantId.mockResolvedValue([
      { id: 'p1', container: { type: 'ms_group', externalId: 'g1' }, deletedAt: null },
      { id: 'p2', container: { type: 'ms_group', externalId: 'g1' }, deletedAt: null },
    ])
    syncRepo.listForTenant.mockResolvedValue([
      makeSyncState('p1', earlier, null),
      makeSyncState('p2', later, null),
    ])

    const result = await handler.execute(new ListLinkedGroupsQuery(TENANT_ID))

    expect(result[0].lastPolledAt).toEqual(later)
  })

  it('returns lastError from sync state when present', async () => {
    groupRepo.listForTenant.mockResolvedValue([makeGroup('g1')])
    planRepo.findByTenantId.mockResolvedValue([
      { id: 'p1', container: { type: 'ms_group', externalId: 'g1' }, deletedAt: null },
    ])
    syncRepo.listForTenant.mockResolvedValue([
      makeSyncState('p1', new Date(), 'Plan not found in MS Graph'),
    ])

    const result = await handler.execute(new ListLinkedGroupsQuery(TENANT_ID))

    expect(result[0].lastError).toBe('Plan not found in MS Graph')
  })
})
