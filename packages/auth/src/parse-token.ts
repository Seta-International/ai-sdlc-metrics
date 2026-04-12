export interface FutureTokenClaims {
  actorId: string
  tenantId: string
  roles: string[]
  provider: string
  displayName: string
  email?: string
}

export function parseToken(token: string): FutureTokenClaims | null {
  try {
    if (!token || !token.includes('.')) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
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
