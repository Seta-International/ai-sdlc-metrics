import { Module } from '@nestjs/common'
import { HiringQueryFacade } from './application/facades/hiring-query.facade'

@Module({
  providers: [HiringQueryFacade],
  exports: [HiringQueryFacade],
})
export class HiringModule {}
