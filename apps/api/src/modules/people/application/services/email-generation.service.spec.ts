import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailGenerationService } from './email-generation.service'
import type { IEmailGenerationConfigRepository } from '../../domain/repositories/email-generation-config.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('EmailGenerationService', () => {
  let service: EmailGenerationService
  let configRepo: IEmailGenerationConfigRepository
  let employmentRepo: IEmploymentRepository

  beforeEach(() => {
    configRepo = {
      findByTenantId: vi.fn(),
      upsert: vi.fn(),
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
    service = new EmailGenerationService(configRepo, employmentRepo)
  })

  it('generates email from Vietnamese name with diacritic stripping', async () => {
    vi.mocked(configRepo.findByTenantId).mockResolvedValue({
      tenantId: TENANT_ID,
      domain: 'seta-international.vn',
      pattern: '{given}.{family}',
      transliteration: 'strip_diacritics',
    })
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([])

    const result = await service.generateCandidates(
      TENANT_ID,
      'Nguyễn', // familyName
      'An', // givenName
      'Văn', // middleName
    )

    expect(result[0]).toBe('an.nguyen@seta-international.vn')
  })

  it('generates fallback candidates when primary is taken', async () => {
    vi.mocked(configRepo.findByTenantId).mockResolvedValue({
      tenantId: TENANT_ID,
      domain: 'seta.vn',
      pattern: '{given}.{family}',
      transliteration: 'strip_diacritics',
    })
    // Simulate first candidate already taken
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([
      { companyEmail: 'an.nguyen@seta.vn' } as any,
    ])

    const result = await service.generateCandidates(TENANT_ID, 'Nguyễn', 'An', 'Văn')

    // Should include fallback candidates
    expect(result.length).toBeGreaterThan(1)
    expect(result).toContain('an.nguyenvan@seta.vn')
  })

  it('handles names without middle name', async () => {
    vi.mocked(configRepo.findByTenantId).mockResolvedValue({
      tenantId: TENANT_ID,
      domain: 'company.com',
      pattern: '{given}.{family}',
      transliteration: 'strip_diacritics',
    })
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([])

    const result = await service.generateCandidates(TENANT_ID, 'Smith', 'John', null)

    expect(result[0]).toBe('john.smith@company.com')
  })

  it('returns empty array when no config exists', async () => {
    vi.mocked(configRepo.findByTenantId).mockResolvedValue(null)

    const result = await service.generateCandidates(TENANT_ID, 'Smith', 'John', null)
    expect(result).toEqual([])
  })
})
