import { describe, it, expect, vi } from 'vitest'
import { RetryConflictHandler } from './retry-conflict.handler'
import { RetryConflictCommand } from './retry-conflict.command'
import type { IMsSyncConflictRepository } from '../../../domain/repositories/ms-sync-conflict.repository'
import type { PgBossService } from '../../../../../common/jobs/pg-boss.service'
import { MsSyncConflictEntity } from '../../../domain/entities/ms-sync-conflict.entity'

function makeConflict(
  overrides: Partial<Parameters<typeof MsSyncConflictEntity.reconstitute>[0]> = {},
): MsSyncConflictEntity {
  return MsSyncConflictEntity.reconstitute({
    id: 'conflict-1',
    tenantId: 'tenant-1',
    kind: 'push_412_exhausted',
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
    createdAt: new Date(),
    ...overrides,
  })
}

describe('RetryConflictHandler', () => {
  it('enqueues push-task job for push_412_exhausted conflicts', async () => {
    const conflict = makeConflict({ kind: 'push_412_exhausted', taskId: 'task-1' })
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(conflict),
      markResolved: vi.fn().mockResolvedValue(undefined),
    }
    const pgBoss: Partial<PgBossService> = {
      enqueue: vi.fn().mockResolvedValue(undefined),
    }
    const handler = new RetryConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      pgBoss as PgBossService,
    )

    await handler.execute(new RetryConflictCommand('tenant-1', 'actor-1', 'conflict-1'))

    expect(pgBoss.enqueue).toHaveBeenCalledWith(
      'ms-sync-push-task',
      { tenantId: 'tenant-1', taskId: 'task-1' },
      { singletonKey: 'push-task:task-1' },
    )
    expect(conflictRepo.markResolved).toHaveBeenCalledWith('conflict-1', 'actor-1', 'applied_mine')
  })

  it('enqueues push-task job for push_failed conflicts', async () => {
    const conflict = makeConflict({ kind: 'push_failed', taskId: 'task-2' })
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(conflict),
      markResolved: vi.fn().mockResolvedValue(undefined),
    }
    const pgBoss: Partial<PgBossService> = {
      enqueue: vi.fn().mockResolvedValue(undefined),
    }
    const handler = new RetryConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      pgBoss as PgBossService,
    )

    await handler.execute(new RetryConflictCommand('tenant-1', 'actor-1', 'conflict-1'))

    expect(pgBoss.enqueue).toHaveBeenCalledWith(
      'ms-sync-push-task',
      { tenantId: 'tenant-1', taskId: 'task-2' },
      expect.any(Object),
    )
  })

  it('enqueues push-attachment job for attachment_upload_failed conflicts', async () => {
    const rawError = { attachmentId: 'att-1' }
    const conflict = makeConflict({ kind: 'attachment_upload_failed', rawError, taskId: 'task-1' })
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(conflict),
      markResolved: vi.fn().mockResolvedValue(undefined),
    }
    const pgBoss: Partial<PgBossService> = {
      enqueue: vi.fn().mockResolvedValue(undefined),
    }
    const handler = new RetryConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      pgBoss as PgBossService,
    )

    await handler.execute(new RetryConflictCommand('tenant-1', 'actor-1', 'conflict-1'))

    expect(pgBoss.enqueue).toHaveBeenCalledWith(
      'ms-sync-push-attachment',
      { tenantId: 'tenant-1', attachmentId: 'att-1' },
      { singletonKey: 'push-attachment:att-1' },
    )
    expect(conflictRepo.markResolved).toHaveBeenCalledWith('conflict-1', 'actor-1', 'applied_mine')
  })

  it('throws for field_lww conflicts (cannot retry)', async () => {
    const conflict = makeConflict({ kind: 'field_lww' })
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(conflict),
      markResolved: vi.fn(),
    }
    const pgBoss: Partial<PgBossService> = {
      enqueue: vi.fn(),
    }
    const handler = new RetryConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      pgBoss as PgBossService,
    )

    await expect(
      handler.execute(new RetryConflictCommand('tenant-1', 'actor-1', 'conflict-1')),
    ).rejects.toThrow('Cannot retry conflict kind=field_lww')
    expect(conflictRepo.markResolved).not.toHaveBeenCalled()
  })

  it('throws if conflict is already resolved', async () => {
    const conflict = makeConflict({ resolvedAt: new Date() })
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(conflict),
      markResolved: vi.fn(),
    }
    const pgBoss: Partial<PgBossService> = {
      enqueue: vi.fn(),
    }
    const handler = new RetryConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      pgBoss as PgBossService,
    )

    await expect(
      handler.execute(new RetryConflictCommand('tenant-1', 'actor-1', 'conflict-1')),
    ).rejects.toThrow('Already resolved')
    expect(conflictRepo.markResolved).not.toHaveBeenCalled()
  })

  it('throws if conflict not found', async () => {
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(null),
      markResolved: vi.fn(),
    }
    const pgBoss: Partial<PgBossService> = {
      enqueue: vi.fn(),
    }
    const handler = new RetryConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      pgBoss as PgBossService,
    )

    await expect(
      handler.execute(new RetryConflictCommand('tenant-1', 'actor-1', 'conflict-1')),
    ).rejects.toThrow('Not found')
  })

  it('throws if conflict belongs to different tenant', async () => {
    const conflict = makeConflict({ tenantId: 'other-tenant' })
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(conflict),
      markResolved: vi.fn(),
    }
    const pgBoss: Partial<PgBossService> = {
      enqueue: vi.fn(),
    }
    const handler = new RetryConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      pgBoss as PgBossService,
    )

    await expect(
      handler.execute(new RetryConflictCommand('tenant-1', 'actor-1', 'conflict-1')),
    ).rejects.toThrow('Not found')
  })
})
