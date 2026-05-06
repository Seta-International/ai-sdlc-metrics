import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { AddDependencyHandler } from './add-dependency.handler'
import { AddDependencyCommand } from './add-dependency.command'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { ITaskDependencyRepository } from '../../../domain/repositories/task-dependency.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { DependencySelfLinkException } from '../../../domain/exceptions/dependency-self-link.exception'
import { DependencyCycleDetectedException } from '../../../domain/exceptions/dependency-cycle-detected.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { TaskDependencyAddedEvent } from '@future/event-contracts'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const FROM_TASK_ID = 'task-from'
const TO_TASK_ID = 'task-to'

const makeTask = (id: string) => ({ id, tenantId: TENANT_ID, planId: PLAN_ID }) as never

describe('AddDependencyHandler', () => {
  let handler: AddDependencyHandler
  let taskRepo: {
    findById: ReturnType<typeof vi.fn>
  }
  let depRepo: {
    listEdgesForPlan: ReturnType<typeof vi.fn>
    add: ReturnType<typeof vi.fn>
    exists: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    listForTask: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    taskRepo = {
      findById: vi.fn().mockResolvedValue(makeTask('task-id')),
    }
    depRepo = {
      listEdgesForPlan: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
      remove: vi.fn().mockResolvedValue(undefined),
      listForTask: vi.fn().mockResolvedValue({ predecessors: [], successors: [] }),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }

    handler = new AddDependencyHandler(
      taskRepo as unknown as ITaskRepository,
      depRepo as unknown as ITaskDependencyRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('adds dependency and publishes event (happy path)', async () => {
    taskRepo.findById
      .mockResolvedValueOnce(makeTask(FROM_TASK_ID))
      .mockResolvedValueOnce(makeTask(TO_TASK_ID))

    const cmd = new AddDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_TASK_ID,
      TO_TASK_ID,
      'finish_to_start',
    )
    await handler.execute(cmd)

    expect(depRepo.add).toHaveBeenCalledWith({
      fromTaskId: FROM_TASK_ID,
      toTaskId: TO_TASK_ID,
      kind: 'finish_to_start',
      tenantId: TENANT_ID,
      createdBy: ACTOR_ID,
    })
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskDependencyAddedEvent))
  })

  it('throws DependencySelfLinkException when fromTaskId === toTaskId', async () => {
    const cmd = new AddDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_TASK_ID,
      FROM_TASK_ID,
      'finish_to_start',
    )
    await expect(handler.execute(cmd)).rejects.toThrow(DependencySelfLinkException)
    expect(depRepo.add).not.toHaveBeenCalled()
  })

  it('throws DependencyCycleDetectedException when cycle would be created', async () => {
    taskRepo.findById
      .mockResolvedValueOnce(makeTask(FROM_TASK_ID))
      .mockResolvedValueOnce(makeTask(TO_TASK_ID))
    // Existing edge: TO_TASK_ID → FROM_TASK_ID (adding FROM→TO would cycle)
    depRepo.listEdgesForPlan.mockResolvedValue([{ from: TO_TASK_ID, to: FROM_TASK_ID }])

    const cmd = new AddDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_TASK_ID,
      TO_TASK_ID,
      'finish_to_start',
    )
    await expect(handler.execute(cmd)).rejects.toThrow(DependencyCycleDetectedException)
    expect(depRepo.add).not.toHaveBeenCalled()
  })

  it('throws TaskNotFoundException when fromTask does not exist', async () => {
    taskRepo.findById.mockResolvedValueOnce(null)

    const cmd = new AddDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_TASK_ID,
      TO_TASK_ID,
      'finish_to_start',
    )
    await expect(handler.execute(cmd)).rejects.toThrow(TaskNotFoundException)
    expect(depRepo.add).not.toHaveBeenCalled()
  })

  it('throws TaskNotFoundException when successor task not found', async () => {
    taskRepo.findById.mockImplementation((id: string) =>
      id === TO_TASK_ID ? Promise.resolve(null) : Promise.resolve(makeTask(id)),
    )
    const cmd = new AddDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_TASK_ID,
      TO_TASK_ID,
      'finish_to_start',
    )
    await expect(handler.execute(cmd)).rejects.toThrow(TaskNotFoundException)
    expect(depRepo.add).not.toHaveBeenCalled()
  })
})
