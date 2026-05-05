import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { DirectorySyncCompletedEvent } from '@future/event-contracts'
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
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'
import { KernelUserIdentityFacade } from '../../../kernel/application/facades/kernel-user-identity.facade'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import {
  DIRECTORY_PROVIDER_FACTORY,
  type IDirectoryProviderFactory,
} from '../../domain/ports/directory-provider.port'
import { RunDirectorySyncCommand } from './run-directory-sync.command'
import type { RoleKeyValue, ScopeTypeValue } from '@future/core'

const SYSTEM_ACTOR_ID = '00000000-0000-7000-8000-000000000000'

@CommandHandler(RunDirectorySyncCommand)
export class RunDirectorySyncHandler implements ICommandHandler<RunDirectorySyncCommand, void> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(IDP_GROUP_MAPPING_REPOSITORY) private readonly mappingRepo: IIdpGroupMappingRepository,
    private readonly auditFacade: KernelAuditFacade,
    @Inject(DIRECTORY_PROVIDER_FACTORY)
    private readonly directoryProviderFactory: IDirectoryProviderFactory,
    private readonly actorFacade: KernelActorFacade,
    private readonly userIdentityFacade: KernelUserIdentityFacade,
    private readonly kernelQueryFacade: KernelQueryFacade,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RunDirectorySyncCommand): Promise<void> {
    const provider = await this.providerRepo.findById(command.identityProviderId, command.tenantId)
    if (!provider) throw new IdentityProviderNotFoundException(command.identityProviderId)
    if (provider.syncStatus === 'running')
      throw new DirectorySyncAlreadyRunningException(command.identityProviderId)

    await this.providerRepo.update(command.identityProviderId, command.tenantId, {
      syncStatus: 'running',
    })

    try {
      const directoryProvider = await this.directoryProviderFactory.create(provider)

      const [idpUsers, idpGroups] = await Promise.all([
        directoryProvider.listUsers(),
        directoryProvider.listGroupsWithMembers(),
      ])

      await this.providerRepo.update(command.identityProviderId, command.tenantId, {
        syncTotal: idpUsers.length,
        syncProcessed: 0,
      })

      const mappings = await this.mappingRepo.findByProviderId(
        command.identityProviderId,
        command.tenantId,
      )

      // Provision / deactivate users
      let syncProcessed = 0
      for (const user of idpUsers) {
        if (user.isActive) {
          const existing = await this.kernelQueryFacade.getUserIdentityBySsoSubject(
            user.externalId,
            command.tenantId,
          )
          if (existing) continue

          const actorId = await this.actorFacade.createActor(
            command.tenantId,
            'person',
            user.displayName,
            SYSTEM_ACTOR_ID,
          )
          await this.userIdentityFacade.createUserIdentity(
            command.tenantId,
            actorId,
            user.email,
            user.externalId,
            provider.providerType,
          )
        } else {
          await this.actorFacade.deactivateActor(user.externalId, command.tenantId)
          await this.userIdentityFacade.deprovisionUserIdentity(command.tenantId, user.externalId)
        }
        syncProcessed++
        if (syncProcessed % 10 === 0) {
          await this.providerRepo.update(command.identityProviderId, command.tenantId, {
            syncProcessed,
          })
        }
      }

      // Apply group-to-role mappings
      for (const group of idpGroups) {
        const mapping = mappings.find((m) => m.externalGroupId === group.externalGroupId)
        if (!mapping) continue

        for (const memberExternalId of group.memberExternalIds) {
          await this.actorFacade.grantRole(
            memberExternalId,
            mapping.roleKey as RoleKeyValue,
            mapping.scopeType as ScopeTypeValue,
            mapping.scopeId,
            command.tenantId,
            SYSTEM_ACTOR_ID,
          )
        }
      }

      await this.providerRepo.update(command.identityProviderId, command.tenantId, {
        syncStatus: 'idle',
        lastSyncAt: new Date(),
        syncProcessed: idpUsers.length,
        syncTotal: idpUsers.length,
      })

      await this.auditFacade.recordEvent({
        tenantId: command.tenantId,
        actorId: SYSTEM_ACTOR_ID,
        eventType: 'directory_sync_completed',
        module: 'identity',
        subjectId: command.identityProviderId,
        payload: { usersProcessed: idpUsers.length, groupsProcessed: idpGroups.length },
      })

      await this.eventBus.publish(
        new DirectorySyncCompletedEvent(
          command.tenantId,
          command.identityProviderId,
          idpUsers.length,
          idpGroups.length,
          new Date().toISOString(),
        ),
      )
    } catch (err) {
      await this.providerRepo.update(command.identityProviderId, command.tenantId, {
        syncStatus: 'failed',
      })
      throw err
    }
  }
}
