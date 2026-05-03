import { describe, it, expect, vi } from 'vitest'
import { AcceptMsStateForConflictHandler } from './accept-ms-state-for-conflict.handler'
import { AcceptMsStateForConflictCommand } from './accept-ms-state-for-conflict.command'
import type { IMsSyncConflictRepository } from '../../../domain/repositories/ms-sync-conflict.repository'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { MsSyncConflictEntity } from '../../../domain/entities/ms-sync-conflict.entity'
import { MsSyncAcceptNotSupportedException } from '../../../domain/exceptions/ms-sync-accept-not-supported.exception'

function makeConflict(
  overrides: Partial<Parameters<typeof MsSyncConflictEntity.reconstitute>[0]> = {},
): MsSyncConflictEntity {
  return MsSyncConflictEntity.reconstitute({
    id: 'conflict-1',
    tenantId: 'tenant-1',
    kind: 'field_lww',
    taskId: 'task-1',
    planId: null,
    field: 'title',
    mineValue: 'Old title',
    theirsValue: { title: 'MS title' },
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

describe('AcceptMsStateForConflictHandler', () => {
  it('calls applyMsWonFields with theirsValue and marks conflict resolved with applied_theirs', async () => {
    const conflict = makeConflict()
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(conflict),
      markResolved: vi.fn().mockResolvedValue(undefined),
    }
    const taskRepo: Partial<ITaskRepository> = {
      applyMsWonFields: vi.fn().mockResolvedValue(undefined),
    }
    const handler = new AcceptMsStateForConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      taskRepo as ITaskRepository,
    )

    await handler.execute(new AcceptMsStateForConflictCommand('tenant-1', 'actor-1', 'conflict-1'))

    expect(taskRepo.applyMsWonFields).toHaveBeenCalledWith(
      'task-1',
      { title: 'MS title' },
      { origin: 'ms-sync-pull' },
    )
    expect(conflictRepo.markResolved).toHaveBeenCalledWith(
      'conflict-1',
      'actor-1',
      'applied_theirs',
    )
  })

  it('throws if conflict is already resolved', async () => {
    const conflict = makeConflict({ resolvedAt: new Date() })
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(conflict),
      markResolved: vi.fn(),
    }
    const taskRepo: Partial<ITaskRepository> = {
      applyMsWonFields: vi.fn(),
    }
    const handler = new AcceptMsStateForConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      taskRepo as ITaskRepository,
    )

    await expect(
      handler.execute(new AcceptMsStateForConflictCommand('tenant-1', 'actor-1', 'conflict-1')),
    ).rejects.toThrow('Already resolved')
    expect(taskRepo.applyMsWonFields).not.toHaveBeenCalled()
    expect(conflictRepo.markResolved).not.toHaveBeenCalled()
  })

  it('throws if conflict not found', async () => {
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(null),
      markResolved: vi.fn(),
    }
    const taskRepo: Partial<ITaskRepository> = {
      applyMsWonFields: vi.fn(),
    }
    const handler = new AcceptMsStateForConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      taskRepo as ITaskRepository,
    )

    await expect(
      handler.execute(new AcceptMsStateForConflictCommand('tenant-1', 'actor-1', 'conflict-1')),
    ).rejects.toThrow('Not found')
  })

  it('throws if conflict belongs to different tenant (get returns null with tenantId filter)', async () => {
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(null),
      markResolved: vi.fn(),
    }
    const taskRepo: Partial<ITaskRepository> = {
      applyMsWonFields: vi.fn(),
    }
    const handler = new AcceptMsStateForConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      taskRepo as ITaskRepository,
    )

    await expect(
      handler.execute(new AcceptMsStateForConflictCommand('tenant-1', 'actor-1', 'conflict-1')),
    ).rejects.toThrow('Not found')
    expect(conflictRepo.get).toHaveBeenCalledWith('conflict-1', 'tenant-1')
  })

  it('throws if taskId is null', async () => {
    const conflict = makeConflict({ taskId: null })
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(conflict),
      markResolved: vi.fn(),
    }
    const taskRepo: Partial<ITaskRepository> = {
      applyMsWonFields: vi.fn(),
    }
    const handler = new AcceptMsStateForConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      taskRepo as ITaskRepository,
    )

    await expect(
      handler.execute(new AcceptMsStateForConflictCommand('tenant-1', 'actor-1', 'conflict-1')),
    ).rejects.toThrow('Cannot accept MS state for a non-task conflict')
    expect(taskRepo.applyMsWonFields).not.toHaveBeenCalled()
    expect(conflictRepo.markResolved).not.toHaveBeenCalled()
  })

  it('throws MsSyncAcceptNotSupportedException when theirsValue is null', async () => {
    const conflict = makeConflict({ kind: 'push_412_exhausted', theirsValue: null })
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      get: vi.fn().mockResolvedValue(conflict),
      markResolved: vi.fn(),
    }
    const taskRepo: Partial<ITaskRepository> = {
      applyMsWonFields: vi.fn(),
    }
    const handler = new AcceptMsStateForConflictHandler(
      conflictRepo as IMsSyncConflictRepository,
      taskRepo as ITaskRepository,
    )

    await expect(
      handler.execute(new AcceptMsStateForConflictCommand('tenant-1', 'actor-1', 'conflict-1')),
    ).rejects.toThrow(MsSyncAcceptNotSupportedException)
    expect(taskRepo.applyMsWonFields).not.toHaveBeenCalled()
    expect(conflictRepo.markResolved).not.toHaveBeenCalled()
  })
})
