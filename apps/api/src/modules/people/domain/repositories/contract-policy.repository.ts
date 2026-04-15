import type { ContractPolicy } from '../entities/contract-policy.entity'

export const CONTRACT_POLICY_REPOSITORY = Symbol('IContractPolicyRepository')

export interface IContractPolicyRepository {
  findByCountry(countryCode: string, tenantId: string): Promise<ContractPolicy | null>
  listByTenant(tenantId: string): Promise<ContractPolicy[]>
  insert(data: Omit<ContractPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<ContractPolicy>
  update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        ContractPolicy,
        | 'maxFixedTermMonths'
        | 'maxFixedTermRenewals'
        | 'forceIndefiniteAfter'
        | 'probationRequiresContract'
      >
    >,
  ): Promise<ContractPolicy>
}
