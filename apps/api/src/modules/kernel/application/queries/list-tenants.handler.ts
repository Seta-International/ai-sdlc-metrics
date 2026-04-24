import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/repositories/tenant.repository.port'
import type { Tenant } from '../../domain/entities/tenant.entity'
import { ListTenantsQuery } from './list-tenants.query'

export interface TenantSummaryDto {
  id: string
  slug: string
  name: string
  status: Tenant['status']
  planTier: Tenant['planTier']
  createdAt: Date
  updatedAt: Date
}

@QueryHandler(ListTenantsQuery)
export class ListTenantsHandler implements IQueryHandler<ListTenantsQuery, TenantSummaryDto[]> {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  async execute(_query: ListTenantsQuery): Promise<TenantSummaryDto[]> {
    const tenants = await this.tenantRepo.findAll()
    return tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      planTier: t.planTier,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))
  }
}
