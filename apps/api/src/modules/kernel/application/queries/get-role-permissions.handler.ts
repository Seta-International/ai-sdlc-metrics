import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../domain/repositories/role-permission.repository.port'
import { GetRolePermissionsQuery } from './get-role-permissions.query'

export interface PermissionDto {
  permissionKey: string
  isLocked: boolean
  module: string
}

export interface RolePermissionsDto {
  roleKey: string
  permissions: PermissionDto[]
}

@QueryHandler(GetRolePermissionsQuery)
export class GetRolePermissionsHandler implements IQueryHandler<
  GetRolePermissionsQuery,
  RolePermissionsDto
> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly permissionRepo: IRolePermissionRepository,
  ) {}

  async execute(query: GetRolePermissionsQuery): Promise<RolePermissionsDto> {
    const permissions = await this.permissionRepo.findByRoleKey(query.roleKey, query.tenantId)

    return {
      roleKey: query.roleKey,
      permissions: permissions.map((p) => ({
        permissionKey: p.permissionKey,
        isLocked: p.isLocked,
        module: p.permissionKey.split(':')[0] ?? '',
      })),
    }
  }
}
