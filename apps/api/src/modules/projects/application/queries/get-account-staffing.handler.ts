import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { AccountNotFoundException } from '../../domain/exceptions/projects.exceptions'
import {
  ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../../domain/repositories/account.repository.port'
import {
  ALLOCATION_REPOSITORY,
  type IAllocationRepository,
} from '../../domain/repositories/allocation.repository.port'
import type { Account } from '../../domain/entities/account.entity'
import type { Allocation } from '../../domain/entities/allocation.entity'
import { GetAccountStaffingQuery } from './get-account-staffing.query'

export interface GetAccountStaffingResult {
  account: Account
  allocations: Allocation[]
}

@QueryHandler(GetAccountStaffingQuery)
export class GetAccountStaffingHandler implements IQueryHandler<
  GetAccountStaffingQuery,
  GetAccountStaffingResult
> {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accountRepo: IAccountRepository,
    @Inject(ALLOCATION_REPOSITORY) private readonly allocRepo: IAllocationRepository,
  ) {}

  async execute(query: GetAccountStaffingQuery): Promise<GetAccountStaffingResult> {
    const account = await this.accountRepo.findById(query.accountId, query.tenantId)
    if (!account) {
      throw new AccountNotFoundException(query.accountId)
    }

    const allocations = await this.allocRepo.findByAccountId(query.accountId, query.tenantId)

    return { account, allocations }
  }
}
