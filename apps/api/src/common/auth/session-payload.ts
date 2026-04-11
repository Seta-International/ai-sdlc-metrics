export interface SessionPayload {
  /** actor.id (UUID v7) */
  sub: string
  /** tenant.id (UUID v7) */
  tid: string
  /** role_grant.role_key values */
  roles: string[]
  /** Identity provider: 'microsoft' | 'google' | 'magic_link' */
  provider: string
  /** Issued at (epoch seconds) */
  iat: number
  /** Expires at (epoch seconds) */
  exp: number
}

export const SESSION_COOKIE_NAME = '_future_session'
export const SESSION_MAX_AGE_SECONDS = 28800 // 8 hours
