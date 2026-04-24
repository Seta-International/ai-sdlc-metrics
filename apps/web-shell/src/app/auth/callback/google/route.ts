import { type NextRequest, NextResponse } from 'next/server'
import {
  SESSION_COOKIE_NAME,
  COOKIE_OPTIONS,
  GOOGLE_CALLBACK_URL,
} from '../../../../lib/auth-config'
import { completeOAuth } from '../../../../lib/auth-gateway-client'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !state) {
    return NextResponse.redirect(new URL('/auth/login?error=oauth_error', request.url))
  }

  try {
    const result = await completeOAuth({
      code,
      state,
      callbackUri: GOOGLE_CALLBACK_URL,
    })

    const response = NextResponse.redirect(new URL(result.redirectTo))
    response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, COOKIE_OPTIONS)
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    const errorCode = message.includes('expired')
      ? 'oauth_session_expired'
      : message.includes('consumed')
        ? 'oauth_already_used'
        : message.includes('mismatch')
          ? 'oauth_error'
          : 'login_failed'

    return NextResponse.redirect(new URL(`/auth/login?error=${errorCode}`, request.url))
  }
}
