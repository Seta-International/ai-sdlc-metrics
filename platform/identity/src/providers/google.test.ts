import { describe, expect, it } from 'vitest'
import { GoogleSsoProvider } from './google'

describe('GoogleSsoProvider.authorizeUrl', () => {
  const provider = new GoogleSsoProvider({
    clientId: 'google-client',
    clientSecret: 'google-secret',
  })

  it('builds an authorize URL with the required OIDC + PKCE query params', () => {
    const url = provider.authorizeUrl({
      state: 'state-abc',
      pkce: 'challenge-xyz',
      redirectUri: 'http://localhost:8080/sso/callback/google',
    })
    const u = new URL(url)
    expect(u.origin).toBe('https://accounts.google.com')
    expect(u.pathname).toBe('/o/oauth2/v2/auth')
    expect(u.searchParams.get('client_id')).toBe('google-client')
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:8080/sso/callback/google')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('scope')).toBe('openid email profile')
    expect(u.searchParams.get('state')).toBe('state-abc')
    expect(u.searchParams.get('code_challenge')).toBe('challenge-xyz')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
  })
})
