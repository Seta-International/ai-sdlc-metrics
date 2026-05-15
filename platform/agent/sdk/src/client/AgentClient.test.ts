import { describe, expect, it } from 'vitest'
import { HttpResponse, http, server } from '../../test/setup'
import type { KernelChunk } from '../schemas/chunk'
import { parseSseStream } from '../sse/parseSseStream'
import { AgentClient } from './AgentClient'

const baseUrl = 'https://api.test'

describe('AgentClient.getMe', () => {
  it('returns the session principal', async () => {
    server.use(
      http.get('https://api.test/me', () =>
        HttpResponse.json({
          id: 'u1',
          email: 'a@b.com',
          name: 'A B',
          tenants: [{ id: 't1', name: 'Acme', role: 'admin' }],
        }),
      ),
    )
    const c = new AgentClient({ baseUrl })
    const me = await c.getMe()
    expect(me).toMatchObject({ id: 'u1', tenants: [{ id: 't1', role: 'admin' }] })
  })

  it('throws kind=http on 401', async () => {
    server.use(http.get('https://api.test/me', () => HttpResponse.json({}, { status: 401 })))
    const c = new AgentClient({ baseUrl })
    await expect(c.getMe()).rejects.toMatchObject({ kind: 'http', status: 401 })
  })
})

describe('AgentClient.streamRun', () => {
  it('returns a Response whose body is a ReadableStream', async () => {
    server.use(
      http.get(
        'https://api.test/runs/r1/stream',
        () =>
          new HttpResponse('event: finish\ndata: {"type":"finish","reason":"stop"}\n\n', {
            headers: { 'content-type': 'text/event-stream' },
          }),
      ),
    )
    const c = new AgentClient({ baseUrl })
    const res = await c.streamRun('r1')
    expect(res.body).toBeInstanceOf(ReadableStream)
  })

  it('forwards an AbortSignal', async () => {
    server.use(
      http.get('https://api.test/runs/r1/stream', async () => {
        await new Promise((r) => setTimeout(r, 200))
        return new HttpResponse('', { headers: { 'content-type': 'text/event-stream' } })
      }),
    )
    const c = new AgentClient({ baseUrl })
    const ctrl = new AbortController()
    const p = c.streamRun('r1', { signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ kind: 'abort' })
  })

  it('end-to-end: streamRun → parseSseStream emits all chunks', async () => {
    server.use(
      http.get(
        'https://api.test/runs/r1/stream',
        () =>
          new HttpResponse(
            [
              'event: text',
              'data: {"type":"text","delta":"hi"}',
              '',
              'event: finish',
              'data: {"type":"finish","reason":"stop"}',
              '',
              '',
            ].join('\n'),
            { headers: { 'content-type': 'text/event-stream' } },
          ),
      ),
    )

    const c = new AgentClient({ baseUrl })
    const res = await c.streamRun('r1')
    if (!res.body) throw new Error('expected stream body')
    const got: KernelChunk[] = []
    await parseSseStream(res.body, (ch) => got.push(ch))
    expect(got.map((c) => c.type)).toEqual(['text', 'finish'])
  })

  it('rejects empty baseUrl', () => {
    expect(() => new AgentClient({ baseUrl: '' })).toThrow(/baseUrl/)
  })
})
