import { QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { PlannerChartsData, TaskFlatWithPlan } from '../../lib/task-flat.types'
import { computePlannerChartsData } from '../../lib/charts-data'
import { ListTasksForActorQuery } from './list-tasks-for-actor.query'
import { GetPersonalChartsQuery } from './get-personal-charts.query'

@QueryHandler(GetPersonalChartsQuery)
export class GetPersonalChartsHandler implements IQueryHandler<
  GetPersonalChartsQuery,
  PlannerChartsData
> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute(query: GetPersonalChartsQuery): Promise<PlannerChartsData> {
    const tasks = await this.queryBus.execute<ListTasksForActorQuery, TaskFlatWithPlan[]>(
      new ListTasksForActorQuery(query.actorId, query.tenantId, { includeCompleted: true }),
    )
    return computePlannerChartsData(tasks)
  }
}
