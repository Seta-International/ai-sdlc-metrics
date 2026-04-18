import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { UserIdentity } from '../../domain/entities/user-identity.entity'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../domain/repositories/user-identity.repository.port'
import { GetUserIdentityByActorIdQuery } from './get-user-identity-by-actor-id.query'

@QueryHandler(GetUserIdentityByActorIdQuery)
export class GetUserIdentityByActorIdHandler implements IQueryHandler<
  GetUserIdentityByActorIdQuery,
  UserIdentity | null
> {
  constructor(
    @Inject(USER_IDENTITY_REPOSITORY) private readonly identityRepo: IUserIdentityRepository,
  ) {}

  execute(query: GetUserIdentityByActorIdQuery): Promise<UserIdentity | null> {
    return this.identityRepo.findByActorId(query.actorId, query.tenantId)
  }
}
