import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { tenantModuleToggle } from '../../infrastructure/schema/admin.schema'
import { UpdateModuleTogglesCommand } from './update-module-toggles.command'

@Injectable()
@CommandHandler(UpdateModuleTogglesCommand)
export class UpdateModuleTogglesHandler implements ICommandHandler<
  UpdateModuleTogglesCommand,
  void
> {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: UpdateModuleTogglesCommand): Promise<void> {
    if (
      !command.callerRoles.includes('platform_admin') &&
      command.callerTenantId !== command.tenantId
    ) {
      throw new ForbiddenException('tenant_admin may only update their own tenant module toggles')
    }

    for (const toggle of command.toggles) {
      await this.db
        .insert(tenantModuleToggle)
        .values({
          tenantId: command.tenantId,
          moduleKey: toggle.moduleKey,
          enabled: toggle.enabled,
          updatedBy: command.actorId,
        })
        .onConflictDoUpdate({
          target: [tenantModuleToggle.tenantId, tenantModuleToggle.moduleKey],
          set: {
            enabled: toggle.enabled,
            updatedAt: new Date(),
            updatedBy: command.actorId,
          },
        })
    }

    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.actorId,
      eventType: 'admin.module_toggles_updated',
      module: 'admin',
      subjectId: command.tenantId,
      payload: { toggles: command.toggles },
    })
  }
}
