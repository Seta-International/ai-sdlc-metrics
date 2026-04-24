import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { createMsSyncDisabledEvent } from '@future/event-contracts'
import { IdentityMsGraphCredentialFacade } from '../../../../identity/application/facades/identity-ms-graph-credential.facade'
import { KernelAuditFacade } from '../../../../kernel/application/facades/kernel-audit.facade'
import { DisconnectMsSyncCommand } from './disconnect-ms-sync.command'

@CommandHandler(DisconnectMsSyncCommand)
export class DisconnectMsSyncHandler implements ICommandHandler<DisconnectMsSyncCommand> {
  constructor(
    private readonly identityGraphFacade: IdentityMsGraphCredentialFacade,
    private readonly auditFacade: KernelAuditFacade,
    private readonly eventBus: EventBus,
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
  }
}
