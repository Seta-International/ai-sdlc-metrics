import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TestIdpConnectionCommand } from './test-idp-connection.command'
import { TestIdpConnectionHandler } from './test-idp-connection.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { IDirectoryProvider } from '../../domain/ports/directory-provider.port'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeProvider: IdentityProviderEntity = {
  id: PROVIDER_ID,
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
  directoryId: 'directory-id-456',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: null,
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('TestIdpConnectionHandler', () => {
  let handler: TestIdpConnectionHandler
  let providerRepo: IIdentityProviderRepository
  let directoryProvider: IDirectoryProvider
  let auditFacade: KernelAuditFacade

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    directoryProvider = {
      testConnection: vi.fn(),
      listGroups: vi.fn(),
      listUsers: vi.fn(),
    }
    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade
    handler = new TestIdpConnectionHandler(providerRepo, directoryProvider, auditFacade)
  })

  it('returns success when connection test passes', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(fakeProvider)
    vi.mocked(directoryProvider.testConnection).mockResolvedValue({
      success: true,
      userCount: 312,
    })
    vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

    const result = await handler.execute(
      new TestIdpConnectionCommand(TENANT_ID, PROVIDER_ID, ACTOR_ID),
    )

    expect(result).toEqual({ success: true, userCount: 312 })
    expect(directoryProvider.testConnection).toHaveBeenCalledWith(
      'microsoft',
      'client-id-123',
      'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
      'directory-id-456',
    )
  })

  it('returns failure with error message when connection test fails', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(fakeProvider)
    vi.mocked(directoryProvider.testConnection).mockResolvedValue({
      success: false,
      error: 'Invalid client credentials',
    })
    vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

    const result = await handler.execute(
      new TestIdpConnectionCommand(TENANT_ID, PROVIDER_ID, ACTOR_ID),
    )

    expect(result).toEqual({ success: false, error: 'Invalid client credentials' })
  })

  it('throws when provider not found', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new TestIdpConnectionCommand(TENANT_ID, PROVIDER_ID, ACTOR_ID)),
    ).rejects.toThrow('Identity provider not found')
  })
})
