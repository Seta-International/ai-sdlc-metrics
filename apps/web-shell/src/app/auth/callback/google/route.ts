import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
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

interface GoogleUserInfo {
  sub: string
  email: string
  name: string
  email_verified: boolean
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL(`/auth/login?error=${error ?? 'no_code'}`, request.url))
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_CONFIG.tokenUrl, {
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

    // 2. Decode ID token
    const idPayload = JSON.parse(
      atob(tokens.id_token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
    ) as GoogleUserInfo

    // 3. Call API to resolve login
    const resolveRes = await fetch(`${API_BASE_URL}/trpc/identity.resolveLogin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        ssoSubject: idPayload.sub,
        email: idPayload.email,
        displayName: idPayload.name ?? 'Unknown',
        tenantId: process.env.DEFAULT_TENANT_ID!,
      }),
    })

    if (!resolveRes.ok) {
      const err = await resolveRes.text()
      return NextResponse.redirect(
        new URL(`/auth/login?error=resolve_failed&detail=${encodeURIComponent(err)}`, request.url),
      )
    }

    const { result } = (await resolveRes.json()) as {
      result: { data: { sessionToken: string } }
    }
    const sessionToken = result.data.sessionToken

    // 4. Set session cookie
    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, COOKIE_OPTIONS)

    return NextResponse.redirect(new URL('/', request.url))
  } catch (err) {
    console.error('Google callback error:', err)
    return NextResponse.redirect(new URL('/auth/login?error=unexpected', request.url))
  }
}
