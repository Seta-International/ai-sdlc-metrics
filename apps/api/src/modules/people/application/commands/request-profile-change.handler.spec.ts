import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestProfileChangeCommand } from './request-profile-change.command'
import { RequestProfileChangeHandler } from './request-profile-change.handler'
import { EmploymentProfileNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelDecisionFacade } from '../../../kernel/application/facades/kernel-decision.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const REQUESTER_ID = '01900000-0000-7000-8000-000000000005'
const CASE_ID = '01900000-0000-7000-8000-000000000020'
const REQUEST_ID = '01900000-0000-7000-8000-000000000010'

const fakeProfile = {
  id: PROFILE_ID,
  tenantId: TENANT_ID,
  actorId: '01900000-0000-7000-8000-000000000002',
  employeeCode: 'SETA-001',
  companyEmail: 'test@seta.vn',
  employmentType: 'permanent' as const,
  employmentStatus: 'active' as const,
  workArrangement: 'onsite' as const,
  hireDate: new Date('2026-01-01'),
  terminationDate: null,
  jobTitle: 'Engineer',
  jobLevel: null,
  costCenter: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('RequestProfileChangeHandler', () => {
  let handler: RequestProfileChangeHandler
  let profileRepo: IEmploymentProfileRepository
  let changeRequestRepo: IProfileChangeRequestRepository
  let auditFacade: KernelAuditFacade
  let decisionFacade: KernelDecisionFacade

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      findByEmployeeCode: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
    }
    changeRequestRepo = {
      findById: vi.fn(),
      findPendingByProfileAndField: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      listByProfile: vi.fn(),
    }
    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade
    decisionFacade = {
      createDecisionCase: vi.fn().mockResolvedValue(CASE_ID),
      resolveDecisionCase: vi.fn(),
    } as unknown as KernelDecisionFacade
    handler = new RequestProfileChangeHandler(
      profileRepo,
      changeRequestRepo,
      auditFacade,
      decisionFacade,
    )
  })

  it('creates a change request and dispatches CreateDecisionCaseCommand', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(fakeProfile)
    vi.mocked(changeRequestRepo.insert).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '5678',
      status: 'pending',
      decisionCaseId: CASE_ID,
      requestedBy: REQUESTER_ID,
      reviewedBy: null,
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new RequestProfileChangeCommand(
        TENANT_ID,
        PROFILE_ID,
        REQUESTER_ID,
        'detail.bankAccountNumber',
        '1234',
        '5678',
      ),
    )

    expect(changeRequestRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        profileId: PROFILE_ID,
        fieldPath: 'detail.bankAccountNumber',
        oldValue: '1234',
        newValue: '5678',
        status: 'pending',
        requestedBy: REQUESTER_ID,
      }),
    )
    expect(decisionFacade.createDecisionCase).toHaveBeenCalledWith(
      TENANT_ID,
      'people',
      REQUEST_ID,
      REQUESTER_ID,
    )
    expect(auditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'profile_change_requested',
        module: 'people',
      }),
    )
    expect(result.id).toBe(REQUEST_ID)
  })

  it('throws EmploymentProfileNotFoundException when profile not found', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new RequestProfileChangeCommand(
          TENANT_ID,
          PROFILE_ID,
          REQUESTER_ID,
          'detail.bankAccountNumber',
          '1234',
          '5678',
        ),
      ),
    ).rejects.toThrow(EmploymentProfileNotFoundException)
  })
})
