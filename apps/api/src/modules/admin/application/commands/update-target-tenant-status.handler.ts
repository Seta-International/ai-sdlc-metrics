import { BadRequestException, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { DomainException } from '@future/core'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import {
  KernelAuditFacade,
  SYSTEM_TENANT_SLUG,
} from '../../../kernel/application/facades/kernel-audit.facade'
import { UpdateTargetTenantStatusCommand } from './update-target-tenant-status.command'

class TargetTenantNotFoundException extends DomainException {
  readonly code = 'TARGET_TENANT_NOT_FOUND'

  constructor(tenantId: string) {
    super(`Tenant not found: ${tenantId}`)
  }
}

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
      throw new TargetTenantNotFoundException(command.targetTenantId)
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

    await this.auditFacade.updateTenantStatus(command.targetTenantId, command.status)

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
