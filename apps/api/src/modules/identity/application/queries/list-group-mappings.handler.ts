import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository.port'
import { ListGroupMappingsQuery } from './list-group-mappings.query'

@QueryHandler(ListGroupMappingsQuery)
export class ListGroupMappingsHandler implements IQueryHandler<
  ListGroupMappingsQuery,
  IdpGroupMapping[]
> {
  constructor(
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
  ) {}

  async execute(query: ListGroupMappingsQuery): Promise<IdpGroupMapping[]> {
    return this.mappingRepo.listByTenantId(query.tenantId)
  }
}
