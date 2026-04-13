import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetBrandingQuery } from './get-branding.query'
import type { ITenantBrandingRepository } from '../../domain/repositories/tenant-branding.repository.port'
import { TENANT_BRANDING_REPOSITORY } from '../../domain/repositories/tenant-branding.repository.port'
import type { TenantBranding } from '../../domain/entities/tenant-branding.entity'

@QueryHandler(GetBrandingQuery)
@Injectable()
export class GetBrandingHandler implements IQueryHandler<GetBrandingQuery, TenantBranding | null> {
  constructor(
    @Inject(TENANT_BRANDING_REPOSITORY) private readonly brandingRepo: ITenantBrandingRepository,
  ) {}

  async execute(query: GetBrandingQuery): Promise<TenantBranding | null> {
    return this.brandingRepo.findByTenant(query.tenantId)
  }
}
