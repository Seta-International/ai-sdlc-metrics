import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { createMsSyncEnabledEvent } from '@future/event-contracts'
import { IdentityMsGraphCredentialFacade } from '../../../../identity/application/facades/identity-ms-graph-credential.facade'
import { KernelAuditFacade } from '../../../../kernel/application/facades/kernel-audit.facade'
import { ConnectMsSyncCommand } from './connect-ms-sync.command'

@CommandHandler(ConnectMsSyncCommand)
export class ConnectMsSyncHandler implements ICommandHandler<ConnectMsSyncCommand> {
  constructor(
    private readonly identityGraphFacade: IdentityMsGraphCredentialFacade,
    private readonly auditFacade: KernelAuditFacade,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ConnectMsSyncCommand): Promise<void> {
    const event = createMsSyncEnabledEvent({
      tenantId: command.tenantId,
      actorId: command.actorId,
      tenantAdId: command.input.tenantAdId,
      clientId: command.input.clientId,
      occurredAt: new Date().toISOString(),
    })

    await this.identityGraphFacade.connectMicrosoftGraphCredential(
      {
        tenantId: command.tenantId,
        clientId: command.input.clientId,
        tenantAdId: command.input.tenantAdId,
        clientSecret: command.input.clientSecret,
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

    await this.eventBus.publish(event)
  }
}
