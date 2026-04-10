export interface Session {
  actorId: string
  tenantId: string
  roles: string[]
  displayName: string
}

export function useSession(): Session | null {
  // TODO: read the httpOnly session cookie via /api/auth/me
  // This hook is a stub — implement when MSAL is wired in web-shell
  return null
}
