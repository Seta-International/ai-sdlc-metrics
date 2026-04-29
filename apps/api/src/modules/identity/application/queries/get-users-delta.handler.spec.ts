import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetUsersDeltaHandler } from './get-users-delta.handler'
import { GetUsersDeltaQuery } from './get-users-delta.query'
import type { IMsGraphCredentialRepository } from '../../domain/repositories/ms-graph-credential.repository'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { MsGraphTokenAcquirer } from '../../infrastructure/providers/microsoft/ms-graph-token-acquirer'
import type { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const mockCredential: MsGraphCredentialEntity = {
  tenantAdId: 'aad',
  clientId: 'c1',
  clientSecretRef: 'ref',
  scopes: [],
  status: 'active',
} as unknown as MsGraphCredentialEntity

const mockProvider: IdentityProviderEntity = {
  id: 'p1',
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  syncStatus: 'idle',
  lastSyncAt: null,
} as unknown as IdentityProviderEntity

describe('GetUsersDeltaHandler', () => {
  let handler: GetUsersDeltaHandler
  let credentialRepo: IMsGraphCredentialRepository
  let providerRepo: IIdentityProviderRepository
  let tokenAcquirer: MsGraphTokenAcquirer

  beforeEach(() => {
    credentialRepo = {
      get: vi.fn().mockResolvedValue(mockCredential),
    } as unknown as IMsGraphCredentialRepository
    providerRepo = {
      findPrimary: vi.fn().mockResolvedValue(mockProvider),
    } as unknown as IIdentityProviderRepository
    tokenAcquirer = {
      acquire: vi.fn().mockResolvedValue('token'),
    } as unknown as MsGraphTokenAcquirer

    handler = new GetUsersDeltaHandler(credentialRepo, providerRepo, tokenAcquirer)

    globalThis.fetch = vi.fn() as unknown as typeof fetch
  })

  it('returns null when MS365 is not connected (no credential)', async () => {
    vi.mocked(credentialRepo.get).mockResolvedValue(null)
    const result = await handler.execute(new GetUsersDeltaQuery(TENANT_ID, undefined))
    expect(result).toBeNull()
  })

  it('returns null when credential status is inactive', async () => {
    vi.mocked(credentialRepo.get).mockResolvedValue({
      ...mockCredential,
      status: 'inactive',
    } as unknown as MsGraphCredentialEntity)
    const result = await handler.execute(new GetUsersDeltaQuery(TENANT_ID, undefined))
    expect(result).toBeNull()
  })

  it('returns null when no identity provider found', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(null)
    const result = await handler.execute(new GetUsersDeltaQuery(TENANT_ID, undefined))
    expect(result).toBeNull()
  })

  it('calls listUsersDelta and returns the result', async () => {
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [{ id: 'u1', displayName: 'User', mail: 'u@co.com', accountEnabled: true }],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/users/delta?$deltaToken=abc',
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' } as Response)

    const result = await handler.execute(new GetUsersDeltaQuery(TENANT_ID, undefined))

    expect(result).not.toBeNull()
    expect(result!.users).toHaveLength(1)
    expect(result!.nextDeltaToken).toContain('deltaToken')
  })
})
