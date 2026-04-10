import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Tenant } from '../../domain/entities/tenant.entity'
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/repositories/tenant.repository.port'
import { GetTenantQuery } from './get-tenant.query'

@QueryHandler(GetTenantQuery)
export class GetTenantHandler implements IQueryHandler<GetTenantQuery, Tenant | null> {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository) {}

  execute(query: GetTenantQuery): Promise<Tenant | null> {
    return this.tenantRepo.findById(query.tenantId)
  }
}
