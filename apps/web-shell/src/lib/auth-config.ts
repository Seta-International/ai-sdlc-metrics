export const SESSION_COOKIE_NAME = '_future_session'
export const SESSION_MAX_AGE_SECONDS = 28800 // 8 hours

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_MAX_AGE_SECONDS,
  path: '/',
}

export const GOOGLE_CONFIG = {
  clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
  clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
  redirectUri: process.env['GOOGLE_REDIRECT_URI'] ?? 'http://localhost:3000/auth/callback/google',
  scope: 'openid profile email',
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
}

export const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:3001'

/**
 * The Microsoft OAuth callback URL registered on the IdP app.
 * Shell passes this to the API's startOAuth procedure; the API embeds it in the
 * authorization URL and verifies it again during completeOAuth.
 */
export const MICROSOFT_CALLBACK_URL =
  process.env['NEXT_PUBLIC_MICROSOFT_REDIRECT_URI'] ??
  'http://localhost:3000/auth/callback/microsoft'

/**
 * Where to redirect the user after a successful login when no explicit redirectTo is present.
 */
export const DEFAULT_POST_LOGIN_URL =
  process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true'
    ? 'http://localhost:3001'
    : 'https://people.future.seta-international.vn'
