import { Inject } from '@nestjs/common'
import { CommandHandler, CommandBus, type ICommandHandler } from '@nestjs/cqrs'
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
import {
  DIRECTORY_PROVIDER_FACTORY,
  type IDirectoryProviderFactory,
} from '../../infrastructure/providers/directory-provider.interface'
import { CreateActorCommand } from '../../../kernel/application/commands/create-actor.command'
import { CreateUserIdentityCommand } from '../../../kernel/application/commands/create-user-identity.command'
import { UpdateActorStatusCommand } from '../../../kernel/application/commands/update-actor-status.command'
import { DeprovisionUserIdentityCommand } from '../../../kernel/application/commands/deprovision-user-identity.command'
import { GrantRoleCommand } from '../../../kernel/application/commands/grant-role.command'
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
    private readonly commandBus: CommandBus,
    @Inject(DIRECTORY_PROVIDER_FACTORY)
    private readonly directoryProviderFactory: IDirectoryProviderFactory,
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
      const directoryProvider = this.directoryProviderFactory.create(provider)

      const [idpUsers, idpGroups] = await Promise.all([
        directoryProvider.listUsers(),
        directoryProvider.listGroupsWithMembers(),
      ])

      const mappings = await this.mappingRepo.findByProviderId(
        command.identityProviderId,
        command.tenantId,
      )

      // Provision / deactivate users
      for (const user of idpUsers) {
        if (user.isActive) {
          const actor = await this.commandBus.execute(
            new CreateActorCommand(command.tenantId, 'person', user.displayName),
          )
          await this.commandBus.execute(
            new CreateUserIdentityCommand(
              command.tenantId,
              actor.id,
              user.email,
              user.externalId,
              provider.providerType,
            ),
          )
        } else {
          await this.commandBus.execute(
            new UpdateActorStatusCommand(command.tenantId, user.externalId, 'inactive'),
          )
          await this.commandBus.execute(
            new DeprovisionUserIdentityCommand(command.tenantId, user.externalId),
          )
        }
      }

      // Apply group-to-role mappings
      for (const group of idpGroups) {
        const mapping = mappings.find((m) => m.externalGroupId === group.externalGroupId)
        if (!mapping) continue

        for (const memberExternalId of group.memberExternalIds) {
          await this.commandBus.execute(
            new GrantRoleCommand(
              command.tenantId,
              memberExternalId,
              mapping.roleKey as RoleKeyValue,
              mapping.scopeType as ScopeTypeValue,
              mapping.scopeId,
              SYSTEM_ACTOR_ID,
              'idp_sync',
            ),
          )
        }
      }

      await this.providerRepo.update(command.identityProviderId, command.tenantId, {
        syncStatus: 'idle',
        lastSyncAt: new Date(),
      })

      await this.auditFacade.recordEvent({
        tenantId: command.tenantId,
        actorId: SYSTEM_ACTOR_ID,
        eventType: 'directory_sync_completed',
        module: 'identity',
        subjectId: command.identityProviderId,
        payload: { usersProcessed: idpUsers.length, groupsProcessed: idpGroups.length },
      })
    } catch (err) {
      await this.providerRepo.update(command.identityProviderId, command.tenantId, {
        syncStatus: 'failed',
      })
      throw err
    }
  }
}
