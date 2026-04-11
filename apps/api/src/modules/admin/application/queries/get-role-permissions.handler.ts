import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { RoleKeyValue } from '../../../kernel/domain/entities/role-grant.entity'
import { GetRolePermissionsQuery } from './get-role-permissions.query'

export interface PermissionItem {
  permissionKey: string
  isLocked: boolean
  module: string
}

export interface RolePermissionsResult {
  roleKey: string
  permissions: PermissionItem[]
}

@QueryHandler(GetRolePermissionsQuery)
export class GetRolePermissionsHandler implements IQueryHandler<
  GetRolePermissionsQuery,
  RolePermissionsResult
> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly rolePermissionRepo: IRolePermissionRepository,
  ) {}

  async execute(query: GetRolePermissionsQuery): Promise<RolePermissionsResult> {
    const permissions = await this.rolePermissionRepo.findByRoleKey(
      query.roleKey as RoleKeyValue,
      query.tenantId,
    )

    return {
      roleKey: query.roleKey,
      permissions: permissions.map((p) => ({
        permissionKey: p.permissionKey,
        isLocked: p.isLocked,
        module: p.permissionKey.split(':')[0] ?? p.permissionKey,
      })),
    }
  }
}
