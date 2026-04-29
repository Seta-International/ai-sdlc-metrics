import { describe, it, expect, vi } from 'vitest'
import { ListConflictsHandler } from './list-conflicts.handler'
import { ListConflictsQuery } from './list-conflicts.query'
import type { IMsSyncConflictRepository } from '../../../domain/repositories/ms-sync-conflict.repository'
import { MsSyncConflictEntity } from '../../../domain/entities/ms-sync-conflict.entity'

function makeConflict(
  overrides: Partial<Parameters<typeof MsSyncConflictEntity.reconstitute>[0]> = {},
): MsSyncConflictEntity {
  return MsSyncConflictEntity.reconstitute({
    id: 'conflict-1',
    tenantId: 'tenant-1',
    kind: 'push_failed',
    taskId: 'task-1',
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
    createdAt: new Date('2025-01-01T10:00:00.000Z'),
    ...overrides,
  })
}

describe('ListConflictsHandler', () => {
  it('returns conflicts with correct DTO shape', async () => {
    const conflict = makeConflict()
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      list: vi.fn().mockResolvedValue([conflict]),
    }
    const handler = new ListConflictsHandler(conflictRepo as IMsSyncConflictRepository)

    const result = await handler.execute(
      new ListConflictsQuery('tenant-1', { resolved: 'open', limit: 100 }),
    )

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      id: 'conflict-1',
      kind: 'push_failed',
      createdAt: '2025-01-01T10:00:00.000Z',
      taskId: 'task-1',
      taskTitle: null,
      planTitle: null,
      field: null,
      mineValue: null,
      theirsValue: null,
      limitCode: null,
      resolution: null,
      resolvedAt: null,
      rawError: null,
    })
    expect(result.nextCursor).toBeNull()
  })

  it('returns limitCode from field for push_403_quota conflicts', async () => {
    const conflict = makeConflict({ kind: 'push_403_quota', field: 'PLAN_BUCKET_LIMIT' })
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      list: vi.fn().mockResolvedValue([conflict]),
    }
    const handler = new ListConflictsHandler(conflictRepo as IMsSyncConflictRepository)

    const result = await handler.execute(
      new ListConflictsQuery('tenant-1', { resolved: 'open', limit: 100 }),
    )

    expect(result.conflicts[0].limitCode).toBe('PLAN_BUCKET_LIMIT')
    expect(result.conflicts[0].field).toBeNull()
  })

  it('returns nextCursor when items.length === limit', async () => {
    const conflicts = Array.from({ length: 2 }, (_, i) =>
      makeConflict({
        id: `conflict-${i}`,
        createdAt: new Date(`2025-01-0${i + 1}T10:00:00.000Z`),
      }),
    )
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      list: vi.fn().mockResolvedValue(conflicts),
    }
    const handler = new ListConflictsHandler(conflictRepo as IMsSyncConflictRepository)

    const result = await handler.execute(
      new ListConflictsQuery('tenant-1', { resolved: 'open', limit: 2 }),
    )

    expect(result.nextCursor).not.toBeNull()
    const decoded = Buffer.from(result.nextCursor!, 'base64').toString('utf8')
    expect(decoded).toBe(conflicts[1].createdAt.toISOString())
  })

  it('returns null nextCursor when items.length < limit', async () => {
    const conflicts = [makeConflict()]
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      list: vi.fn().mockResolvedValue(conflicts),
    }
    const handler = new ListConflictsHandler(conflictRepo as IMsSyncConflictRepository)

    const result = await handler.execute(
      new ListConflictsQuery('tenant-1', { resolved: 'open', limit: 100 }),
    )

    expect(result.nextCursor).toBeNull()
  })

  it('decodes cursor and passes before to repo', async () => {
    const cursor = Buffer.from('2025-01-01T10:00:00.000Z').toString('base64')
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      list: vi.fn().mockResolvedValue([]),
    }
    const handler = new ListConflictsHandler(conflictRepo as IMsSyncConflictRepository)

    await handler.execute(
      new ListConflictsQuery('tenant-1', { resolved: 'open', limit: 100, cursor }),
    )

    expect(conflictRepo.list).toHaveBeenCalledWith('tenant-1', {
      resolved: 'open',
      limit: 100,
      before: new Date('2025-01-01T10:00:00.000Z'),
    })
  })
})
