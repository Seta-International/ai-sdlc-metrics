import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditPolicyService } from './edit-policy.service'
import type { IFieldEditPolicyRepository } from '../../domain/repositories/field-edit-policy.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('EditPolicyService', () => {
  let service: EditPolicyService
  let policyRepo: IFieldEditPolicyRepository

  beforeEach(() => {
    policyRepo = {
      findByTenant: vi.fn(),
      findByFieldPath: vi.fn(),
      upsert: vi.fn(),
      upsertMany: vi.fn(),
    }
    service = new EditPolicyService(policyRepo)
  })

  it('resolves self_service for preferred_name', async () => {
    vi.mocked(policyRepo.findByFieldPath).mockResolvedValue({
      id: '1',
      tenantId: TENANT_ID,
      fieldPath: 'person_profile.preferred_name',
      editMode: 'self_service',
    })

    const result = await service.resolveEditMode(
      TENANT_ID,
      'person_profile.preferred_name',
      false, // isHR
    )

    expect(result).toEqual({
      editMode: 'self_service',
      requiresApproval: false,
      canEdit: true,
    })
  })

  it('resolves hr_approval for bank account', async () => {
    vi.mocked(policyRepo.findByFieldPath).mockResolvedValue({
      id: '2',
      tenantId: TENANT_ID,
      fieldPath: 'employment_detail.bank_account_number',
      editMode: 'hr_approval',
    })

    const result = await service.resolveEditMode(
      TENANT_ID,
      'employment_detail.bank_account_number',
      false,
    )

    expect(result).toEqual({
      editMode: 'hr_approval',
      requiresApproval: true,
      canEdit: true,
    })
  })

  it('resolves hr_only blocks non-HR editors', async () => {
    vi.mocked(policyRepo.findByFieldPath).mockResolvedValue({
      id: '3',
      tenantId: TENANT_ID,
      fieldPath: 'employment.employment_type',
      editMode: 'hr_only',
    })

    const result = await service.resolveEditMode(TENANT_ID, 'employment.employment_type', false)

    expect(result).toEqual({
      editMode: 'hr_only',
      requiresApproval: false,
      canEdit: false,
    })
  })

  it('resolves hr_only allows HR editors', async () => {
    vi.mocked(policyRepo.findByFieldPath).mockResolvedValue({
      id: '3',
      tenantId: TENANT_ID,
      fieldPath: 'employment.employment_type',
      editMode: 'hr_only',
    })

    const result = await service.resolveEditMode(
      TENANT_ID,
      'employment.employment_type',
      true, // isHR
    )

    expect(result).toEqual({
      editMode: 'hr_only',
      requiresApproval: false,
      canEdit: true,
    })
  })

  it('defaults to hr_approval when no policy found', async () => {
    vi.mocked(policyRepo.findByFieldPath).mockResolvedValue(null)

    const result = await service.resolveEditMode(TENANT_ID, 'unknown.field', false)

    expect(result).toEqual({
      editMode: 'hr_approval',
      requiresApproval: true,
      canEdit: true,
    })
  })
})
