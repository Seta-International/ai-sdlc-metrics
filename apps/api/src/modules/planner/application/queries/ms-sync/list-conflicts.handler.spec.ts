import { describe, it, expect, vi } from 'vitest'
import { ListConflictsHandler } from './list-conflicts.handler'
import { ListConflictsQuery } from './list-conflicts.query'
import type { IMsSyncConflictRepository } from '../../../domain/repositories/ms-sync-conflict.repository'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import { MsSyncConflictEntity } from '../../../domain/entities/ms-sync-conflict.entity'
import { Task } from '../../../domain/entities/task.entity'
import { Plan } from '../../../domain/entities/plan.entity'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'

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

function makeTask(overrides: { id?: string; title?: string; planId?: string } = {}): Task {
  return Task.reconstitute({
    id: overrides.id ?? 'task-1',
    tenantId: 'tenant-1',
    planId: overrides.planId ?? 'plan-1',
    bucketId: 'bucket-1',
    title: overrides.title ?? 'My Task',
    description: '',
    progress: 0,
    priority: 5,
    startDate: null,
    dueDate: null,
    orderHint: '!',
    createdBy: 'actor-1',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    completedBy: null,
    completedAt: null,
    deletedAt: null,
    checklistItemCount: 0,
    checklistCheckedCount: 0,
    assignees: [],
    appliedLabels: [],
    coverAttachmentId: null,
    msTaskId: null,
    msTaskEtag: null,
    msTaskDetailsEtag: null,
    pendingMsAssignments: [],
  })
}

function makePlan(overrides: { id?: string; name?: string } = {}): Plan {
  return Plan.reconstitute({
    id: overrides.id ?? 'plan-1',
    tenantId: 'tenant-1',
    name: overrides.name ?? 'My Plan',
    description: '',
    container: PlanContainer.of({ type: 'future_only' }),
    createdBy: 'actor-1',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    deletedAt: null,
    msPlanId: null,
    msPlanEtag: null,
    buckets: [],
    labels: [],
    members: [],
    ownerActorId: null,
    syncEnabled: false,
  })
}

function makeHandler(
  conflictRepo: Partial<IMsSyncConflictRepository>,
  taskRepo: Partial<ITaskRepository> = {},
  planRepo: Partial<IPlanRepository> = {},
): ListConflictsHandler {
  return new ListConflictsHandler(
    conflictRepo as IMsSyncConflictRepository,
    taskRepo as ITaskRepository,
    planRepo as IPlanRepository,
  )
}

describe('ListConflictsHandler', () => {
  it('returns conflicts with correct DTO shape (task not found → null titles)', async () => {
    const conflict = makeConflict()
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      list: vi.fn().mockResolvedValue([conflict]),
    }
    const taskRepo: Partial<ITaskRepository> = {
      findById: vi.fn().mockResolvedValue(null),
    }
    const planRepo: Partial<IPlanRepository> = {
      findById: vi.fn().mockResolvedValue(null),
    }
    const handler = makeHandler(conflictRepo, taskRepo, planRepo)

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

  it('populates taskTitle and planTitle when task and plan exist', async () => {
    const conflict = makeConflict({ taskId: 'task-1' })
    const task = makeTask({ id: 'task-1', title: 'Fix the bug', planId: 'plan-1' })
    const plan = makePlan({ id: 'plan-1', name: 'Sprint 42' })

    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      list: vi.fn().mockResolvedValue([conflict]),
    }
    const taskRepo: Partial<ITaskRepository> = {
      findById: vi.fn().mockResolvedValue(task),
    }
    const planRepo: Partial<IPlanRepository> = {
      findById: vi.fn().mockResolvedValue(plan),
    }
    const handler = makeHandler(conflictRepo, taskRepo, planRepo)

    const result = await handler.execute(
      new ListConflictsQuery('tenant-1', { resolved: 'open', limit: 100 }),
    )

    expect(result.conflicts[0].taskTitle).toBe('Fix the bug')
    expect(result.conflicts[0].planTitle).toBe('Sprint 42')
    expect(taskRepo.findById).toHaveBeenCalledWith('task-1', 'tenant-1')
    expect(planRepo.findById).toHaveBeenCalledWith('plan-1', 'tenant-1')
  })

  it('deduplicates task/plan lookups across multiple conflicts for the same task', async () => {
    const conflicts = [
      makeConflict({ id: 'conflict-1', taskId: 'task-1' }),
      makeConflict({ id: 'conflict-2', taskId: 'task-1' }),
    ]
    const task = makeTask({ id: 'task-1', title: 'Shared Task', planId: 'plan-1' })
    const plan = makePlan({ id: 'plan-1', name: 'My Plan' })

    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      list: vi.fn().mockResolvedValue(conflicts),
    }
    const taskRepo: Partial<ITaskRepository> = {
      findById: vi.fn().mockResolvedValue(task),
    }
    const planRepo: Partial<IPlanRepository> = {
      findById: vi.fn().mockResolvedValue(plan),
    }
    const handler = makeHandler(conflictRepo, taskRepo, planRepo)

    const result = await handler.execute(
      new ListConflictsQuery('tenant-1', { resolved: 'open', limit: 100 }),
    )

    expect(taskRepo.findById).toHaveBeenCalledTimes(1)
    expect(planRepo.findById).toHaveBeenCalledTimes(1)
    expect(result.conflicts[0].taskTitle).toBe('Shared Task')
    expect(result.conflicts[1].taskTitle).toBe('Shared Task')
  })

  it('sets null titles for conflicts without a taskId', async () => {
    const conflict = makeConflict({ taskId: null })
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      list: vi.fn().mockResolvedValue([conflict]),
    }
    const taskRepo: Partial<ITaskRepository> = {
      findById: vi.fn(),
    }
    const planRepo: Partial<IPlanRepository> = {
      findById: vi.fn(),
    }
    const handler = makeHandler(conflictRepo, taskRepo, planRepo)

    const result = await handler.execute(
      new ListConflictsQuery('tenant-1', { resolved: 'open', limit: 100 }),
    )

    expect(result.conflicts[0].taskTitle).toBeNull()
    expect(result.conflicts[0].planTitle).toBeNull()
    expect(taskRepo.findById).not.toHaveBeenCalled()
  })

  it('returns limitCode from field for push_403_quota conflicts', async () => {
    const conflict = makeConflict({ kind: 'push_403_quota', field: 'PLAN_BUCKET_LIMIT' })
    const conflictRepo: Partial<IMsSyncConflictRepository> = {
      list: vi.fn().mockResolvedValue([conflict]),
    }
    const taskRepo: Partial<ITaskRepository> = {
      findById: vi.fn().mockResolvedValue(null),
    }
    const handler = makeHandler(conflictRepo, taskRepo)

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
    const taskRepo: Partial<ITaskRepository> = {
      findById: vi.fn().mockResolvedValue(null),
    }
    const handler = makeHandler(conflictRepo, taskRepo)

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
    const taskRepo: Partial<ITaskRepository> = {
      findById: vi.fn().mockResolvedValue(null),
    }
    const handler = makeHandler(conflictRepo, taskRepo)

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
    const handler = makeHandler(conflictRepo)

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
