import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  DIRECTORY_PROVIDER,
  type IDirectoryProvider,
  type DirectoryGroup,
} from '../../domain/ports/directory-provider.port'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import { SyncIdpGroupsCommand } from './sync-idp-groups.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class NoIdentityProviderConfiguredException extends DomainException {
  readonly code = 'NO_IDENTITY_PROVIDER_CONFIGURED'
  constructor() {
    super('No identity provider configured for this tenant')
  }
}

export interface SyncGroupsResult {
  providerId: string
  groups: DirectoryGroup[]
}

@CommandHandler(SyncIdpGroupsCommand)
export class SyncIdpGroupsHandler implements ICommandHandler<
  SyncIdpGroupsCommand,
  SyncGroupsResult
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(DIRECTORY_PROVIDER)
    private readonly directoryProvider: IDirectoryProvider,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: SyncIdpGroupsCommand): Promise<SyncGroupsResult> {
    const provider = await this.providerRepo.findPrimaryByTenantId(command.tenantId)
    if (!provider) {
      throw new NoIdentityProviderConfiguredException()
    }

    const groups = await this.directoryProvider.listGroups(
      provider.providerType,
      provider.clientId,
      provider.clientSecretRef,
      provider.directoryId ?? '',
    )

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.syncedBy,
      eventType: 'idp_groups.synced',
      module: 'identity',
      subjectId: provider.id,
      payload: { groupCount: groups.length },
    })

    return { providerId: provider.id, groups }
  }
}
