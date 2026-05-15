import { describe, expect, it } from 'vitest'
import { EntraSsoProvider } from './entra'

describe('EntraSsoProvider.authorizeUrl', () => {
  const provider = new EntraSsoProvider({
    clientId: 'entra-client',
    clientSecret: 'entra-secret',
    tenant: 'common',
  })

  it('builds an authorize URL with the required OIDC + PKCE query params', () => {
    const url = provider.authorizeUrl({
      state: 'state-abc',
      pkce: 'challenge-xyz',
      redirectUri: 'http://localhost:8080/sso/callback/entra',
    })
    const u = new URL(url)
    expect(u.origin).toBe('https://login.microsoftonline.com')
    expect(u.pathname).toBe('/common/oauth2/v2.0/authorize')
    expect(u.searchParams.get('client_id')).toBe('entra-client')
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:8080/sso/callback/entra')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('response_mode')).toBe('query')
    expect(u.searchParams.get('scope')).toBe('openid email profile')
    expect(u.searchParams.get('state')).toBe('state-abc')
    expect(u.searchParams.get('code_challenge')).toBe('challenge-xyz')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('uses configured tenant when not "common"', () => {
    const p = new EntraSsoProvider({ clientId: 'c', clientSecret: 's', tenant: 'my-tenant' })
    const url = p.authorizeUrl({
      state: 's',
      pkce: 'p',
      redirectUri: 'http://localhost/cb',
    })
    expect(new URL(url).pathname).toBe('/my-tenant/oauth2/v2.0/authorize')
  })
})
