import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { RunDirectorySyncCommand } from './run-directory-sync.command'
import { RunDirectorySyncHandler } from './run-directory-sync.handler'
import {
  IdentityProviderNotFoundException,
  DirectorySyncAlreadyRunningException,
} from '../../domain/exceptions/identity.exceptions'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'
import type {
  IDirectoryProvider,
  IdpUser,
  IdpGroup,
} from '../../infrastructure/providers/directory-provider.interface'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000002'

const makeProvider = (overrides = {}) => ({
  id: PROVIDER_ID,
  tenantId: TENANT_ID,
  providerType: 'microsoft' as const,
  displayName: 'SETA Entra',
  clientId: 'c',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test',
  directoryId: 'dir',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: null,
  syncStatus: 'idle' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('RunDirectorySyncHandler', () => {
  let handler: RunDirectorySyncHandler
  let providerRepo: IIdentityProviderRepository
  let mappingRepo: IIdpGroupMappingRepository
  let auditFacade: KernelAuditFacade
  let commandBus: CommandBus
  let actorFacade: KernelActorFacade
  let directoryProvider: IDirectoryProvider
  let directoryProviderFactory: { create: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    mappingRepo = {
      findById: vi.fn(),
      findByProviderId: vi.fn(),
      findByTenantId: vi.fn(),
      listByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade
    commandBus = { execute: vi.fn() } as unknown as CommandBus
    actorFacade = {
      createActor: vi.fn(),
      deactivateActor: vi.fn(),
      grantRole: vi.fn(),
      revokeAllRoles: vi.fn(),
    } as unknown as KernelActorFacade
    directoryProvider = { listUsers: vi.fn(), listGroupsWithMembers: vi.fn() }
    directoryProviderFactory = { create: vi.fn().mockReturnValue(directoryProvider) }
    handler = new RunDirectorySyncHandler(
      providerRepo,
      mappingRepo,
      auditFacade,
      commandBus,
      directoryProviderFactory as never,
      actorFacade,
    )
  })

  it('throws IdentityProviderNotFoundException when provider does not exist', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(null)
    await expect(
      handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID)),
    ).rejects.toThrow(IdentityProviderNotFoundException)
  })

  it('throws DirectorySyncAlreadyRunningException when sync is in progress', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider({ syncStatus: 'running' }))
    await expect(
      handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID)),
    ).rejects.toThrow(DirectorySyncAlreadyRunningException)
  })

  it('provisions new users from IdP via KernelActorFacade', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(undefined)
    const idpUsers: IdpUser[] = [
      { externalId: 'ext-user-001', email: 'alice@seta.vn', displayName: 'Alice', isActive: true },
    ]
    vi.mocked(directoryProvider.listUsers).mockResolvedValue(idpUsers)
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue([])
    vi.mocked(mappingRepo.findByProviderId).mockResolvedValue([])
    vi.mocked(actorFacade.createActor).mockResolvedValue('new-actor-001')
    vi.mocked(commandBus.execute).mockResolvedValue(undefined) // CreateUserIdentityCommand
    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))
    expect(actorFacade.createActor).toHaveBeenCalledTimes(1)
    expect(commandBus.execute).toHaveBeenCalledTimes(1) // CreateUserIdentityCommand only
    expect(providerRepo.update).toHaveBeenCalledWith(
      PROVIDER_ID,
      TENANT_ID,
      expect.objectContaining({ syncStatus: 'idle' }),
    )
  })

  it('deactivates users disabled in IdP', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(undefined)
    const idpUsers: IdpUser[] = [
      {
        externalId: 'ext-user-disabled',
        email: 'disabled@seta.vn',
        displayName: 'Disabled User',
        isActive: false,
      },
    ]
    vi.mocked(directoryProvider.listUsers).mockResolvedValue(idpUsers)
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue([])
    vi.mocked(mappingRepo.findByProviderId).mockResolvedValue([])
    vi.mocked(actorFacade.deactivateActor).mockResolvedValue(undefined)
    vi.mocked(commandBus.execute).mockResolvedValue(undefined) // DeprovisionUserIdentityCommand
    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))
    expect(actorFacade.deactivateActor).toHaveBeenCalledTimes(1)
    expect(commandBus.execute).toHaveBeenCalledTimes(1) // DeprovisionUserIdentityCommand only
  })

  it('syncs group-to-role mappings via KernelActorFacade.grantRole', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(undefined)
    vi.mocked(directoryProvider.listUsers).mockResolvedValue([])
    const idpGroups: IdpGroup[] = [
      {
        externalGroupId: 'aad-eng-group',
        displayName: 'Engineering',
        memberExternalIds: ['ext-user-001'],
      },
    ]
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue(idpGroups)
    vi.mocked(mappingRepo.findByProviderId).mockResolvedValue([
      {
        id: 'mapping-001',
        tenantId: TENANT_ID,
        identityProviderId: PROVIDER_ID,
        externalGroupId: 'aad-eng-group',
        externalGroupName: 'Engineering',
        roleKey: 'employee',
        scopeType: 'global',
        scopeId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    vi.mocked(actorFacade.grantRole).mockResolvedValue(undefined)
    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))
    expect(actorFacade.grantRole).toHaveBeenCalledTimes(1)
  })

  it('sets sync status to failed on error and rethrows', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(undefined)
    vi.mocked(directoryProvider.listUsers).mockRejectedValue(new Error('Graph API error'))
    await expect(
      handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID)),
    ).rejects.toThrow('Graph API error')
    expect(providerRepo.update).toHaveBeenCalledWith(
      PROVIDER_ID,
      TENANT_ID,
      expect.objectContaining({ syncStatus: 'failed' }),
    )
  })
})
