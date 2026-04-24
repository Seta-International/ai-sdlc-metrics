import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { eq, sql } from 'drizzle-orm'
import type { Tenant } from '../../domain/entities/tenant.entity'
import type { ITenantRepository } from '../../domain/repositories/tenant.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { tenant } from '../schema/index'

@Injectable()
export class DrizzleTenantRepository implements ITenantRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string): Promise<Tenant | null> {
    const rows = await this.db.select().from(tenant).where(eq(tenant.id, id)).limit(1)
    return (rows[0] as Tenant | undefined) ?? null
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const rows = await this.db.select().from(tenant).where(eq(tenant.slug, slug)).limit(1)
    return (rows[0] as Tenant | undefined) ?? null
  }

  async findAll(): Promise<Tenant[]> {
    const rows = await this.db.select().from(tenant)
    return rows as Tenant[]
  }

  async insert(data: {
    name: string
    slug: string
    planTier: Tenant['planTier']
  }): Promise<Tenant> {
    const rows = await this.db
      .insert(tenant)
      .values({ name: data.name, slug: data.slug, planTier: data.planTier })
      .returning()
    return rows[0] as Tenant
  }

  async upsertSystemTenant(data: { id: string; slug: string; name: string }): Promise<Tenant> {
    const rows = await this.db
      .insert(tenant)
      .values({
        id: data.id,
        name: data.name,
        slug: data.slug,
        planTier: 'enterprise',
        status: 'active',
      })
      .onConflictDoUpdate({
        target: tenant.id,
        set: {
          name: data.name,
          updatedAt: sql`now()`,
        },
      })
      .returning()
    return rows[0] as Tenant
  }
}
