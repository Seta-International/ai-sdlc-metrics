import { Inject, Injectable } from '@nestjs/common'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  EMPLOYMENT_DETAIL_REPOSITORY,
  type IEmploymentDetailRepository,
} from '../../domain/repositories/employment-detail.repository'

export interface DuplicateWarning {
  field: string
  severity: 'error' | 'warning'
  conflictEmploymentId: string
  message: string
}

export interface DuplicateCheckInput {
  companyEmail?: string
  nationalId?: string
  taxId?: string
  socialInsuranceId?: string
  passportNumber?: string
  bankAccountNumber?: string
  personalEmail?: string
  personalPhone?: string
}

@Injectable()
export class DuplicateValidationService {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly detailRepo: IEmploymentDetailRepository,
  ) {}

  async checkDuplicates(
    tenantId: string,
    currentEmploymentId: string,
    input: DuplicateCheckInput,
  ): Promise<DuplicateWarning[]> {
    const warnings: DuplicateWarning[] = []

    const allEmployments = await this.employmentRepo.listByTenant(tenantId)
    const otherEmployments = allEmployments.filter((e) => e.id !== currentEmploymentId)

    // Hard block: company email must be unique
    if (input.companyEmail) {
      for (const emp of otherEmployments) {
        if ((emp as any).companyEmail === input.companyEmail) {
          warnings.push({
            field: 'companyEmail',
            severity: 'error',
            conflictEmploymentId: emp.id,
            message: `Company email ${input.companyEmail} is already in use`,
          })
        }
      }
    }

    // Warning fields: check via employment details
    const detailFields: Array<{ inputKey: keyof DuplicateCheckInput; detailKey: string }> = [
      { inputKey: 'nationalId', detailKey: 'nationalId' },
      { inputKey: 'taxId', detailKey: 'taxId' },
      { inputKey: 'socialInsuranceId', detailKey: 'socialInsuranceId' },
      { inputKey: 'passportNumber', detailKey: 'passportNumber' },
      { inputKey: 'bankAccountNumber', detailKey: 'bankAccountNumber' },
      { inputKey: 'personalEmail', detailKey: 'personalEmail' },
      { inputKey: 'personalPhone', detailKey: 'personalPhone' },
    ]

    for (const emp of otherEmployments) {
      const detail = await this.detailRepo.findByEmploymentId(emp.id, tenantId)
      if (!detail) continue

      for (const { inputKey, detailKey } of detailFields) {
        const inputValue = input[inputKey]
        const existingValue = (detail as Record<string, unknown>)[detailKey]
        if (inputValue && existingValue && inputValue === existingValue) {
          warnings.push({
            field: inputKey,
            severity: 'warning',
            conflictEmploymentId: emp.id,
            message: `${inputKey} ${inputValue} is already used by another employee`,
          })
        }
      }
    }

    return warnings
  }
}
