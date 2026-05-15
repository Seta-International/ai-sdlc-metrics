import type { OidcIdToken, SsoProvider } from '../../src/provider'

export class MockSsoProvider implements SsoProvider {
  readonly id: 'entra' | 'google'
  constructor(
    id: 'entra' | 'google',
    private readonly fixture: OidcIdToken,
  ) {
    this.id = id
  }

  authorizeUrl(opts: { state: string; pkce: string; redirectUri: string }): string {
    const u = new URL(`https://mock-${this.id}.test/authorize`)
    u.searchParams.set('state', opts.state)
    u.searchParams.set('code_challenge', opts.pkce)
    u.searchParams.set('redirect_uri', opts.redirectUri)
    return u.toString()
  }

  async exchangeCode(_opts: {
    code: string
    pkce: string
    redirectUri: string
  }): Promise<OidcIdToken> {
    return this.fixture
  }
}
