import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import {
  MS_GRAPH_CREDENTIAL_REPOSITORY,
  type IMsGraphCredentialRepository,
} from '../../domain/repositories/ms-graph-credential.repository'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import { MicrosoftGraphProvider } from '../../infrastructure/providers/microsoft-graph.provider'
import { MsGraphTokenAcquirer } from '../../infrastructure/providers/microsoft/ms-graph-token-acquirer'
import { GetUsersDeltaQuery } from './get-users-delta.query'
import type { UsersDeltaResult } from '../../infrastructure/providers/microsoft-graph.provider'

export type {
  UsersDeltaResult,
  IdpUserWithProfile,
} from '../../infrastructure/providers/microsoft-graph.provider'

@QueryHandler(GetUsersDeltaQuery)
export class GetUsersDeltaHandler implements IQueryHandler<
  GetUsersDeltaQuery,
  UsersDeltaResult | null
> {
  constructor(
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY)
    private readonly credentialRepo: IMsGraphCredentialRepository,
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    private readonly tokenAcquirer: MsGraphTokenAcquirer,
  ) {}

  async execute(query: GetUsersDeltaQuery): Promise<UsersDeltaResult | null> {
    const credential = await this.credentialRepo.get(query.tenantId)
    if (!credential || credential.status !== 'active') return null

    const providerEntity = await this.providerRepo.findPrimary(query.tenantId)
    if (!providerEntity) return null

    const graphProvider = new MicrosoftGraphProvider(providerEntity, credential, this.tokenAcquirer)
    return graphProvider.listUsersDelta(query.deltaToken)
  }
}
