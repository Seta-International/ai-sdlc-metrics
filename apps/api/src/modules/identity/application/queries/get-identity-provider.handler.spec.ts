import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetIdentityProviderQuery } from './get-identity-provider.query'
import { GetIdentityProviderHandler } from './get-identity-provider.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository.port'
import type { IdentityProvider } from '../../domain/repositories/identity-provider.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeProvider: IdentityProvider = {
  id: '01900000-0000-7000-8000-000000000010',
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
  directoryId: 'directory-id-456',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: new Date('2026-04-10T10:00:00Z'),
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('GetIdentityProviderHandler', () => {
  let handler: GetIdentityProviderHandler
  let providerRepo: IIdentityProviderRepository

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    handler = new GetIdentityProviderHandler(providerRepo)
  })

  it('returns provider DTO when one exists for tenant', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(fakeProvider)

    const result = await handler.execute(new GetIdentityProviderQuery(TENANT_ID))

    expect(result).toEqual({
      id: fakeProvider.id,
      providerType: 'microsoft',
      displayName: 'SETA Entra',
      clientId: 'client-id-123',
      directoryId: 'directory-id-456',
      isPrimary: true,
      syncEnabled: true,
      lastSyncAt: '2026-04-10T10:00:00.000Z',
      syncStatus: 'idle',
    })
    expect(result).not.toHaveProperty('clientSecretRef')
  })

  it('returns null when no provider configured for tenant', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(null)

    const result = await handler.execute(new GetIdentityProviderQuery(TENANT_ID))

    expect(result).toBeNull()
  })
})
