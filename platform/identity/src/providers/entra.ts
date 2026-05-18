import { ServiceUnavailable } from '@seta/middleware'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { OidcIdToken, SsoProvider } from '../provider'

export type EntraSsoConfig = {
  clientId: string
  clientSecret: string
  entraTenantId: string
  discoveryUrl?: string
  fetchImpl?: typeof fetch
}

type Discovery = {
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  issuer: string
}

export class EntraSsoProvider implements SsoProvider {
  readonly id = 'entra' as const
  private discoveryCache: Discovery | null = null

  constructor(private readonly cfg: EntraSsoConfig) {}

  private get discoveryUrl(): string {
    return (
      this.cfg.discoveryUrl ??
      `https://login.microsoftonline.com/${this.cfg.entraTenantId}/v2.0/.well-known/openid-configuration`
    )
  }

  private get fetchImpl(): typeof fetch {
    return this.cfg.fetchImpl ?? fetch
  }

  private async discover(): Promise<Discovery> {
    if (this.discoveryCache) return this.discoveryCache
    const res = await this.fetchImpl(this.discoveryUrl)
    if (!res.ok) throw new ServiceUnavailable(`Entra discovery failed: ${res.status}`)
    const json = (await res.json()) as Discovery
    this.discoveryCache = json
    return json
  }

  authorizeUrl(opts: {
    state: string
    pkce: string
    redirectUri: string
    loginHint?: string
  }): string {
    const u = new URL(
      `https://login.microsoftonline.com/${this.cfg.entraTenantId}/oauth2/v2.0/authorize`,
    )
    u.searchParams.set('client_id', this.cfg.clientId)
    u.searchParams.set('redirect_uri', opts.redirectUri)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('response_mode', 'query')
    u.searchParams.set('scope', 'openid email profile')
    u.searchParams.set('state', opts.state)
    u.searchParams.set('code_challenge', opts.pkce)
    u.searchParams.set('code_challenge_method', 'S256')
    if (opts.loginHint) u.searchParams.set('login_hint', opts.loginHint)
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
    if (!res.ok) throw new ServiceUnavailable(`Entra token exchange failed: ${res.status}`)
    const tok = (await res.json()) as { id_token?: string }
    if (!tok.id_token) throw new ServiceUnavailable('Entra token response missing id_token')

    const jwks = createRemoteJWKSet(new URL(d.jwks_uri))
    const { payload } = await jwtVerify(tok.id_token, jwks, {
      issuer: d.issuer,
      audience: this.cfg.clientId,
    })
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new ServiceUnavailable('Entra id_token missing sub or email')
    }
    const out: OidcIdToken = {
      sub: payload.sub,
      email: payload.email,
      iss: typeof payload.iss === 'string' ? payload.iss : '',
      aud: this.cfg.clientId,
    }
    if (typeof payload.name === 'string') out.name = payload.name
    if (typeof payload.picture === 'string') out.picture = payload.picture
    return out
  }
}
