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

  async findByRoleKey(roleKey: RoleKeyValue | string, tenantId: string): Promise<RolePermission[]> {
    const rows = await this.db
      .select()
      .from(rolePermission)
      .where(
        and(
          eq(rolePermission.roleKey, roleKey as RoleKeyValue),
          eq(rolePermission.tenantId, tenantId),
        ),
      )

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

  async findAll(tenantId: string): Promise<RolePermission[]> {
    const rows = await this.db
      .select()
      .from(rolePermission)
      .where(eq(rolePermission.tenantId, tenantId))

    return rows as RolePermission[]
  }

  async findByTenantId(tenantId: string): Promise<RolePermission[]> {
    return this.findAll(tenantId)
  }

  async findByRoleKeyAndPermissionKey(
    roleKey: string,
    permissionKey: string,
    tenantId: string,
  ): Promise<RolePermission | null> {
    const rows = await this.db
      .select()
      .from(rolePermission)
      .where(
        and(
          eq(rolePermission.roleKey, roleKey as RoleKeyValue),
          eq(rolePermission.permissionKey, permissionKey),
          eq(rolePermission.tenantId, tenantId),
        ),
      )
      .limit(1)

    return (rows[0] as RolePermission | undefined) ?? null
  }

  async insert(data: {
    tenantId: string
    roleKey: RoleKeyValue | string
    permissionKey: string
    isLocked: boolean
  }): Promise<RolePermission> {
    const rows = await this.db
      .insert(rolePermission)
      .values({
        tenantId: data.tenantId,
        roleKey: data.roleKey as RoleKeyValue,
        permissionKey: data.permissionKey,
        isLocked: data.isLocked,
      })
      .onConflictDoNothing()
      .returning()

    const row = rows[0] as RolePermission | undefined
    if (!row) {
      // Row already exists — fetch and return it
      const existing = await this.findByRoleKeyAndPermissionKey(
        data.roleKey,
        data.permissionKey,
        data.tenantId,
      )
      if (!existing) throw new Error('Failed to insert or find role permission')
      return existing
    }
    return row
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(rolePermission)
      .where(and(eq(rolePermission.id, id), eq(rolePermission.tenantId, tenantId)))
  }

  async removeAllForRole(roleKey: string, tenantId: string): Promise<void> {
    await this.db
      .delete(rolePermission)
      .where(
        and(
          eq(rolePermission.roleKey, roleKey as RoleKeyValue),
          eq(rolePermission.tenantId, tenantId),
        ),
      )
  }

  async insertMany(
    data: Array<{
      tenantId: string
      roleKey: string
      permissionKey: string
      isLocked: boolean
    }>,
  ): Promise<void> {
    if (data.length === 0) return
    await this.db
      .insert(rolePermission)
      .values(data.map((d) => ({ ...d, roleKey: d.roleKey as RoleKeyValue })))
      .onConflictDoNothing()
  }
}
