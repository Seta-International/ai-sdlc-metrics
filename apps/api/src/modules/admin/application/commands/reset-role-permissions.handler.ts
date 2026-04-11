import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../../kernel/domain/repositories/role-permission.repository.port'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { RoleKeyValue } from '../../../kernel/domain/entities/role-grant.entity'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'
import { DEFAULT_ROLE_PERMISSIONS as DEFAULT_ROLE_PERMISSION_MAP } from '../../../kernel/domain/constants/default-role-permissions'
import { ResetRolePermissionsCommand } from './reset-role-permissions.command'

export const DEFAULT_ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSION_MAP

class NoDefaultPermissionsException extends DomainException {
  readonly code = 'NO_DEFAULT_PERMISSIONS'

  constructor(roleKey: string) {
    super(`No default permissions defined for role: ${roleKey}`)
  }
}

@CommandHandler(ResetRolePermissionsCommand)
export class ResetRolePermissionsHandler implements ICommandHandler<
  ResetRolePermissionsCommand,
  void
> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly rolePermissionRepo: IRolePermissionRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: ResetRolePermissionsCommand): Promise<void> {
    const defaults = DEFAULT_ROLE_PERMISSIONS[command.roleKey as RoleKeyValue]

    if (!defaults) {
      throw new NoDefaultPermissionsException(command.roleKey)
    }

    await this.rolePermissionRepo.removeAllForRole(
      command.roleKey as RoleKeyValue,
      command.tenantId,
    )

    await this.rolePermissionRepo.insertMany(
      defaults.map((d) => ({
        tenantId: command.tenantId,
        roleKey: command.roleKey as RoleKeyValue,
        permissionKey: d.permissionKey,
        isLocked: d.isLocked,
      })),
    )

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.resetBy,
      eventType: 'role_permissions.reset',
      module: 'admin',
      subjectId: command.roleKey,
      payload: {
        roleKey: command.roleKey,
        permissionsReset: defaults.length,
      },
    })
  }
}
