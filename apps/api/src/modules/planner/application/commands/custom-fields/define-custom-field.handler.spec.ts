import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { DefineCustomFieldHandler } from './define-custom-field.handler'
import { DefineCustomFieldCommand } from './define-custom-field.command'
import type { ICustomFieldDefRepository } from '../../../domain/repositories/custom-field-def.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { CustomFieldLimitExceededException } from '../../../domain/exceptions/custom-field-limit-exceeded.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'

describe('DefineCustomFieldHandler', () => {
  let handler: DefineCustomFieldHandler
  let repo: { countByPlan: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = {
      countByPlan: vi.fn().mockResolvedValue(0),
      save: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new DefineCustomFieldHandler(
      repo as unknown as ICustomFieldDefRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('creates field def and returns id', async () => {
    const cmd = new DefineCustomFieldCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      'Status',
      'text',
      null,
      0,
    )
    const result = await handler.execute(cmd)
    expect(repo.save).toHaveBeenCalledOnce()
    expect(result).toEqual({ id: expect.any(String) })
  })

  it('throws when plan already has 10 field defs', async () => {
    repo.countByPlan.mockResolvedValue(10)
    const cmd = new DefineCustomFieldCommand(TENANT_ID, PLAN_ID, ACTOR_ID, 'Extra', 'text', null, 0)
    await expect(handler.execute(cmd)).rejects.toThrow(CustomFieldLimitExceededException)
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('throws when auth fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const cmd = new DefineCustomFieldCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      'Status',
      'text',
      null,
      0,
    )
    await expect(handler.execute(cmd)).rejects.toThrow(UnauthorizedPlanAccessException)
  })
})
