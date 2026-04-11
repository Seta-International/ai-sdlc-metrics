import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import { GetIdentityProviderQuery } from './get-identity-provider.query'

@QueryHandler(GetIdentityProviderQuery)
export class GetIdentityProviderHandler implements IQueryHandler<
  GetIdentityProviderQuery,
  IdentityProviderEntity | null
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
  ) {}

  async execute(query: GetIdentityProviderQuery): Promise<IdentityProviderEntity | null> {
    return this.providerRepo.findPrimary(query.tenantId)
  }
}
