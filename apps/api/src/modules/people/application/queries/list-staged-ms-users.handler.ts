import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import {
  MS_STAGED_USER_REPOSITORY,
  type IMsStagedUserRepository,
} from '../../domain/repositories/ms-staged-user.repository'
import type { MsStagedUser } from '../../domain/entities/ms-staged-user.entity'
import { ListStagedMsUsersQuery } from './list-staged-ms-users.query'

export interface ListStagedMsUsersResult {
  items: MsStagedUser[]
  total: number
}

@QueryHandler(ListStagedMsUsersQuery)
export class ListStagedMsUsersHandler implements IQueryHandler<
  ListStagedMsUsersQuery,
  ListStagedMsUsersResult
> {
  constructor(
    @Inject(MS_STAGED_USER_REPOSITORY)
    private readonly stagedUserRepo: IMsStagedUserRepository,
  ) {}

  async execute(query: ListStagedMsUsersQuery): Promise<ListStagedMsUsersResult> {
    const items = await this.stagedUserRepo.listByStatus(
      query.tenantId,
      query.status,
      query.limit,
      query.offset,
    )
    const total = await this.stagedUserRepo.countByStatus(query.tenantId, query.status)
    return { items, total }
  }
}
