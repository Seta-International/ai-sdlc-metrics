import { Module } from '@nestjs/common'
import { PlannerQueryFacade } from './application/facades/planner-query.facade'
import { MS_PLANNER_CLIENT } from './domain/ports/ms-planner-client.port'
import { Phase1MsPlannerClientAdapter } from './infrastructure/ms-graph/phase1-ms-planner-client.adapter'

@Module({
  providers: [
    PlannerQueryFacade,
    { provide: MS_PLANNER_CLIENT, useClass: Phase1MsPlannerClientAdapter },
  ],
  exports: [PlannerQueryFacade],
})
export class PlannerModule {}
