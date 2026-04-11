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
import { RemoveRolePermissionCommand } from './remove-role-permission.command'

class PermissionNotFoundException extends DomainException {
  readonly code = 'PERMISSION_NOT_FOUND'

  constructor() {
    super('Permission not found')
  }
}

class CannotRemoveLockedPermissionException extends DomainException {
  readonly code = 'CANNOT_REMOVE_LOCKED_PERMISSION'

  constructor() {
    super('Cannot remove locked permission')
  }
}

@CommandHandler(RemoveRolePermissionCommand)
export class RemoveRolePermissionHandler implements ICommandHandler<
  RemoveRolePermissionCommand,
  void
> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly rolePermissionRepo: IRolePermissionRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: RemoveRolePermissionCommand): Promise<void> {
    const existing = await this.rolePermissionRepo.findByRoleKeyAndPermissionKey(
      command.roleKey as RoleKeyValue,
      command.permissionKey,
      command.tenantId,
    )

    if (!existing) {
      throw new PermissionNotFoundException()
    }

    if (existing.isLocked) {
      throw new CannotRemoveLockedPermissionException()
    }

    await this.rolePermissionRepo.removeById(existing.id, command.tenantId)

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.removedBy,
      eventType: 'role_permission.removed',
      module: 'admin',
      subjectId: existing.id,
      payload: {
        roleKey: command.roleKey,
        permissionKey: command.permissionKey,
      },
    })
  }
}
