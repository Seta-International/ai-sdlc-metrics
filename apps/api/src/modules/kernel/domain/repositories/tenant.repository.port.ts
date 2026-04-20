import type { Tenant } from '../entities/tenant.entity'

export const TENANT_REPOSITORY = Symbol('ITenantRepository')

export interface ITenantRepository {
  findById(id: string): Promise<Tenant | null>
  findBySlug(slug: string): Promise<Tenant | null>
  findAll(): Promise<Tenant[]>
  insert(data: { name: string; slug: string; planTier: Tenant['planTier'] }): Promise<Tenant>
}
