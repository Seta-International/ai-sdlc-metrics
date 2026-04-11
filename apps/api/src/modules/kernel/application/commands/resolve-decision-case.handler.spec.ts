import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResolveDecisionCaseCommand } from './resolve-decision-case.command'
import { ResolveDecisionCaseHandler } from './resolve-decision-case.handler'
import type {
  DecisionOutcome,
  IDecisionCaseRepository,
} from '../../domain/repositories/decision-case.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const CASE_ID = '01900000-0000-7000-8000-000000000002'
const DECIDED_BY = '01900000-0000-7000-8000-000000000003'
const OUTCOME_ID = '01900000-0000-7000-8000-000000000004'

const fakeOutcome = (
  finalAction: 'approved' | 'rejected',
  comment: string | null,
): DecisionOutcome => ({
  id: OUTCOME_ID,
  tenantId: TENANT_ID,
  caseId: CASE_ID,
  finalAction,
  decidedBy: DECIDED_BY,
  decidedAt: new Date(),
  comment,
})

describe('ResolveDecisionCaseHandler', () => {
  let handler: ResolveDecisionCaseHandler
  let repo: IDecisionCaseRepository

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      insertOutcome: vi.fn(),
    }
    handler = new ResolveDecisionCaseHandler(repo)
  })

  it('approves a decision case and creates an outcome', async () => {
    vi.mocked(repo.updateStatus).mockResolvedValue(undefined)
    vi.mocked(repo.insertOutcome).mockResolvedValue(fakeOutcome('approved', null))

    await handler.execute(
      new ResolveDecisionCaseCommand(TENANT_ID, CASE_ID, 'approved', DECIDED_BY, null),
    )

    expect(repo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'approved')
    expect(repo.insertOutcome).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      caseId: CASE_ID,
      finalAction: 'approved',
      decidedBy: DECIDED_BY,
      comment: null,
    })
  })

  it('rejects a decision case with a comment', async () => {
    const comment = 'Missing documentation'
    vi.mocked(repo.updateStatus).mockResolvedValue(undefined)
    vi.mocked(repo.insertOutcome).mockResolvedValue(fakeOutcome('rejected', comment))

    await handler.execute(
      new ResolveDecisionCaseCommand(TENANT_ID, CASE_ID, 'rejected', DECIDED_BY, comment),
    )

    expect(repo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'rejected')
    expect(repo.insertOutcome).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      caseId: CASE_ID,
      finalAction: 'rejected',
      decidedBy: DECIDED_BY,
      comment,
    })
  })
})
