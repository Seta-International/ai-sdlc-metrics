import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/repositories/tenant.repository.port'
import type { Tenant } from '../../domain/entities/tenant.entity'
import { ListTenantsQuery } from './list-tenants.query'

export type TenantSummaryDto = Tenant

@QueryHandler(ListTenantsQuery)
export class ListTenantsHandler implements IQueryHandler<ListTenantsQuery, TenantSummaryDto[]> {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  execute(_query: ListTenantsQuery): Promise<TenantSummaryDto[]> {
    return this.tenantRepo.findAll()
  }
}
