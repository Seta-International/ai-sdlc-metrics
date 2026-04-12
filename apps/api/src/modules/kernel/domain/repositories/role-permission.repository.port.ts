import type { RolePermission } from '../entities/role-permission.entity'
import type { RoleKeyValue } from '../entities/role-grant.entity'

export const ROLE_PERMISSION_REPOSITORY = Symbol('IRolePermissionRepository')

export interface IRolePermissionRepository {
  findByRoleKey(roleKey: RoleKeyValue | string, tenantId: string): Promise<RolePermission[]>
  findByRoleKeys(roleKeys: RoleKeyValue[], tenantId: string): Promise<RolePermission[]>
  /** Alias for findAll — used by Plan 05 handlers */
  findByTenantId(tenantId: string): Promise<RolePermission[]>
  findByRoleKeyAndPermissionKey(
    roleKey: string,
    permissionKey: string,
    tenantId: string,
  ): Promise<RolePermission | null>
  insert(data: {
    tenantId: string
    roleKey: RoleKeyValue | string
    permissionKey: string
    isLocked: boolean
  }): Promise<RolePermission>
  remove(id: string, tenantId: string): Promise<void>
  removeAllForRole(roleKey: string, tenantId: string): Promise<void>
  insertMany(
    data: Array<{
      tenantId: string
      roleKey: string
      permissionKey: string
      isLocked: boolean
    }>,
  ): Promise<void>
  findAll(tenantId: string): Promise<RolePermission[]>
}
