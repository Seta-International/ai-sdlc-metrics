import { describe, expect, it, vi } from 'vitest'
import { discover, start } from './signIn'

describe('discover', () => {
  it('posts email and returns the result', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, provider: 'entra', tenantSlug: 'acme', displayName: 'Acme' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
    const r = await discover('alice@acme.com', { fetch: fetchImpl as never })
    expect(r).toEqual({ ok: true, provider: 'entra', tenantSlug: 'acme', displayName: 'Acme' })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse((init.body as string) ?? '{}')).toEqual({ email: 'alice@acme.com' })
  })
})

describe('start', () => {
  it('posts email + returnTo and returns the authorize URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: 'https://login.microsoftonline.com/x/oauth2/v2.0/authorize?cid=1',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const r = await start('alice@acme.com', { returnTo: '/dashboard', fetch: fetchImpl as never })
    expect(r.url).toMatch(/^https:\/\/login\.microsoftonline\.com/)
  })
})
