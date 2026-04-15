import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  COMPLETENESS_RULE_REPOSITORY,
  type ICompletenessRuleRepository,
} from '../../domain/repositories/completeness-rule.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  EMPLOYMENT_DETAIL_REPOSITORY,
  type IEmploymentDetailRepository,
} from '../../domain/repositories/employment-detail.repository'
import {
  EMPLOYEE_DOCUMENT_REPOSITORY,
  type IEmployeeDocumentRepository,
} from '../../domain/repositories/employee-document.repository'
import type { CompletenessResult } from './get-profile-completeness.query'
import { GetProfileCompletenessQuery } from './get-profile-completeness.query'

function toCamelCase(snakeCase: string): string {
  return snakeCase.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

function isFieldFilled(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ''
}

@QueryHandler(GetProfileCompletenessQuery)
export class GetProfileCompletenessHandler implements IQueryHandler<
  GetProfileCompletenessQuery,
  CompletenessResult
> {
  constructor(
    @Inject(COMPLETENESS_RULE_REPOSITORY)
    private readonly ruleRepo: ICompletenessRuleRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly detailRepo: IEmploymentDetailRepository,
    @Inject(EMPLOYEE_DOCUMENT_REPOSITORY)
    private readonly docRepo: IEmployeeDocumentRepository,
  ) {}

  async execute(query: GetProfileCompletenessQuery): Promise<CompletenessResult> {
    const employment = await this.employmentRepo.findById(query.employmentId, query.tenantId)
    if (!employment) {
      return { score: 0, filled: 0, total: 0, missing: [] }
    }

    const [profile, detail, rules] = await Promise.all([
      this.profileRepo.findById(employment.personProfileId, query.tenantId),
      this.detailRepo.findByEmploymentId(query.employmentId, query.tenantId),
      this.ruleRepo.findApplicable(
        query.tenantId,
        employment.countryCode,
        employment.employmentType,
      ),
    ])

    let totalWeight = 0
    let filledWeight = 0
    let filled = 0
    const missing: CompletenessResult['missing'] = []

    for (const rule of rules) {
      totalWeight += rule.weight
      const parts = rule.fieldPath.split('.')
      const prefix = parts[0]
      const fieldName = parts[1]
      let isFilled = false

      if (prefix === 'person_profile' && fieldName && profile) {
        const camelField = toCamelCase(fieldName)
        isFilled = isFieldFilled((profile as unknown as Record<string, unknown>)[camelField])
      } else if (prefix === 'employment_detail' && fieldName && detail) {
        const camelField = toCamelCase(fieldName)
        isFilled = isFieldFilled((detail as unknown as Record<string, unknown>)[camelField])
      } else if (prefix === 'document' && fieldName) {
        const docs = await this.docRepo.findByCategory(
          query.employmentId,
          fieldName,
          query.tenantId,
        )
        isFilled = docs.length > 0
      }

      if (isFilled) {
        filledWeight += rule.weight
        filled++
      } else {
        missing.push({
          fieldPath: rule.fieldPath,
          label: rule.label,
          section: rule.section,
          isRequired: rule.isRequired,
          deadlineDays: rule.deadlineDays,
        })
      }
    }

    const score = totalWeight > 0 ? Math.round((filledWeight / totalWeight) * 100) : 100

    return {
      score,
      filled,
      total: rules.length,
      missing,
    }
  }
}
