import { Injectable, Logger } from '@nestjs/common'
import type {
  IDirectoryProvider,
  DirectoryGroup,
  DirectoryUser,
} from '../../domain/ports/directory-provider.port'

/**
 * Concrete implementation of the domain-port IDirectoryProvider.
 * Provides stateless credential-based connection testing and directory queries.
 * Providers are stubs — replace with real Graph/Google SDK calls when needed.
 */
@Injectable()
export class DirectoryConnectionService implements IDirectoryProvider {
  private readonly logger = new Logger(DirectoryConnectionService.name)

  async testConnection(
    providerType: 'microsoft' | 'google',
    clientId: string,
    _clientSecretRef: string,
    _directoryId: string,
  ): Promise<{ success: boolean; error?: string; userCount?: number }> {
    this.logger.warn(
      `DirectoryConnectionService.testConnection() is a stub — provider: ${providerType}, clientId: ${clientId}`,
    )
    return { success: true, userCount: 0 }
  }

  async listGroups(
    providerType: 'microsoft' | 'google',
    _clientId: string,
    _clientSecretRef: string,
    _directoryId: string,
  ): Promise<DirectoryGroup[]> {
    this.logger.warn(
      `DirectoryConnectionService.listGroups() is a stub — provider: ${providerType}`,
    )
    return []
  }

  async listUsers(
    providerType: 'microsoft' | 'google',
    _clientId: string,
    _clientSecretRef: string,
    _directoryId: string,
  ): Promise<DirectoryUser[]> {
    this.logger.warn(`DirectoryConnectionService.listUsers() is a stub — provider: ${providerType}`)
    return []
  }
}
