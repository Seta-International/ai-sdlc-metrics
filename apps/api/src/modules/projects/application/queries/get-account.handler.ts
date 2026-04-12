import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { AccountNotFoundException } from '../../domain/exceptions/projects.exceptions'
import {
  ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../../domain/repositories/account.repository.port'
import {
  PROJECT_REPOSITORY,
  type IProjectRepository,
} from '../../domain/repositories/project.repository.port'
import type { Account } from '../../domain/entities/account.entity'
import type { Project } from '../../domain/entities/project.entity'
import { GetAccountQuery } from './get-account.query'

export interface GetAccountResult {
  account: Account
  projects: Project[]
}

@QueryHandler(GetAccountQuery)
export class GetAccountHandler implements IQueryHandler<GetAccountQuery, GetAccountResult> {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accountRepo: IAccountRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: IProjectRepository,
  ) {}

  async execute(query: GetAccountQuery): Promise<GetAccountResult> {
    const account = await this.accountRepo.findById(query.accountId, query.tenantId)
    if (!account) {
      throw new AccountNotFoundException(query.accountId)
    }

    const projects = await this.projectRepo.findByAccountId(query.accountId, query.tenantId)

    return { account, projects }
  }
}
