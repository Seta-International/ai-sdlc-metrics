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
import type { MsPlanUpsertProps } from '../../domain/repositories/plan.repository'
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
        containerRef: row.containerRef ?? undefined,
        msPlanId: row.msPlanId ?? undefined,
        msPlanEtag: row.msPlanEtag ?? undefined,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        ownerActorId: row.ownerActorId ?? undefined,
        syncEnabled: row.syncEnabled,
      })
      .onConflictDoUpdate({
        target: plannerPlan.id,
        // ownerActorId + syncEnabled are set at create time and shouldn't flip on update,
        // so they are intentionally omitted from this SET block.
        set: {
          name: row.name,
          description: row.description,
          containerType: row.containerType ?? undefined,
          containerRef: row.containerRef ?? undefined,
          msPlanId: row.msPlanId ?? undefined,
          msPlanEtag: row.msPlanEtag ?? undefined,
          updatedAt: sql`NOW()`,
        },
      })
  }

  async findPersonalByOwner(
    tenantId: string,
    ownerActorId: string,
  ): Promise<{ id: string } | null> {
    const rows = await this.db
      .select({ id: plannerPlan.id })
      .from(plannerPlan)
      .where(
        and(
          eq(plannerPlan.tenantId, tenantId),
          eq(plannerPlan.ownerActorId, ownerActorId),
          isNull(plannerPlan.deletedAt),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async listAllIds(tenantId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: plannerPlan.id })
      .from(plannerPlan)
      .where(and(eq(plannerPlan.tenantId, tenantId), isNull(plannerPlan.deletedAt)))
    return rows.map((r) => r.id)
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

  async convertAllToFutureOnly(tenantId: string): Promise<void> {
    await this.db
      .update(plannerPlan)
      .set({ containerType: 'future_only', containerRef: null, msPlanId: null, msPlanEtag: null })
      .where(eq(plannerPlan.tenantId, tenantId))
  }

  async upsertFromMs(props: MsPlanUpsertProps, _opts: { origin: string }): Promise<{ id: string }> {
    const existing = await this.db
      .select({ id: plannerPlan.id })
      .from(plannerPlan)
      .where(
        and(eq(plannerPlan.tenantId, props.tenantId), eq(plannerPlan.msPlanId, props.msPlanId)),
      )
      .limit(1)

    if (existing[0]) {
      await this.db
        .update(plannerPlan)
        .set({
          name: props.title,
          containerType: props.containerType,
          containerRef: props.containerRef,
          msPlanEtag: props.msPlanEtag,
          updatedAt: sql`NOW()`,
        })
        .where(eq(plannerPlan.id, existing[0].id))
      return { id: existing[0].id }
    }

    const rows = await this.db
      .insert(plannerPlan)
      .values({
        tenantId: props.tenantId,
        name: props.title,
        containerType: props.containerType,
        containerRef: props.containerRef,
        msPlanId: props.msPlanId,
        msPlanEtag: props.msPlanEtag,
        createdBy: props.tenantId,
      })
      .returning({ id: plannerPlan.id })
    return { id: rows[0].id }
  }
}
