import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { UpdateCustomFieldDefHandler } from './update-custom-field-def.handler'
import { UpdateCustomFieldDefCommand } from './update-custom-field-def.command'
import type { ICustomFieldDefRepository } from '../../../domain/repositories/custom-field-def.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CustomFieldDefNotFoundException } from '../../../domain/exceptions/custom-field-def-not-found.exception'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const DEF_ID = 'def-1'

const EXISTING_DEF = {
  id: DEF_ID,
  tenantId: TENANT_ID,
  planId: PLAN_ID,
  name: 'Old Name',
  kind: 'text' as const,
  choiceOptions: null,
  position: 0,
}

describe('UpdateCustomFieldDefHandler', () => {
  let handler: UpdateCustomFieldDefHandler
  let repo: {
    findById: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = {
      findById: vi.fn().mockResolvedValue(EXISTING_DEF),
      update: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new UpdateCustomFieldDefHandler(
      repo as unknown as ICustomFieldDefRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('updates name and persists', async () => {
    const cmd = new UpdateCustomFieldDefCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      DEF_ID,
      'New Name',
      null,
      0,
    )
    await handler.execute(cmd)
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: DEF_ID, name: 'New Name' }),
    )
  })

  it('throws when field def not found', async () => {
    repo.findById.mockResolvedValue(null)
    const cmd = new UpdateCustomFieldDefCommand(TENANT_ID, PLAN_ID, ACTOR_ID, DEF_ID, 'X', null, 0)
    await expect(handler.execute(cmd)).rejects.toThrow(CustomFieldDefNotFoundException)
  })

  it('throws when auth fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const cmd = new UpdateCustomFieldDefCommand(TENANT_ID, PLAN_ID, ACTOR_ID, DEF_ID, 'X', null, 0)
    await expect(handler.execute(cmd)).rejects.toThrow(UnauthorizedPlanAccessException)
  })
})
