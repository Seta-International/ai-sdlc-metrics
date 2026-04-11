import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  LOCAL_USER_QUERY_PORT,
  type ILocalUserQueryPort,
  type LocalUserDto,
} from '../../domain/ports/local-user-query.port'
import { ListLocalUsersQuery } from './list-local-users.query'

@QueryHandler(ListLocalUsersQuery)
export class ListLocalUsersHandler implements IQueryHandler<ListLocalUsersQuery, LocalUserDto[]> {
  constructor(
    @Inject(LOCAL_USER_QUERY_PORT)
    private readonly localUserQuery: ILocalUserQueryPort,
  ) {}

  async execute(query: ListLocalUsersQuery): Promise<LocalUserDto[]> {
    return this.localUserQuery.listByTenantId(query.tenantId)
  }
}
