import { Module } from '@nestjs/common'
import { PerformanceQueryFacade } from './application/facades/performance-query.facade'

@Module({
  providers: [PerformanceQueryFacade],
  exports: [PerformanceQueryFacade],
})
export class PerformanceModule {}
