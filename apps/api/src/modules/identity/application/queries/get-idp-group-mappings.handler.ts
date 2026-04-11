import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'
import { GetIdpGroupMappingsQuery } from './get-idp-group-mappings.query'

@QueryHandler(GetIdpGroupMappingsQuery)
export class GetIdpGroupMappingsHandler implements IQueryHandler<
  GetIdpGroupMappingsQuery,
  IdpGroupMapping[]
> {
  constructor(
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
  ) {}

  async execute(query: GetIdpGroupMappingsQuery): Promise<IdpGroupMapping[]> {
    return this.mappingRepo.findByTenantId(query.tenantId)
  }
}
