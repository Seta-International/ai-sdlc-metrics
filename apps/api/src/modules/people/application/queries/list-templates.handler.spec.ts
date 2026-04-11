import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListTemplatesQuery } from './list-templates.query'
import { ListTemplatesHandler } from './list-templates.handler'
import type { IOnboardingTemplateRepository } from '../../domain/repositories/onboarding-template.repository'
import type { IOffboardingTemplateRepository } from '../../domain/repositories/offboarding-template.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const onboardingTemplates = [
  {
    id: '01900000-0000-7000-8000-000000000010',
    tenantId: TENANT_ID,
    name: 'Standard Onboarding',
    employmentType: 'permanent' as const,
    isDefault: true,
    isActive: true,
  },
]

const offboardingTemplates = [
  {
    id: '01900000-0000-7000-8000-000000000020',
    tenantId: TENANT_ID,
    name: 'Standard Offboarding',
    employmentType: null,
    reasonCategory: null,
    isDefault: true,
    isActive: true,
  },
]

describe('ListTemplatesHandler', () => {
  let handler: ListTemplatesHandler
  let onboardingTemplateRepo: IOnboardingTemplateRepository
  let offboardingTemplateRepo: IOffboardingTemplateRepository

  beforeEach(() => {
    onboardingTemplateRepo = {
      findById: vi.fn(),
      findByEmploymentType: vi.fn(),
      findDefault: vi.fn(),
      listByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      getTaskTemplates: vi.fn(),
    }
    offboardingTemplateRepo = {
      findById: vi.fn(),
      findByEmploymentTypeAndCategory: vi.fn(),
      findMatch: vi.fn(),
      findDefault: vi.fn(),
      listByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      getTaskTemplates: vi.fn(),
    }
    handler = new ListTemplatesHandler(onboardingTemplateRepo, offboardingTemplateRepo)
  })

  it('returns onboarding templates when templateType is onboarding', async () => {
    vi.mocked(onboardingTemplateRepo.listByTenant).mockResolvedValue(onboardingTemplates)

    const result = await handler.execute(new ListTemplatesQuery(TENANT_ID, 'onboarding'))

    expect(onboardingTemplateRepo.listByTenant).toHaveBeenCalledWith(TENANT_ID)
    expect(offboardingTemplateRepo.listByTenant).not.toHaveBeenCalled()
    expect(result).toEqual(onboardingTemplates)
  })

  it('returns offboarding templates when templateType is offboarding', async () => {
    vi.mocked(offboardingTemplateRepo.listByTenant).mockResolvedValue(offboardingTemplates)

    const result = await handler.execute(new ListTemplatesQuery(TENANT_ID, 'offboarding'))

    expect(offboardingTemplateRepo.listByTenant).toHaveBeenCalledWith(TENANT_ID)
    expect(onboardingTemplateRepo.listByTenant).not.toHaveBeenCalled()
    expect(result).toEqual(offboardingTemplates)
  })

  it('returns empty array when no templates exist', async () => {
    vi.mocked(onboardingTemplateRepo.listByTenant).mockResolvedValue([])

    const result = await handler.execute(new ListTemplatesQuery(TENANT_ID, 'onboarding'))

    expect(result).toEqual([])
  })
})
