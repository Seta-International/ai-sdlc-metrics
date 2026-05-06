import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { SetCustomFieldValueHandler } from './set-custom-field-value.handler'
import { SetCustomFieldValueCommand } from './set-custom-field-value.command'
import type { ICustomFieldDefRepository } from '../../../domain/repositories/custom-field-def.repository'
import type { ITaskCustomFieldValueRepository } from '../../../domain/repositories/task-custom-field-value.repository'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CustomFieldDefNotFoundException } from '../../../domain/exceptions/custom-field-def-not-found.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const DEF_ID = 'def-1'

const EXISTING_DEF = {
  id: DEF_ID,
  tenantId: TENANT_ID,
  planId: PLAN_ID,
  name: 'Score',
  kind: 'number' as const,
  choiceOptions: null,
  position: 0,
}

const EXISTING_TASK = {
  id: TASK_ID,
  tenantId: TENANT_ID,
  planId: PLAN_ID,
}

describe('SetCustomFieldValueHandler', () => {
  let handler: SetCustomFieldValueHandler
  let defRepo: { findById: ReturnType<typeof vi.fn> }
  let taskRepo: { findById: ReturnType<typeof vi.fn> }
  let valueRepo: { upsert: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    defRepo = { findById: vi.fn().mockResolvedValue(EXISTING_DEF) }
    taskRepo = { findById: vi.fn().mockResolvedValue(EXISTING_TASK) }
    valueRepo = { upsert: vi.fn().mockResolvedValue(undefined) }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new SetCustomFieldValueHandler(
      defRepo as unknown as ICustomFieldDefRepository,
      taskRepo as unknown as ITaskRepository,
      valueRepo as unknown as ITaskCustomFieldValueRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('upserts value and emits event', async () => {
    const cmd = new SetCustomFieldValueCommand(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, DEF_ID, {
      number: 42,
    })
    await handler.execute(cmd)
    expect(valueRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK_ID, fieldDefId: DEF_ID }),
    )
    expect(eventBus.publish).toHaveBeenCalledOnce()
  })

  it('throws when field def not found', async () => {
    defRepo.findById.mockResolvedValue(null)
    const cmd = new SetCustomFieldValueCommand(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, DEF_ID, {
      number: 1,
    })
    await expect(handler.execute(cmd)).rejects.toThrow(CustomFieldDefNotFoundException)
  })

  it('throws when task not found', async () => {
    taskRepo.findById.mockResolvedValue(null)
    const cmd = new SetCustomFieldValueCommand(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, DEF_ID, {
      number: 1,
    })
    await expect(handler.execute(cmd)).rejects.toThrow(TaskNotFoundException)
  })
})
