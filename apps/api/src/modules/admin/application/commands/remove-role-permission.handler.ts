import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../../kernel/domain/repositories/role-permission.repository.port'
import { RemoveRolePermissionCommand } from './remove-role-permission.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class PermissionNotFoundException extends DomainException {
  readonly code = 'PERMISSION_NOT_FOUND'
  constructor(roleKey: string, permissionKey: string) {
    super(`Permission not found for role: ${roleKey} -> ${permissionKey}`)
  }
}

class LockedPermissionException extends DomainException {
  readonly code = 'LOCKED_PERMISSION'
  constructor(permissionKey: string) {
    super(`Cannot remove locked permission: ${permissionKey}`)
  }
}

@CommandHandler(RemoveRolePermissionCommand)
export class RemoveRolePermissionHandler implements ICommandHandler<
  RemoveRolePermissionCommand,
  void
> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly permissionRepo: IRolePermissionRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: RemoveRolePermissionCommand): Promise<void> {
    const existing = await this.permissionRepo.findByRoleKeyAndPermissionKey(
      command.roleKey,
      command.permissionKey,
      command.tenantId,
    )

    if (!existing) {
      throw new PermissionNotFoundException(command.roleKey, command.permissionKey)
    }

    if (existing.isLocked) {
      throw new LockedPermissionException(command.permissionKey)
    }

    await this.permissionRepo.remove(existing.id, command.tenantId)

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.removedBy,
      eventType: 'role_permission.removed',
      module: 'admin',
      subjectId: existing.id,
      payload: { roleKey: command.roleKey, permissionKey: command.permissionKey },
    })
  }
}
