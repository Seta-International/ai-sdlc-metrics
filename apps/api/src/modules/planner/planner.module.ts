import { Module } from '@nestjs/common'
import { PlannerQueryFacade } from './application/facades/planner-query.facade.js'

@Module({
  providers: [PlannerQueryFacade],
  exports: [PlannerQueryFacade],
})
export class PlannerModule {}
