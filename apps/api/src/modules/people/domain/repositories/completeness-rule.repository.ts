import type { CompletenessRule } from '../entities/completeness-rule.entity'

export const COMPLETENESS_RULE_REPOSITORY = Symbol('ICompletenessRuleRepository')

export interface ICompletenessRuleRepository {
  findApplicable(
    tenantId: string,
    countryCode: string,
    employmentType: string,
  ): Promise<CompletenessRule[]>
  listByTenant(tenantId: string): Promise<CompletenessRule[]>
  insertMany(data: Omit<CompletenessRule, 'id'>[]): Promise<CompletenessRule[]>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<CompletenessRule, 'id' | 'tenantId'>>,
  ): Promise<CompletenessRule>
}
