import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { FieldEditPolicy } from '../../domain/entities/field-edit-policy.entity'
import type { IFieldEditPolicyRepository } from '../../domain/repositories/field-edit-policy.repository'
import { fieldEditPolicy } from '../schema/extensibility.schema'

@Injectable()
export class DrizzleFieldEditPolicyRepository implements IFieldEditPolicyRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByTenant(tenantId: string): Promise<FieldEditPolicy[]> {
    return (await this.db
      .select()
      .from(fieldEditPolicy)
      .where(eq(fieldEditPolicy.tenantId, tenantId))) as FieldEditPolicy[]
  }

  async findByFieldPath(fieldPath: string, tenantId: string): Promise<FieldEditPolicy | null> {
    const rows = await this.db
      .select()
      .from(fieldEditPolicy)
      .where(and(eq(fieldEditPolicy.fieldPath, fieldPath), eq(fieldEditPolicy.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as FieldEditPolicy | undefined) ?? null
  }

  async upsert(data: Omit<FieldEditPolicy, 'id'>): Promise<FieldEditPolicy> {
    const rows = await this.db
      .insert(fieldEditPolicy)
      .values(data as typeof fieldEditPolicy.$inferInsert)
      .onConflictDoUpdate({
        target: [fieldEditPolicy.tenantId, fieldEditPolicy.fieldPath],
        set: { editMode: sql`excluded.edit_mode` },
      })
      .returning()
    return rows[0] as FieldEditPolicy
  }

  async upsertMany(data: Omit<FieldEditPolicy, 'id'>[]): Promise<FieldEditPolicy[]> {
    return (await this.db
      .insert(fieldEditPolicy)
      .values(data as (typeof fieldEditPolicy.$inferInsert)[])
      .onConflictDoUpdate({
        target: [fieldEditPolicy.tenantId, fieldEditPolicy.fieldPath],
        set: { editMode: sql`excluded.edit_mode` },
      })
      .returning()) as FieldEditPolicy[]
  }
}
