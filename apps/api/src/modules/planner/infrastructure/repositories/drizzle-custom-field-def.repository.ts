import { Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, count, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { plannerCustomFieldDef } from '../schema/planner.schema'
import type {
  CustomFieldDefRecord,
  ICustomFieldDefRepository,
} from '../../domain/repositories/custom-field-def.repository'

export class DrizzleCustomFieldDefRepository implements ICustomFieldDefRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async countByPlan(planId: string, tenantId: string): Promise<number> {
    const rows = await this.db
      .select({ cnt: count() })
      .from(plannerCustomFieldDef)
      .where(
        and(eq(plannerCustomFieldDef.planId, planId), eq(plannerCustomFieldDef.tenantId, tenantId)),
      )
    return Number(rows[0]?.cnt ?? 0)
  }

  async save(record: CustomFieldDefRecord): Promise<void> {
    await this.db.insert(plannerCustomFieldDef).values({
      id: record.id,
      tenantId: record.tenantId,
      planId: record.planId,
      name: record.name,
      kind: record.kind,
      choiceOptions: record.choiceOptions as never,
      position: record.position,
    })
  }

  async findById(id: string, tenantId: string): Promise<CustomFieldDefRecord | null> {
    const rows = await this.db
      .select()
      .from(plannerCustomFieldDef)
      .where(and(eq(plannerCustomFieldDef.id, id), eq(plannerCustomFieldDef.tenantId, tenantId)))
    if (!rows[0]) return null
    return this.toRecord(rows[0])
  }

  async listByPlan(planId: string, tenantId: string): Promise<CustomFieldDefRecord[]> {
    const rows = await this.db
      .select()
      .from(plannerCustomFieldDef)
      .where(
        and(eq(plannerCustomFieldDef.planId, planId), eq(plannerCustomFieldDef.tenantId, tenantId)),
      )
      .orderBy(plannerCustomFieldDef.position)
    return rows.map((r) => this.toRecord(r))
  }

  async update(record: CustomFieldDefRecord): Promise<void> {
    await this.db
      .update(plannerCustomFieldDef)
      .set({
        name: record.name,
        choiceOptions: record.choiceOptions as never,
        position: record.position,
      })
      .where(
        and(
          eq(plannerCustomFieldDef.id, record.id),
          eq(plannerCustomFieldDef.tenantId, record.tenantId),
        ),
      )
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(plannerCustomFieldDef)
      .where(and(eq(plannerCustomFieldDef.id, id), eq(plannerCustomFieldDef.tenantId, tenantId)))
  }

  private toRecord(row: typeof plannerCustomFieldDef.$inferSelect): CustomFieldDefRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      planId: row.planId,
      name: row.name,
      kind: row.kind as CustomFieldDefRecord['kind'],
      choiceOptions: Array.isArray(row.choiceOptions) ? (row.choiceOptions as string[]) : null,
      position: row.position,
    }
  }
}
