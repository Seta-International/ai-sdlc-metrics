import { Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { TenantSummaryDto } from '../../../kernel/application/queries/list-tenants.handler'
import { ListPlatformTenantsQuery } from './list-platform-tenants.query'

@Injectable()
@QueryHandler(ListPlatformTenantsQuery)
export class ListPlatformTenantsHandler implements IQueryHandler<
  ListPlatformTenantsQuery,
  TenantSummaryDto[]
> {
  constructor(private readonly kernelQuery: KernelQueryFacade) {}

  execute(_query: ListPlatformTenantsQuery): Promise<TenantSummaryDto[]> {
    return this.kernelQuery.listTenants()
  }
}
