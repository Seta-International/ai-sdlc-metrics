import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { RemoveDependencyHandler } from './remove-dependency.handler'
import { RemoveDependencyCommand } from './remove-dependency.command'
import type { ITaskDependencyRepository } from '../../../domain/repositories/task-dependency.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskDependencyRemovedEvent } from '@future/event-contracts'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const FROM_TASK_ID = 'task-from'
const TO_TASK_ID = 'task-to'

describe('RemoveDependencyHandler', () => {
  let handler: RemoveDependencyHandler
  let depRepo: {
    exists: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    add: ReturnType<typeof vi.fn>
    listEdgesForPlan: ReturnType<typeof vi.fn>
    listForTask: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    depRepo = {
      exists: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
      listEdgesForPlan: vi.fn().mockResolvedValue([]),
      listForTask: vi.fn().mockResolvedValue({ predecessors: [], successors: [] }),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }

    handler = new RemoveDependencyHandler(
      depRepo as unknown as ITaskDependencyRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('removes dependency and publishes event (happy path)', async () => {
    const cmd = new RemoveDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_TASK_ID,
      TO_TASK_ID,
      'finish_to_start',
    )
    await handler.execute(cmd)

    expect(depRepo.remove).toHaveBeenCalledWith(
      FROM_TASK_ID,
      TO_TASK_ID,
      'finish_to_start',
      TENANT_ID,
    )
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskDependencyRemovedEvent))
  })

  it('is a no-op when dependency does not exist', async () => {
    depRepo.exists.mockResolvedValue(false)

    const cmd = new RemoveDependencyCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      FROM_TASK_ID,
      TO_TASK_ID,
      'finish_to_start',
    )
    await handler.execute(cmd)

    expect(depRepo.remove).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
