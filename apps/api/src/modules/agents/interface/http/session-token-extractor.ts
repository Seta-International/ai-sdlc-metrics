import { SESSION_COOKIE_NAME } from '../../../../common/auth/session-payload'

export function extractSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`))
  return match ? (match[1] ?? null) : null
}
