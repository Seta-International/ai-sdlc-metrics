import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, MICROSOFT_CONFIG } from '../../../lib/auth-config'

export async function GET(request: NextRequest) {
  // 1. Clear session cookie
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // Expire immediately
  })

  // 2. Determine post-logout redirect
  const postLogoutUrl = new URL('/auth/login', request.url).toString()

  // 3. If Microsoft, redirect to Entra front-channel logout
  // Google does not support front-channel logout — just clear cookie
  const provider = request.cookies.get('_future_provider')?.value

  if (provider === 'microsoft' && MICROSOFT_CONFIG.clientId) {
    const logoutUrl = new URL(MICROSOFT_CONFIG.logoutUrl)
    logoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutUrl)
    return NextResponse.redirect(logoutUrl)
  }

  return NextResponse.redirect(postLogoutUrl)
}
