import type { IdpGroupMapping } from '../entities/idp-group-mapping.entity'

export const IDP_GROUP_MAPPING_REPOSITORY = Symbol('IIdpGroupMappingRepository')

export interface IIdpGroupMappingRepository {
  findByProviderId(identityProviderId: string, tenantId: string): Promise<IdpGroupMapping[]>
  findByTenantId(tenantId: string): Promise<IdpGroupMapping[]>
  upsert(data: {
    tenantId: string
    identityProviderId: string
    externalGroupId: string
    externalGroupName: string
    roleKey: string
    scopeType: IdpGroupMapping['scopeType']
    scopeId: string | null
  }): Promise<IdpGroupMapping>
  remove(id: string, tenantId: string): Promise<void>
}
