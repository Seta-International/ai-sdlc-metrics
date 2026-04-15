import { Inject, Injectable } from '@nestjs/common'
import {
  COUNTRY_FIELD_CONFIG_REPOSITORY,
  type ICountryFieldConfigRepository,
} from '../../domain/repositories/country-field-config.repository'

export interface FieldValidationError {
  fieldKey: string
  message: string
}

@Injectable()
export class CountryFieldValidationService {
  constructor(
    @Inject(COUNTRY_FIELD_CONFIG_REPOSITORY)
    private readonly configRepo: ICountryFieldConfigRepository,
  ) {}

  async validate(
    countryCode: string,
    countryData: Record<string, unknown>,
  ): Promise<FieldValidationError[]> {
    const configs = await this.configRepo.findByCountryCode(countryCode)
    if (configs.length === 0) return []

    const errors: FieldValidationError[] = []

    for (const config of configs) {
      const value = countryData[config.fieldKey]

      if (config.isRequired && (value === undefined || value === null || value === '')) {
        errors.push({
          fieldKey: config.fieldKey,
          message: `${config.label} is required`,
        })
        continue
      }

      if (value === undefined || value === null || value === '') continue

      if (config.fieldType === 'text' && typeof value === 'string') {
        if (config.validation?.regex) {
          const regex = new RegExp(config.validation.regex)
          if (!regex.test(value)) {
            errors.push({
              fieldKey: config.fieldKey,
              message: `${config.label} does not match required format`,
            })
          }
        }
        if (config.validation?.minLength && value.length < config.validation.minLength) {
          errors.push({
            fieldKey: config.fieldKey,
            message: `${config.label} must be at least ${config.validation.minLength} characters`,
          })
        }
        if (config.validation?.maxLength && value.length > config.validation.maxLength) {
          errors.push({
            fieldKey: config.fieldKey,
            message: `${config.label} must be at most ${config.validation.maxLength} characters`,
          })
        }
      }

      if (config.fieldType === 'select' && config.options) {
        const allowedValues = config.options.map((o) => o.value)
        if (!allowedValues.includes(value as string)) {
          errors.push({
            fieldKey: config.fieldKey,
            message: `${config.label} has invalid option: ${value}`,
          })
        }
      }
    }

    return errors
  }
}
