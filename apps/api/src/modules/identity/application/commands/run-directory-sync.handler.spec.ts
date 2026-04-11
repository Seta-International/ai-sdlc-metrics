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
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type {
  IDirectoryProvider,
  IdpUser,
  IdpGroup,
} from '../../infrastructure/providers/directory-provider.interface'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000002'

const makeProvider = (overrides?: Partial<ReturnType<typeof makeProviderDefaults>>) => ({
  ...makeProviderDefaults(),
  ...overrides,
})

function makeProviderDefaults() {
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
  let auditRepo: IAuditEventRepository
  let commandBus: CommandBus
  let directoryProvider: IDirectoryProvider
  let directoryProviderFactory: { create: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    mappingRepo = {
      findByProviderId: vi.fn(),
      findByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    auditRepo = { insert: vi.fn() }
    commandBus = { execute: vi.fn() } as unknown as CommandBus
    directoryProvider = {
      listUsers: vi.fn(),
      listGroupsWithMembers: vi.fn(),
    }
    directoryProviderFactory = { create: vi.fn().mockReturnValue(directoryProvider) }

    handler = new RunDirectorySyncHandler(
      providerRepo,
      mappingRepo,
      auditRepo,
      commandBus,
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

    vi.mocked(commandBus.execute)
      .mockResolvedValueOnce({ id: 'new-actor-001' })
      .mockResolvedValueOnce({ id: 'new-ui-001' })

    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))

    expect(commandBus.execute).toHaveBeenCalledTimes(2)
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
