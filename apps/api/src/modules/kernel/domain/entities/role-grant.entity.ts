import type { RoleKeyValue, ScopeTypeValue, RoleGrantSourceValue } from '@future/core'
export type { RoleKeyValue, ScopeTypeValue, RoleGrantSourceValue } from '@future/core'

export interface RoleGrant {
  id: string
  tenantId: string
  actorId: string
  roleKey: RoleKeyValue
  scopeType: ScopeTypeValue
  scopeId: string | null
  grantedBy: string
  source: RoleGrantSourceValue
  validFrom: Date
  validUntil: Date | null
}
