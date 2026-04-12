import { type NextRequest, NextResponse } from 'next/server'
import {
  GOOGLE_CONFIG,
  SESSION_COOKIE_NAME,
  COOKIE_OPTIONS,
  API_BASE_URL,
} from '../../../../lib/auth-config'

interface GoogleTokenResponse {
  access_token: string
  id_token: string
  token_type: string
  expires_in: number
}

interface GoogleIdTokenClaims {
  sub: string
  email: string
  name: string
  hd?: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/auth/login?error=oauth_error', request.url))
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_CONFIG.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CONFIG.clientId,
        client_secret: GOOGLE_CONFIG.clientSecret,
        code,
        redirect_uri: GOOGLE_CONFIG.redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL('/auth/login?error=token_exchange_failed', request.url))
    }

    const tokens = (await tokenRes.json()) as GoogleTokenResponse

    // Decode id_token to get claims
    const parts = tokens.id_token.split('.')
    const claims = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf-8'),
    ) as GoogleIdTokenClaims

    // Derive tenant from hosted domain or state param
    const tenantId = searchParams.get('state') ?? claims.hd ?? ''

    const apiRes = await fetch(`${API_BASE_URL}/trpc/identity.resolveLogin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        json: {
          provider: 'google',
          ssoSubject: claims.sub,
          email: claims.email,
          displayName: claims.name,
          tenantId,
        },
      }),
    })

    if (!apiRes.ok) {
      return NextResponse.redirect(new URL('/auth/login?error=login_failed', request.url))
    }

    const apiData = (await apiRes.json()) as {
      result?: { data?: { json?: { token?: string } } }
      error?: unknown
    }

    if (apiData.error) {
      return NextResponse.redirect(new URL('/auth/login?error=account_error', request.url))
    }

    const sessionToken = apiData.result?.data?.json?.token

    if (!sessionToken) {
      return NextResponse.redirect(new URL('/auth/login?error=no_token', request.url))
    }

    const response = NextResponse.redirect(new URL('/', request.url))
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, COOKIE_OPTIONS)
    return response
  } catch {
    return NextResponse.redirect(new URL('/auth/login?error=server_error', request.url))
  }
}
