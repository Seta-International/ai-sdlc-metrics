import { describe, it, expect, vi } from 'vitest'
import { ForceResyncTaskCommand } from './force-resync-task.command'
import { ForceResyncTaskHandler } from './force-resync-task.handler'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { MsGraphClient } from '../../../infrastructure/ms-graph/ms-graph-client'

const TENANT_ID = 'tenant-1'
const ACTOR_ID = 'actor-1'
const TASK_ID = 'task-1'
const MS_TASK_ID = 'ms-task-abc'

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    tenantId: TENANT_ID,
    planId: 'plan-1',
    msTaskId: MS_TASK_ID,
    msTaskEtag: 'etag-1',
    lastPushedAt: null,
    ...overrides,
  }
}

function makeMsTaskBody() {
  return {
    id: MS_TASK_ID,
    '@odata.etag': 'etag-abc',
    planId: 'ms-plan-1',
    bucketId: 'ms-bucket-1',
    title: 'My Task',
    orderHint: ' !',
    percentComplete: 50,
    priority: 5,
    startDateTime: null,
    dueDateTime: null,
    completedDateTime: null,
    appliedCategories: {},
    assignments: {},
  }
}

function makeMsDetailsBody() {
  return {
    id: MS_TASK_ID,
    '@odata.etag': 'etag-details-abc',
    description: 'Some description',
    previewType: 'automatic',
    checklist: {},
    references: {},
  }
}

function makeHandler(overrides: {
  task?: ReturnType<typeof makeTask> | null
  taskBody?: Record<string, unknown> | null
  detailsBody?: Record<string, unknown> | null
}) {
  const taskRepo: Partial<ITaskRepository> = {
    findById: vi.fn().mockResolvedValue(overrides.task !== undefined ? overrides.task : makeTask()),
    upsertFromMs: vi.fn().mockResolvedValue({ id: TASK_ID }),
    upsertDetailsFromMs: vi.fn().mockResolvedValue(undefined),
  }

  const graph: Partial<MsGraphClient> = {
    get: vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        body: overrides.taskBody !== undefined ? overrides.taskBody : makeMsTaskBody(),
        etag: null,
      })
      .mockResolvedValueOnce({
        status: 200,
        body: overrides.detailsBody !== undefined ? overrides.detailsBody : makeMsDetailsBody(),
        etag: null,
      }),
  }

  return {
    handler: new ForceResyncTaskHandler(taskRepo as ITaskRepository, graph as MsGraphClient),
    taskRepo,
    graph,
  }
}

describe('ForceResyncTaskHandler', () => {
  it('calls graph twice and upserts task + details on success', async () => {
    const { handler, taskRepo, graph } = makeHandler({})
    await handler.execute(new ForceResyncTaskCommand(TENANT_ID, ACTOR_ID, TASK_ID))

    expect(graph.get).toHaveBeenCalledTimes(2)
    expect(graph.get).toHaveBeenNthCalledWith(
      1,
      TENANT_ID,
      `/planner/tasks/${encodeURIComponent(MS_TASK_ID)}`,
    )
    expect(graph.get).toHaveBeenNthCalledWith(
      2,
      TENANT_ID,
      `/planner/tasks/${encodeURIComponent(MS_TASK_ID)}/details`,
    )

    expect(taskRepo.upsertFromMs).toHaveBeenCalledWith(
      expect.objectContaining({
        msTaskId: MS_TASK_ID,
        localPlanId: 'plan-1',
        assigneeActorIds: [],
        pendingMsAssignments: [],
      }),
      { origin: 'ms-sync-force' },
    )

    expect(taskRepo.upsertDetailsFromMs).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: TASK_ID,
        msTaskId: MS_TASK_ID,
      }),
      { origin: 'ms-sync-force' },
    )
  })

  it('throws if task not found', async () => {
    const { handler } = makeHandler({ task: null })
    await expect(
      handler.execute(new ForceResyncTaskCommand(TENANT_ID, ACTOR_ID, TASK_ID)),
    ).rejects.toThrow('Task not MS-linked')
  })

  it('throws if task has no msTaskId', async () => {
    const { handler } = makeHandler({ task: makeTask({ msTaskId: null }) })
    await expect(
      handler.execute(new ForceResyncTaskCommand(TENANT_ID, ACTOR_ID, TASK_ID)),
    ).rejects.toThrow('Task not MS-linked')
  })

  it('throws if graph returns no body for task', async () => {
    const { handler } = makeHandler({ taskBody: null })
    await expect(
      handler.execute(new ForceResyncTaskCommand(TENANT_ID, ACTOR_ID, TASK_ID)),
    ).rejects.toThrow('Failed to refresh from MS')
  })
})
