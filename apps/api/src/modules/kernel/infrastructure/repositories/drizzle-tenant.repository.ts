import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { eq } from 'drizzle-orm'
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
}
