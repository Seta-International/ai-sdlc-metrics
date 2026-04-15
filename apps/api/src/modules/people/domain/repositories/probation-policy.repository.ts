import type { ProbationPolicy } from '../entities/probation-policy.entity'

export const PROBATION_POLICY_REPOSITORY = Symbol('IProbationPolicyRepository')

export interface IProbationPolicyRepository {
  findById(id: string, tenantId: string): Promise<ProbationPolicy | null>
  findByCountryAndLevel(
    countryCode: string,
    jobLevelCategory: string,
    tenantId: string,
  ): Promise<ProbationPolicy | null>
  listByTenant(tenantId: string): Promise<ProbationPolicy[]>
  insert(data: Omit<ProbationPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProbationPolicy>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<ProbationPolicy, 'id' | 'tenantId' | 'createdAt'>>,
  ): Promise<ProbationPolicy>
}
