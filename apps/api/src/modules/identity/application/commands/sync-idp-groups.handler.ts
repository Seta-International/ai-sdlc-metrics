import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { SyncIdpGroupsCommand } from './sync-idp-groups.command'
import { IdentityProviderNotFoundException } from '../../domain/exceptions/identity.exceptions'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'
import {
  DIRECTORY_PROVIDER_FACTORY,
  type IDirectoryProviderFactory,
  type IdpGroup,
} from '../../domain/ports/directory-provider.factory.port'

export interface DirectoryGroup {
  externalGroupId: string
  displayName: string
  memberCount: number
}

export interface SyncIdpGroupsResult {
  providerId: string
  groups: DirectoryGroup[]
}

@CommandHandler(SyncIdpGroupsCommand)
export class SyncIdpGroupsHandler implements ICommandHandler<SyncIdpGroupsCommand> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(DIRECTORY_PROVIDER_FACTORY)
    private readonly directoryProviderFactory: IDirectoryProviderFactory,
    private readonly auditService: KernelAuditService,
  ) {}

  async execute(command: SyncIdpGroupsCommand): Promise<SyncIdpGroupsResult> {
    const { tenantId, syncedBy } = command

    const provider = await this.providerRepo.findPrimary(tenantId)
    if (!provider) {
      throw new IdentityProviderNotFoundException('primary')
    }

    const directoryProvider = this.directoryProviderFactory.create(provider)
    const idpGroups: IdpGroup[] = await directoryProvider.listGroupsWithMembers()

    const groups: DirectoryGroup[] = idpGroups.map((g) => ({
      externalGroupId: g.externalGroupId,
      displayName: g.displayName,
      memberCount: g.memberExternalIds.length,
    }))

    await this.auditService.log({
      tenantId,
      actorId: syncedBy,
      eventType: 'idp_groups.synced',
      module: 'identity',
      subjectId: provider.id,
      payload: { groupCount: groups.length },
    })

    return { providerId: provider.id, groups }
  }
}
