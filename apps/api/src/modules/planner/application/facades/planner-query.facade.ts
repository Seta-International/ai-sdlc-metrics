import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ListPlansForActorQuery } from '../queries/plans/list-plans-for-actor.query'
import type { PlanSummary } from '../queries/plans/list-plans-for-actor.handler'
import { GetPlanQuery } from '../queries/plans/get-plan.query'
import type { PlanDetail } from '../queries/plans/get-plan.handler'

@Injectable()
export class PlannerQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

  listPlansForActor(actorId: string, tenantId: string): Promise<PlanSummary[]> {
    return this.queryBus.execute(new ListPlansForActorQuery(actorId, tenantId))
  }

  countOpenTasksForActor(_actorId: string, _tenantId: string): Promise<number> {
    // Stub: task counts implemented in Plan 02
    return Promise.resolve(0)
  }

  getPlan(actorId: string, planId: string, tenantId: string): Promise<PlanDetail | null> {
    return this.queryBus.execute(new GetPlanQuery(actorId, planId, tenantId))
  }
}
