import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../../kernel/domain/repositories/role-permission.repository.port'
import { ListRolesQuery } from './list-roles.query'

export interface RoleSummaryDto {
  roleKey: string
  permissionCount: number
  lockedPermissionCount: number
}

@QueryHandler(ListRolesQuery)
export class ListRolesHandler implements IQueryHandler<ListRolesQuery, RoleSummaryDto[]> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly permissionRepo: IRolePermissionRepository,
  ) {}

  async execute(query: ListRolesQuery): Promise<RoleSummaryDto[]> {
    const all = await this.permissionRepo.findByTenantId(query.tenantId)

    const grouped = new Map<string, { total: number; locked: number }>()
    for (const p of all) {
      const entry = grouped.get(p.roleKey) ?? { total: 0, locked: 0 }
      entry.total++
      if (p.isLocked) entry.locked++
      grouped.set(p.roleKey, entry)
    }

    return Array.from(grouped.entries()).map(([roleKey, counts]) => ({
      roleKey,
      permissionCount: counts.total,
      lockedPermissionCount: counts.locked,
    }))
  }
}
