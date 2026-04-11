import { Injectable } from '@nestjs/common'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { IDirectoryProviderFactory } from '../../domain/ports/directory-provider.factory.port'
import type { IDirectoryProvider } from './directory-provider.interface'
import { MicrosoftGraphProvider } from './microsoft-graph.provider'
import { GoogleDirectoryProvider } from './google-directory.provider'

@Injectable()
export class DirectoryProviderFactory implements IDirectoryProviderFactory {
  create(provider: IdentityProviderEntity): IDirectoryProvider {
    switch (provider.providerType) {
      case 'microsoft':
        return new MicrosoftGraphProvider(provider)
      case 'google':
        return new GoogleDirectoryProvider(provider)
      default: {
        const _exhaustive: never = provider.providerType
        throw new Error(`Unknown provider type: ${_exhaustive}`)
      }
    }
  }
}
