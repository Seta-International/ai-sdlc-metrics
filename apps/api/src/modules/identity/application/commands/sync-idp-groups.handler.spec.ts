import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncIdpGroupsCommand } from './sync-idp-groups.command'
import { SyncIdpGroupsHandler } from './sync-idp-groups.handler'
import { IdentityProviderNotFoundException } from '../../domain/exceptions/identity.exceptions'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'
import type {
  IDirectoryProvider,
  IDirectoryProviderFactory,
} from '../../domain/ports/directory-provider.factory.port'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

const makeProvider = (overrides?: Partial<IdentityProviderEntity>): IdentityProviderEntity => ({
  id: PROVIDER_ID,
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'c',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test',
  directoryId: 'dir',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: null,
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('SyncIdpGroupsHandler', () => {
  let handler: SyncIdpGroupsHandler
  let providerRepo: IIdentityProviderRepository
  let directoryProvider: IDirectoryProvider
  let directoryProviderFactory: IDirectoryProviderFactory
  let auditService: KernelAuditService

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    directoryProvider = {
      listUsers: vi.fn(),
      listGroupsWithMembers: vi.fn(),
      testConnection: vi.fn(),
    }
    directoryProviderFactory = {
      create: vi.fn().mockReturnValue(directoryProvider),
    }
    auditService = { log: vi.fn() } as unknown as KernelAuditService

    handler = new SyncIdpGroupsHandler(providerRepo, directoryProviderFactory, auditService)
  })

  it('fetches groups from IdP and returns them with providerId', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(makeProvider())
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue([
      {
        externalGroupId: 'aad-group-001',
        displayName: 'Engineering',
        memberExternalIds: ['user-1', 'user-2', 'user-3'],
      },
      {
        externalGroupId: 'aad-group-002',
        displayName: 'Management',
        memberExternalIds: ['user-4'],
      },
    ])

    const result = await handler.execute(new SyncIdpGroupsCommand(TENANT_ID, ACTOR_ID))

    expect(result.providerId).toBe(PROVIDER_ID)
    expect(result.groups).toHaveLength(2)
    expect(result.groups[0]).toEqual({
      externalGroupId: 'aad-group-001',
      displayName: 'Engineering',
      memberCount: 3,
    })
    expect(result.groups[1]).toEqual({
      externalGroupId: 'aad-group-002',
      displayName: 'Management',
      memberCount: 1,
    })
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'idp_groups.synced',
        module: 'identity',
        subjectId: PROVIDER_ID,
      }),
    )
  })

  it('throws IdentityProviderNotFoundException when no provider configured for tenant', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(null)

    await expect(handler.execute(new SyncIdpGroupsCommand(TENANT_ID, ACTOR_ID))).rejects.toThrow(
      IdentityProviderNotFoundException,
    )

    expect(directoryProviderFactory.create).not.toHaveBeenCalled()
  })
})
