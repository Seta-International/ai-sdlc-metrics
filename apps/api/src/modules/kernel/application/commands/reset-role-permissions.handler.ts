import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../domain/repositories/role-permission.repository.port'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../domain/repositories/audit-event.repository.port'
import { DEFAULT_ROLE_PERMISSIONS } from '../../domain/constants/default-role-permissions'
import { DomainException } from '../../domain/exceptions/domain.exception'
import { ResetRolePermissionsCommand } from './reset-role-permissions.command'

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
    private readonly permissionRepo: IRolePermissionRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: ResetRolePermissionsCommand): Promise<void> {
    const defaults =
      DEFAULT_ROLE_PERMISSIONS[command.roleKey as keyof typeof DEFAULT_ROLE_PERMISSIONS]
    if (!defaults) {
      throw new NoDefaultPermissionsException(command.roleKey)
    }

    await this.permissionRepo.removeAllForRole(command.roleKey, command.tenantId)

    await this.permissionRepo.insertMany(
      defaults.map((p) => ({
        tenantId: command.tenantId,
        roleKey: command.roleKey,
        permissionKey: p.permissionKey,
        isLocked: p.isLocked,
      })),
    )

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.resetBy,
      eventType: 'role_permissions.reset',
      module: 'admin',
      subjectId: command.tenantId,
      payload: {
        roleKey: command.roleKey,
        permissionCount: defaults.length,
      },
    })
  }
}
