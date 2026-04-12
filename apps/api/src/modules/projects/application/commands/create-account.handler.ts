import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../../domain/repositories/account.repository.port'
import { CreateAccountCommand } from './create-account.command'

@CommandHandler(CreateAccountCommand)
export class CreateAccountHandler implements ICommandHandler<CreateAccountCommand, string> {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accountRepo: IAccountRepository) {}

  async execute(command: CreateAccountCommand): Promise<string> {
    const account = await this.accountRepo.insert({
      tenantId: command.tenantId,
      name: command.name,
      clientCompany: command.clientCompany,
      description: command.description,
      domain: command.domain,
      location: command.location,
      timezone: command.timezone,
      billingModel: command.billingModel,
      accountManagerId: command.accountManagerId,
      startedAt: command.startedAt,
    })

    return account.id
  }
}
