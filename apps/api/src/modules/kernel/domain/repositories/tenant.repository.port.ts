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
  /**
   * Update the status of a tenant. Used by platform admin operations.
   * No RLS context required — the tenant table is not RLS-protected.
   * Returns true if a row was updated, false if the tenant was not found.
   */
  updateStatus(id: string, status: Tenant['status']): Promise<boolean>
}
