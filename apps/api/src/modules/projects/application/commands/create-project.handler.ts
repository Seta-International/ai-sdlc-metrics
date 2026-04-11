import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { AccountNotFoundException } from '../../domain/exceptions/projects.exceptions'
import {
  ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../../domain/repositories/account.repository.port'
import {
  PROJECT_REPOSITORY,
  type IProjectRepository,
} from '../../domain/repositories/project.repository.port'
import { CreateProjectCommand } from './create-project.command'

@CommandHandler(CreateProjectCommand)
export class CreateProjectHandler implements ICommandHandler<CreateProjectCommand, string> {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accountRepo: IAccountRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: IProjectRepository,
  ) {}

  async execute(command: CreateProjectCommand): Promise<string> {
    const account = await this.accountRepo.findById(command.accountId, command.tenantId)
    if (!account) {
      throw new AccountNotFoundException(command.accountId)
    }

    const project = await this.projectRepo.insert({
      tenantId: command.tenantId,
      accountId: command.accountId,
      name: command.name,
      code: command.code,
      description: command.description,
      deliveryModel: command.deliveryModel,
      startedAt: command.startedAt,
      tags: command.tags,
    })

    return project.id
  }
}
