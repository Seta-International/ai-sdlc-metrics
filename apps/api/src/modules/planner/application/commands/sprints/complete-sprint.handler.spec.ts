import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CompleteSprintHandler } from './complete-sprint.handler'
import { CompleteSprintCommand } from './complete-sprint.command'
import type { ISprintRepository } from '../../../domain/repositories/sprint.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const ACTOR_ID = 'actor-1'
const SPRINT_ID = 'sprint-1'

describe('CompleteSprintHandler', () => {
  let handler: CompleteSprintHandler
  let repo: { complete: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = { complete: vi.fn().mockResolvedValue(undefined) }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    handler = new CompleteSprintHandler(
      repo as unknown as ISprintRepository,
      authSvc as unknown as PlanAuthorizationService,
    )
  })

  it('calls repo.complete with the sprint id and tenant id', async () => {
    const command = new CompleteSprintCommand(TENANT_ID, PLAN_ID, ACTOR_ID, SPRINT_ID)

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(repo.complete).toHaveBeenCalledOnce()
    const [id, tenantId, completedAt] = repo.complete.mock.calls[0]
    expect(id).toBe(SPRINT_ID)
    expect(tenantId).toBe(TENANT_ID)
    expect(completedAt).toBeInstanceOf(Date)
  })
})
