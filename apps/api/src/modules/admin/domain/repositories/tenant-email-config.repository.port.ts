import type { TenantEmailConfig } from '../entities/tenant-email-config.entity'

export interface ITenantEmailConfigRepository {
  findByTenantId(tenantId: string): Promise<TenantEmailConfig | null>
  upsert(
    config: Omit<TenantEmailConfig, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TenantEmailConfig>
}

export const TENANT_EMAIL_CONFIG_REPOSITORY = Symbol('ITenantEmailConfigRepository')
