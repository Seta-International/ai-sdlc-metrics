export const SESSION_COOKIE_NAME = '_future_session'
export const SESSION_MAX_AGE_SECONDS = 28800 // 8 hours

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_MAX_AGE_SECONDS,
  path: '/',
}

export const MICROSOFT_CONFIG = {
  clientId: process.env['NEXT_PUBLIC_MICROSOFT_CLIENT_ID'] ?? '',
  clientSecret: process.env['MICROSOFT_CLIENT_SECRET'] ?? '',
  tenantId: process.env['NEXT_PUBLIC_MICROSOFT_TENANT_ID'] ?? 'common',
  redirectUri:
    process.env['MICROSOFT_REDIRECT_URI'] ?? 'http://localhost:3000/auth/callback/microsoft',
  scope: 'openid profile email',
  authorizationEndpoint: `https://login.microsoftonline.com/${process.env['NEXT_PUBLIC_MICROSOFT_TENANT_ID'] ?? 'common'}/oauth2/v2.0/authorize`,
  tokenEndpoint: `https://login.microsoftonline.com/${process.env['NEXT_PUBLIC_MICROSOFT_TENANT_ID'] ?? 'common'}/oauth2/v2.0/token`,
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
