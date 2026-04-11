import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RunDirectorySyncCommand } from './run-directory-sync.command'
import { RunDirectorySyncHandler } from './run-directory-sync.handler'
import {
  IdentityProviderNotFoundException,
  DirectorySyncAlreadyRunningException,
} from '../../domain/exceptions/identity.exceptions'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository'
import type { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'
import type { KernelActorService } from '../../../kernel/application/facades/kernel-actor.service'
import type {
  IDirectoryProvider,
  IdpUser,
} from '../../infrastructure/providers/directory-provider.interface'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000002'

const makeProvider = (overrides?: Partial<IdentityProviderEntity>) => ({
  ...makeProviderDefaults(),
  ...overrides,
})

function makeProviderDefaults(): IdentityProviderEntity {
  return {
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
  }
}

describe('RunDirectorySyncHandler', () => {
  let handler: RunDirectorySyncHandler
  let providerRepo: IIdentityProviderRepository
  let mappingRepo: IIdpGroupMappingRepository
  let auditService: KernelAuditService
  let actorService: KernelActorService
  let directoryProvider: IDirectoryProvider
  let directoryProviderFactory: { create: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findPrimary: vi.fn(),
      findByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    mappingRepo = {
      findById: vi.fn(),
      findByProviderId: vi.fn(),
      listByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    auditService = { log: vi.fn() } as unknown as KernelAuditService
    actorService = {
      createActor: vi.fn(),
      createUserIdentity: vi.fn(),
      updateActorStatus: vi.fn(),
      deprovisionUserIdentity: vi.fn(),
      grantRole: vi.fn(),
      revokeAllRoleGrants: vi.fn(),
    } as unknown as KernelActorService
    directoryProvider = {
      listUsers: vi.fn(),
      listGroupsWithMembers: vi.fn(),
      testConnection: vi.fn(),
    }
    directoryProviderFactory = { create: vi.fn().mockReturnValue(directoryProvider) }

    handler = new RunDirectorySyncHandler(
      providerRepo,
      mappingRepo,
      auditService,
      actorService,
      directoryProviderFactory as never,
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

  it('provisions new users from IdP via kernel command bus', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(makeProvider({ syncStatus: 'running' }))

    const idpUsers: IdpUser[] = [
      {
        externalId: 'ext-user-001',
        email: 'alice@seta.vn',
        displayName: 'Alice',
        isActive: true,
      },
    ]
    vi.mocked(directoryProvider.listUsers).mockResolvedValue(idpUsers)
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue([])
    vi.mocked(mappingRepo.findByProviderId).mockResolvedValue([])
    vi.mocked(actorService.createActor).mockResolvedValue('new-actor-001')
    vi.mocked(actorService.createUserIdentity).mockResolvedValue('new-ui-001')

    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))

    expect(actorService.createActor).toHaveBeenCalledTimes(1)
    expect(actorService.createUserIdentity).toHaveBeenCalledTimes(1)
    expect(providerRepo.update).toHaveBeenCalledWith(
      PROVIDER_ID,
      TENANT_ID,
      expect.objectContaining({ syncStatus: 'idle' }),
    )
  })

  it('sets sync status to failed on error and rethrows', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(makeProvider({ syncStatus: 'running' }))
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
