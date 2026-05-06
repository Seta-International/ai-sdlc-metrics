import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { DeleteCustomFieldDefHandler } from './delete-custom-field-def.handler'
import { DeleteCustomFieldDefCommand } from './delete-custom-field-def.command'
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
  name: 'Score',
  kind: 'number' as const,
  choiceOptions: null,
  position: 0,
}

describe('DeleteCustomFieldDefHandler', () => {
  let handler: DeleteCustomFieldDefHandler
  let repo: {
    findById: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = {
      findById: vi.fn().mockResolvedValue(EXISTING_DEF),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new DeleteCustomFieldDefHandler(
      repo as unknown as ICustomFieldDefRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('deletes field def', async () => {
    const cmd = new DeleteCustomFieldDefCommand(TENANT_ID, PLAN_ID, ACTOR_ID, DEF_ID)
    await handler.execute(cmd)
    expect(repo.delete).toHaveBeenCalledWith(DEF_ID, TENANT_ID)
  })

  it('throws when field def not found', async () => {
    repo.findById.mockResolvedValue(null)
    const cmd = new DeleteCustomFieldDefCommand(TENANT_ID, PLAN_ID, ACTOR_ID, DEF_ID)
    await expect(handler.execute(cmd)).rejects.toThrow(CustomFieldDefNotFoundException)
  })

  it('throws when auth fails', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const cmd = new DeleteCustomFieldDefCommand(TENANT_ID, PLAN_ID, ACTOR_ID, DEF_ID)
    await expect(handler.execute(cmd)).rejects.toThrow(UnauthorizedPlanAccessException)
  })
})
