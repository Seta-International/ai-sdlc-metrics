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
import { AddRolePermissionCommand } from './add-role-permission.command'

class PermissionAlreadyAssignedException extends DomainException {
  readonly code = 'PERMISSION_ALREADY_ASSIGNED'

  constructor() {
    super('Permission already assigned')
  }
}

class FailedToInsertPermissionException extends DomainException {
  readonly code = 'FAILED_TO_INSERT_PERMISSION'

  constructor() {
    super('Failed to insert permission')
  }
}

@CommandHandler(AddRolePermissionCommand)
export class AddRolePermissionHandler implements ICommandHandler<AddRolePermissionCommand, string> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly rolePermissionRepo: IRolePermissionRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: AddRolePermissionCommand): Promise<string> {
    const existing = await this.rolePermissionRepo.findByRoleKeyAndPermissionKey(
      command.roleKey as RoleKeyValue,
      command.permissionKey,
      command.tenantId,
    )

    if (existing) {
      throw new PermissionAlreadyAssignedException()
    }

    const inserted = await this.rolePermissionRepo.insert({
      tenantId: command.tenantId,
      roleKey: command.roleKey as RoleKeyValue,
      permissionKey: command.permissionKey,
      isLocked: false,
    })

    if (!inserted) {
      throw new FailedToInsertPermissionException()
    }

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.addedBy,
      eventType: 'role_permission.added',
      module: 'admin',
      subjectId: inserted.id,
      payload: {
        roleKey: command.roleKey,
        permissionKey: command.permissionKey,
      },
    })

    return inserted.id
  }
}
