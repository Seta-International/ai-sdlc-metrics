import { type NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, COOKIE_OPTIONS, API_BASE_URL } from '../../../../lib/auth-config'

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string; tenantId?: string }
  const email = body.email?.trim()
  const tenantId = body.tenantId?.trim()

  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })
  if (!tenantId) return NextResponse.json({ error: 'Tenant id required' }, { status: 400 })

  if (process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true') {
    try {
      const apiRes = await fetch(`${API_BASE_URL}/trpc/identity.devLogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!apiRes.ok) {
        const data = (await apiRes.json()) as { error?: { message?: string } }
        return NextResponse.json({ error: data.error?.message ?? 'Login failed' }, { status: 401 })
      }
      const apiData = (await apiRes.json()) as {
        result?: { data?: { token?: string } }
        error?: unknown
      }
      if (apiData.error) {
        return NextResponse.json({ error: 'Login failed' }, { status: 401 })
      }
      const token = apiData.result?.data?.token
      if (!token) return NextResponse.json({ error: 'No token returned' }, { status: 500 })

      const response = NextResponse.json({ ok: true, dev: true })
      response.cookies.set(SESSION_COOKIE_NAME, token, COOKIE_OPTIONS)
      return response
    } catch {
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
  }

  try {
    const apiRes = await fetch(`${API_BASE_URL}/trpc/identity.requestMagicLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, tenantId }),
    })

    if (!apiRes.ok) {
      const data = (await apiRes.json()) as { error?: { message?: string } }
      return NextResponse.json(
        { error: data.error?.message ?? 'Failed to send magic link' },
        { status: apiRes.status },
      )
    }

    const apiData = (await apiRes.json()) as {
      result?: { data?: { sent?: boolean } }
      error?: unknown
    }

    if (apiData.error) {
      return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
