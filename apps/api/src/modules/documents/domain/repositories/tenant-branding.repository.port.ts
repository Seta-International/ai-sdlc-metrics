import type { TenantBranding } from '../entities/tenant-branding.entity'

export interface ITenantBrandingRepository {
  findByTenant(tenantId: string): Promise<TenantBranding | null>
  upsert(data: Omit<TenantBranding, 'id'>): Promise<TenantBranding>
}

export const TENANT_BRANDING_REPOSITORY = Symbol('ITenantBrandingRepository')
