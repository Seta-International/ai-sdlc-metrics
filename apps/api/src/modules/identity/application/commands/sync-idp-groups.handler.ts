import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import {
  DIRECTORY_PROVIDER_FACTORY,
  type IDirectoryProviderFactory,
  type IdpGroup,
} from '../../domain/ports/directory-provider.port'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import {
  IDP_GROUP_MEMBER_REPOSITORY,
  type IIdpGroupMemberRepository,
} from '../../domain/repositories/idp-group-member.repository'
import { SyncIdpGroupsCommand } from './sync-idp-groups.command'
import { DomainException } from '@future/core'

class NoIdentityProviderConfiguredException extends DomainException {
  readonly code = 'NO_IDENTITY_PROVIDER_CONFIGURED'
  constructor() {
    super('No identity provider configured for this tenant')
  }
}

export interface SyncGroupsResult {
  providerId: string
  groups: IdpGroup[]
}

@CommandHandler(SyncIdpGroupsCommand)
export class SyncIdpGroupsHandler implements ICommandHandler<
  SyncIdpGroupsCommand,
  SyncGroupsResult
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(DIRECTORY_PROVIDER_FACTORY)
    private readonly directoryProviderFactory: IDirectoryProviderFactory,
    private readonly auditFacade: KernelAuditFacade,
    @Inject(IDP_GROUP_MEMBER_REPOSITORY)
    private readonly memberRepo: IIdpGroupMemberRepository,
  ) {}

  async execute(command: SyncIdpGroupsCommand): Promise<SyncGroupsResult> {
    const provider = await this.providerRepo.findPrimaryByTenantId(command.tenantId)
    if (!provider) {
      throw new NoIdentityProviderConfiguredException()
    }

    const directoryProvider = await this.directoryProviderFactory.create(provider)
    const groups = await directoryProvider.listGroupsWithMembers()

    for (const group of groups) {
      await this.memberRepo.replaceForGroup({
        tenantId: command.tenantId,
        externalGroupId: group.externalGroupId,
        ssoSubjects: group.memberExternalIds,
      })
    }

    await this.auditFacade.recordEvent({
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
