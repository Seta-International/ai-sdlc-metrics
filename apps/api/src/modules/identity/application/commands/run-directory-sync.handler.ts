import { CommandHandler, type ICommandHandler, CommandBus } from '@nestjs/cqrs'
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
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  DIRECTORY_PROVIDER_FACTORY,
  type IDirectoryProviderFactory,
} from '../../infrastructure/providers/directory-provider.interface'
import { CreateActorCommand } from '../../../kernel/application/commands/create-actor.command'
import { CreateUserIdentityCommand } from '../../../kernel/application/commands/create-user-identity.command'
import { UpdateActorStatusCommand } from '../../../kernel/application/commands/update-actor-status.command'
import { DeprovisionUserIdentityCommand } from '../../../kernel/application/commands/deprovision-user-identity.command'
import { GrantRoleCommand } from '../../../kernel/application/commands/grant-role.command'
import type {
  RoleKeyValue,
  ScopeTypeValue,
} from '../../../kernel/domain/entities/role-grant.entity'
import type { IdentityProvider } from '../../../kernel/domain/entities/user-identity.entity'

@CommandHandler(RunDirectorySyncCommand)
export class RunDirectorySyncHandler implements ICommandHandler<RunDirectorySyncCommand> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
    private readonly commandBus: CommandBus,
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
          const actorId = await this.commandBus.execute<CreateActorCommand, string>(
            new CreateActorCommand(tenantId, 'person', idpUser.displayName),
          )
          const idpType = provider.providerType === 'microsoft' ? 'microsoft' : 'google'
          await this.commandBus.execute<CreateUserIdentityCommand, string>(
            new CreateUserIdentityCommand(
              tenantId,
              actorId,
              idpUser.email,
              idpUser.externalId,
              idpType as IdentityProvider,
            ),
          )
        } else {
          // Inactive users — deprovision
          // We need actorId to deprovision; in a real scenario we'd look up the actor by externalId
          // For now, dispatch UpdateActorStatus + DeprovisionUserIdentity using the externalId as actorId placeholder
          await this.commandBus.execute(
            new UpdateActorStatusCommand(tenantId, idpUser.externalId, 'inactive'),
          )
          await this.commandBus.execute(
            new DeprovisionUserIdentityCommand(tenantId, idpUser.externalId),
          )
        }
      }

      // Apply group → role mappings
      const groupMappings = await this.mappingRepo.findByProviderId(identityProviderId, tenantId)

      for (const idpGroup of idpGroups) {
        const mapping = groupMappings.find((m) => m.externalGroupId === idpGroup.externalGroupId)
        if (!mapping) continue

        for (const memberExternalId of idpGroup.memberExternalIds) {
          await this.commandBus.execute(
            new GrantRoleCommand(
              tenantId,
              memberExternalId,
              mapping.roleKey as RoleKeyValue,
              mapping.scopeType as ScopeTypeValue,
              mapping.scopeId,
              'system',
              'idp_sync',
            ),
          )
        }
      }

      await this.providerRepo.update(identityProviderId, tenantId, {
        syncStatus: 'idle',
        lastSyncAt: new Date(),
      })

      await this.auditRepo.insert({
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
