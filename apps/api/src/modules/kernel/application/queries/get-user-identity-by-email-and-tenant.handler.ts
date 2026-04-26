import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { UserIdentity } from '../../domain/entities/user-identity.entity'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../domain/repositories/user-identity.repository.port'
import { GetUserIdentityByEmailAndTenantQuery } from './get-user-identity-by-email-and-tenant.query'

@QueryHandler(GetUserIdentityByEmailAndTenantQuery)
export class GetUserIdentityByEmailAndTenantHandler implements IQueryHandler<
  GetUserIdentityByEmailAndTenantQuery,
  UserIdentity | null
> {
  constructor(
    @Inject(USER_IDENTITY_REPOSITORY) private readonly identityRepo: IUserIdentityRepository,
  ) {}

  execute(query: GetUserIdentityByEmailAndTenantQuery): Promise<UserIdentity | null> {
    return this.identityRepo.findByEmailAndTenant(query.email, query.tenantId)
  }
}
