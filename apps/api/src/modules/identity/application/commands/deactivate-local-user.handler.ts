import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { DeprovisionUserIdentityCommand } from '../../../kernel/application/commands/deprovision-user-identity.command'
import { RevokeAllRoleGrantsCommand } from '../../../kernel/application/commands/revoke-all-role-grants.command'
import { UpdateActorStatusCommand } from '../../../kernel/application/commands/update-actor-status.command'
import { DeactivateLocalUserCommand } from './deactivate-local-user.command'

@CommandHandler(DeactivateLocalUserCommand)
export class DeactivateLocalUserHandler implements ICommandHandler<
  DeactivateLocalUserCommand,
  void
> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: DeactivateLocalUserCommand): Promise<void> {
    // 1. Deprovision user identity
    await this.commandBus.execute(
      new DeprovisionUserIdentityCommand(command.tenantId, command.actorId),
    )

    // 2. Revoke all role grants
    await this.commandBus.execute(new RevokeAllRoleGrantsCommand(command.tenantId, command.actorId))

    // 3. Update actor status to inactive
    await this.commandBus.execute(
      new UpdateActorStatusCommand(command.tenantId, command.actorId, 'inactive'),
    )

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
