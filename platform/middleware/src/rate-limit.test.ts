import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { rateLimit } from './rate-limit'

describe('rateLimit', () => {
  it('passes within burst', async () => {
    const app = new Hono()
    app.use('/x', rateLimit({ rps: 5, burst: 3, key: () => 'k1' }))
    app.get('/x', (c) => c.text('ok'))
    expect((await app.request('/x')).status).toBe(200)
    expect((await app.request('/x')).status).toBe(200)
    expect((await app.request('/x')).status).toBe(200)
  })

  it('429s after burst exceeded', async () => {
    const app = new Hono()
    app.use('/y', rateLimit({ rps: 5, burst: 2, key: () => 'k2' }))
    app.get('/y', (c) => c.text('ok'))
    expect((await app.request('/y')).status).toBe(200)
    expect((await app.request('/y')).status).toBe(200)
    expect((await app.request('/y')).status).toBe(429)
  })

  it('separates buckets per key', async () => {
    const app = new Hono()
    let i = 0
    app.use('/z', rateLimit({ rps: 5, burst: 1, key: () => `kx-${i++}` }))
    app.get('/z', (c) => c.text('ok'))
    // each request gets a fresh key — none exhaust their bucket
    expect((await app.request('/z')).status).toBe(200)
    expect((await app.request('/z')).status).toBe(200)
    expect((await app.request('/z')).status).toBe(200)
  })
})
