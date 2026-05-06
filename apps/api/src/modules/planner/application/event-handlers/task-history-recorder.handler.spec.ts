import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TaskUpdatedEvent,
  TaskProgressSetEvent,
  TaskAssignedEvent,
  TaskUnassignedEvent,
  TaskMovedEvent,
  TaskLabelAppliedEvent,
  TaskLabelRemovedEvent,
  TaskCustomFieldUpdatedEvent,
  TaskDependencyAddedEvent,
  TaskDependencyRemovedEvent,
  TaskSprintAssignedEvent,
} from '@future/event-contracts'
import { TaskHistoryRecorderHandler } from './task-history-recorder.handler'
import type { ITaskHistoryRepository } from '../../domain/repositories/task-history.repository'

const TENANT_ID = 'tenant-hist-1'
const ACTOR_ID = 'actor-hist-1'
const TASK_ID = 'task-hist-1'
const PLAN_ID = 'plan-hist-1'

describe('TaskHistoryRecorderHandler', () => {
  let handler: TaskHistoryRecorderHandler
  let repo: {
    append: ReturnType<typeof vi.fn>
    listByTask: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    repo = {
      append: vi.fn().mockResolvedValue(undefined),
      listByTask: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    }
    handler = new TaskHistoryRecorderHandler(repo as unknown as ITaskHistoryRepository)
  })

  it('records TaskUpdatedEvent', async () => {
    const event = new TaskUpdatedEvent(TENANT_ID, ACTOR_ID, TASK_ID, PLAN_ID, ['priority'], 'user')
    await handler.handleTaskUpdated(event)
    expect(repo.append).toHaveBeenCalledOnce()
    expect(repo.append.mock.calls[0][0].field).toBe('priority')
  })

  it('records TaskUpdatedEvent with multiple changed fields (one call per field)', async () => {
    const event = new TaskUpdatedEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      ['title', 'description'],
      'user',
    )
    await handler.handleTaskUpdated(event)
    expect(repo.append).toHaveBeenCalledTimes(2)
    const fields = repo.append.mock.calls.map((c: [{ field: string }]) => c[0].field)
    expect(fields).toContain('title')
    expect(fields).toContain('description')
  })

  it('records TaskProgressSetEvent', async () => {
    const event = new TaskProgressSetEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      100,
      ['progress'],
      'user',
    )
    await handler.handleProgressSet(event)
    const record = repo.append.mock.calls[0][0]
    expect(record.field).toBe('progress')
    expect(record.newValue).toBe(100)
    expect(record.oldValue).toBeNull()
  })

  it('records TaskAssignedEvent', async () => {
    const event = new TaskAssignedEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      'assignee-1',
      ['assignees'],
      'user',
    )
    await handler.handleAssigned(event)
    expect(repo.append.mock.calls[0][0].field).toBe('assignee.added')
  })

  it('records TaskUnassignedEvent', async () => {
    const event = new TaskUnassignedEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      'assignee-1',
      ['assignees'],
      'user',
    )
    await handler.handleUnassigned(event)
    expect(repo.append.mock.calls[0][0].field).toBe('assignee.removed')
  })

  it('records TaskMovedEvent', async () => {
    const event = new TaskMovedEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      'bucket-new',
      'hint',
      ['bucket'],
      'user',
    )
    await handler.handleMoved(event)
    expect(repo.append.mock.calls[0][0].field).toBe('bucket')
    expect(repo.append.mock.calls[0][0].newValue).toBe('bucket-new')
  })

  it('records TaskLabelAppliedEvent', async () => {
    const event = new TaskLabelAppliedEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      'category1',
      ['labels'],
      'user',
    )
    await handler.handleLabelApplied(event)
    expect(repo.append.mock.calls[0][0].field).toBe('label.applied')
    expect(repo.append.mock.calls[0][0].newValue).toBe('category1')
  })

  it('records TaskLabelRemovedEvent', async () => {
    const event = new TaskLabelRemovedEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      'category1',
      ['labels'],
      'user',
    )
    await handler.handleLabelRemoved(event)
    expect(repo.append.mock.calls[0][0].field).toBe('label.removed')
  })

  it('records TaskCustomFieldUpdatedEvent', async () => {
    const event = new TaskCustomFieldUpdatedEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      'def-id-1',
      'My Custom Field',
    )
    await handler.handleCustomFieldUpdated(event)
    const record = repo.append.mock.calls[0][0]
    expect(record.field).toBe('customField.My Custom Field')
  })

  it('records TaskDependencyAddedEvent', async () => {
    const event = new TaskDependencyAddedEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      'from-task-1',
      'to-task-1',
      'finish_to_start',
    )
    await handler.handleDependencyAdded(event)
    const record = repo.append.mock.calls[0][0]
    expect(record.field).toBe('dependency.added')
    expect(record.newValue).toEqual({
      fromTaskId: 'from-task-1',
      toTaskId: 'to-task-1',
      kind: 'finish_to_start',
    })
  })

  it('records TaskDependencyRemovedEvent', async () => {
    const event = new TaskDependencyRemovedEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      'from-task-1',
      'to-task-1',
      'finish_to_start',
    )
    await handler.handleDependencyRemoved(event)
    expect(repo.append.mock.calls[0][0].field).toBe('dependency.removed')
  })

  it('records TaskSprintAssignedEvent (sprint assigned)', async () => {
    const event = new TaskSprintAssignedEvent(
      TENANT_ID,
      ACTOR_ID,
      TASK_ID,
      PLAN_ID,
      'sprint-1',
      'Sprint 1',
    )
    await handler.handleSprintAssigned(event)
    const record = repo.append.mock.calls[0][0]
    expect(record.field).toBe('sprint')
    expect(record.newValue).toBe('sprint-1')
  })

  it('records TaskSprintAssignedEvent (sprint unassigned with null sprintId)', async () => {
    const event = new TaskSprintAssignedEvent(TENANT_ID, ACTOR_ID, TASK_ID, PLAN_ID, null)
    await handler.handleSprintAssigned(event)
    const record = repo.append.mock.calls[0][0]
    expect(record.field).toBe('sprint')
    expect(record.newValue).toBeNull()
  })

  it('does not throw when append fails (best-effort)', async () => {
    repo.append.mockRejectedValue(new Error('DB error'))
    const event = new TaskProgressSetEvent(TENANT_ID, ACTOR_ID, TASK_ID, PLAN_ID, 50, [], 'user')
    await expect(handler.handleProgressSet(event)).resolves.toBeUndefined()
  })
})
