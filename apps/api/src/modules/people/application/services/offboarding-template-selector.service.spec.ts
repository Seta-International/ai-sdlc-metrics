import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OffboardingTemplateSelectorService } from './offboarding-template-selector.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('OffboardingTemplateSelectorService', () => {
  let service: OffboardingTemplateSelectorService
  let templateRepo: any

  beforeEach(() => {
    templateRepo = { findActiveByTenant: vi.fn() }
    service = new OffboardingTemplateSelectorService(templateRepo)
  })

  it('selects template matching termination_reason + country', async () => {
    vi.mocked(templateRepo.findActiveByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Default',
        countryCode: null,
        terminationReason: null,
        reasonCategory: null,
        isDefault: true,
      },
      {
        id: 't2',
        name: 'VN Resignation',
        countryCode: 'VN',
        terminationReason: 'voluntary_resignation',
        reasonCategory: 'voluntary',
        isDefault: false,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'voluntary_resignation')
    expect(result?.id).toBe('t2')
  })

  it('falls back to country + reason_category when exact reason not found', async () => {
    vi.mocked(templateRepo.findActiveByTenant).mockResolvedValue([
      {
        id: 't1',
        name: 'Default',
        countryCode: null,
        terminationReason: null,
        reasonCategory: null,
        isDefault: true,
      },
      {
        id: 't2',
        name: 'VN Voluntary',
        countryCode: 'VN',
        terminationReason: null,
        reasonCategory: 'voluntary',
        isDefault: false,
      },
    ])

    const result = await service.selectTemplate(TENANT_ID, 'VN', 'voluntary_resignation')
    expect(result?.id).toBe('t2')
  })
})
