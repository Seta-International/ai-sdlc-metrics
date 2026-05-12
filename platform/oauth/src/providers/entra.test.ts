import { describe, expect, it, vi } from 'vitest'
import { EntraProvider } from './entra'

describe('EntraProvider', () => {
  it('acquireAppOnly normalizes MSAL AuthenticationResult to a TokenBundle', async () => {
    const fakeCca = {
      acquireTokenByClientCredential: vi.fn().mockResolvedValue({
        accessToken: 'at-1',
        expiresOn: new Date(Date.now() + 3600_000),
        scopes: ['Tasks.Read.All', 'Group.Read.All'],
        account: null,
        tenantId: 'tid-1',
      }),
    }
    const provider = new EntraProvider({
      clientId: 'client-id',
      clientSecret: 'secret',
      ccaFactory: () => fakeCca as never,
    })
    const bundle = await provider.acquireAppOnly('tid-1', ['Tasks.Read.All', 'Group.Read.All'])
    expect(bundle.accessToken).toBe('at-1')
    expect(bundle.refreshToken).toBeNull()
    expect(bundle.scopes).toEqual(['Tasks.Read.All', 'Group.Read.All'])
    expect(bundle.meta).toMatchObject({ tid: 'tid-1' })
    expect(fakeCca.acquireTokenByClientCredential).toHaveBeenCalledWith({
      scopes: ['Tasks.Read.All', 'Group.Read.All'],
    })
  })

  it('acquireOnBehalfOf passes user assertion + normalizes account meta', async () => {
    const fakeCca = {
      acquireTokenOnBehalfOf: vi.fn().mockResolvedValue({
        accessToken: 'obo-1',
        expiresOn: new Date(Date.now() + 3600_000),
        scopes: ['Tasks.ReadWrite'],
        account: { homeAccountId: 'home-1', tenantId: 'tid-1' },
      }),
    }
    const provider = new EntraProvider({
      clientId: 'client-id',
      clientSecret: 'secret',
      ccaFactory: () => fakeCca as never,
    })
    const bundle = await provider.acquireOnBehalfOf({
      tenantId: 'tid-1',
      userAssertion: 'user-jwt',
      scopes: ['Tasks.ReadWrite'],
    })
    expect(bundle.accessToken).toBe('obo-1')
    expect(bundle.meta).toMatchObject({ homeAccountId: 'home-1', tid: 'tid-1' })
    expect(fakeCca.acquireTokenOnBehalfOf).toHaveBeenCalledWith({
      oboAssertion: 'user-jwt',
      scopes: ['Tasks.ReadWrite'],
    })
  })

  it('ccaFactory is cached by tenantId (LRU)', async () => {
    let calls = 0
    const provider = new EntraProvider({
      clientId: 'c',
      clientSecret: 's',
      ccaFactory: () => {
        calls += 1
        return {
          acquireTokenByClientCredential: async () => ({
            accessToken: 'a',
            expiresOn: new Date(Date.now() + 60_000),
            scopes: [],
            account: null,
            tenantId: 'x',
          }),
        } as never
      },
    })
    await provider.acquireAppOnly('tid-1', [])
    await provider.acquireAppOnly('tid-1', [])
    await provider.acquireAppOnly('tid-2', [])
    expect(calls).toBe(2) // one per tenant id
  })

  it('buildAdminConsentUrl uses /v2.0/adminconsent with .default scope', () => {
    const provider = new EntraProvider({
      clientId: 'client-id',
      clientSecret: 'secret',
      ccaFactory: () => ({}) as never,
    })
    const url = provider.buildAdminConsentUrl({
      scopes: ['ignored-by-default-scope'],
      redirectUri: 'https://api.example.com/oauth/entra/callback',
      state: 'abc123',
    })
    expect(url).toContain('https://login.microsoftonline.com/organizations/v2.0/adminconsent')
    expect(url).toContain('client_id=client-id')
    expect(url).toContain('scope=https%3A%2F%2Fgraph.microsoft.com%2F.default')
    expect(url).toContain('state=abc123')
    expect(url).toContain('redirect_uri=https%3A%2F%2Fapi.example.com%2Foauth%2Fentra%2Fcallback')
  })

  it('buildAdminConsentUrl uses given tenantHint when provided', () => {
    const provider = new EntraProvider({
      clientId: 'c',
      clientSecret: 's',
      ccaFactory: () => ({}) as never,
    })
    const url = provider.buildAdminConsentUrl({
      scopes: [],
      redirectUri: 'https://api.example.com/cb',
      state: 's',
      tenantHint: 'tid-xyz',
    })
    expect(url).toContain('https://login.microsoftonline.com/tid-xyz/v2.0/adminconsent')
  })

  it('refresh delegates to acquireAppOnly when no refresh token (app-only)', async () => {
    const fakeCca = {
      acquireTokenByClientCredential: vi.fn().mockResolvedValue({
        accessToken: 'new-app',
        expiresOn: new Date(Date.now() + 3600_000),
        scopes: ['Tasks.Read.All'],
        account: null,
        tenantId: 'tid-app',
      }),
    }
    const provider = new EntraProvider({
      clientId: 'c',
      clientSecret: 's',
      ccaFactory: () => fakeCca as never,
    })
    const refreshed = await provider.refresh(
      {
        accessToken: 'old',
        refreshToken: null,
        scopes: ['Tasks.Read.All'],
        expiresAt: new Date(0),
        meta: { tid: 'tid-app' },
      },
      ['Tasks.Read.All'],
    )
    expect(refreshed.accessToken).toBe('new-app')
    expect(fakeCca.acquireTokenByClientCredential).toHaveBeenCalled()
  })

  it('refresh delegates to acquireTokenByRefreshToken when refresh token present (delegated)', async () => {
    const fakeCca = {
      acquireTokenByRefreshToken: vi.fn().mockResolvedValue({
        accessToken: 'new-delegated',
        expiresOn: new Date(Date.now() + 3600_000),
        scopes: ['Tasks.ReadWrite'],
        account: { homeAccountId: 'home-1', tenantId: 'tid-user' },
      }),
    }
    const provider = new EntraProvider({
      clientId: 'c',
      clientSecret: 's',
      ccaFactory: () => fakeCca as never,
    })
    const refreshed = await provider.refresh(
      {
        accessToken: 'old',
        refreshToken: 'rt',
        scopes: ['Tasks.ReadWrite'],
        expiresAt: new Date(0),
        meta: { tid: 'tid-user', homeAccountId: 'home-1' },
      },
      ['Tasks.ReadWrite'],
    )
    expect(refreshed.accessToken).toBe('new-delegated')
    expect(fakeCca.acquireTokenByRefreshToken).toHaveBeenCalledWith({
      refreshToken: 'rt',
      scopes: ['Tasks.ReadWrite'],
    })
  })

  it('throws ServiceUnavailable if MSAL returns null AuthenticationResult', async () => {
    const fakeCca = {
      acquireTokenByClientCredential: vi.fn().mockResolvedValue(null),
    }
    const provider = new EntraProvider({
      clientId: 'c',
      clientSecret: 's',
      ccaFactory: () => fakeCca as never,
    })
    await expect(provider.acquireAppOnly('tid', [])).rejects.toThrow(/Entra returned no/i)
  })
})
