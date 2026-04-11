export interface FutureTokenClaims {
  actorId: string
  tenantId: string
  roles: string[]
  provider: string
  displayName: string
  email?: string
}

/**
 * Client-side JWT decode — extracts payload claims without signature verification.
 * Signature is verified server-side by JwtService. This is for UI rendering only.
 *
 * Returns null if the token is malformed.
 */
export function parseToken(token: string): FutureTokenClaims | null {
  try {
    if (!token || !token.includes('.')) {
      return null
    }

    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    // Base64url decode the payload (second part)
    const payload = parts[1]!
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded)
    const claims = JSON.parse(json) as Record<string, unknown>

    return {
      actorId: claims['sub'] as string,
      tenantId: claims['tid'] as string,
      roles: (claims['roles'] as string[]) ?? [],
      provider: (claims['provider'] as string) ?? 'unknown',
      displayName: (claims['displayName'] as string) ?? '',
      email: claims['email'] as string | undefined,
    }
  } catch {
    return null
  }
}
