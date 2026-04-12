import { type NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, COOKIE_OPTIONS, API_BASE_URL } from '../../../../lib/auth-config'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const { searchParams } = request.nextUrl
  const tenantId = searchParams.get('tid') ?? ''

  try {
    const apiRes = await fetch(`${API_BASE_URL}/trpc/identity.validateMagicLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        json: { token, tenantId },
      }),
    })

    if (!apiRes.ok) {
      return NextResponse.redirect(new URL('/auth/login?error=invalid_link', request.url))
    }

    const apiData = (await apiRes.json()) as {
      result?: { data?: { json?: { token?: string } } }
      error?: unknown
    }

    if (apiData.error) {
      return NextResponse.redirect(new URL('/auth/login?error=link_expired', request.url))
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
