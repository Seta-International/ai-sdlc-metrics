import { Injectable, Logger } from '@nestjs/common'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type {
  IDirectoryProvider,
  IdpUser,
  IdpGroup,
} from '../../domain/ports/directory-provider.port'

@Injectable()
export class GoogleDirectoryProvider implements IDirectoryProvider {
  private readonly logger = new Logger(GoogleDirectoryProvider.name)

  constructor(private readonly providerConfig: IdentityProviderEntity) {}

  async testConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
    this.logger.warn('GoogleDirectoryProvider.testConnection() is a stub — not yet implemented')
    return { ok: true }
  }

  async listUsers(): Promise<IdpUser[]> {
    this.logger.warn('GoogleDirectoryProvider.listUsers() is a stub — not yet implemented')
    return []
  }

  async listGroupsWithMembers(): Promise<IdpGroup[]> {
    this.logger.warn(
      'GoogleDirectoryProvider.listGroupsWithMembers() is a stub — not yet implemented',
    )
    return []
  }
}
