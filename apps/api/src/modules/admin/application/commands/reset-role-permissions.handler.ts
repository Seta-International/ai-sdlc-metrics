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
import { ResetRolePermissionsCommand } from './reset-role-permissions.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class NoDefaultPermissionsException extends DomainException {
  readonly code = 'NO_DEFAULT_PERMISSIONS'
  constructor(roleKey: string) {
    super(`No default permissions defined for role: ${roleKey}`)
  }
}

export const DEFAULT_ROLE_PERMISSIONS: Record<
  string,
  Array<{ permissionKey: string; isLocked: boolean }>
> = {
  employee: [
    { permissionKey: 'people:profile:self:read', isLocked: true },
    { permissionKey: 'time:leave:self:submit', isLocked: true },
    { permissionKey: 'time:attendance:self:read', isLocked: true },
    { permissionKey: 'planner:task:self:manage', isLocked: false },
  ],
  line_manager: [
    { permissionKey: 'people:profile:self:read', isLocked: true },
    { permissionKey: 'time:leave:self:submit', isLocked: true },
    { permissionKey: 'time:attendance:self:read', isLocked: true },
    { permissionKey: 'people:profile:team:read', isLocked: true },
    { permissionKey: 'time:leave:approve', isLocked: false },
    { permissionKey: 'performance:review:submit', isLocked: false },
  ],
  hr_ops: [
    { permissionKey: 'people:profile:self:read', isLocked: true },
    { permissionKey: 'time:leave:self:submit', isLocked: true },
    { permissionKey: 'time:attendance:self:read', isLocked: true },
    { permissionKey: 'people:profile:read', isLocked: false },
    { permissionKey: 'people:profile:update', isLocked: false },
    { permissionKey: 'time:leave:read', isLocked: false },
    { permissionKey: 'hiring:candidate:read', isLocked: false },
  ],
  tenant_admin: [
    { permissionKey: 'admin:role:manage', isLocked: true },
    { permissionKey: 'admin:tenant:read', isLocked: true },
    { permissionKey: 'admin:tenant:manage', isLocked: false },
    { permissionKey: 'admin:audit:read', isLocked: false },
    { permissionKey: 'admin:agent:manage', isLocked: false },
  ],
  recruiter: [
    { permissionKey: 'people:profile:self:read', isLocked: true },
    { permissionKey: 'time:leave:self:submit', isLocked: true },
    { permissionKey: 'time:attendance:self:read', isLocked: true },
    { permissionKey: 'hiring:candidate:read', isLocked: false },
    { permissionKey: 'hiring:candidate:create', isLocked: false },
    { permissionKey: 'hiring:pipeline:manage', isLocked: false },
  ],
  finance_operator: [
    { permissionKey: 'people:profile:self:read', isLocked: true },
    { permissionKey: 'time:leave:self:submit', isLocked: true },
    { permissionKey: 'time:attendance:self:read', isLocked: true },
    { permissionKey: 'finance:invoice:read', isLocked: false },
    { permissionKey: 'finance:payroll:read', isLocked: false },
    { permissionKey: 'finance:budget:manage', isLocked: false },
  ],
  project_manager: [
    { permissionKey: 'people:profile:self:read', isLocked: true },
    { permissionKey: 'time:leave:self:submit', isLocked: true },
    { permissionKey: 'time:attendance:self:read', isLocked: true },
    { permissionKey: 'projects:assignment:manage', isLocked: false },
    { permissionKey: 'projects:staffing:read', isLocked: false },
  ],
  platform_admin: [
    { permissionKey: 'admin:role:manage', isLocked: true },
    { permissionKey: 'admin:tenant:read', isLocked: true },
    { permissionKey: 'admin:tenant:manage', isLocked: true },
    { permissionKey: 'admin:audit:read', isLocked: true },
    { permissionKey: 'admin:agent:manage', isLocked: true },
  ],
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
    const defaults = DEFAULT_ROLE_PERMISSIONS[command.roleKey]
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
