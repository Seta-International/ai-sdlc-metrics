import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetIdentityProviderQuery } from './get-identity-provider.query'
import { GetIdentityProviderHandler } from './get-identity-provider.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000003'

describe('GetIdentityProviderHandler', () => {
  let handler: GetIdentityProviderHandler
  let providerRepo: IIdentityProviderRepository

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    handler = new GetIdentityProviderHandler(providerRepo)
  })

  it('returns a DTO without clientSecretRef when primary provider exists', async () => {
    const lastSyncAt = new Date('2026-01-01T00:00:00.000Z')
    vi.mocked(providerRepo.findPrimary).mockResolvedValue({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      providerType: 'microsoft',
      displayName: 'SETA Entra',
      clientId: 'client-123',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:secret-key',
      directoryId: 'dir-456',
      isPrimary: true,
      syncEnabled: true,
      lastSyncAt,
      syncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(new GetIdentityProviderQuery(TENANT_ID))

    expect(result).not.toBeNull()
    expect(result!.id).toBe(PROVIDER_ID)
    expect(result!.providerType).toBe('microsoft')
    expect(result!.displayName).toBe('SETA Entra')
    expect(result!.clientId).toBe('client-123')
    expect(result!.directoryId).toBe('dir-456')
    expect(result!.isPrimary).toBe(true)
    expect(result!.syncEnabled).toBe(true)
    expect(result!.lastSyncAt).toBe('2026-01-01T00:00:00.000Z')
    expect(result!.syncStatus).toBe('idle')
    // Ensure clientSecretRef is NOT present in the DTO
    expect('clientSecretRef' in result!).toBe(false)
  })

  it('returns null when no primary provider exists', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(null)

    const result = await handler.execute(new GetIdentityProviderQuery(TENANT_ID))

    expect(result).toBeNull()
  })

  it('maps lastSyncAt to null when it is null', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      providerType: 'google',
      displayName: 'Google Workspace',
      clientId: 'client-789',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:secret-key',
      directoryId: null,
      isPrimary: true,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(new GetIdentityProviderQuery(TENANT_ID))

    expect(result).not.toBeNull()
    expect(result!.lastSyncAt).toBeNull()
    expect(result!.directoryId).toBeNull()
  })
})
