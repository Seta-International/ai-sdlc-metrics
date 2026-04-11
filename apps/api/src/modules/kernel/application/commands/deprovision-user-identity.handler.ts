import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../domain/repositories/user-identity.repository.port'
import { DeprovisionUserIdentityCommand } from './deprovision-user-identity.command'

@CommandHandler(DeprovisionUserIdentityCommand)
export class DeprovisionUserIdentityHandler implements ICommandHandler<
  DeprovisionUserIdentityCommand,
  void
> {
  constructor(
    @Inject(USER_IDENTITY_REPOSITORY) private readonly userIdentityRepo: IUserIdentityRepository,
  ) {}

  // Idempotent: no-op if actor has no identity record (e.g. SSO-less system actors).
  async execute(command: DeprovisionUserIdentityCommand): Promise<void> {
    await this.userIdentityRepo.deprovisionByActorId(command.actorId, command.tenantId)
  }
}
