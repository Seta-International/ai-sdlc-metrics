import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../../domain/repositories/account.repository.port'
import type { Account } from '../../domain/entities/account.entity'
import { ListAccountsQuery } from './list-accounts.query'

export interface ListAccountsResult {
  items: Account[]
  total: number
}

@QueryHandler(ListAccountsQuery)
export class ListAccountsHandler implements IQueryHandler<ListAccountsQuery, ListAccountsResult> {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accountRepo: IAccountRepository) {}

  async execute(query: ListAccountsQuery): Promise<ListAccountsResult> {
    const items = await this.accountRepo.list(query.tenantId, {
      limit: query.limit,
      offset: query.offset,
    })
    const total = await this.accountRepo.count(query.tenantId)

    return { items, total }
  }
}
