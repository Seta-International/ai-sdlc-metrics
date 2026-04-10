import { Module } from '@nestjs/common'
import { HiringQueryFacade } from './application/facades/hiring-query.facade.js'

@Module({
  providers: [HiringQueryFacade],
  exports: [HiringQueryFacade],
})
export class HiringModule {}
