import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { UserIdentity } from '../../domain/entities/user-identity.entity'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../domain/repositories/user-identity.repository.port'
import { GetUserIdentityBySsoSubjectQuery } from './get-user-identity-by-sso-subject.query'

@QueryHandler(GetUserIdentityBySsoSubjectQuery)
export class GetUserIdentityBySsoSubjectHandler implements IQueryHandler<
  GetUserIdentityBySsoSubjectQuery,
  UserIdentity | null
> {
  constructor(
    @Inject(USER_IDENTITY_REPOSITORY) private readonly identityRepo: IUserIdentityRepository,
  ) {}

  execute(query: GetUserIdentityBySsoSubjectQuery): Promise<UserIdentity | null> {
    return this.identityRepo.findBySsoSubject(query.ssoSubject, query.tenantId)
  }
}
