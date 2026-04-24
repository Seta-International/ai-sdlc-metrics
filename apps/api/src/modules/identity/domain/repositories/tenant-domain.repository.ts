import type { TenantDomainEntity, TenantDomainStatus } from '../entities/tenant-domain.entity'

export const TENANT_DOMAIN_REPOSITORY = Symbol('ITenantDomainRepository')

export interface ITenantDomainRepository {
  insert(data: {
    tenantId: string
    domain: string
    status: TenantDomainStatus
    verificationTokenHash: string
    verifiedAt?: Date | null
  }): Promise<TenantDomainEntity>
  findById(id: string, tenantId: string): Promise<TenantDomainEntity | null>
  findByTenantId(tenantId: string): Promise<TenantDomainEntity[]>
  findVerifiedByDomain(domain: string): Promise<TenantDomainEntity | null>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<TenantDomainEntity, 'status' | 'verifiedAt' | 'verificationTokenHash'>>,
  ): Promise<void>
}
