import { Module } from '@nestjs/common'
import { InsightsQueryFacade } from './application/facades/insights-query.facade.js'

@Module({
  providers: [InsightsQueryFacade],
  exports: [InsightsQueryFacade],
})
export class InsightsModule {}
