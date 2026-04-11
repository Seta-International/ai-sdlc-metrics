import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../../kernel/domain/repositories/role-permission.repository.port'
import { ListRolesQuery } from './list-roles.query'

export interface RoleListItem {
  roleKey: string
  permissionCount: number
  lockedPermissionCount: number
}

@QueryHandler(ListRolesQuery)
export class ListRolesHandler implements IQueryHandler<ListRolesQuery, RoleListItem[]> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly rolePermissionRepo: IRolePermissionRepository,
  ) {}

  async execute(query: ListRolesQuery): Promise<RoleListItem[]> {
    const permissions = await this.rolePermissionRepo.findByTenantId(query.tenantId)

    const roleMap = new Map<string, { total: number; locked: number }>()

    for (const perm of permissions) {
      const existing = roleMap.get(perm.roleKey) ?? { total: 0, locked: 0 }
      existing.total++
      if (perm.isLocked) existing.locked++
      roleMap.set(perm.roleKey, existing)
    }

    return Array.from(roleMap.entries()).map(([roleKey, counts]) => ({
      roleKey,
      permissionCount: counts.total,
      lockedPermissionCount: counts.locked,
    }))
  }
}
