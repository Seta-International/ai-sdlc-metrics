import type { MsLinkedGroupEntity } from '../entities/ms-linked-group.entity'

export const MS_LINKED_GROUP_REPOSITORY = Symbol('IMsLinkedGroupRepository')

export interface IMsLinkedGroupRepository {
  findByTenantAndGroup(tenantId: string, msGroupId: string): Promise<MsLinkedGroupEntity | null>
  listForTenant(tenantId: string): Promise<MsLinkedGroupEntity[]>
  upsert(entity: MsLinkedGroupEntity): Promise<void>
  remove(id: string, tenantId: string): Promise<void>
}
