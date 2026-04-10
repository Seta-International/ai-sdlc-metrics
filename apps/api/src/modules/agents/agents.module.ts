import { Module } from '@nestjs/common'
import { AgentsQueryFacade } from './application/facades/agents-query.facade.js'

@Module({
  providers: [AgentsQueryFacade],
  exports: [AgentsQueryFacade],
})
export class AgentsModule {}
