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
import { AddRolePermissionCommand } from './add-role-permission.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class PermissionAlreadyAssignedException extends DomainException {
  readonly code = 'PERMISSION_ALREADY_ASSIGNED'
  constructor(roleKey: string, permissionKey: string) {
    super(`Permission already assigned to role: ${roleKey} -> ${permissionKey}`)
  }
}

@CommandHandler(AddRolePermissionCommand)
export class AddRolePermissionHandler implements ICommandHandler<AddRolePermissionCommand, string> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly permissionRepo: IRolePermissionRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: AddRolePermissionCommand): Promise<string> {
    const existing = await this.permissionRepo.findByRoleKeyAndPermissionKey(
      command.roleKey,
      command.permissionKey,
      command.tenantId,
    )
    if (existing) {
      throw new PermissionAlreadyAssignedException(command.roleKey, command.permissionKey)
    }

    const permission = await this.permissionRepo.insert({
      tenantId: command.tenantId,
      roleKey: command.roleKey,
      permissionKey: command.permissionKey,
      isLocked: false,
    })

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.addedBy,
      eventType: 'role_permission.added',
      module: 'admin',
      subjectId: permission.id,
      payload: { roleKey: command.roleKey, permissionKey: command.permissionKey },
    })

    return permission.id
  }
}
