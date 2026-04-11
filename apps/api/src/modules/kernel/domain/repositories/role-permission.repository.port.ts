import type { RolePermission } from '../entities/role-permission.entity'
import type { RoleKeyValue } from '../entities/role-grant.entity'

export const ROLE_PERMISSION_REPOSITORY = Symbol('IRolePermissionRepository')

export interface IRolePermissionRepository {
  findByRoleKey(roleKey: RoleKeyValue, tenantId: string): Promise<RolePermission[]>
  findByRoleKeys(roleKeys: RoleKeyValue[], tenantId: string): Promise<RolePermission[]>
  insert(data: {
    tenantId: string
    roleKey: RoleKeyValue
    permissionKey: string
    isLocked: boolean
  }): Promise<RolePermission | null>
  remove(tenantId: string, roleKey: RoleKeyValue, permissionKey: string): Promise<void>
  findAll(tenantId: string): Promise<RolePermission[]>
  findByTenantId(tenantId: string): Promise<RolePermission[]>
  findByRoleKeyAndPermissionKey(
    roleKey: RoleKeyValue,
    permissionKey: string,
    tenantId: string,
  ): Promise<RolePermission | null>
  removeById(id: string, tenantId: string): Promise<void>
  removeAllForRole(roleKey: RoleKeyValue, tenantId: string): Promise<void>
  insertMany(
    data: Array<{
      tenantId: string
      roleKey: RoleKeyValue
      permissionKey: string
      isLocked: boolean
    }>,
  ): Promise<void>
}
