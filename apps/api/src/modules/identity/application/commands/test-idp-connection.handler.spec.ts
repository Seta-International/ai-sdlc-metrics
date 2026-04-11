import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TestIdpConnectionCommand } from './test-idp-connection.command'
import { TestIdpConnectionHandler } from './test-idp-connection.handler'
import { IdentityProviderNotFoundException } from '../../domain/exceptions/identity.exceptions'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type {
  IDirectoryProviderFactory,
  IDirectoryProvider,
} from '../../infrastructure/providers/directory-provider.interface'
import type { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000003'

const makeProviderEntity = () => ({
  id: PROVIDER_ID,
  tenantId: TENANT_ID,
  providerType: 'microsoft' as const,
  displayName: 'SETA Entra',
  clientId: 'client-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test',
  directoryId: 'dir-123',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: null,
  syncStatus: 'idle' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('TestIdpConnectionHandler', () => {
  let handler: TestIdpConnectionHandler
  let providerRepo: IIdentityProviderRepository
  let directoryProviderFactory: IDirectoryProviderFactory
  let auditService: KernelAuditService
  let mockDirectoryProvider: IDirectoryProvider

  beforeEach(() => {
    mockDirectoryProvider = {
      listUsers: vi.fn(),
      listGroupsWithMembers: vi.fn(),
      testConnection: vi.fn(),
    }
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    directoryProviderFactory = {
      create: vi.fn().mockReturnValue(mockDirectoryProvider),
    }
    auditService = { log: vi.fn() } as unknown as KernelAuditService
    handler = new TestIdpConnectionHandler(providerRepo, directoryProviderFactory, auditService)
  })

  it('returns success result when connection passes', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProviderEntity())
    vi.mocked(mockDirectoryProvider.testConnection).mockResolvedValue({
      success: true,
      userCount: 42,
    })

    const result = await handler.execute(
      new TestIdpConnectionCommand(TENANT_ID, PROVIDER_ID, ACTOR_ID),
    )

    expect(result.success).toBe(true)
    expect(result.userCount).toBe(42)
    expect(directoryProviderFactory.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: PROVIDER_ID, tenantId: TENANT_ID }),
    )
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        eventType: 'identity_provider.connection_tested',
        module: 'identity',
        subjectId: PROVIDER_ID,
      }),
    )
  })

  it('returns failure result with error message when connection fails', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProviderEntity())
    vi.mocked(mockDirectoryProvider.testConnection).mockResolvedValue({
      success: false,
      error: 'Authentication failed: invalid credentials',
    })

    const result = await handler.execute(
      new TestIdpConnectionCommand(TENANT_ID, PROVIDER_ID, ACTOR_ID),
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Authentication failed: invalid credentials')
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'identity_provider.connection_tested',
        payload: expect.objectContaining({ success: false }),
      }),
    )
  })

  it('throws IdentityProviderNotFoundException when provider is not found', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new TestIdpConnectionCommand(TENANT_ID, PROVIDER_ID, ACTOR_ID)),
    ).rejects.toThrow(IdentityProviderNotFoundException)

    expect(directoryProviderFactory.create).not.toHaveBeenCalled()
    expect(auditService.log).not.toHaveBeenCalled()
  })
})
