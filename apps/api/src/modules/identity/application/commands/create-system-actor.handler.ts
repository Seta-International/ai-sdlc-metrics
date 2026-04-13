import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'
import { CreateSystemActorCommand } from './create-system-actor.command'

@CommandHandler(CreateSystemActorCommand)
export class CreateSystemActorHandler implements ICommandHandler<
  CreateSystemActorCommand,
  { actorId: string }
> {
  constructor(
    private readonly actorFacade: KernelActorFacade,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: CreateSystemActorCommand): Promise<{ actorId: string }> {
    const actorId = await this.actorFacade.createActor(
      command.tenantId,
      'system',
      command.displayName,
      command.createdBy,
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
