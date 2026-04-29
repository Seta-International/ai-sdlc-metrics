import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('MicrosoftGraphProvider.listUsersDelta', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let acquirer: MsGraphTokenAcquirer
  const cred = {
    tenantId: 't1',
    clientId: 'c1',
    clientSecretRef: 'ref1',
    tenantAdId: 'aad-t1',
    scopes: [],
  } as MsGraphCredentialEntity
  const providerEntity = {} as IdentityProviderEntity

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    acquirer = {
      acquire: vi.fn().mockResolvedValue('mock-token'),
    } as unknown as MsGraphTokenAcquirer
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns users and nextDeltaToken on first run (no deltaToken)', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [
            {
              id: 'u1',
              displayName: 'Alice',
              mail: 'alice@co.com',
              accountEnabled: true,
              jobTitle: 'Engineer',
              department: 'Eng',
              officeLocation: 'HCM',
              mobilePhone: '0901',
              businessPhones: ['0902'],
            },
          ],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/users/delta?$deltaToken=tok123',
        }),
      })
      .mockResolvedValueOnce({
        // manager fetch for u1
        ok: true,
        json: async () => ({ id: 'mgr1' }),
      })

    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)
    const result = await provider.listUsersDelta()

    expect(result.users).toHaveLength(1)
    expect(result.users[0]!.externalId).toBe('u1')
    expect(result.users[0]!.managerMsId).toBe('mgr1')
    expect(result.nextDeltaToken).toBe(
      'https://graph.microsoft.com/v1.0/users/delta?$deltaToken=tok123',
    )
    expect(result.deletedIds).toEqual([])
  })

  it('extracts deleted users with @removed flag', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [{ id: 'd1', '@removed': { reason: 'deleted' } }],
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/users/delta?$deltaToken=tok2',
      }),
    })

    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)
    const result = await provider.listUsersDelta('https://prev-delta-url')

    expect(result.deletedIds).toEqual(['d1'])
    expect(result.users).toHaveLength(0)
  })

  it('throws on 410 Gone (expired delta token)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 410,
      text: async () => 'Gone',
    })

    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)
    await expect(provider.listUsersDelta('expired-token')).rejects.toThrow('Graph 410')
  })

  it('skips manager link when manager returns 404', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [{ id: 'u2', displayName: 'Bob', accountEnabled: true }],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/users/delta?$deltaToken=tok3',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      })

    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)
    const result = await provider.listUsersDelta()

    expect(result.users[0]!.managerMsId).toBeNull()
  })

  it('paginates @odata.nextLink before collecting @odata.deltaLink', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [{ id: 'u1', displayName: 'A', accountEnabled: true }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users/delta?$skiptoken=abc',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [{ id: 'u2', displayName: 'B', accountEnabled: true }],
          '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/users/delta?$deltaToken=final',
        }),
      })
      .mockResolvedValue({ ok: false, status: 404, text: async () => '' })

    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)
    const result = await provider.listUsersDelta()

    expect(result.users).toHaveLength(2)
    expect(result.nextDeltaToken).toContain('final')
  })
})
