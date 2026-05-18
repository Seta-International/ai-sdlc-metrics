import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { HttpResponse, http, server } from '../../test/setup'
import { request } from './request'

const opts = { baseUrl: 'https://api.test', credentials: 'include' as const }

describe('request', () => {
  it('GETs and validates response with provided schema', async () => {
    server.use(http.get('https://api.test/me', () => HttpResponse.json({ id: 'u1' })))
    const Schema = z.object({ id: z.string() })
    const out = await request(opts, '/me', { schema: Schema })
    expect(out).toEqual({ id: 'u1' })
  })

  it('throws kind=http with status + body on 401', async () => {
    server.use(
      http.get('https://api.test/me', () => HttpResponse.json({ error: 'no' }, { status: 401 })),
    )
    await expect(request(opts, '/me', { schema: z.unknown() })).rejects.toMatchObject({
      kind: 'http',
      status: 401,
      body: { error: 'no' },
    })
  })

  it('throws kind=parse when schema rejects body', async () => {
    server.use(http.get('https://api.test/me', () => HttpResponse.json({ wrong: true })))
    await expect(
      request(opts, '/me', { schema: z.object({ id: z.string() }) }),
    ).rejects.toMatchObject({ kind: 'parse' })
  })

  it('throws kind=abort on AbortSignal', async () => {
    server.use(
      http.get('https://api.test/slow', async () => {
        await new Promise((r) => setTimeout(r, 100))
        return HttpResponse.json({})
      }),
    )
    const ctrl = new AbortController()
    const p = request(opts, '/slow', { schema: z.unknown(), signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ kind: 'abort' })
  })

  it('POSTs JSON body and merges headers', async () => {
    server.use(
      http.post('https://api.test/echo', async ({ request: req }) => {
        const body = await req.json()
        return HttpResponse.json({ got: body, auth: req.headers.get('x-test') })
      }),
    )
    const out = await request(opts, '/echo', {
      method: 'POST',
      body: { hello: 'world' },
      headers: { 'x-test': '1' },
      schema: z.object({ got: z.object({ hello: z.string() }), auth: z.string() }),
    })
    expect(out).toEqual({ got: { hello: 'world' }, auth: '1' })
  })

  it('returns raw Response when expect="stream"', async () => {
    server.use(
      http.get(
        'https://api.test/stream',
        () =>
          new HttpResponse('event: finish\ndata: {"type":"finish","reason":"stop"}\n\n', {
            headers: { 'content-type': 'text/event-stream' },
          }),
      ),
    )
    const res = await request(opts, '/stream', { expect: 'stream' })
    expect(res.body).toBeInstanceOf(ReadableStream)
  })
})
