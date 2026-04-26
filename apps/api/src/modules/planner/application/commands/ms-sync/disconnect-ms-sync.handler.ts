import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { createMsSyncDisabledEvent } from '@future/event-contracts'
import { IdentityMsGraphCredentialFacade } from '../../../../identity/application/facades/identity-ms-graph-credential.facade'
import { KernelAuditFacade } from '../../../../kernel/application/facades/kernel-audit.facade'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import {
  MS_LINKED_GROUP_REPOSITORY,
  type IMsLinkedGroupRepository,
} from '../../../domain/repositories/ms-linked-group.repository'
import {
  MS_PLAN_SYNC_STATE_REPOSITORY,
  type IMsPlanSyncStateRepository,
} from '../../../domain/repositories/ms-plan-sync-state.repository'
import { DisconnectMsSyncCommand } from './disconnect-ms-sync.command'

@CommandHandler(DisconnectMsSyncCommand)
export class DisconnectMsSyncHandler implements ICommandHandler<DisconnectMsSyncCommand> {
  constructor(
    private readonly identityGraphFacade: IdentityMsGraphCredentialFacade,
    private readonly auditFacade: KernelAuditFacade,
    private readonly eventBus: EventBus,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    @Inject(MS_LINKED_GROUP_REPOSITORY) private readonly groupRepo: IMsLinkedGroupRepository,
    @Inject(MS_PLAN_SYNC_STATE_REPOSITORY)
    private readonly syncStateRepo: IMsPlanSyncStateRepository,
  ) {}

  async execute(command: DisconnectMsSyncCommand): Promise<void> {
    const reason = command.mode === 'pause' ? 'paused' : 'destroyed'
    const event = createMsSyncDisabledEvent({
      tenantId: command.tenantId,
      actorId: command.actorId,
      reason,
      occurredAt: new Date().toISOString(),
    })

    const disconnected = await this.identityGraphFacade.disconnectMicrosoftGraphCredential(
      {
        tenantId: command.tenantId,
        mode: command.mode,
      },
      {
        persistDurableEvent: () =>
          this.auditFacade.publishOutboxEvent({
            tenantId: command.tenantId,
            eventName: event.type,
            payload: event,
          }),
      },
    )

    if (!disconnected) {
      return
    }

    await this.eventBus.publish(event)

    if (command.mode === 'destroy') {
      await this.planRepo.convertAllToFutureOnly(command.tenantId)
      await this.groupRepo.removeAllForTenant(command.tenantId)
      await this.syncStateRepo.removeAllForTenant(command.tenantId)
    }
  }
}
