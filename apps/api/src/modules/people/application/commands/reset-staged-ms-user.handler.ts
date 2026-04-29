import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { StagedMsUserNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  MS_STAGED_USER_REPOSITORY,
  type IMsStagedUserRepository,
} from '../../domain/repositories/ms-staged-user.repository'
import { ResetStagedMsUserCommand } from './reset-staged-ms-user.command'

@CommandHandler(ResetStagedMsUserCommand)
export class ResetStagedMsUserHandler implements ICommandHandler<ResetStagedMsUserCommand, void> {
  constructor(
    @Inject(MS_STAGED_USER_REPOSITORY)
    private readonly stagedUserRepo: IMsStagedUserRepository,
  ) {}

  async execute(command: ResetStagedMsUserCommand): Promise<void> {
    const staged = await this.stagedUserRepo.findById(command.stagedUserId, command.tenantId)
    if (!staged) throw new StagedMsUserNotFoundException(command.stagedUserId)
    await this.stagedUserRepo.updateStatus(command.stagedUserId, command.tenantId, 'pending')
  }
}
