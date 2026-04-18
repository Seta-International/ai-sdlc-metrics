import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { IPlanRepository } from '../../domain/repositories/plan.repository'
import type { Plan } from '../../domain/entities/plan.entity'
import {
  plannerPlan,
  plannerBucket,
  plannerPlanLabel,
  plannerPlanMember,
} from '../schema/planner.schema'
import { planRowToEntity, planEntityToRow } from './mappers/plan.mapper'
import { bucketRowToEntity } from './mappers/bucket.mapper'
import { planLabelRowToEntity } from './mappers/plan-label.mapper'
import { planMemberRowToEntity } from './mappers/plan-member.mapper'

@Injectable()
export class DrizzlePlanRepository implements IPlanRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<Plan | null> {
    const planRows = await this.db
      .select()
      .from(plannerPlan)
      .where(
        and(
          eq(plannerPlan.id, id),
          eq(plannerPlan.tenantId, tenantId),
          isNull(plannerPlan.deletedAt),
        ),
      )
      .limit(1)

    if (!planRows[0]) return null

    const bucketRows = await this.db
      .select()
      .from(plannerBucket)
      .where(
        and(
          eq(plannerBucket.planId, id),
          eq(plannerBucket.tenantId, tenantId),
          isNull(plannerBucket.deletedAt),
        ),
      )

    const labelRows = await this.db
      .select()
      .from(plannerPlanLabel)
      .where(and(eq(plannerPlanLabel.planId, id), eq(plannerPlanLabel.tenantId, tenantId)))

    const memberRows = await this.db
      .select()
      .from(plannerPlanMember)
      .where(and(eq(plannerPlanMember.planId, id), eq(plannerPlanMember.tenantId, tenantId)))

    const buckets = bucketRows.map(bucketRowToEntity)
    const labels = labelRows.map(planLabelRowToEntity)
    const members = memberRows.map(planMemberRowToEntity)

    return planRowToEntity(planRows[0], buckets, labels, members)
  }

  async findByTenantId(tenantId: string): Promise<Plan[]> {
    const planRows = await this.db
      .select()
      .from(plannerPlan)
      .where(and(eq(plannerPlan.tenantId, tenantId), isNull(plannerPlan.deletedAt)))

    const plans: Plan[] = []

    for (const planRow of planRows) {
      const bucketRows = await this.db
        .select()
        .from(plannerBucket)
        .where(
          and(
            eq(plannerBucket.planId, planRow.id),
            eq(plannerBucket.tenantId, tenantId),
            isNull(plannerBucket.deletedAt),
          ),
        )

      const labelRows = await this.db
        .select()
        .from(plannerPlanLabel)
        .where(
          and(eq(plannerPlanLabel.planId, planRow.id), eq(plannerPlanLabel.tenantId, tenantId)),
        )

      const memberRows = await this.db
        .select()
        .from(plannerPlanMember)
        .where(
          and(eq(plannerPlanMember.planId, planRow.id), eq(plannerPlanMember.tenantId, tenantId)),
        )

      const buckets = bucketRows.map(bucketRowToEntity)
      const labels = labelRows.map(planLabelRowToEntity)
      const members = memberRows.map(planMemberRowToEntity)

      plans.push(planRowToEntity(planRow, buckets, labels, members))
    }

    return plans
  }

  async save(plan: Plan): Promise<void> {
    const row = planEntityToRow(plan)

    await this.db
      .insert(plannerPlan)
      .values({
        id: row.id,
        tenantId: row.tenantId,
        name: row.name,
        description: row.description,
        containerType: row.containerType ?? undefined,
        msGroupId: row.msGroupId ?? undefined,
        msRosterId: row.msRosterId ?? undefined,
        msPlanId: row.msPlanId ?? undefined,
        msPlanEtag: row.msPlanEtag ?? undefined,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
      .onConflictDoUpdate({
        target: plannerPlan.id,
        set: {
          name: row.name,
          description: row.description,
          containerType: row.containerType ?? undefined,
          msGroupId: row.msGroupId ?? undefined,
          msRosterId: row.msRosterId ?? undefined,
          msPlanId: row.msPlanId ?? undefined,
          msPlanEtag: row.msPlanEtag ?? undefined,
          updatedAt: sql`NOW()`,
        },
      })
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    await this.db
      .update(plannerPlan)
      .set({ deletedAt: sql`NOW()` })
      .where(
        and(
          eq(plannerPlan.id, id),
          eq(plannerPlan.tenantId, tenantId),
          isNull(plannerPlan.deletedAt),
        ),
      )
  }
}
