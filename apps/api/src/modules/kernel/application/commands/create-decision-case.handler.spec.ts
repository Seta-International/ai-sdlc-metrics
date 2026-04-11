import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateDecisionCaseCommand } from './create-decision-case.command'
import { CreateDecisionCaseHandler } from './create-decision-case.handler'
import type {
  DecisionCase,
  IDecisionCaseRepository,
} from '../../domain/repositories/decision-case.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const CASE_ID = '01900000-0000-7000-8000-000000000002'
const SUBJECT_ID = '01900000-0000-7000-8000-000000000003'
const REQUESTED_BY = '01900000-0000-7000-8000-000000000004'

const fakeCase: DecisionCase = {
  id: CASE_ID,
  tenantId: TENANT_ID,
  module: 'people',
  subjectId: SUBJECT_ID,
  requestedBy: REQUESTED_BY,
  status: 'pending',
  createdAt: new Date(),
}

describe('CreateDecisionCaseHandler', () => {
  let handler: CreateDecisionCaseHandler
  let repo: IDecisionCaseRepository

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      insertOutcome: vi.fn(),
    }
    handler = new CreateDecisionCaseHandler(repo)
  })

  it('creates a decision case and returns the id', async () => {
    vi.mocked(repo.insert).mockResolvedValue(fakeCase)

    const result = await handler.execute(
      new CreateDecisionCaseCommand(TENANT_ID, 'people', SUBJECT_ID, REQUESTED_BY),
    )

    expect(result).toBe(CASE_ID)
    expect(repo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      module: 'people',
      subjectId: SUBJECT_ID,
      requestedBy: REQUESTED_BY,
    })
  })
})
