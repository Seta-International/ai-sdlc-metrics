import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { IPlanMemberRepository } from '../../domain/repositories/plan-member.repository'
import type { PlanMember } from '../../domain/entities/plan.entity'
import { plannerPlanMember } from '../schema/planner.schema'
import { planMemberRowToEntity, planMemberEntityToRow } from './mappers/plan-member.mapper'

@Injectable()
export class DrizzlePlanMemberRepository implements IPlanMemberRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByPlanId(planId: string, tenantId: string): Promise<PlanMember[]> {
    const rows = await this.db
      .select()
      .from(plannerPlanMember)
      .where(and(eq(plannerPlanMember.planId, planId), eq(plannerPlanMember.tenantId, tenantId)))

    return rows.map(planMemberRowToEntity)
  }

  async upsert(planId: string, tenantId: string, member: PlanMember): Promise<void> {
    const row = planMemberEntityToRow(planId, tenantId, member)

    await this.db
      .insert(plannerPlanMember)
      .values({
        planId: row.planId,
        actorId: row.actorId,
        role: row.role,
        addedBy: row.addedBy,
        addedAt: row.addedAt,
        tenantId: row.tenantId,
      })
      .onConflictDoUpdate({
        target: [plannerPlanMember.planId, plannerPlanMember.actorId],
        set: {
          role: row.role,
          addedBy: row.addedBy,
          addedAt: row.addedAt,
        },
      })
  }

  async delete(planId: string, actorId: string, tenantId: string): Promise<void> {
    await this.db
      .delete(plannerPlanMember)
      .where(
        and(
          eq(plannerPlanMember.planId, planId),
          eq(plannerPlanMember.actorId, actorId),
          eq(plannerPlanMember.tenantId, tenantId),
        ),
      )
  }
}
