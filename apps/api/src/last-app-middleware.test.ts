import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { KNOWN_APPS, lastAppMiddleware, verifyLastApp } from './last-app-middleware'

const HMAC = 'k'.repeat(32)

function buildApp() {
  const app = new Hono()
  app.use('*', lastAppMiddleware({ hmacKey: HMAC, secure: false }))
  app.get('/studio', (c) => c.html('<html></html>'))
  app.get('/studio/runs', (c) => c.html('<html></html>'))
  app.get('/admin/tenants', (c) => c.html('<html></html>'))
  app.get('/api/something', (c) => c.json({}))
  return app
}

describe('lastAppMiddleware', () => {
  it('sets cookie for GET /studio/* with text/html', async () => {
    const res = await buildApp().request('/studio/runs', { headers: { accept: 'text/html' } })
    const cookies = res.headers.get('set-cookie') ?? ''
    expect(cookies).toMatch(/seta_last_app=/)
    expect(cookies).toMatch(/HttpOnly/i)
    expect(cookies).toMatch(/SameSite=Lax/i)
  })

  it('does not set cookie on non-HTML accept', async () => {
    const res = await buildApp().request('/studio/runs', {
      headers: { accept: 'application/json' },
    })
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/seta_last_app/)
  })

  it('does not set cookie on non-GET', async () => {
    const res = await buildApp().request('/studio/runs', {
      method: 'POST',
      headers: { accept: 'text/html' },
    })
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/seta_last_app/)
  })

  it('does not set cookie for unknown app path', async () => {
    const res = await buildApp().request('/admin/tenants', { headers: { accept: 'text/html' } })
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/seta_last_app/)
  })

  it('verifyLastApp round-trips signed value', async () => {
    const res = await buildApp().request('/studio', { headers: { accept: 'text/html' } })
    const raw = (res.headers.get('set-cookie') ?? '').match(/seta_last_app=([^;]+)/)?.[1]
    expect(verifyLastApp(decodeURIComponent(raw ?? ''), HMAC)).toBe('studio')
  })

  it('verifyLastApp returns null for unsigned/tampered value', () => {
    expect(verifyLastApp('totally-wrong', HMAC)).toBeNull()
    expect(verifyLastApp(undefined, HMAC)).toBeNull()
  })

  it('KNOWN_APPS is the expected set', () => {
    expect([...KNOWN_APPS]).toEqual(['studio', 'finance', 'pmo', 'timesheet'])
  })
})
