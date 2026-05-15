import { ServiceUnavailable } from '@seta/middleware'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { OidcIdToken, SsoProvider } from '../provider'

export type GoogleSsoConfig = {
  clientId: string
  clientSecret: string
  discoveryUrl?: string
  fetchImpl?: typeof fetch
}

type Discovery = {
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  issuer: string
}

export class GoogleSsoProvider implements SsoProvider {
  readonly id = 'google' as const
  private discoveryCache: Discovery | null = null

  constructor(private readonly cfg: GoogleSsoConfig) {}

  private get discoveryUrl(): string {
    return this.cfg.discoveryUrl ?? 'https://accounts.google.com/.well-known/openid-configuration'
  }

  private get fetchImpl(): typeof fetch {
    return this.cfg.fetchImpl ?? fetch
  }

  private async discover(): Promise<Discovery> {
    if (this.discoveryCache) return this.discoveryCache
    const res = await this.fetchImpl(this.discoveryUrl)
    if (!res.ok) throw new ServiceUnavailable(`Google discovery failed: ${res.status}`)
    const json = (await res.json()) as Discovery
    this.discoveryCache = json
    return json
  }

  authorizeUrl(opts: { state: string; pkce: string; redirectUri: string }): string {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    u.searchParams.set('client_id', this.cfg.clientId)
    u.searchParams.set('redirect_uri', opts.redirectUri)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('scope', 'openid email profile')
    u.searchParams.set('state', opts.state)
    u.searchParams.set('code_challenge', opts.pkce)
    u.searchParams.set('code_challenge_method', 'S256')
    return u.toString()
  }

  async exchangeCode(opts: {
    code: string
    pkce: string
    redirectUri: string
  }): Promise<OidcIdToken> {
    const d = await this.discover()
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
      code_verifier: opts.pkce,
    })
    const res = await this.fetchImpl(d.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) throw new ServiceUnavailable(`Google token exchange failed: ${res.status}`)
    const tok = (await res.json()) as { id_token?: string }
    if (!tok.id_token) throw new ServiceUnavailable('Google token response missing id_token')

    const jwks = createRemoteJWKSet(new URL(d.jwks_uri))
    const { payload } = await jwtVerify(tok.id_token, jwks, {
      issuer: d.issuer,
      audience: this.cfg.clientId,
    })
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new ServiceUnavailable('Google id_token missing sub or email')
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
      iss: typeof payload.iss === 'string' ? payload.iss : '',
      aud: this.cfg.clientId,
    }
  }
}
