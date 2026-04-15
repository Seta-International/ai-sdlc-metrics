import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { FieldVisibilityConfig } from '../../domain/entities/field-visibility-config.entity'
import type { IFieldVisibilityConfigRepository } from '../../domain/repositories/field-visibility-config.repository'
import { fieldVisibilityConfig } from '../schema/extensibility.schema'

@Injectable()
export class DrizzleFieldVisibilityConfigRepository implements IFieldVisibilityConfigRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByTenant(tenantId: string): Promise<FieldVisibilityConfig[]> {
    return (await this.db
      .select()
      .from(fieldVisibilityConfig)
      .where(eq(fieldVisibilityConfig.tenantId, tenantId))) as FieldVisibilityConfig[]
  }

  async findByFieldPath(
    fieldPath: string,
    tenantId: string,
  ): Promise<FieldVisibilityConfig | null> {
    const rows = await this.db
      .select()
      .from(fieldVisibilityConfig)
      .where(
        and(
          eq(fieldVisibilityConfig.fieldPath, fieldPath),
          eq(fieldVisibilityConfig.tenantId, tenantId),
        ),
      )
      .limit(1)
    return (rows[0] as FieldVisibilityConfig | undefined) ?? null
  }

  async upsert(data: Omit<FieldVisibilityConfig, 'id'>): Promise<FieldVisibilityConfig> {
    const rows = await this.db
      .insert(fieldVisibilityConfig)
      .values(data as typeof fieldVisibilityConfig.$inferInsert)
      .onConflictDoUpdate({
        target: [fieldVisibilityConfig.tenantId, fieldVisibilityConfig.fieldPath],
        set: { visibilityTier: sql`excluded.visibility_tier` },
      })
      .returning()
    return rows[0] as FieldVisibilityConfig
  }

  async upsertMany(data: Omit<FieldVisibilityConfig, 'id'>[]): Promise<FieldVisibilityConfig[]> {
    return (await this.db
      .insert(fieldVisibilityConfig)
      .values(data as (typeof fieldVisibilityConfig.$inferInsert)[])
      .onConflictDoUpdate({
        target: [fieldVisibilityConfig.tenantId, fieldVisibilityConfig.fieldPath],
        set: { visibilityTier: sql`excluded.visibility_tier` },
      })
      .returning()) as FieldVisibilityConfig[]
  }
}
