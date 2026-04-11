import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, COOKIE_OPTIONS, API_BASE_URL } from '../../../../lib/auth-config'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  if (!token) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_token', request.url))
  }

  try {
    // Call API to validate magic link and get session
    const validateRes = await fetch(`${API_BASE_URL}/trpc/identity.validateMagicLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        tenantId: process.env.DEFAULT_TENANT_ID!,
      }),
    })

    if (!validateRes.ok) {
      return NextResponse.redirect(new URL('/auth/login?error=invalid_magic_link', request.url))
    }

    const { result } = (await validateRes.json()) as {
      result: { data: { sessionToken: string } }
    }
    const sessionToken = result.data.sessionToken

    // Set session cookie
    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, COOKIE_OPTIONS)

    return NextResponse.redirect(new URL('/', request.url))
  } catch (err) {
    console.error('Magic link validation error:', err)
    return NextResponse.redirect(new URL('/auth/login?error=unexpected', request.url))
  }
}
