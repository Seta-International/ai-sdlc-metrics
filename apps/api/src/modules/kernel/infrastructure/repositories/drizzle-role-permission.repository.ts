import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, inArray } from 'drizzle-orm'
import type { RoleKeyValue } from '../../domain/entities/role-grant.entity'
import type { RolePermission } from '../../domain/entities/role-permission.entity'
import type { IRolePermissionRepository } from '../../domain/repositories/role-permission.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { rolePermission } from '../schema/index'

@Injectable()
export class DrizzleRolePermissionRepository implements IRolePermissionRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByRoleKey(roleKey: RoleKeyValue, tenantId: string): Promise<RolePermission[]> {
    const rows = await this.db
      .select()
      .from(rolePermission)
      .where(and(eq(rolePermission.roleKey, roleKey), eq(rolePermission.tenantId, tenantId)))

    return rows as RolePermission[]
  }

  async findByRoleKeys(roleKeys: RoleKeyValue[], tenantId: string): Promise<RolePermission[]> {
    if (roleKeys.length === 0) return []

    const rows = await this.db
      .select()
      .from(rolePermission)
      .where(and(inArray(rolePermission.roleKey, roleKeys), eq(rolePermission.tenantId, tenantId)))

    return rows as RolePermission[]
  }

  async insert(data: {
    tenantId: string
    roleKey: RoleKeyValue
    permissionKey: string
    isLocked: boolean
  }): Promise<RolePermission> {
    const rows = await this.db
      .insert(rolePermission)
      .values({
        tenantId: data.tenantId,
        roleKey: data.roleKey,
        permissionKey: data.permissionKey,
        isLocked: data.isLocked,
      })
      .returning()

    return rows[0] as RolePermission
  }

  async remove(tenantId: string, roleKey: RoleKeyValue, permissionKey: string): Promise<void> {
    await this.db
      .delete(rolePermission)
      .where(
        and(
          eq(rolePermission.tenantId, tenantId),
          eq(rolePermission.roleKey, roleKey),
          eq(rolePermission.permissionKey, permissionKey),
        ),
      )
  }

  async findAll(tenantId: string): Promise<RolePermission[]> {
    const rows = await this.db
      .select()
      .from(rolePermission)
      .where(eq(rolePermission.tenantId, tenantId))

    return rows as RolePermission[]
  }
}
