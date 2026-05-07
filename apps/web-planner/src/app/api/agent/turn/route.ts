import type { NextRequest } from 'next/server'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const body = await request.text()

  let upstream: Response
  try {
    upstream = await fetch(`${API_URL}/api/agent/turn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: cookieHeader,
      },
      body,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backend unreachable'
    return Response.json({ error: message }, { status: 502 })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
