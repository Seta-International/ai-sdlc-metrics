import { Inject, Injectable } from '@nestjs/common'
import { and, eq, isNull, or } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import {
  plannerPlan,
  plannerPlanMember,
  plannerTask,
  plannerTaskAssignee,
} from '../../infrastructure/schema/planner.schema'

export const TASK_VISIBILITY_SERVICE = Symbol('TASK_VISIBILITY_SERVICE')

export type VisibilityResult = true | false | 'task-not-found'

export interface ITaskVisibilityService {
  canActorSeeTask(actorId: string, tenantId: string, taskId: string): Promise<VisibilityResult>
}

@Injectable()
export class DrizzleTaskVisibilityService implements ITaskVisibilityService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async canActorSeeTask(
    actorId: string,
    tenantId: string,
    taskId: string,
  ): Promise<VisibilityResult> {
    // Load the task joined to its plan, scoped to tenant + not deleted
    const rows = await this.db
      .select({
        ownerActorId: plannerPlan.ownerActorId,
      })
      .from(plannerTask)
      .innerJoin(plannerPlan, eq(plannerTask.planId, plannerPlan.id))
      .where(
        and(
          eq(plannerTask.id, taskId),
          eq(plannerTask.tenantId, tenantId),
          isNull(plannerTask.deletedAt),
          isNull(plannerPlan.deletedAt),
        ),
      )
      .limit(1)

    const planRow = rows[0]
    if (!planRow) {
      return 'task-not-found'
    }

    const { ownerActorId } = planRow

    // Personal plan: only the owner can see it
    if (ownerActorId !== null) {
      return ownerActorId === actorId
    }

    // Team plan: actor must be either an assignee on the task OR a plan member
    const visibilityRows = await this.db
      .select({ actorId: plannerTaskAssignee.actorId })
      .from(plannerTaskAssignee)
      .innerJoin(plannerTask, eq(plannerTaskAssignee.taskId, plannerTask.id))
      .where(
        and(
          eq(plannerTaskAssignee.taskId, taskId),
          eq(plannerTaskAssignee.actorId, actorId),
          eq(plannerTaskAssignee.tenantId, tenantId),
        ),
      )
      .limit(1)

    if (visibilityRows.length > 0) {
      return true
    }

    const memberRows = await this.db
      .select({ actorId: plannerPlanMember.actorId })
      .from(plannerPlanMember)
      .innerJoin(plannerTask, eq(plannerPlanMember.planId, plannerTask.planId))
      .where(
        and(
          eq(plannerTask.id, taskId),
          eq(plannerPlanMember.actorId, actorId),
          eq(plannerPlanMember.tenantId, tenantId),
        ),
      )
      .limit(1)

    return memberRows.length > 0
  }
}
