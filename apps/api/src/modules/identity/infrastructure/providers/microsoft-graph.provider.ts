import { Injectable, Logger } from '@nestjs/common'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { IDirectoryProvider, IdpUser, IdpGroup } from './directory-provider.interface'

@Injectable()
export class MicrosoftGraphProvider implements IDirectoryProvider {
  private readonly logger = new Logger(MicrosoftGraphProvider.name)

  constructor(private readonly providerConfig: IdentityProviderEntity) {}

  async listUsers(): Promise<IdpUser[]> {
    this.logger.warn('MicrosoftGraphProvider.listUsers() is a stub — not yet implemented')
    return []
  }

  async listGroupsWithMembers(): Promise<IdpGroup[]> {
    this.logger.warn(
      'MicrosoftGraphProvider.listGroupsWithMembers() is a stub — not yet implemented',
    )
    return []
  }
}
