import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DuplicateValidationService } from './duplicate-validation.service'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IEmploymentDetailRepository } from '../../domain/repositories/employment-detail.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'

describe('DuplicateValidationService', () => {
  let service: DuplicateValidationService
  let employmentRepo: IEmploymentRepository
  let detailRepo: IEmploymentDetailRepository

  beforeEach(() => {
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
    detailRepo = {
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    service = new DuplicateValidationService(employmentRepo, detailRepo)
  })

  it('returns no warnings when no duplicates', async () => {
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([])

    const warnings = await service.checkDuplicates(TENANT_ID, EMPLOYMENT_ID, {
      companyEmail: 'unique@test.com',
      nationalId: '012345678901',
    })

    expect(warnings).toEqual([])
  })

  it('returns hard block for duplicate company email', async () => {
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([
      {
        id: 'other-emp',
        companyEmail: 'john@company.com',
        employmentStatus: 'active',
      } as any,
    ])

    const warnings = await service.checkDuplicates(TENANT_ID, EMPLOYMENT_ID, {
      companyEmail: 'john@company.com',
    })

    expect(warnings).toEqual([
      expect.objectContaining({
        field: 'companyEmail',
        severity: 'error',
        conflictEmploymentId: 'other-emp',
      }),
    ])
  })

  it('returns warning for duplicate national ID (acknowledgeable)', async () => {
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([
      { id: 'other-emp', employmentStatus: 'active' } as any,
    ])
    vi.mocked(detailRepo.findByEmploymentId).mockResolvedValue({
      nationalId: '012345678901',
    } as any)

    const warnings = await service.checkDuplicates(TENANT_ID, EMPLOYMENT_ID, {
      nationalId: '012345678901',
    })

    expect(warnings).toEqual([
      expect.objectContaining({
        field: 'nationalId',
        severity: 'warning',
      }),
    ])
  })
})
