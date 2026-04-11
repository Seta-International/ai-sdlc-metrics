import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { RunDirectorySyncCommand } from './run-directory-sync.command'
import {
  IdentityProviderNotFoundException,
  DirectorySyncAlreadyRunningException,
} from '../../domain/exceptions/identity.exceptions'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository'
import { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'
import { KernelActorService } from '../../../kernel/application/facades/kernel-actor.service'
import {
  DIRECTORY_PROVIDER_FACTORY,
  type IDirectoryProviderFactory,
} from '../../domain/ports/directory-provider.factory.port'
import type { RoleKeyValue, ScopeTypeValue, IdentityProvider } from '../../../kernel'

@CommandHandler(RunDirectorySyncCommand)
export class RunDirectorySyncHandler implements ICommandHandler<RunDirectorySyncCommand> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
    private readonly auditService: KernelAuditService,
    private readonly actorService: KernelActorService,
    @Inject(DIRECTORY_PROVIDER_FACTORY)
    private readonly directoryProviderFactory: IDirectoryProviderFactory,
  ) {}

  async execute(command: RunDirectorySyncCommand): Promise<void> {
    const { tenantId, identityProviderId } = command

    const provider = await this.providerRepo.findById(identityProviderId, tenantId)
    if (!provider) {
      throw new IdentityProviderNotFoundException(identityProviderId)
    }

    if (provider.syncStatus === 'running') {
      throw new DirectorySyncAlreadyRunningException(identityProviderId)
    }

    await this.providerRepo.update(identityProviderId, tenantId, { syncStatus: 'running' })

    const directoryProvider = this.directoryProviderFactory.create(provider)

    try {
      const [idpUsers, idpGroups] = await Promise.all([
        directoryProvider.listUsers(),
        directoryProvider.listGroupsWithMembers(),
      ])

      // Provision / deprovision users
      for (const idpUser of idpUsers) {
        if (idpUser.isActive) {
          const actorId = await this.actorService.createActor(
            tenantId,
            'person',
            idpUser.displayName,
          )
          const idpType = provider.providerType === 'microsoft' ? 'microsoft' : 'google'
          await this.actorService.createUserIdentity(
            tenantId,
            actorId,
            idpUser.email,
            idpUser.externalId,
            idpType as IdentityProvider,
          )
        } else {
          // Inactive users — deprovision
          await this.actorService.updateActorStatus(tenantId, idpUser.externalId, 'inactive')
          await this.actorService.deprovisionUserIdentity(tenantId, idpUser.externalId)
        }
      }

      // Apply group → role mappings
      const groupMappings = await this.mappingRepo.findByProviderId(identityProviderId, tenantId)

      for (const idpGroup of idpGroups) {
        const mapping = groupMappings.find((m) => m.externalGroupId === idpGroup.externalGroupId)
        if (!mapping) continue

        for (const memberExternalId of idpGroup.memberExternalIds) {
          await this.actorService.grantRole(
            tenantId,
            memberExternalId,
            mapping.roleKey as RoleKeyValue,
            mapping.scopeType as ScopeTypeValue,
            mapping.scopeId,
            'system',
            'idp_sync',
          )
        }
      }

      await this.providerRepo.update(identityProviderId, tenantId, {
        syncStatus: 'idle',
        lastSyncAt: new Date(),
      })

      await this.auditService.log({
        tenantId,
        actorId: 'system',
        eventType: 'directory_sync_completed',
        module: 'identity',
        subjectId: identityProviderId,
        payload: { userCount: idpUsers.length, groupCount: idpGroups.length },
      })
    } catch (err) {
      await this.providerRepo.update(identityProviderId, tenantId, { syncStatus: 'failed' })
      throw err
    }
  }
}
