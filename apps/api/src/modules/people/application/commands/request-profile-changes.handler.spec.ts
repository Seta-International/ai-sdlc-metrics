import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestProfileChangesCommand } from './request-profile-changes.command'
import { RequestProfileChangesHandler } from './request-profile-changes.handler'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { EditPolicyService } from '../services/edit-policy.service'
import type { Employment } from '../../domain/entities/employment.entity'
import type { ProfileChangeRequest } from '../../domain/entities/profile-change-request.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('RequestProfileChangesHandler', () => {
  let handler: RequestProfileChangesHandler
  let changeRepo: IProfileChangeRequestRepository
  let employmentRepo: IEmploymentRepository
  let editPolicyService: EditPolicyService

  beforeEach(() => {
    changeRepo = {
      findById: vi.fn(),
      findByBatchId: vi.fn(),
      findByEmploymentId: vi.fn(),
      findPendingByFieldPath: vi.fn(),
      findScheduledBeforeDate: vi.fn(),
      insertMany: vi.fn(),
      updateStatus: vi.fn(),
      updateStatusByBatchId: vi.fn(),
    }
    employmentRepo = {
      findById: vi.fn(),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
    }
    editPolicyService = {
      resolveEditMode: vi.fn(),
    } as unknown as EditPolicyService
    handler = new RequestProfileChangesHandler(changeRepo, employmentRepo, editPolicyService)
  })

  it('creates self-service changes as immediately applied', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as unknown as Employment)
    vi.mocked(editPolicyService.resolveEditMode).mockResolvedValue({
      editMode: 'self_service',
      requiresApproval: false,
      canEdit: true,
    })
    vi.mocked(changeRepo.findPendingByFieldPath).mockResolvedValue(null)
    vi.mocked(changeRepo.insertMany).mockResolvedValue([
      {
        id: 'cr-1',
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        batchId: expect.any(String),
        fieldPath: 'person_profile.preferred_name',
        oldValue: 'Tom',
        newValue: 'Tommy',
        effectiveDate: null,
        status: 'applied',
        requestedBy: ACTOR_ID,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        decisionCaseId: null,
        createdAt: new Date(),
      },
    ])

    await handler.execute(
      new RequestProfileChangesCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        [{ fieldPath: 'person_profile.preferred_name', oldValue: 'Tom', newValue: 'Tommy' }],
        ACTOR_ID,
      ),
    )

    expect(changeRepo.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'applied',
        fieldPath: 'person_profile.preferred_name',
      }),
    ])
  })

  it('creates approval-required changes as pending', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as unknown as Employment)
    vi.mocked(editPolicyService.resolveEditMode).mockResolvedValue({
      editMode: 'hr_approval',
      requiresApproval: true,
      canEdit: true,
    })
    vi.mocked(changeRepo.findPendingByFieldPath).mockResolvedValue(null)
    vi.mocked(changeRepo.insertMany).mockResolvedValue([
      {
        id: 'cr-1',
        status: 'pending',
      } as unknown as ProfileChangeRequest,
    ])

    await handler.execute(
      new RequestProfileChangesCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        [
          {
            fieldPath: 'employment_detail.bank_account_number',
            oldValue: '1234',
            newValue: '5678',
          },
        ],
        ACTOR_ID,
      ),
    )

    expect(changeRepo.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ status: 'pending' }),
    ])
  })

  it('supersedes existing pending request for same field', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as unknown as Employment)
    vi.mocked(editPolicyService.resolveEditMode).mockResolvedValue({
      editMode: 'hr_approval',
      requiresApproval: true,
      canEdit: true,
    })
    vi.mocked(changeRepo.findPendingByFieldPath).mockResolvedValue({
      id: 'old-cr',
      status: 'pending',
    } as unknown as ProfileChangeRequest)
    vi.mocked(changeRepo.insertMany).mockResolvedValue([
      { id: 'new-cr' } as unknown as ProfileChangeRequest,
    ])

    await handler.execute(
      new RequestProfileChangesCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        [
          {
            fieldPath: 'employment_detail.bank_account_number',
            oldValue: '1234',
            newValue: '9999',
          },
        ],
        ACTOR_ID,
      ),
    )

    expect(changeRepo.updateStatus).toHaveBeenCalledWith('old-cr', TENANT_ID, 'superseded')
  })

  it('throws when field edit policy blocks non-HR', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as unknown as Employment)
    vi.mocked(editPolicyService.resolveEditMode).mockResolvedValue({
      editMode: 'hr_only',
      requiresApproval: false,
      canEdit: false,
    })

    await expect(
      handler.execute(
        new RequestProfileChangesCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          [{ fieldPath: 'employment.employment_type', oldValue: 'permanent', newValue: 'intern' }],
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow()
  })

  it('creates future-dated changes as scheduled', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as unknown as Employment)
    vi.mocked(editPolicyService.resolveEditMode).mockResolvedValue({
      editMode: 'self_service',
      requiresApproval: false,
      canEdit: true,
    })
    vi.mocked(changeRepo.findPendingByFieldPath).mockResolvedValue(null)
    vi.mocked(changeRepo.insertMany).mockResolvedValue([
      {
        id: 'cr-1',
        status: 'scheduled',
      } as unknown as ProfileChangeRequest,
    ])

    await handler.execute(
      new RequestProfileChangesCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        [
          {
            fieldPath: 'person_profile.preferred_name',
            oldValue: 'Tom',
            newValue: 'Tommy',
            effectiveDate: new Date('2026-07-01'),
          },
        ],
        ACTOR_ID,
      ),
    )

    expect(changeRepo.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'scheduled',
        effectiveDate: new Date('2026-07-01'),
      }),
    ])
  })

  it('stores reason on inserted rows', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as unknown as Employment)
    vi.mocked(editPolicyService.resolveEditMode).mockResolvedValue({
      editMode: 'self_service',
      requiresApproval: false,
      canEdit: true,
    })
    vi.mocked(changeRepo.findPendingByFieldPath).mockResolvedValue(null)
    vi.mocked(changeRepo.insertMany).mockResolvedValue([])

    const cmd = new RequestProfileChangesCommand(
      TENANT_ID,
      EMPLOYMENT_ID,
      [{ fieldPath: 'person_profile.preferred_name', oldValue: 'Old', newValue: 'New' }],
      ACTOR_ID,
      'Updating after name change',
    )

    await handler.execute(cmd)

    expect(changeRepo.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ reason: 'Updating after name change' })]),
    )
  })

  it('stores null reason when not provided', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as unknown as Employment)
    vi.mocked(editPolicyService.resolveEditMode).mockResolvedValue({
      editMode: 'self_service',
      requiresApproval: false,
      canEdit: true,
    })
    vi.mocked(changeRepo.findPendingByFieldPath).mockResolvedValue(null)
    vi.mocked(changeRepo.insertMany).mockResolvedValue([])

    const cmd = new RequestProfileChangesCommand(
      TENANT_ID,
      EMPLOYMENT_ID,
      [{ fieldPath: 'person_profile.preferred_name', oldValue: 'Old', newValue: 'New' }],
      ACTOR_ID,
      // no reason
    )

    await handler.execute(cmd)

    expect(changeRepo.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ reason: null })]),
    )
  })
})
