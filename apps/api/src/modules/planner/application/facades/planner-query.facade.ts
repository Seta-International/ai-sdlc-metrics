import { Injectable, Inject } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { ListPlansForActorQuery } from '../queries/plans/list-plans-for-actor.query'
import type { PlanSummary } from '../queries/plans/list-plans-for-actor.handler'
import { GetPlanQuery } from '../queries/plans/get-plan.query'
import type { PlanDetail } from '../queries/plans/get-plan.handler'

@Injectable()
export class PlannerQueryFacade {
  constructor(
    private readonly queryBus: QueryBus,
    @Inject(DB_TOKEN) private readonly db: Db,
  ) {}

  listPlansForActor(actorId: string, tenantId: string): Promise<PlanSummary[]> {
    return this.queryBus.execute(new ListPlansForActorQuery(actorId, tenantId))
  }

  async countOpenTasksForActor(actorId: string, tenantId: string): Promise<number> {
    const result = await this.db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count
          FROM planner.task
          WHERE tenant_id = ${tenantId}
            AND deleted_at IS NULL
            AND progress < 100
            AND id IN (
              SELECT task_id FROM planner.task_assignee
              WHERE actor_id = ${actorId}
                AND tenant_id = ${tenantId}
            )`,
    )
    return parseInt(result.rows[0]?.count ?? '0', 10)
  }

  getPlan(actorId: string, planId: string, tenantId: string): Promise<PlanDetail | null> {
    return this.queryBus.execute(new GetPlanQuery(actorId, planId, tenantId))
  }
}
