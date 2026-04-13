import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { ITenantBrandingRepository } from '../../domain/repositories/tenant-branding.repository.port'
import type { TenantBranding } from '../../domain/entities/tenant-branding.entity'
import { tenantBranding } from '../schema/documents.schema'

@Injectable()
export class DrizzleTenantBrandingRepository implements ITenantBrandingRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByTenant(tenantId: string): Promise<TenantBranding | null> {
    const rows = await this.db
      .select()
      .from(tenantBranding)
      .where(eq(tenantBranding.tenantId, tenantId))
      .limit(1)
    return (rows[0] as TenantBranding | undefined) ?? null
  }

  async upsert(data: Omit<TenantBranding, 'id'>): Promise<TenantBranding> {
    const rows = await this.db
      .insert(tenantBranding)
      .values({
        tenantId: data.tenantId,
        companyName: data.companyName,
        logoFileKey: data.logoFileKey,
        primaryColor: data.primaryColor,
        fontFamily: data.fontFamily,
        updatedAt: data.updatedAt,
      })
      .onConflictDoUpdate({
        target: tenantBranding.tenantId,
        set: {
          companyName: data.companyName,
          logoFileKey: data.logoFileKey,
          primaryColor: data.primaryColor,
          fontFamily: data.fontFamily,
          updatedAt: new Date(),
        },
      })
      .returning()
    return rows[0] as TenantBranding
  }
}
