import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetProfileCompletenessQuery } from './get-profile-completeness.query'
import { GetProfileCompletenessHandler } from './get-profile-completeness.handler'
import type { ICompletenessRuleRepository } from '../../domain/repositories/completeness-rule.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'
import type { IEmployeeDocumentRepository } from '../../domain/repositories/employee-document.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'

describe('GetProfileCompletenessHandler', () => {
  let handler: GetProfileCompletenessHandler
  let ruleRepo: ICompletenessRuleRepository
  let employmentRepo: IEmploymentRepository
  let profileRepo: IPersonProfileRepository
  let detailRepo: IEmploymentDetailRepository
  let docRepo: IEmployeeDocumentRepository

  beforeEach(() => {
    ruleRepo = {
      findApplicable: vi.fn(),
      listByTenant: vi.fn(),
      insertMany: vi.fn(),
      update: vi.fn(),
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
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    detailRepo = {
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    docRepo = {
      findById: vi.fn(),
      findByEmploymentId: vi.fn(),
      findExpiringBefore: vi.fn(),
      findByCategory: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    handler = new GetProfileCompletenessHandler(
      ruleRepo,
      employmentRepo,
      profileRepo,
      detailRepo,
      docRepo,
    )
  })

  it('computes 100% score when all fields filled', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      personProfileId: PROFILE_ID,
      countryCode: 'VN',
      employmentType: 'permanent',
    } as any)
    vi.mocked(profileRepo.findById).mockResolvedValue({
      id: PROFILE_ID,
      dateOfBirth: new Date('1990-01-01'),
    } as any)
    vi.mocked(detailRepo.findByEmploymentId).mockResolvedValue({
      nationalId: '012345678901',
    } as any)
    vi.mocked(docRepo.findByCategory).mockResolvedValue([{ id: 'doc-1' } as any])
    vi.mocked(ruleRepo.findApplicable).mockResolvedValue([
      {
        id: 'r1',
        tenantId: TENANT_ID,
        fieldPath: 'person_profile.date_of_birth',
        weight: 10,
        isRequired: true,
        countryCode: null,
        employmentType: null,
        deadlineDays: null,
        label: 'Date of Birth',
        section: 'personal',
        sortOrder: 1,
      },
      {
        id: 'r2',
        tenantId: TENANT_ID,
        fieldPath: 'employment_detail.national_id',
        weight: 10,
        isRequired: true,
        countryCode: 'VN',
        employmentType: null,
        deadlineDays: 30,
        label: 'National ID',
        section: 'identity',
        sortOrder: 2,
      },
    ])

    const result = await handler.execute(new GetProfileCompletenessQuery(TENANT_ID, EMPLOYMENT_ID))

    expect(result.score).toBe(100)
    expect(result.filled).toBe(2)
    expect(result.total).toBe(2)
    expect(result.missing).toEqual([])
  })

  it('computes 50% score with one field missing', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      personProfileId: PROFILE_ID,
      countryCode: 'VN',
      employmentType: 'permanent',
    } as any)
    vi.mocked(profileRepo.findById).mockResolvedValue({
      id: PROFILE_ID,
      dateOfBirth: new Date('1990-01-01'),
    } as any)
    vi.mocked(detailRepo.findByEmploymentId).mockResolvedValue({
      nationalId: null,
    } as any)
    vi.mocked(docRepo.findByCategory).mockResolvedValue([])
    vi.mocked(ruleRepo.findApplicable).mockResolvedValue([
      {
        id: 'r1',
        tenantId: TENANT_ID,
        fieldPath: 'person_profile.date_of_birth',
        weight: 10,
        isRequired: true,
        countryCode: null,
        employmentType: null,
        deadlineDays: null,
        label: 'Date of Birth',
        section: 'personal',
        sortOrder: 1,
      },
      {
        id: 'r2',
        tenantId: TENANT_ID,
        fieldPath: 'employment_detail.national_id',
        weight: 10,
        isRequired: true,
        countryCode: 'VN',
        employmentType: null,
        deadlineDays: 30,
        label: 'National ID',
        section: 'identity',
        sortOrder: 2,
      },
    ])

    const result = await handler.execute(new GetProfileCompletenessQuery(TENANT_ID, EMPLOYMENT_ID))

    expect(result.score).toBe(50)
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0].fieldPath).toBe('employment_detail.national_id')
  })
})
