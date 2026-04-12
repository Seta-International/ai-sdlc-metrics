import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { CreateActorCommand } from '../../../kernel/application/commands/create-actor.command'
import { CreateSystemActorCommand } from './create-system-actor.command'

@CommandHandler(CreateSystemActorCommand)
export class CreateSystemActorHandler implements ICommandHandler<
  CreateSystemActorCommand,
  { actorId: string }
> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: CreateSystemActorCommand): Promise<{ actorId: string }> {
    const actorId = await this.commandBus.execute(
      new CreateActorCommand(command.tenantId, 'system', command.displayName),
    )

    await this.auditFacade.recordEvent({
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
