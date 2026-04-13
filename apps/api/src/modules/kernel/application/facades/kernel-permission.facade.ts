import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { AddRolePermissionCommand } from '../commands/add-role-permission.command'
import { RemoveRolePermissionCommand } from '../commands/remove-role-permission.command'
import { ResetRolePermissionsCommand } from '../commands/reset-role-permissions.command'

@Injectable()
export class KernelPermissionFacade {
  constructor(private readonly commandBus: CommandBus) {}

  addRolePermission(
    tenantId: string,
    roleKey: string,
    permissionKey: string,
    addedBy: string,
  ): Promise<void> {
    return this.commandBus.execute(
      new AddRolePermissionCommand(tenantId, roleKey, permissionKey, addedBy),
    )
  }

  removeRolePermission(
    tenantId: string,
    roleKey: string,
    permissionKey: string,
    removedBy: string,
  ): Promise<void> {
    return this.commandBus.execute(
      new RemoveRolePermissionCommand(tenantId, roleKey, permissionKey, removedBy),
    )
  }

  resetRolePermissions(tenantId: string, roleKey: string, resetBy: string): Promise<void> {
    return this.commandBus.execute(new ResetRolePermissionsCommand(tenantId, roleKey, resetBy))
  }
}
