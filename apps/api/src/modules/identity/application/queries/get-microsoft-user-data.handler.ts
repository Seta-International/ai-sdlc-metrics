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
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { GetMicrosoftUserDataQuery } from './get-microsoft-user-data.query'

export interface MicrosoftUserData {
  displayName: string | null
  mail: string | null
  officeLocation: string | null
  mobilePhone: string | null
  businessPhone: string | null
  photo: Buffer | null
}

@QueryHandler(GetMicrosoftUserDataQuery)
export class GetMicrosoftUserDataHandler implements IQueryHandler<
  GetMicrosoftUserDataQuery,
  MicrosoftUserData | null
> {
  constructor(
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY)
    private readonly credentialRepo: IMsGraphCredentialRepository,
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    private readonly tokenAcquirer: MsGraphTokenAcquirer,
    private readonly kernelQueryFacade: KernelQueryFacade,
  ) {}

  async execute(query: GetMicrosoftUserDataQuery): Promise<MicrosoftUserData | null> {
    const externalUserId = await this.kernelQueryFacade.getExternalUserId(
      query.actorId,
      query.tenantId,
    )
    if (!externalUserId) return null

    const credential = await this.credentialRepo.get(query.tenantId)
    if (!credential || credential.status !== 'active') return null

    const providerEntity = await this.providerRepo.findPrimary(query.tenantId)
    if (!providerEntity) return null

    const graphProvider = new MicrosoftGraphProvider(providerEntity, credential, this.tokenAcquirer)
    const { user, photo } = await graphProvider.getUserWithProfile(externalUserId)

    return {
      displayName: user.displayName ?? null,
      mail: user.mail ?? null,
      officeLocation: user.officeLocation ?? null,
      mobilePhone: user.mobilePhone ?? null,
      businessPhone: user.businessPhones?.[0] ?? null,
      photo,
    }
  }
}
