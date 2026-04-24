import { BadRequestException, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { UpdateTargetTenantStatusCommand } from './update-target-tenant-status.command'

const SYSTEM_TENANT_SLUG = 'future-system'

@Injectable()
@CommandHandler(UpdateTargetTenantStatusCommand)
export class UpdateTargetTenantStatusHandler implements ICommandHandler<
  UpdateTargetTenantStatusCommand,
  void
> {
  constructor(
    private readonly kernelQuery: KernelQueryFacade,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: UpdateTargetTenantStatusCommand): Promise<void> {
    const target = await this.kernelQuery.getTenant(command.targetTenantId)

    if (!target) {
      throw new BadRequestException(`Tenant not found: ${command.targetTenantId}`)
    }

    if (
      target.slug === SYSTEM_TENANT_SLUG &&
      (command.status === 'suspended' || command.status === 'cancelled')
    ) {
      throw new BadRequestException(
        `Cannot ${command.status} the system tenant (${SYSTEM_TENANT_SLUG})`,
      )
    }

    const previousStatus = target.status

    await this.kernelQuery.updateTenantStatus(command.targetTenantId, command.status)

    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.actorId,
      eventType: 'tenant.status_updated',
      module: 'admin',
      subjectId: command.targetTenantId,
      payload: {
        targetTenantId: command.targetTenantId,
        previousStatus,
        nextStatus: command.status,
      },
    })
  }
}
