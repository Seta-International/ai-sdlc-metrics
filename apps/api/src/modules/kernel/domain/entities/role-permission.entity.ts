import type { RoleKeyValue } from './role-grant.entity'

export interface RolePermission {
  id: string
  tenantId: string
  roleKey: RoleKeyValue
  permissionKey: string
  isLocked: boolean
  createdAt: Date
}
