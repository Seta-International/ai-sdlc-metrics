import { Module } from '@nestjs/common'
import { FinanceQueryFacade } from './application/facades/finance-query.facade.js'

@Module({
  providers: [FinanceQueryFacade],
  exports: [FinanceQueryFacade],
})
export class FinanceModule {}
