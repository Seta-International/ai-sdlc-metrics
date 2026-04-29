import type { MsLinkedRosterEntity } from '../entities/ms-linked-roster.entity'

export const MS_LINKED_ROSTER_REPOSITORY = Symbol('IMsLinkedRosterRepository')

export interface IMsLinkedRosterRepository {
  findByTenantAndRoster(tenantId: string, msRosterId: string): Promise<MsLinkedRosterEntity | null>
  listForTenant(tenantId: string): Promise<MsLinkedRosterEntity[]>
  listActiveForTenant(tenantId: string): Promise<MsLinkedRosterEntity[]>
  upsert(entity: MsLinkedRosterEntity): Promise<void>
  remove(id: string, tenantId: string): Promise<void>
}
