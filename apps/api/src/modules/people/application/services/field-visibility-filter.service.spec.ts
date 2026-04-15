import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldVisibilityFilterService } from './field-visibility-filter.service'
import type { IFieldVisibilityConfigRepository } from '../../domain/repositories/field-visibility-config.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const VIEWER_ID = '01900000-0000-7000-8000-000000000002'
const TARGET_EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000003'

describe('FieldVisibilityFilterService', () => {
  let service: FieldVisibilityFilterService
  let visibilityRepo: IFieldVisibilityConfigRepository
  let assignmentRepo: IJobAssignmentRepository

  beforeEach(() => {
    visibilityRepo = {
      findByTenant: vi.fn(),
      findByFieldPath: vi.fn(),
      upsert: vi.fn(),
      upsertMany: vi.fn(),
    }
    assignmentRepo = {
      findById: vi.fn(),
      findCurrent: vi.fn(),
      findAsOf: vi.fn(),
      findHistory: vi.fn(),
      insert: vi.fn(),
      closeAssignment: vi.fn(),
      delete: vi.fn(),
    }
    service = new FieldVisibilityFilterService(visibilityRepo, assignmentRepo)
  })

  it('returns all fields for self-view', async () => {
    vi.mocked(visibilityRepo.findByTenant).mockResolvedValue([
      {
        id: '1',
        tenantId: TENANT_ID,
        fieldPath: 'person_profile.date_of_birth',
        visibilityTier: 'restricted',
      },
      {
        id: '2',
        tenantId: TENANT_ID,
        fieldPath: 'employment_detail.national_id',
        visibilityTier: 'confidential',
      },
    ])

    const maxTier = await service.resolveMaxTier(
      TENANT_ID,
      VIEWER_ID,
      TARGET_EMPLOYMENT_ID,
      true, // isSelf
      false, // hasConfidentialPermission
      false, // hasRestrictedPermission
    )

    expect(maxTier).toBe('confidential')
  })

  it('returns public only for general viewer', async () => {
    const maxTier = await service.resolveMaxTier(
      TENANT_ID,
      VIEWER_ID,
      TARGET_EMPLOYMENT_ID,
      false,
      false,
      false,
    )

    expect(maxTier).toBe('public')
  })

  it('returns restricted for direct manager', async () => {
    vi.mocked(assignmentRepo.findCurrent).mockResolvedValue({
      managerId: VIEWER_ID,
    } as any)

    const maxTier = await service.resolveMaxTier(
      TENANT_ID,
      VIEWER_ID,
      TARGET_EMPLOYMENT_ID,
      false,
      false,
      false,
    )

    expect(maxTier).toBe('restricted')
  })

  it('returns confidential for HR with permission', async () => {
    const maxTier = await service.resolveMaxTier(
      TENANT_ID,
      VIEWER_ID,
      TARGET_EMPLOYMENT_ID,
      false,
      true, // hasConfidentialPermission
      false,
    )

    expect(maxTier).toBe('confidential')
  })

  it('strips unauthorized fields from profile data', async () => {
    vi.mocked(visibilityRepo.findByTenant).mockResolvedValue([
      {
        id: '1',
        tenantId: TENANT_ID,
        fieldPath: 'person_profile.date_of_birth',
        visibilityTier: 'restricted',
      },
      {
        id: '2',
        tenantId: TENANT_ID,
        fieldPath: 'employment_detail.national_id',
        visibilityTier: 'confidential',
      },
      {
        id: '3',
        tenantId: TENANT_ID,
        fieldPath: 'person_profile.full_name',
        visibilityTier: 'public',
      },
    ])

    const data = {
      'person_profile.full_name': 'John Smith',
      'person_profile.date_of_birth': '1990-01-01',
      'employment_detail.national_id': '123456789',
    }

    const filtered = await service.filterFields(TENANT_ID, data, 'public')
    expect(filtered).toEqual({ 'person_profile.full_name': 'John Smith' })
    expect(filtered).not.toHaveProperty('person_profile.date_of_birth')
    expect(filtered).not.toHaveProperty('employment_detail.national_id')
  })
})
