import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaskDailySnapshotWorker } from './task-daily-snapshot.worker'
import type { ITaskDailySnapshotRepository } from '../../domain/repositories/task-daily-snapshot.repository'
import type { ITaskRepository } from '../../domain/repositories/task.repository'
import { Task } from '../../domain/entities/task.entity'
import { TaskAssignee } from '../../domain/entities/task-assignee.value-object'
import type PgBoss from 'pg-boss'
import type { TaskDailySnapshotJobData } from './task-daily-snapshot.worker'

function makeTask(
  overrides: Partial<{
    id: string
    progress: 0 | 50 | 100
    priority: 1 | 3 | 5 | 9
    bucketId: string
    completedAt: Date | null
    assignees: TaskAssignee[]
  }> = {},
): Task {
  return Task.reconstitute({
    id: overrides.id ?? 'task-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    bucketId: overrides.bucketId ?? 'bucket-1',
    title: 'Test Task',
    description: '',
    progress: overrides.progress ?? 0,
    priority: overrides.priority ?? 5,
    startDate: null,
    dueDate: null,
    orderHint: '!',
    createdBy: 'actor-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    completedBy: overrides.completedAt ? 'actor-1' : null,
    completedAt: overrides.completedAt ?? null,
    deletedAt: null,
    checklistItemCount: 0,
    checklistCheckedCount: 0,
    assignees: overrides.assignees ?? [],
    appliedLabels: [],
    coverAttachmentId: null,
    msTaskId: null,
    msTaskEtag: null,
    msTaskDetailsEtag: null,
    pendingMsAssignments: [],
  })
}

function makeJob(data: TaskDailySnapshotJobData): PgBoss.Job<TaskDailySnapshotJobData> {
  return { id: 'job-1', name: 'task-daily-snapshot', data } as PgBoss.Job<TaskDailySnapshotJobData>
}

const mockSnapshotRepo: ITaskDailySnapshotRepository = {
  upsert: vi.fn(),
  listForPlanInRange: vi.fn(),
}

const mockTaskRepo: ITaskRepository = {
  findById: vi.fn(),
  findByBucketId: vi.fn(),
  listByPlanIncludingCompleted: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
  softDeleteMany: vi.fn(),
}

describe('TaskDailySnapshotWorker', () => {
  let worker: TaskDailySnapshotWorker

  beforeEach(() => {
    vi.clearAllMocks()
    worker = new TaskDailySnapshotWorker(mockSnapshotRepo, mockTaskRepo)
  })

  it('builds a snapshot for yesterday from current task state', async () => {
    // 3 tasks: one open/medium/bucket-1/assignee-A,
    //          one in-progress/important/bucket-1/assignee-B,
    //          one completed (not today)/urgent/bucket-2/assignee-A
    const tasks = [
      makeTask({
        id: 'task-1',
        progress: 0,
        priority: 5, // medium
        bucketId: 'bucket-1',
        completedAt: null,
        assignees: [TaskAssignee.create('actor-A', 'system')],
      }),
      makeTask({
        id: 'task-2',
        progress: 50,
        priority: 3, // important
        bucketId: 'bucket-1',
        completedAt: null,
        assignees: [TaskAssignee.create('actor-B', 'system')],
      }),
      makeTask({
        id: 'task-3',
        progress: 100,
        priority: 1, // urgent
        bucketId: 'bucket-2',
        completedAt: new Date('2026-04-17T10:00:00Z'), // prior day
        assignees: [TaskAssignee.create('actor-A', 'system')],
      }),
    ]

    vi.mocked(mockTaskRepo.listByPlanIncludingCompleted).mockResolvedValue(tasks)
    vi.mocked(mockSnapshotRepo.upsert).mockResolvedValue(undefined)

    await worker.handle(
      makeJob({ tenantId: 'tenant-1', planId: 'plan-1', snapshotDate: '2026-04-18' }),
    )

    expect(mockTaskRepo.listByPlanIncludingCompleted).toHaveBeenCalledWith('plan-1', 'tenant-1')
    expect(mockSnapshotRepo.upsert).toHaveBeenCalledTimes(1)

    const upsertArg = vi.mocked(mockSnapshotRepo.upsert).mock.calls[0]![0]
    expect(upsertArg.tenantId).toBe('tenant-1')
    expect(upsertArg.planId).toBe('plan-1')
    expect(upsertArg.snapshotDate).toBe('2026-04-18')
    expect(upsertArg.totalCount).toBe(3)
    expect(upsertArg.openCount).toBe(2) // progress 0 and 50
    expect(upsertArg.completedCount).toBe(1)
    expect(upsertArg.completedInDay).toBe(0) // completed on prior day
    expect(upsertArg.byPriority).toEqual({ urgent: 1, important: 1, medium: 1, low: 0 })
    expect(upsertArg.byBucket).toEqual({ 'bucket-1': 2, 'bucket-2': 1 })

    // actor-A: open 1 (task-1 progress=0), completed 1 (task-3)
    // actor-B: open 1 (task-2 progress=50)
    const byAssignee = upsertArg.byAssignee
    const actorA = byAssignee.find((e) => e.actorId === 'actor-A')
    const actorB = byAssignee.find((e) => e.actorId === 'actor-B')
    expect(actorA).toEqual({ actorId: 'actor-A', open: 1, completed: 1 })
    expect(actorB).toEqual({ actorId: 'actor-B', open: 1, completed: 0 })
  })

  it('is idempotent — running twice produces identical upsert calls', async () => {
    const tasks = [
      makeTask({ id: 'task-1', progress: 0, priority: 5, bucketId: 'bucket-1' }),
      makeTask({
        id: 'task-2',
        progress: 100,
        priority: 9,
        bucketId: 'bucket-2',
        completedAt: new Date('2026-04-18T08:00:00Z'),
      }),
    ]

    vi.mocked(mockTaskRepo.listByPlanIncludingCompleted).mockResolvedValue(tasks)
    vi.mocked(mockSnapshotRepo.upsert).mockResolvedValue(undefined)

    const jobData = { tenantId: 'tenant-1', planId: 'plan-1', snapshotDate: '2026-04-18' }
    await worker.handle(makeJob(jobData))
    await worker.handle(makeJob(jobData))

    expect(mockSnapshotRepo.upsert).toHaveBeenCalledTimes(2)
    const firstCall = vi.mocked(mockSnapshotRepo.upsert).mock.calls[0]![0]
    const secondCall = vi.mocked(mockSnapshotRepo.upsert).mock.calls[1]![0]
    expect(firstCall).toEqual(secondCall)
  })

  it('counts completedInDay only for tasks whose completedAt date matches snapshotDate', async () => {
    // Task completed on 2026-04-18 → counts
    const completedOnDate = makeTask({
      id: 'task-1',
      progress: 100,
      priority: 5,
      bucketId: 'bucket-1',
      completedAt: new Date('2026-04-18T15:00:00Z'),
    })

    // Task completed on prior day → does NOT count
    const completedPriorDay = makeTask({
      id: 'task-2',
      progress: 100,
      priority: 5,
      bucketId: 'bucket-1',
      completedAt: new Date('2026-04-17T23:00:00Z'),
    })

    vi.mocked(mockTaskRepo.listByPlanIncludingCompleted).mockResolvedValue([
      completedOnDate,
      completedPriorDay,
    ])
    vi.mocked(mockSnapshotRepo.upsert).mockResolvedValue(undefined)

    await worker.handle(
      makeJob({ tenantId: 'tenant-1', planId: 'plan-1', snapshotDate: '2026-04-18' }),
    )

    const upsertArg = vi.mocked(mockSnapshotRepo.upsert).mock.calls[0]![0]
    expect(upsertArg.completedInDay).toBe(1)
    expect(upsertArg.completedCount).toBe(2)
    expect(upsertArg.openCount).toBe(0)
  })
})
