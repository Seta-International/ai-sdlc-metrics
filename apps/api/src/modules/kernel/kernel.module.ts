import { Module } from '@nestjs/common'
import { KernelQueryFacade } from './application/facades/kernel-query.facade.js'

@Module({
  providers: [KernelQueryFacade],
  exports: [KernelQueryFacade],
})
export class KernelModule {}
