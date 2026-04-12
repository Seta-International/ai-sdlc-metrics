export interface SessionPayload {
  sub: string
  tid: string
  roles: string[]
  provider: string
  iat: number
  exp: number
}

export const SESSION_COOKIE_NAME = '_future_session'
export const SESSION_MAX_AGE_SECONDS = 28800 // 8 hours
