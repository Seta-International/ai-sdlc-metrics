import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListTaskEvidenceHandler } from './list-task-evidence.handler'
import { ListTaskEvidenceQuery } from './list-task-evidence.query'
import { TaskEvidence } from '../../../domain/entities/task-evidence.entity'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { ITaskEvidenceRepository } from '../../../domain/repositories/task-evidence.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'

function makeNoteEvidence(id: string): TaskEvidence {
  return TaskEvidence.createNote({
    id,
    taskId: TASK_ID,
    tenantId: TENANT_ID,
    submittedBy: ACTOR_ID,
    caption: `Note ${id}`,
    body: `Body for ${id}`,
  })
}

function makeLinkEvidence(id: string): TaskEvidence {
  return TaskEvidence.createLink({
    id,
    taskId: TASK_ID,
    tenantId: TENANT_ID,
    submittedBy: ACTOR_ID,
    caption: `Link ${id}`,
    url: 'https://example.com',
  })
}

describe('ListTaskEvidenceHandler', () => {
  let handler: ListTaskEvidenceHandler
  let evidenceRepo: { listByTask: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    evidenceRepo = { listByTask: vi.fn().mockResolvedValue([]) }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    handler = new ListTaskEvidenceHandler(
      evidenceRepo as unknown as ITaskEvidenceRepository,
      authSvc as unknown as PlanAuthorizationService,
    )
  })

  it('returns empty items array when no evidence exists', async () => {
    const query = new ListTaskEvidenceQuery(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID)

    const result = await handler.execute(query)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(result).toEqual({ items: [] })
  })

  it('returns mapped DTOs for all evidence', async () => {
    const noteEv = makeNoteEvidence('ev-1')
    const linkEv = makeLinkEvidence('ev-2')
    evidenceRepo.listByTask.mockResolvedValue([noteEv, linkEv])

    const query = new ListTaskEvidenceQuery(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID)
    const result = await handler.execute(query)

    expect(result.items).toHaveLength(2)
    expect(result.items[0].id).toBe('ev-1')
    expect(result.items[0].kind).toBe('note')
    expect(result.items[0].body).toBe('Body for ev-1')
    expect(result.items[1].id).toBe('ev-2')
    expect(result.items[1].kind).toBe('link')
    expect(result.items[1].url).toBe('https://example.com')
  })

  it('queries by correct taskId and tenantId', async () => {
    const query = new ListTaskEvidenceQuery(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID)
    await handler.execute(query)

    expect(evidenceRepo.listByTask).toHaveBeenCalledWith(TASK_ID, TENANT_ID)
  })

  it('throws UnauthorizedPlanAccessException when actor lacks permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const query = new ListTaskEvidenceQuery(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID)

    await expect(handler.execute(query)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(evidenceRepo.listByTask).not.toHaveBeenCalled()
  })
})
