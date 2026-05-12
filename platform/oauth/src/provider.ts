import type { TokenBundle } from './vault.js'

export interface OAuthProvider {
  /** Stable identifier — 'entra', 'google', 'atlassian'. */
  id: string

  buildAdminConsentUrl(input: {
    scopes: string[]
    redirectUri: string
    state: string
    tenantHint?: string
  }): string

  completeAdminConsent(input: {
    tenantQueryParam: string
    state: string
  }): Promise<{ tenantId: string; appOnlyBundle: TokenBundle }>

  acquireAppOnly(tenantId: string, scopes: string[]): Promise<TokenBundle>

  acquireOnBehalfOf(input: {
    tenantId: string
    userAssertion: string
    scopes: string[]
  }): Promise<TokenBundle>

  refresh(bundle: TokenBundle, scopes: string[]): Promise<TokenBundle>
}
