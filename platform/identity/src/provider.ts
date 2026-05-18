export type OidcIdToken = {
  sub: string
  email: string
  name?: string
  picture?: string
  iss: string
  aud: string
}

export interface SsoProvider {
  readonly id: 'entra' | 'google'
  authorizeUrl(opts: {
    state: string
    pkce: string
    redirectUri: string
    loginHint?: string
  }): string
  exchangeCode(opts: { code: string; pkce: string; redirectUri: string }): Promise<OidcIdToken>
}
