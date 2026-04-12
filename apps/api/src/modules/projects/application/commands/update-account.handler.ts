import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { AccountNotFoundException } from '../../domain/exceptions/projects.exceptions'
import {
  ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../../domain/repositories/account.repository.port'
import { UpdateAccountCommand } from './update-account.command'

@CommandHandler(UpdateAccountCommand)
export class UpdateAccountHandler implements ICommandHandler<UpdateAccountCommand, void> {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accountRepo: IAccountRepository) {}

  async execute(command: UpdateAccountCommand): Promise<void> {
    const account = await this.accountRepo.findById(command.accountId, command.tenantId)
    if (!account) {
      throw new AccountNotFoundException(command.accountId)
    }

    await this.accountRepo.update(command.accountId, command.tenantId, command.data)
  }
}
