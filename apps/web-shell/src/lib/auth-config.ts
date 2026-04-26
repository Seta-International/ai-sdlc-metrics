export const SESSION_COOKIE_NAME = '_future_session'
export const SESSION_MAX_AGE_SECONDS = 28800 // 8 hours

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_MAX_AGE_SECONDS,
  path: '/',
}

export const API_BASE_URL =
  process.env['API_BASE_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

/**
 * The Microsoft OAuth callback URL registered on the IdP app.
 * Shell passes this to the API's startOAuth procedure; the API embeds it in the
 * authorization URL and verifies it again during completeOAuth.
 */
export const MICROSOFT_CALLBACK_URL =
  process.env['NEXT_PUBLIC_MICROSOFT_REDIRECT_URI'] ??
  'http://localhost:3000/auth/callback/microsoft'

/**
 * The Google OAuth callback URL registered on the IdP app.
 * Shell passes this to the API's startOAuth procedure; the API embeds it in the
 * authorization URL and verifies it again during completeOAuth.
 */
export const GOOGLE_CALLBACK_URL =
  process.env['NEXT_PUBLIC_GOOGLE_REDIRECT_URI'] ?? 'http://localhost:3000/auth/callback/google'

/**
 * Where to redirect the user after a successful login when no explicit redirectTo is present.
 */
export const DEFAULT_POST_LOGIN_URL =
  process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true'
    ? 'http://localhost:3001'
    : 'https://people.future.seta-international.vn'
