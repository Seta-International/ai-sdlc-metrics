import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CountryFieldValidationService } from './country-field-validation.service'
import type { ICountryFieldConfigRepository } from '../../domain/repositories/country-field-config.repository'

describe('CountryFieldValidationService', () => {
  let service: CountryFieldValidationService
  let configRepo: ICountryFieldConfigRepository

  beforeEach(() => {
    configRepo = {
      findById: vi.fn(),
      findByCountryCode: vi.fn(),
      findByCountryAndKey: vi.fn(),
      insertMany: vi.fn(),
      update: vi.fn(),
    }
    service = new CountryFieldValidationService(configRepo)
  })

  it('validates valid country data against config', async () => {
    vi.mocked(configRepo.findByCountryCode).mockResolvedValue([
      {
        id: '1',
        countryCode: 'VN',
        fieldKey: 'citizen_id',
        label: 'Citizen ID',
        labelLocale: null,
        fieldType: 'text',
        fieldGroup: 'identity',
        isRequired: true,
        sortOrder: 1,
        validation: { regex: '^\\d{12}$' },
        options: null,
      },
    ])

    const errors = await service.validate('VN', { citizen_id: '012345678901' })
    expect(errors).toEqual([])
  })

  it('returns error for missing required field', async () => {
    vi.mocked(configRepo.findByCountryCode).mockResolvedValue([
      {
        id: '1',
        countryCode: 'VN',
        fieldKey: 'citizen_id',
        label: 'Citizen ID',
        labelLocale: null,
        fieldType: 'text',
        fieldGroup: 'identity',
        isRequired: true,
        sortOrder: 1,
        validation: null,
        options: null,
      },
    ])

    const errors = await service.validate('VN', {})
    expect(errors).toHaveLength(1)
    expect(errors[0]).toEqual(
      expect.objectContaining({
        fieldKey: 'citizen_id',
        message: expect.stringContaining('required'),
      }),
    )
  })

  it('returns error for invalid regex pattern', async () => {
    vi.mocked(configRepo.findByCountryCode).mockResolvedValue([
      {
        id: '1',
        countryCode: 'VN',
        fieldKey: 'citizen_id',
        label: 'Citizen ID',
        labelLocale: null,
        fieldType: 'text',
        fieldGroup: 'identity',
        isRequired: true,
        sortOrder: 1,
        validation: { regex: '^\\d{12}$' },
        options: null,
      },
    ])

    const errors = await service.validate('VN', { citizen_id: 'INVALID' })
    expect(errors).toHaveLength(1)
    expect(errors[0].fieldKey).toBe('citizen_id')
  })

  it('validates select field against allowed options', async () => {
    vi.mocked(configRepo.findByCountryCode).mockResolvedValue([
      {
        id: '1',
        countryCode: 'VN',
        fieldKey: 'vehicle_type',
        label: 'Vehicle Type',
        labelLocale: null,
        fieldType: 'select',
        fieldGroup: 'vehicle',
        isRequired: false,
        sortOrder: 1,
        validation: null,
        options: [
          { value: 'motorbike', label: 'Motorbike' },
          { value: 'car', label: 'Car' },
        ],
      },
    ])

    const errors = await service.validate('VN', { vehicle_type: 'truck' })
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('invalid option')
  })

  it('returns empty array for unknown country', async () => {
    vi.mocked(configRepo.findByCountryCode).mockResolvedValue([])
    const errors = await service.validate('XX', { any_field: 'value' })
    expect(errors).toEqual([])
  })
})
