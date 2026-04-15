import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateCompanyEmailCommand } from './generate-company-email.command'
import { GenerateCompanyEmailHandler } from './generate-company-email.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { EmailGenerationService } from '../services/email-generation.service'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'

describe('GenerateCompanyEmailHandler', () => {
  let handler: GenerateCompanyEmailHandler
  let employmentRepo: IEmploymentRepository
  let profileRepo: IPersonProfileRepository
  let emailService: EmailGenerationService

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
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    emailService = {
      generateCandidates: vi.fn(),
    } as never
    handler = new GenerateCompanyEmailHandler(employmentRepo, profileRepo, emailService)
  })

  it('generates and assigns company email from name', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      companyEmail: null,
    } as never)
    vi.mocked(profileRepo.findById).mockResolvedValue({
      id: PROFILE_ID,
      familyName: 'Nguyễn',
      givenName: 'An',
      middleName: 'Văn',
    } as never)
    vi.mocked(emailService.generateCandidates).mockResolvedValue([
      'an.nguyen@seta.vn',
      'an.nguyenvan@seta.vn',
    ])
    vi.mocked(employmentRepo.update).mockResolvedValue({
      id: EMPLOYMENT_ID,
      companyEmail: 'an.nguyen@seta.vn',
    } as never)

    const result = await handler.execute(new GenerateCompanyEmailCommand(TENANT_ID, EMPLOYMENT_ID))

    expect(employmentRepo.update).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      expect.objectContaining({ companyEmail: 'an.nguyen@seta.vn' }),
    )
    expect(result.companyEmail).toBe('an.nguyen@seta.vn')
  })

  it('uses override email when provided', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      companyEmail: null,
    } as never)
    vi.mocked(employmentRepo.update).mockResolvedValue({
      id: EMPLOYMENT_ID,
      companyEmail: 'custom@seta.vn',
    } as never)

    await handler.execute(
      new GenerateCompanyEmailCommand(TENANT_ID, EMPLOYMENT_ID, 'custom@seta.vn'),
    )

    expect(emailService.generateCandidates).not.toHaveBeenCalled()
    expect(employmentRepo.update).toHaveBeenCalledWith(
      EMPLOYMENT_ID,
      TENANT_ID,
      expect.objectContaining({ companyEmail: 'custom@seta.vn' }),
    )
  })

  it('throws EmploymentNotFoundException when employment missing', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new GenerateCompanyEmailCommand(TENANT_ID, EMPLOYMENT_ID)),
    ).rejects.toThrow(EmploymentNotFoundException)
  })

  it('throws when no email candidates available', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
      personProfileId: PROFILE_ID,
      companyEmail: null,
    } as never)
    vi.mocked(profileRepo.findById).mockResolvedValue({
      id: PROFILE_ID,
      familyName: 'Smith',
      givenName: 'John',
      middleName: null,
    } as never)
    vi.mocked(emailService.generateCandidates).mockResolvedValue([])

    await expect(
      handler.execute(new GenerateCompanyEmailCommand(TENANT_ID, EMPLOYMENT_ID)),
    ).rejects.toThrow('No email candidates available')
  })
})
