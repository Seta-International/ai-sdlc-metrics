import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { DirectorySyncCompletedEvent } from '@future/event-contracts'
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
import { KernelUserIdentityFacade } from '../../../kernel/application/facades/kernel-user-identity.facade'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type {
  IDirectoryProvider,
  IdpUser,
  IdpGroup,
} from '../../domain/ports/directory-provider.port'

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
  syncProcessed: 0,
  syncTotal: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('RunDirectorySyncHandler', () => {
  let handler: RunDirectorySyncHandler
  let providerRepo: IIdentityProviderRepository
  let mappingRepo: IIdpGroupMappingRepository
  let auditFacade: KernelAuditFacade
  let actorFacade: KernelActorFacade
  let userIdentityFacade: KernelUserIdentityFacade
  let directoryProvider: IDirectoryProvider
  let kernelQueryFacade: KernelQueryFacade
  let directoryProviderFactory: { create: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

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
    actorFacade = {
      createActor: vi.fn(),
      deactivateActor: vi.fn(),
      grantRole: vi.fn(),
      revokeAllRoles: vi.fn(),
    } as unknown as KernelActorFacade
    userIdentityFacade = {
      createUserIdentity: vi.fn(),
      deprovisionUserIdentity: vi.fn(),
    } as unknown as KernelUserIdentityFacade
    kernelQueryFacade = {
      getUserIdentityBySsoSubject: vi.fn().mockResolvedValue(null),
    } as unknown as KernelQueryFacade
    directoryProvider = {
      testConnection: vi.fn(),
      listUsers: vi.fn(),
      listGroupsWithMembers: vi.fn(),
    }
    directoryProviderFactory = { create: vi.fn().mockResolvedValue(directoryProvider) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new RunDirectorySyncHandler(
      providerRepo,
      mappingRepo,
      auditFacade,
      directoryProviderFactory as never,
      actorFacade,
      userIdentityFacade,
      kernelQueryFacade,
      eventBus as unknown as EventBus,
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

  it('skips provisioning when user identity already exists', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(undefined)
    const idpUsers: IdpUser[] = [
      { externalId: 'ext-user-001', email: 'alice@seta.vn', displayName: 'Alice', isActive: true },
    ]
    vi.mocked(directoryProvider.listUsers).mockResolvedValue(idpUsers)
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue([])
    vi.mocked(mappingRepo.findByProviderId).mockResolvedValue([])
    vi.mocked(kernelQueryFacade.getUserIdentityBySsoSubject).mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))

    expect(actorFacade.createActor).not.toHaveBeenCalled()
    expect(userIdentityFacade.createUserIdentity).not.toHaveBeenCalled()
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
    vi.mocked(userIdentityFacade.createUserIdentity).mockResolvedValue(undefined)
    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))
    expect(actorFacade.createActor).toHaveBeenCalledTimes(1)
    expect(userIdentityFacade.createUserIdentity).toHaveBeenCalledTimes(1)
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
    vi.mocked(userIdentityFacade.deprovisionUserIdentity).mockResolvedValue(undefined)
    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))
    expect(actorFacade.deactivateActor).toHaveBeenCalledTimes(1)
    expect(userIdentityFacade.deprovisionUserIdentity).toHaveBeenCalledTimes(1)
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

  it('publishes DirectorySyncCompletedEvent after successful sync', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(undefined)
    vi.mocked(directoryProvider.listUsers).mockResolvedValue([])
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue([])
    vi.mocked(mappingRepo.findByProviderId).mockResolvedValue([])

    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))

    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(DirectorySyncCompletedEvent))
    const publishedEvent = eventBus.publish.mock.calls[0][0] as DirectorySyncCompletedEvent
    expect(publishedEvent.tenantId).toBe(TENANT_ID)
    expect(publishedEvent.identityProviderId).toBe(PROVIDER_ID)
  })

  it('sets syncTotal to user count and syncProcessed=0 before processing users', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(undefined)
    const idpUsers: IdpUser[] = [
      { externalId: 'u1', email: 'u1@seta.vn', displayName: 'U1', isActive: true },
      { externalId: 'u2', email: 'u2@seta.vn', displayName: 'U2', isActive: true },
      { externalId: 'u3', email: 'u3@seta.vn', displayName: 'U3', isActive: true },
    ]
    vi.mocked(directoryProvider.listUsers).mockResolvedValue(idpUsers)
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue([])
    vi.mocked(mappingRepo.findByProviderId).mockResolvedValue([])
    vi.mocked(actorFacade.createActor).mockResolvedValue('new-actor')
    vi.mocked(userIdentityFacade.createUserIdentity).mockResolvedValue(undefined)

    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))

    const updateCalls = vi.mocked(providerRepo.update).mock.calls
    const progressInitCall = updateCalls.find(
      ([, , data]) =>
        'syncTotal' in data &&
        (data as Record<string, unknown>).syncTotal === 3 &&
        (data as Record<string, unknown>).syncProcessed === 0,
    )
    expect(progressInitCall).toBeDefined()
  })

  it('sets syncProcessed to total user count after successful sync', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(undefined)
    const idpUsers: IdpUser[] = [
      { externalId: 'u1', email: 'u1@seta.vn', displayName: 'U1', isActive: true },
      { externalId: 'u2', email: 'u2@seta.vn', displayName: 'U2', isActive: true },
    ]
    vi.mocked(directoryProvider.listUsers).mockResolvedValue(idpUsers)
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue([])
    vi.mocked(mappingRepo.findByProviderId).mockResolvedValue([])
    vi.mocked(actorFacade.createActor).mockResolvedValue('new-actor')
    vi.mocked(userIdentityFacade.createUserIdentity).mockResolvedValue(undefined)

    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))

    expect(providerRepo.update).toHaveBeenCalledWith(
      PROVIDER_ID,
      TENANT_ID,
      expect.objectContaining({ syncStatus: 'idle', syncProcessed: 2, syncTotal: 2 }),
    )
  })

  it('does NOT publish event when sync throws', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(undefined)
    vi.mocked(directoryProviderFactory.create).mockRejectedValue(new Error('provider error'))

    await expect(
      handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID)),
    ).rejects.toThrow('provider error')

    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
