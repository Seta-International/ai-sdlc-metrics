import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApproveProfileChangeCommand } from './approve-profile-change.command'
import { ApproveProfileChangeHandler } from './approve-profile-change.handler'
import {
  ProfileChangeRequestNotFoundException,
  ProfileChangeRequestNotPendingException,
} from '../../domain/exceptions/people.exceptions'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import type { IEmploymentProfileDetailRepository } from '../../domain/repositories/employment-profile-detail.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelDecisionFacade } from '../../../kernel/application/facades/kernel-decision.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const REQUEST_ID = '01900000-0000-7000-8000-000000000010'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const APPROVER_ID = '01900000-0000-7000-8000-000000000005'
const CASE_ID = '01900000-0000-7000-8000-000000000020'

describe('ApproveProfileChangeHandler', () => {
  let handler: ApproveProfileChangeHandler
  let changeRequestRepo: IProfileChangeRequestRepository
  let detailRepo: IEmploymentProfileDetailRepository
  let auditFacade: KernelAuditFacade
  let decisionFacade: KernelDecisionFacade

  beforeEach(() => {
    changeRequestRepo = {
      findById: vi.fn(),
      findPendingByProfileAndField: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      listByProfile: vi.fn(),
    }
    detailRepo = {
      findByProfileId: vi.fn(),
      upsert: vi.fn(),
      updateField: vi.fn(),
    }
    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade
    decisionFacade = {
      createDecisionCase: vi.fn(),
      resolveDecisionCase: vi.fn(),
    } as unknown as KernelDecisionFacade
    handler = new ApproveProfileChangeHandler(
      changeRequestRepo,
      detailRepo,
      auditFacade,
      decisionFacade,
    )
  })

  it('applies the change and resolves the decision case', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '5678',
      status: 'pending',
      decisionCaseId: CASE_ID,
      requestedBy: 'req-actor',
      reviewedBy: null,
      createdAt: new Date(),
    })

    await handler.execute(new ApproveProfileChangeCommand(TENANT_ID, REQUEST_ID, APPROVER_ID))

    expect(detailRepo.updateField).toHaveBeenCalledWith(
      PROFILE_ID,
      TENANT_ID,
      'bankAccountNumber',
      '5678',
    )
    expect(changeRequestRepo.updateStatus).toHaveBeenCalledWith(
      REQUEST_ID,
      TENANT_ID,
      'approved',
      APPROVER_ID,
    )
    expect(decisionFacade.resolveDecisionCase).toHaveBeenCalledWith(
      TENANT_ID,
      CASE_ID,
      'approved',
      APPROVER_ID,
      null,
    )
    expect(auditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'profile_change_approved',
        module: 'people',
      }),
    )
  })

  it('does not dispatch ResolveDecisionCaseCommand when decisionCaseId is null', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '5678',
      status: 'pending',
      decisionCaseId: null,
      requestedBy: 'req-actor',
      reviewedBy: null,
      createdAt: new Date(),
    })

    await handler.execute(new ApproveProfileChangeCommand(TENANT_ID, REQUEST_ID, APPROVER_ID))

    expect(decisionFacade.resolveDecisionCase).not.toHaveBeenCalled()
  })

  it('throws ProfileChangeRequestNotFoundException when not found', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new ApproveProfileChangeCommand(TENANT_ID, REQUEST_ID, APPROVER_ID)),
    ).rejects.toThrow(ProfileChangeRequestNotFoundException)
  })

  it('throws ProfileChangeRequestNotPendingException when request is not pending', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '5678',
      status: 'approved',
      decisionCaseId: CASE_ID,
      requestedBy: 'req-actor',
      reviewedBy: APPROVER_ID,
      createdAt: new Date(),
    })

    await expect(
      handler.execute(new ApproveProfileChangeCommand(TENANT_ID, REQUEST_ID, APPROVER_ID)),
    ).rejects.toThrow(ProfileChangeRequestNotPendingException)
  })
})
