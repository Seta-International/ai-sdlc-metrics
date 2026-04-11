export const SESSION_COOKIE_NAME = '_future_session'

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 28800, // 8 hours
  domain: process.env.COOKIE_DOMAIN ?? undefined, // .seta-international.com in prod
}

export const MICROSOFT_CONFIG = {
  clientId: process.env.MICROSOFT_CLIENT_ID!,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  tenantId: process.env.MICROSOFT_TENANT_ID!,
  redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
  get authorizeUrl() {
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize`
  },
  get tokenUrl() {
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`
  },
  get logoutUrl() {
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/logout`
  },
  scope: 'openid profile email',
}

export const GOOGLE_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scope: 'openid profile email',
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
