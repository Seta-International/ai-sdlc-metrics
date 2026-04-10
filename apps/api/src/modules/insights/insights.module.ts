import { Module } from '@nestjs/common'
import { InsightsQueryFacade } from './application/facades/insights-query.facade'

@Module({
  providers: [InsightsQueryFacade],
  exports: [InsightsQueryFacade],
})
export class InsightsModule {}
