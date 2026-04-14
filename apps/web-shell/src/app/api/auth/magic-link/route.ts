import { type NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, COOKIE_OPTIONS, API_BASE_URL } from '../../../../lib/auth-config'

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string }
  const email = body.email?.trim()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  if (process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true') {
    try {
      const apiRes = await fetch(`${API_BASE_URL}/trpc/identity.devLogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { email } }),
      })
      if (!apiRes.ok) {
        const data = (await apiRes.json()) as { error?: { message?: string } }
        return NextResponse.json({ error: data.error?.message ?? 'Login failed' }, { status: 401 })
      }
      const apiData = (await apiRes.json()) as {
        result?: { data?: { json?: { token?: string } } }
        error?: unknown
      }
      if (apiData.error) {
        return NextResponse.json({ error: 'Login failed' }, { status: 401 })
      }
      const token = apiData.result?.data?.json?.token
      if (!token) return NextResponse.json({ error: 'No token returned' }, { status: 500 })

      const response = NextResponse.json({ ok: true, dev: true })
      response.cookies.set(SESSION_COOKIE_NAME, token, COOKIE_OPTIONS)
      return response
    } catch {
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
  }

  return NextResponse.json(
    { error: 'Magic link login not yet implemented for production' },
    { status: 501 },
  )
}
