import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import type { MsGraphTokenAcquirer } from './microsoft/ms-graph-token-acquirer'
import { MicrosoftGraphProvider } from './microsoft-graph.provider'

describe('MicrosoftGraphProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let acquirer: MsGraphTokenAcquirer
  const cred = {
    tenantId: 't1',
    clientId: 'c',
    clientSecretRef: 'arn',
    tenantAdId: 'aad',
    scopes: ['https://graph.microsoft.com/.default'],
  } as MsGraphCredentialEntity
  const providerEntity = {} as IdentityProviderEntity

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    acquirer = { acquire: vi.fn().mockResolvedValue('tok') } as unknown as MsGraphTokenAcquirer
  })

  it('listUsers paginates @odata.nextLink and maps fields', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [
            { id: 'u1', mail: 'a@x.com', displayName: 'A', accountEnabled: true },
            {
              id: 'u2',
              mail: null,
              userPrincipalName: 'b@x.com',
              displayName: 'B',
              accountEnabled: false,
            },
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skip=2',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [{ id: 'u3', mail: 'c@x.com', displayName: 'C', accountEnabled: true }],
        }),
      })

    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)
    const users = await provider.listUsers()

    expect(users.map((u) => u.externalId)).toEqual(['u1', 'u2', 'u3'])
    expect(users[1]?.email).toBe('b@x.com')
    expect(users[1]?.isActive).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('listGroupsWithMembers fetches each group members', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [{ id: 'g1', displayName: 'Marketing' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [{ id: 'u1' }, { id: 'u2' }] }),
      })

    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)

    await expect(provider.listGroupsWithMembers()).resolves.toEqual([
      { externalGroupId: 'g1', displayName: 'Marketing', memberExternalIds: ['u1', 'u2'] },
    ])
  })

  it('testConnection returns ok:true on 200', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ value: [] }) })
    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)

    await expect(provider.testConnection()).resolves.toEqual({ ok: true })
  })

  it('testConnection returns ok:false with body on 403', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '{"error":"Forbidden"}',
    })
    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)

    await expect(provider.testConnection()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('403'),
    })
  })
})
