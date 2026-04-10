export interface FutureTokenClaims {
  oid: string // Entra Object ID → maps to actor.sso_subject
  tid: string // Entra Tenant ID
  preferred_username: string
  name: string
  roles: string[]
}

export function parseToken(_idToken: string): FutureTokenClaims {
  // TODO: decode the Entra OIDC JWT and extract claims
  // For now, return a stub — real implementation uses MSAL token claims
  throw new Error('parseToken: not yet implemented')
}
