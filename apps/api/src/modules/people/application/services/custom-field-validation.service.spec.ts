import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomFieldValidationService } from './custom-field-validation.service'
import type { ICustomFieldDefinitionRepository } from '../../domain/repositories/custom-field-definition.repository'

describe('CustomFieldValidationService', () => {
  let service: CustomFieldValidationService
  let defRepo: ICustomFieldDefinitionRepository

  beforeEach(() => {
    defRepo = {
      findById: vi.fn(),
      findByFieldKey: vi.fn(),
      findByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    service = new CustomFieldValidationService(defRepo)
  })

  it('validates valid custom fields', async () => {
    vi.mocked(defRepo.findByTenant).mockResolvedValue([
      {
        id: '1',
        tenantId: 't1',
        fieldKey: 'tshirt_size',
        label: 'T-Shirt Size',
        fieldType: 'select',
        fieldGroup: null,
        isRequired: false,
        isSearchable: false,
        isFilterable: false,
        sortOrder: 1,
        validation: null,
        options: [
          { value: 'S', label: 'Small' },
          { value: 'M', label: 'Medium' },
          { value: 'L', label: 'Large' },
        ],
        visibilityTier: 'public',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const errors = await service.validate('t1', { tshirt_size: 'M' })
    expect(errors).toEqual([])
  })

  it('returns error for required custom field missing', async () => {
    vi.mocked(defRepo.findByTenant).mockResolvedValue([
      {
        id: '1',
        tenantId: 't1',
        fieldKey: 'badge_number',
        label: 'Badge Number',
        fieldType: 'text',
        fieldGroup: null,
        isRequired: true,
        isSearchable: false,
        isFilterable: false,
        sortOrder: 1,
        validation: null,
        options: null,
        visibilityTier: 'public',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const errors = await service.validate('t1', {})
    expect(errors).toHaveLength(1)
    expect(errors[0].fieldKey).toBe('badge_number')
  })

  it('skips inactive field definitions', async () => {
    vi.mocked(defRepo.findByTenant).mockResolvedValue([
      {
        id: '1',
        tenantId: 't1',
        fieldKey: 'old_field',
        label: 'Old Field',
        fieldType: 'text',
        fieldGroup: null,
        isRequired: true,
        isSearchable: false,
        isFilterable: false,
        sortOrder: 1,
        validation: null,
        options: null,
        visibilityTier: 'public',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const errors = await service.validate('t1', {})
    expect(errors).toEqual([])
  })

  it('validates number field with min/max', async () => {
    vi.mocked(defRepo.findByTenant).mockResolvedValue([
      {
        id: '1',
        tenantId: 't1',
        fieldKey: 'years_exp',
        label: 'Years Experience',
        fieldType: 'number',
        fieldGroup: null,
        isRequired: false,
        isSearchable: false,
        isFilterable: false,
        sortOrder: 1,
        validation: { min: 0, max: 50 },
        options: null,
        visibilityTier: 'public',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const errors = await service.validate('t1', { years_exp: 60 })
    expect(errors).toHaveLength(1)
  })
})
