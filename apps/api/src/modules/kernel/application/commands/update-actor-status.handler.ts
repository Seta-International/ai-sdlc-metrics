import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ActorNotFoundException } from '../../domain/exceptions/actor.exceptions'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import { UpdateActorStatusCommand } from './update-actor-status.command'

@CommandHandler(UpdateActorStatusCommand)
export class UpdateActorStatusHandler implements ICommandHandler<UpdateActorStatusCommand, void> {
  constructor(@Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository) {}

  async execute(command: UpdateActorStatusCommand): Promise<void> {
    const actor = await this.actorRepo.findById(command.actorId, command.tenantId)
    if (!actor) {
      throw new ActorNotFoundException(command.actorId)
    }
    await this.actorRepo.updateStatus(command.actorId, command.tenantId, command.status)
  }
}
