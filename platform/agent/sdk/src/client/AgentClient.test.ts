import { describe, expect, it } from 'vitest'
import { HttpResponse, http, server } from '../../test/setup'
import grantConsentUrlRecording from '../__recordings__/grantConsentUrl.json' with { type: 'json' }
import listConnectorsRecording from '../__recordings__/listConnectors.json' with { type: 'json' }
import listTenantsRecording from '../__recordings__/listTenants.json' with { type: 'json' }
import type { KernelChunk } from '../schemas/chunk'
import { parseSseStream } from '../sse/parseSseStream'
import { AgentClient } from './AgentClient'

const baseUrl = 'https://api.test'

describe('AgentClient.getMe', () => {
  it('returns the session principal', async () => {
    server.use(
      http.get('https://api.test/me', () =>
        HttpResponse.json({
          user: { id: 'u1', email: 'a@b.com', name: 'A B', pictureUrl: null },
          tenants: [{ id: 't1', name: 'Acme', role: 'admin' }],
          csrfToken: 'csrf-xyz',
        }),
      ),
    )
    const c = new AgentClient({ baseUrl })
    const me = await c.getMe()
    expect(me).toMatchObject({ user: { id: 'u1' }, tenants: [{ id: 't1', role: 'admin' }] })
  })

  it('throws kind=http on 401', async () => {
    server.use(http.get('https://api.test/me', () => HttpResponse.json({}, { status: 401 })))
    const c = new AgentClient({ baseUrl })
    await expect(c.getMe()).rejects.toMatchObject({ kind: 'http', status: 401 })
  })
})

describe('AgentClient.listTenants', () => {
  it('returns tenant rows from /tenants', async () => {
    server.use(
      http.get(`${baseUrl}${listTenantsRecording.request.url}`, () =>
        HttpResponse.json(listTenantsRecording.response.body),
      ),
    )
    const c = new AgentClient({ baseUrl })
    const rows = await c.listTenants()
    expect(rows).toEqual(listTenantsRecording.response.body)
  })

  it('forwards an AbortSignal', async () => {
    server.use(
      http.get(`${baseUrl}/tenants`, async () => {
        await new Promise((r) => setTimeout(r, 200))
        return HttpResponse.json([])
      }),
    )
    const c = new AgentClient({ baseUrl })
    const ctrl = new AbortController()
    const p = c.listTenants({ signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ kind: 'abort' })
  })
})

describe('AgentClient.listConnectors', () => {
  it('returns connector rows for the given tenant', async () => {
    server.use(
      http.get(`${baseUrl}${listConnectorsRecording.request.url}`, () =>
        HttpResponse.json(listConnectorsRecording.response.body),
      ),
    )
    const c = new AgentClient({ baseUrl })
    const rows = await c.listConnectors('00000000-0000-0000-0000-0000000000a1')
    expect(rows[0]).toMatchObject({ id: 'ms365-planner', status: 'pending' })
  })
})

describe('AgentClient.grantConsentUrl', () => {
  it('POSTs to the consent-url endpoint and returns { url, state }', async () => {
    server.use(
      http.post(`${baseUrl}${grantConsentUrlRecording.request.url}`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        expect(body).toEqual({})
        return HttpResponse.json(grantConsentUrlRecording.response.body)
      }),
    )
    const c = new AgentClient({ baseUrl })
    const out = await c.grantConsentUrl({
      tenantId: '00000000-0000-0000-0000-0000000000a1',
      connectorId: 'ms365-planner',
    })
    expect(out).toEqual(grantConsentUrlRecording.response.body)
  })

  it('forwards tenantHint when provided', async () => {
    server.use(
      http.post(`${baseUrl}${grantConsentUrlRecording.request.url}`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        expect(body).toEqual({ tenantHint: 'common' })
        return HttpResponse.json(grantConsentUrlRecording.response.body)
      }),
    )
    const c = new AgentClient({ baseUrl })
    await c.grantConsentUrl({
      tenantId: '00000000-0000-0000-0000-0000000000a1',
      connectorId: 'ms365-planner',
      tenantHint: 'common',
    })
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
