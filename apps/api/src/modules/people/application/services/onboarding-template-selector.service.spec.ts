import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingTemplateSelectorService } from './onboarding-template-selector.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('OnboardingTemplateSelectorService', () => {
  let service: OnboardingTemplateSelectorService
  let templateRepo: any

  beforeEach(() => {
    templateRepo = {
      findActiveByTenant: vi.fn(),
    }
    service = new OnboardingTemplateSelectorService(templateRepo)
  })

  it('selects template matching country + worker_type + employment_type', async () => {
    vi.mocked(templateRepo.findActiveByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Global Default',
        countryCode: null,
        workerType: null,
        employmentType: null,
        isDefault: true,
      },
      {
        id: 't2',
        name: 'VN Employee Permanent',
        countryCode: 'VN',
        workerType: 'employee',
        employmentType: 'permanent',
        isDefault: false,
      },
      {
        id: 't3',
        name: 'VN Intern',
        countryCode: 'VN',
        workerType: null,
        employmentType: 'intern',
        isDefault: false,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'employee', 'permanent')

    expect(result?.id).toBe('t2') // Most specific match
  })

  it('falls back to country-only match when exact match not found', async () => {
    vi.mocked(templateRepo.findActiveByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Global Default',
        countryCode: null,
        workerType: null,
        employmentType: null,
        isDefault: true,
      },
      {
        id: 't2',
        name: 'VN General',
        countryCode: 'VN',
        workerType: null,
        employmentType: null,
        isDefault: false,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'contingent', 'fixed_term')

    expect(result?.id).toBe('t2') // Country match
  })

  it('falls back to global default when no country match', async () => {
    vi.mocked(templateRepo.findActiveByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Global Default',
        countryCode: null,
        workerType: null,
        employmentType: null,
        isDefault: true,
      },
      {
        id: 't2',
        name: 'VN General',
        countryCode: 'VN',
        workerType: null,
        employmentType: null,
        isDefault: false,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'SG', 'employee', 'permanent')

    expect(result?.id).toBe('t1') // Global default
  })

  it('returns null when no templates exist', async () => {
    vi.mocked(templateRepo.findActiveByTenant).mockResolvedValue([])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'employee', 'permanent')

    expect(result).toBeNull()
  })
})
