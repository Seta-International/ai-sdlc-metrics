import { Module } from '@nestjs/common'
import { TimeQueryFacade } from './application/facades/time-query.facade'

@Module({
  providers: [TimeQueryFacade],
  exports: [TimeQueryFacade],
})
export class TimeModule {}
