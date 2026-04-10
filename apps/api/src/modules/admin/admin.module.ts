import { Module } from '@nestjs/common'
import { AdminQueryFacade } from './application/facades/admin-query.facade.js'

@Module({
  providers: [AdminQueryFacade],
  exports: [AdminQueryFacade],
})
export class AdminModule {}
