import type { ContractVersion } from '../entities/contract-version.entity'

export const CONTRACT_VERSION_REPOSITORY = Symbol('IContractVersionRepository')

export interface IContractVersionRepository {
  findById(id: string, tenantId: string): Promise<ContractVersion | null>
  findByEmploymentId(employmentId: string, tenantId: string): Promise<ContractVersion[]>
  findActiveByEmploymentId(employmentId: string, tenantId: string): Promise<ContractVersion | null>
  insert(data: Omit<ContractVersion, 'id' | 'createdAt'>): Promise<ContractVersion>
  update(
    id: string,
    tenantId: string,
    data: Partial<
      Omit<ContractVersion, 'id' | 'tenantId' | 'employmentId' | 'createdAt' | 'createdBy'>
    >,
  ): Promise<ContractVersion>
  countExpiringBefore(tenantId: string, date: Date): Promise<number>
}
