import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { tenantEmailConfig } from '../schema/admin.schema'
import type { ITenantEmailConfigRepository } from '../../domain/repositories/tenant-email-config.repository.port'
import type { TenantEmailConfig } from '../../domain/entities/tenant-email-config.entity'

@Injectable()
export class DrizzleTenantEmailConfigRepository implements ITenantEmailConfigRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByTenantId(tenantId: string): Promise<TenantEmailConfig | null> {
    const rows = await this.db
      .select()
      .from(tenantEmailConfig)
      .where(eq(tenantEmailConfig.tenantId, tenantId))
      .limit(1)

    return rows[0] ?? null
  }

  async upsert(
    config: Omit<TenantEmailConfig, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TenantEmailConfig> {
    const rows = await this.db
      .insert(tenantEmailConfig)
      .values(config)
      .onConflictDoUpdate({
        target: tenantEmailConfig.tenantId,
        set: {
          provider: config.provider,
          fromAddress: config.fromAddress,
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          credentialRef: config.credentialRef,
          updatedAt: new Date(),
        },
      })
      .returning()

    return rows[0]!
  }
}
