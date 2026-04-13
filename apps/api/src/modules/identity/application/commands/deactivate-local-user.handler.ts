import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'
import { DeprovisionUserIdentityCommand } from '../../../kernel/application/commands/deprovision-user-identity.command'
import { DeactivateLocalUserCommand } from './deactivate-local-user.command'

@CommandHandler(DeactivateLocalUserCommand)
export class DeactivateLocalUserHandler implements ICommandHandler<
  DeactivateLocalUserCommand,
  void
> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly auditFacade: KernelAuditFacade,
    private readonly actorFacade: KernelActorFacade,
  ) {}

  async execute(command: DeactivateLocalUserCommand): Promise<void> {
    // 1. Deprovision user identity
    await this.commandBus.execute(
      new DeprovisionUserIdentityCommand(command.tenantId, command.actorId),
    )

    // 2. Revoke all role grants
    await this.actorFacade.revokeAllRoles(command.actorId, command.tenantId)

    // 3. Update actor status to inactive
    await this.actorFacade.deactivateActor(command.actorId, command.tenantId)

    // 4. Audit
    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.deactivatedBy,
      eventType: 'local_user.deactivated',
      module: 'identity',
      subjectId: command.actorId,
      payload: {},
    })
  }
}
