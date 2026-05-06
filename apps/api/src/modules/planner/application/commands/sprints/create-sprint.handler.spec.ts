import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateSprintHandler } from './create-sprint.handler'
import { CreateSprintCommand } from './create-sprint.command'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { ISprintRepository } from '../../../domain/repositories/sprint.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'

describe('CreateSprintHandler', () => {
  let handler: CreateSprintHandler
  let repo: { save: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = { save: vi.fn().mockResolvedValue(undefined) }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    handler = new CreateSprintHandler(
      repo as unknown as ISprintRepository,
      authSvc as unknown as PlanAuthorizationService,
    )
  })

  it('saves a sprint with string dates and returns id', async () => {
    const command = new CreateSprintCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      'Sprint 1',
      '2026-06-01',
      '2026-06-14',
    )

    const result = await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(repo.save).toHaveBeenCalledOnce()
    const saved = repo.save.mock.calls[0][0]
    expect(saved.name).toBe('Sprint 1')
    expect(saved.startDate).toBe('2026-06-01')
    expect(saved.endDate).toBe('2026-06-14')
    expect(saved.completedAt).toBeNull()
    expect(saved.tenantId).toBe(TENANT_ID)
    expect(saved.planId).toBe(PLAN_ID)
    expect(result.id).toBe(saved.id)
  })

  it('throws when actor is not authorized', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )

    const command = new CreateSprintCommand(
      TENANT_ID,
      PLAN_ID,
      ACTOR_ID,
      'Sprint 1',
      '2026-06-01',
      '2026-06-14',
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(repo.save).not.toHaveBeenCalled()
  })
})
