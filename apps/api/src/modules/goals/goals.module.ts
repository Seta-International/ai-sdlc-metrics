import { Module } from '@nestjs/common'
import { GoalsQueryFacade } from './application/facades/goals-query.facade'

@Module({
  providers: [GoalsQueryFacade],
  exports: [GoalsQueryFacade],
})
export class GoalsModule {}
