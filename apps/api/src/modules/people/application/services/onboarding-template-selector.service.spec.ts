import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingTemplateSelectorService } from './onboarding-template-selector.service'
import type { IOnboardingTemplateRepository } from '../../domain/repositories/onboarding-template.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('OnboardingTemplateSelectorService', () => {
  let service: OnboardingTemplateSelectorService
  let templateRepo: { listByTenant: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    templateRepo = {
      listByTenant: vi.fn(),
    }
    service = new OnboardingTemplateSelectorService(
      templateRepo as unknown as IOnboardingTemplateRepository,
    )
  })

  it('selects template matching country + worker_type + employment_type', async () => {
    vi.mocked(templateRepo.listByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Global Default',
        countryCode: null,
        workerType: null,
        employmentType: null,
        isDefault: true,
        isActive: true,
      },
      {
        id: 't2',
        name: 'VN Employee Permanent',
        countryCode: 'VN',
        workerType: 'employee',
        employmentType: 'permanent',
        isDefault: false,
        isActive: true,
      },
      {
        id: 't3',
        name: 'VN Intern',
        countryCode: 'VN',
        workerType: null,
        employmentType: 'intern',
        isDefault: false,
        isActive: true,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'employee', 'permanent')

    expect(result?.id).toBe('t2') // Most specific match
  })

  it('falls back to country-only match when exact match not found', async () => {
    vi.mocked(templateRepo.listByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Global Default',
        countryCode: null,
        workerType: null,
        employmentType: null,
        isDefault: true,
        isActive: true,
      },
      {
        id: 't2',
        name: 'VN General',
        countryCode: 'VN',
        workerType: null,
        employmentType: null,
        isDefault: false,
        isActive: true,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'contingent', 'fixed_term')

    expect(result?.id).toBe('t2') // Country match
  })

  it('falls back to global default when no country match', async () => {
    vi.mocked(templateRepo.listByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Global Default',
        countryCode: null,
        workerType: null,
        employmentType: null,
        isDefault: true,
        isActive: true,
      },
      {
        id: 't2',
        name: 'VN General',
        countryCode: 'VN',
        workerType: null,
        employmentType: null,
        isDefault: false,
        isActive: true,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'SG', 'employee', 'permanent')

    expect(result?.id).toBe('t1') // Global default
  })

  it('returns null when no templates exist', async () => {
    vi.mocked(templateRepo.listByTenant).mockResolvedValue([])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'employee', 'permanent')

    expect(result).toBeNull()
  })
})
