import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { isActorArchived } from '../../domain/entities/actor.entity'
import {
  ActorArchivedException,
  ActorNotFoundException,
} from '../../domain/exceptions/actor.exceptions'
import { DuplicateSsoSubjectException } from '../../domain/exceptions/user-identity.exceptions'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../domain/repositories/user-identity.repository.port'
import { CreateUserIdentityCommand } from './create-user-identity.command'

@CommandHandler(CreateUserIdentityCommand)
export class CreateUserIdentityHandler implements ICommandHandler<
  CreateUserIdentityCommand,
  string
> {
  constructor(
    @Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository,
    @Inject(USER_IDENTITY_REPOSITORY) private readonly identityRepo: IUserIdentityRepository,
  ) {}

  async execute(command: CreateUserIdentityCommand): Promise<string> {
    const actor = await this.actorRepo.findById(command.actorId, command.tenantId)
    if (!actor) {
      throw new ActorNotFoundException(command.actorId)
    }
    if (isActorArchived(actor)) {
      throw new ActorArchivedException(command.actorId)
    }

    const existing = await this.identityRepo.findBySsoSubject(command.ssoSubject, command.tenantId)
    if (existing) {
      throw new DuplicateSsoSubjectException(command.ssoSubject)
    }

    const identity = await this.identityRepo.insert({
      tenantId: command.tenantId,
      actorId: command.actorId,
      email: command.email,
      ssoSubject: command.ssoSubject,
      provider: command.provider,
    })

    return identity.id
  }
}
