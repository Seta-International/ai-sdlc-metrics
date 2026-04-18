import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { IPlanLabelRepository } from '../../domain/repositories/plan-label.repository'
import type { Label } from '../../domain/entities/plan.entity'
import type { LabelSlot } from '../../domain/value-objects/label-slot.vo'
import { plannerPlanLabel } from '../schema/planner.schema'
import { planLabelRowToEntity, planLabelEntityToRow } from './mappers/plan-label.mapper'

@Injectable()
export class DrizzlePlanLabelRepository implements IPlanLabelRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByPlanId(planId: string, tenantId: string): Promise<Label[]> {
    const rows = await this.db
      .select()
      .from(plannerPlanLabel)
      .where(and(eq(plannerPlanLabel.planId, planId), eq(plannerPlanLabel.tenantId, tenantId)))

    return rows.map(planLabelRowToEntity)
  }

  async upsert(planId: string, tenantId: string, label: Label): Promise<void> {
    const row = planLabelEntityToRow(planId, tenantId, label)

    await this.db
      .insert(plannerPlanLabel)
      .values({
        planId: row.planId,
        slot: row.slot,
        name: row.name,
        color: row.color,
        tenantId: row.tenantId,
      })
      .onConflictDoUpdate({
        target: [plannerPlanLabel.planId, plannerPlanLabel.slot],
        set: {
          name: row.name,
          color: row.color,
        },
      })
  }

  async delete(planId: string, slot: LabelSlot, tenantId: string): Promise<void> {
    await this.db
      .delete(plannerPlanLabel)
      .where(
        and(
          eq(plannerPlanLabel.planId, planId),
          eq(plannerPlanLabel.slot, slot.value),
          eq(plannerPlanLabel.tenantId, tenantId),
        ),
      )
  }
}
