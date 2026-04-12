import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../domain/repositories/role-permission.repository.port'
import type { RoleKeyValue } from '../../domain/entities/role-grant.entity'
import { DEFAULT_ROLE_PERMISSIONS } from '../../domain/constants/default-role-permissions'
import { SeedRolePermissionsCommand } from './seed-role-permissions.command'

@CommandHandler(SeedRolePermissionsCommand)
export class SeedRolePermissionsHandler implements ICommandHandler<
  SeedRolePermissionsCommand,
  void
> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly rolePermissionRepo: IRolePermissionRepository,
  ) {}

  async execute(command: SeedRolePermissionsCommand): Promise<void> {
    const { tenantId } = command

    for (const [roleKey, entries] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const entry of entries) {
        await this.rolePermissionRepo.insert({
          tenantId,
          roleKey: roleKey as RoleKeyValue,
          permissionKey: entry.permissionKey,
          isLocked: entry.isLocked,
        })
      }
    }
  }
}
