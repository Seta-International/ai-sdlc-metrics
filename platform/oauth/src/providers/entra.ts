import { type AuthenticationResult, ConfidentialClientApplication } from '@azure/msal-node'
import { ServiceUnavailable } from '@seta/middleware'
import { LRUCache } from 'lru-cache'
import type { OAuthProvider } from '../provider'
import type { TokenBundle } from '../vault'

class EntraNoResultError extends ServiceUnavailable {
  constructor() {
    super('Entra returned no AuthenticationResult')
    this.message = 'Entra returned no AuthenticationResult'
  }
}

/**
 * Subset of MSAL Node's ConfidentialClientApplication that we depend on.
 * Lets tests inject a minimal fake CCA without constructing the real one.
 */
export type CcaLike = {
  acquireTokenByClientCredential(input: { scopes: string[] }): Promise<AuthenticationResult | null>
  acquireTokenOnBehalfOf(input: {
    oboAssertion: string
    scopes: string[]
  }): Promise<AuthenticationResult | null>
  acquireTokenByRefreshToken(input: {
    refreshToken: string
    scopes: string[]
  }): Promise<AuthenticationResult | null>
}

export type EntraConfig = {
  clientId: string
  clientSecret: string
  /** Optional override — primarily for tests. */
  ccaFactory?: (authority: string) => CcaLike
}

export class EntraProvider implements OAuthProvider {
  readonly id = 'entra'
  private cache = new LRUCache<string, CcaLike>({ max: 256, ttl: 60 * 60 * 1000 })

  constructor(private cfg: EntraConfig) {}

  private cca(tenantId: string): CcaLike {
    const cached = this.cache.get(tenantId)
    if (cached) return cached
    const authority = `https://login.microsoftonline.com/${tenantId}/v2.0`
    const cca = this.cfg.ccaFactory
      ? this.cfg.ccaFactory(authority)
      : (new ConfidentialClientApplication({
          auth: { clientId: this.cfg.clientId, clientSecret: this.cfg.clientSecret, authority },
        }) as unknown as CcaLike)
    this.cache.set(tenantId, cca)
    return cca
  }

  private toBundle(res: AuthenticationResult | null, scopes: string[]): TokenBundle {
    if (!res) throw new EntraNoResultError()
    // MSAL sets res.tenantId to "" for client-credentials flow and res.account is null.
    // Decode tid from the JWT payload directly — it's always present in real tokens.
    let jwtTid: string | undefined
    try {
      const part = res.accessToken.split('.')[1]
      if (part) {
        const payload = JSON.parse(Buffer.from(part, 'base64url').toString())
        if (typeof payload.tid === 'string' && payload.tid) jwtTid = payload.tid
      }
    } catch {
      // fake token in tests — fall through to MSAL fields
    }
    return {
      accessToken: res.accessToken,
      refreshToken: null,
      scopes: res.scopes && res.scopes.length > 0 ? [...res.scopes] : scopes,
      expiresAt: res.expiresOn ?? new Date(Date.now() + 3300_000),
      meta: {
        homeAccountId: res.account?.homeAccountId,
        tid: jwtTid ?? res.account?.tenantId ?? res.tenantId,
        idToken: res.idToken,
      },
    }
  }

  buildAdminConsentUrl(input: {
    scopes: string[]
    redirectUri: string
    state: string
    tenantHint?: string
  }): string {
    const u = new URL(
      `https://login.microsoftonline.com/${input.tenantHint ?? 'organizations'}/v2.0/adminconsent`,
    )
    u.searchParams.set('client_id', this.cfg.clientId)
    u.searchParams.set('redirect_uri', input.redirectUri)
    u.searchParams.set('scope', 'https://graph.microsoft.com/.default')
    u.searchParams.set('state', input.state)
    return u.toString()
  }

  async completeAdminConsent(input: { tenantQueryParam: string; state: string }): Promise<{
    tenantId: string
    appOnlyBundle: TokenBundle
  }> {
    const appOnlyBundle = await this.acquireAppOnly(input.tenantQueryParam, [
      'https://graph.microsoft.com/.default',
    ])
    const tid = (appOnlyBundle.meta.tid as string | undefined) || input.tenantQueryParam
    return { tenantId: tid, appOnlyBundle }
  }

  async acquireAppOnly(tenantId: string, scopes: string[]): Promise<TokenBundle> {
    const res = await this.cca(tenantId).acquireTokenByClientCredential({ scopes })
    return this.toBundle(res, scopes)
  }

  async acquireOnBehalfOf(input: {
    tenantId: string
    userAssertion: string
    scopes: string[]
  }): Promise<TokenBundle> {
    const res = await this.cca(input.tenantId).acquireTokenOnBehalfOf({
      oboAssertion: input.userAssertion,
      scopes: input.scopes,
    })
    return this.toBundle(res, input.scopes)
  }

  async refresh(bundle: TokenBundle, scopes: string[]): Promise<TokenBundle> {
    if (!bundle.refreshToken) {
      const tid = bundle.meta.tid as string
      return this.acquireAppOnly(tid, scopes)
    }
    const res = await this.cca(bundle.meta.tid as string).acquireTokenByRefreshToken({
      refreshToken: bundle.refreshToken,
      scopes,
    })
    return this.toBundle(res, scopes)
  }
}
