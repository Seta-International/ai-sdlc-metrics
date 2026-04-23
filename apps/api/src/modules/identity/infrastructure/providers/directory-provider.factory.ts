import { Inject, Injectable } from '@nestjs/common'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type {
  IDirectoryProvider,
  IDirectoryProviderFactory,
} from '../../domain/ports/directory-provider.port'
import {
  MS_GRAPH_CREDENTIAL_REPOSITORY,
  type IMsGraphCredentialRepository,
} from '../../domain/repositories/ms-graph-credential.repository'
import { MicrosoftGraphProvider } from './microsoft-graph.provider'
import { GoogleDirectoryProvider } from './google-directory.provider'
import { MsGraphTokenAcquirer } from './microsoft/ms-graph-token-acquirer'

@Injectable()
export class DirectoryProviderFactory implements IDirectoryProviderFactory {
  constructor(
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY)
    private readonly credentialRepo: IMsGraphCredentialRepository,
    private readonly tokenAcquirer: MsGraphTokenAcquirer,
  ) {}

  async create(provider: IdentityProviderEntity): Promise<IDirectoryProvider> {
    switch (provider.providerType) {
      case 'microsoft': {
        const credential = await this.credentialRepo.get(provider.tenantId)
        if (!credential) {
          throw new Error(
            `No ms_graph_credential for tenant ${provider.tenantId}; admin must connect Microsoft 365 first`,
          )
        }
        return new MicrosoftGraphProvider(provider, credential, this.tokenAcquirer)
      }
      case 'google':
        return new GoogleDirectoryProvider(provider)
      default: {
        const _exhaustive: never = provider.providerType
        throw new Error(`Unknown provider type: ${_exhaustive}`)
      }
    }
  }
}
