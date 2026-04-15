import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RejectProfileChangeCommand } from './reject-profile-change.command'
import { RejectProfileChangeHandler } from './reject-profile-change.handler'
import {
  ProfileChangeRequestNotFoundException,
  ProfileChangeRequestNotPendingException,
} from '../../domain/exceptions/people.exceptions'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelDecisionFacade } from '../../../kernel/application/facades/kernel-decision.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const REQUEST_ID = '01900000-0000-7000-8000-000000000010'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000003'
const REJECTOR_ID = '01900000-0000-7000-8000-000000000005'
const CASE_ID = '01900000-0000-7000-8000-000000000020'
const COMMENT = 'Does not meet policy requirements'

describe('RejectProfileChangeHandler', () => {
  let handler: RejectProfileChangeHandler
  let changeRequestRepo: IProfileChangeRequestRepository
  let auditFacade: KernelAuditFacade
  let decisionFacade: KernelDecisionFacade

  beforeEach(() => {
    changeRequestRepo = {
      findById: vi.fn(),
      findByBatchId: vi.fn(),
      findByEmploymentId: vi.fn(),
      findPendingByFieldPath: vi.fn(),
      findScheduledBeforeDate: vi.fn(),
      insertMany: vi.fn(),
      updateStatus: vi.fn(),
      updateStatusByBatchId: vi.fn(),
    }
    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade
    decisionFacade = {
      createDecisionCase: vi.fn(),
      resolveDecisionCase: vi.fn(),
    } as unknown as KernelDecisionFacade
    handler = new RejectProfileChangeHandler(changeRequestRepo, auditFacade, decisionFacade)
  })

  it('rejects the request and resolves the decision case with comment', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      batchId: null,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '5678',
      effectiveDate: null,
      status: 'pending',
      decisionCaseId: CASE_ID,
      requestedBy: 'req-actor',
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: new Date(),
    })

    await handler.execute(
      new RejectProfileChangeCommand(TENANT_ID, REQUEST_ID, REJECTOR_ID, COMMENT),
    )

    expect(changeRequestRepo.updateStatus).toHaveBeenCalledWith(
      REQUEST_ID,
      TENANT_ID,
      'rejected',
      REJECTOR_ID,
      COMMENT,
    )
    expect(decisionFacade.resolveDecisionCase).toHaveBeenCalledWith(
      TENANT_ID,
      CASE_ID,
      'rejected',
      REJECTOR_ID,
      COMMENT,
    )
    expect(auditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'profile_change_rejected',
        module: 'people',
      }),
    )
  })

  it('does not dispatch ResolveDecisionCaseCommand when decisionCaseId is null', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      batchId: null,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '5678',
      effectiveDate: null,
      status: 'pending',
      decisionCaseId: null,
      requestedBy: 'req-actor',
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: new Date(),
    })

    await handler.execute(
      new RejectProfileChangeCommand(TENANT_ID, REQUEST_ID, REJECTOR_ID, COMMENT),
    )

    expect(decisionFacade.resolveDecisionCase).not.toHaveBeenCalled()
  })

  it('throws ProfileChangeRequestNotFoundException when not found', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new RejectProfileChangeCommand(TENANT_ID, REQUEST_ID, REJECTOR_ID, COMMENT)),
    ).rejects.toThrow(ProfileChangeRequestNotFoundException)
  })

  it('throws ProfileChangeRequestNotPendingException when request is not pending', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      batchId: null,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '5678',
      effectiveDate: null,
      status: 'approved',
      decisionCaseId: CASE_ID,
      requestedBy: 'req-actor',
      reviewedBy: REJECTOR_ID,
      reviewedAt: new Date(),
      reviewNote: null,
      createdAt: new Date(),
    })

    await expect(
      handler.execute(new RejectProfileChangeCommand(TENANT_ID, REQUEST_ID, REJECTOR_ID, COMMENT)),
    ).rejects.toThrow(ProfileChangeRequestNotPendingException)
  })
})
