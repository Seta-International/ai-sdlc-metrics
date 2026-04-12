import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import { CreateActorCommand } from '../../../kernel/application/commands/create-actor.command'
import { CreateSystemActorCommand } from './create-system-actor.command'

@CommandHandler(CreateSystemActorCommand)
export class CreateSystemActorHandler implements ICommandHandler<
  CreateSystemActorCommand,
  { actorId: string }
> {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: CreateSystemActorCommand): Promise<{ actorId: string }> {
    const actorId = await this.commandBus.execute(
      new CreateActorCommand(command.tenantId, 'system', command.displayName),
    )

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.createdBy,
      eventType: 'system_actor.created',
      module: 'identity',
      subjectId: actorId,
      payload: { displayName: command.displayName },
    })

    return { actorId }
  }
}
