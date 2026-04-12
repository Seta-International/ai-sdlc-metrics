import type { RoleKeyValue } from './role-grant.entity'

export interface Delegation {
  id: string
  tenantId: string
  delegatorId: string
  delegateeId: string
  role: RoleKeyValue
  validFrom: Date
  validUntil: Date
}
