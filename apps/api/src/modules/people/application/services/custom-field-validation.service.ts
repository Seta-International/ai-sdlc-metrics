import { Inject, Injectable } from '@nestjs/common'
import {
  CUSTOM_FIELD_DEFINITION_REPOSITORY,
  type ICustomFieldDefinitionRepository,
} from '../../domain/repositories/custom-field-definition.repository'
import type { FieldValidationError } from './country-field-validation.service'

export type { FieldValidationError }

@Injectable()
export class CustomFieldValidationService {
  constructor(
    @Inject(CUSTOM_FIELD_DEFINITION_REPOSITORY)
    private readonly defRepo: ICustomFieldDefinitionRepository,
  ) {}

  async validate(
    tenantId: string,
    customFields: Record<string, unknown>,
  ): Promise<FieldValidationError[]> {
    const definitions = await this.defRepo.findByTenant(tenantId)
    const activeDefs = definitions.filter((d) => d.isActive)

    const errors: FieldValidationError[] = []

    for (const def of activeDefs) {
      const value = customFields[def.fieldKey]

      if (def.isRequired && (value === undefined || value === null || value === '')) {
        errors.push({
          fieldKey: def.fieldKey,
          message: `${def.label} is required`,
        })
        continue
      }

      if (value === undefined || value === null || value === '') continue

      if (def.fieldType === 'text' && typeof value === 'string') {
        if (def.validation?.regex) {
          try {
            const regex = new RegExp(def.validation.regex)
            if (!regex.test(value)) {
              errors.push({
                fieldKey: def.fieldKey,
                message: `${def.label} does not match required format`,
              })
            }
          } catch {
            errors.push({
              fieldKey: def.fieldKey,
              message: `${def.label} has invalid validation pattern`,
            })
          }
        }
        if (def.validation?.minLength && value.length < def.validation.minLength) {
          errors.push({
            fieldKey: def.fieldKey,
            message: `${def.label} must be at least ${def.validation.minLength} characters`,
          })
        }
        if (def.validation?.maxLength && value.length > def.validation.maxLength) {
          errors.push({
            fieldKey: def.fieldKey,
            message: `${def.label} must be at most ${def.validation.maxLength} characters`,
          })
        }
      }

      if (def.fieldType === 'number' && typeof value === 'number') {
        if (def.validation?.min !== undefined && value < def.validation.min) {
          errors.push({
            fieldKey: def.fieldKey,
            message: `${def.label} must be at least ${def.validation.min}`,
          })
        }
        if (def.validation?.max !== undefined && value > def.validation.max) {
          errors.push({
            fieldKey: def.fieldKey,
            message: `${def.label} must be at most ${def.validation.max}`,
          })
        }
      }

      if (def.fieldType === 'select' && def.options) {
        const allowedValues = def.options.map((o) => o.value)
        if (!allowedValues.includes(value as string)) {
          errors.push({
            fieldKey: def.fieldKey,
            message: `${def.label} has invalid option: ${value}`,
          })
        }
      }
    }

    return errors
  }
}
