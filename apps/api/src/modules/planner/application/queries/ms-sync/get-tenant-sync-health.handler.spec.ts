import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetTenantSyncHealthHandler } from './get-tenant-sync-health.handler'
import { GetTenantSyncHealthQuery } from './get-tenant-sync-health.query'
import { MsLinkedGroupEntity } from '../../../domain/entities/ms-linked-group.entity'
import { MsSyncConflictEntity } from '../../../domain/entities/ms-sync-conflict.entity'

function makeGroup(tenantId: string, msGroupId: string): MsLinkedGroupEntity {
  return MsLinkedGroupEntity.create({
    id: `grp-${msGroupId}`,
    tenantId,
    msGroupId,
    displayName: `Group ${msGroupId}`,
    linkedByActorId: 'actor-1',
  })
}

function makeConflict(tenantId: string, id: string): MsSyncConflictEntity {
  return MsSyncConflictEntity.reconstitute({
    id,
    tenantId,
    kind: 'push_failed',
    taskId: null,
    planId: null,
    field: null,
    mineValue: null,
    theirsValue: null,
    mineChangedAt: null,
    theirsChangedAt: null,
    resolution: null,
    resolvedByActorId: null,
    resolvedAt: null,
    rawError: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  })
}

describe('GetTenantSyncHealthHandler', () => {
  let groupRepo: {
    listDistinctActiveTenantIds: ReturnType<typeof vi.fn>
    listActiveForTenant: ReturnType<typeof vi.fn>
  }
  let conflictRepo: {
    list: ReturnType<typeof vi.fn>
  }
  let handler: GetTenantSyncHealthHandler

  beforeEach(() => {
    groupRepo = {
      listDistinctActiveTenantIds: vi.fn(),
      listActiveForTenant: vi.fn(),
    }
    conflictRepo = {
      list: vi.fn(),
    }
    handler = new GetTenantSyncHealthHandler(groupRepo as never, conflictRepo as never)
  })

  it('returns empty array when no active tenants exist', async () => {
    groupRepo.listDistinctActiveTenantIds.mockResolvedValue([])

    const result = await handler.execute(new GetTenantSyncHealthQuery())

    expect(result).toEqual([])
    expect(groupRepo.listActiveForTenant).not.toHaveBeenCalled()
    expect(conflictRepo.list).not.toHaveBeenCalled()
  })

  it('returns one row per tenant with correct counts', async () => {
    const TENANT_A = 'tenant-a-0000-0000-0000-000000000001'
    const TENANT_B = 'tenant-b-0000-0000-0000-000000000002'

    groupRepo.listDistinctActiveTenantIds.mockResolvedValue([TENANT_A, TENANT_B])
    groupRepo.listActiveForTenant
      .mockResolvedValueOnce([makeGroup(TENANT_A, 'g1'), makeGroup(TENANT_A, 'g2')])
      .mockResolvedValueOnce([makeGroup(TENANT_B, 'g3')])
    conflictRepo.list
      .mockResolvedValueOnce([makeConflict(TENANT_A, 'c1')])
      .mockResolvedValueOnce([])

    const result = await handler.execute(new GetTenantSyncHealthQuery())

    expect(result).toHaveLength(2)

    const rowA = result.find((r) => r.tenantId === TENANT_A)!
    expect(rowA.linkedGroups).toBe(2)
    expect(rowA.openConflicts).toBe(1)
    expect(rowA.status).toBe('active')

    const rowB = result.find((r) => r.tenantId === TENANT_B)!
    expect(rowB.linkedGroups).toBe(1)
    expect(rowB.openConflicts).toBe(0)
    expect(rowB.status).toBe('active')
  })

  it('sets status=disconnected when tenant has no active linked groups', async () => {
    const TENANT_ID = 'tenant-0000-0000-0000-000000000003'

    groupRepo.listDistinctActiveTenantIds.mockResolvedValue([TENANT_ID])
    groupRepo.listActiveForTenant.mockResolvedValue([])
    conflictRepo.list.mockResolvedValue([])

    const result = await handler.execute(new GetTenantSyncHealthQuery())

    expect(result[0].status).toBe('disconnected')
    expect(result[0].linkedGroups).toBe(0)
    expect(result[0].openConflicts).toBe(0)
  })
})
