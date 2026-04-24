import type { Tenant } from '../entities/tenant.entity'

export const TENANT_REPOSITORY = Symbol('ITenantRepository')

export interface ITenantRepository {
  findById(id: string): Promise<Tenant | null>
  findBySlug(slug: string): Promise<Tenant | null>
  findAll(): Promise<Tenant[]>
  insert(data: { name: string; slug: string; planTier: Tenant['planTier'] }): Promise<Tenant>
  /**
   * Insert or update the hidden system tenant by its fixed ID.
   * Used only by the bootstrap command — no RLS context required.
   */
  upsertSystemTenant(data: { id: string; slug: string; name: string }): Promise<Tenant>
}
