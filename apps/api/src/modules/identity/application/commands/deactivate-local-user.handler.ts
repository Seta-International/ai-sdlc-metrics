import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { DeprovisionUserIdentityCommand } from '../../../kernel/application/commands/deprovision-user-identity.command'
import { RevokeAllRoleGrantsCommand } from '../../../kernel/application/commands/revoke-all-role-grants.command'
import { UpdateActorStatusCommand } from '../../../kernel/application/commands/update-actor-status.command'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import { DeactivateLocalUserCommand } from './deactivate-local-user.command'

@CommandHandler(DeactivateLocalUserCommand)
export class DeactivateLocalUserHandler implements ICommandHandler<
  DeactivateLocalUserCommand,
  void
> {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: DeactivateLocalUserCommand): Promise<void> {
    const { tenantId, actorId, deactivatedBy } = command

    await this.commandBus.execute(new DeprovisionUserIdentityCommand(tenantId, actorId))
    await this.commandBus.execute(new RevokeAllRoleGrantsCommand(tenantId, actorId))
    await this.commandBus.execute(new UpdateActorStatusCommand(tenantId, actorId, 'inactive'))

    await this.auditRepo.insert({
      tenantId,
      actorId: deactivatedBy,
      eventType: 'local_user.deactivated',
      module: 'identity',
      subjectId: actorId,
      payload: {},
    })
  }
}
