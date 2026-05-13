import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  GraphNotFound,
  GraphPermissionDenied,
  GraphPreconditionFailed,
  GraphRateLimited,
  GraphUnauthorized,
  GraphUnavailable,
} from './errors'
import { createGraphFetch } from './graph-fetch'
import { mswServer } from './test/msw-server'

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())

describe('graphFetch.call', () => {
  it('GET 200 captures @odata.etag and returns typed data', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/T1', () =>
        HttpResponse.json({ '@odata.etag': 'W/"1"', id: 'T1', title: 'a' }, { status: 200 }),
      ),
    )
    const gf = createGraphFetch({ recordAudit: async () => {} })
    const res = await gf.call<{ id: string; title: string }>({
      token: 't',
      method: 'GET',
      path: '/me/planner/tasks/T1',
      actor: { type: 'user', userId: 'u' },
      connectorId: 'ms365-planner',
    })
    expect(res.data.id).toBe('T1')
    expect(res.etag).toBe('W/"1"')
    expect(res.status).toBe(200)
  })

  it('falls back to ETag response header when @odata.etag is absent', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/plans/P1', () =>
        HttpResponse.json({ id: 'P1' }, { status: 200, headers: { ETag: 'W/"hdr"' } }),
      ),
    )
    const gf = createGraphFetch({ recordAudit: async () => {} })
    const res = await gf.call({
      token: 't',
      method: 'GET',
      path: '/me/planner/plans/P1',
      actor: { type: 'user', userId: 'u' },
      connectorId: 'ms365-planner',
    })
    expect(res.etag).toBe('W/"hdr"')
  })

  it('204 returns null data and null etag', async () => {
    mswServer.use(
      http.delete(
        'https://graph.microsoft.com/v1.0/me/planner/tasks/T1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    const gf = createGraphFetch({ recordAudit: async () => {} })
    const res = await gf.call({
      token: 't',
      method: 'DELETE',
      path: '/me/planner/tasks/T1',
      etag: 'W/"1"',
      actor: { type: 'user', userId: 'u' },
      connectorId: 'ms365-planner',
    })
    expect(res.status).toBe(204)
    expect(res.data).toBeNull()
    expect(res.etag).toBeNull()
  })
})

describe('graphFetch.call — status mapping', () => {
  const makeCall = (gf: ReturnType<typeof createGraphFetch>) =>
    gf.call({
      token: 't',
      method: 'GET',
      path: '/me/planner/tasks/X',
      actor: { type: 'user', userId: 'u' },
      connectorId: 'ms365-planner',
    })

  it('404 → GraphNotFound', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () =>
        HttpResponse.json({ error: { code: 'NotFound' } }, { status: 404 }),
      ),
    )
    const gf = createGraphFetch({ recordAudit: async () => {} })
    await expect(makeCall(gf)).rejects.toBeInstanceOf(GraphNotFound)
  })

  it('403 → GraphPermissionDenied', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () =>
        HttpResponse.json({ error: { code: 'Forbidden' } }, { status: 403 }),
      ),
    )
    const gf = createGraphFetch({ recordAudit: async () => {} })
    await expect(makeCall(gf)).rejects.toBeInstanceOf(GraphPermissionDenied)
  })

  it('412 → GraphPreconditionFailed', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () =>
        HttpResponse.json({}, { status: 412 }),
      ),
    )
    const gf = createGraphFetch({ recordAudit: async () => {} })
    await expect(makeCall(gf)).rejects.toBeInstanceOf(GraphPreconditionFailed)
  })

  it('401 → GraphUnauthorized', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () =>
        HttpResponse.json({}, { status: 401 }),
      ),
    )
    const gf = createGraphFetch({ recordAudit: async () => {} })
    await expect(makeCall(gf)).rejects.toBeInstanceOf(GraphUnauthorized)
  })
})

describe('graphFetch.call — retry', () => {
  it('429 with Retry-After=0 retries up to 3x then GraphRateLimited', async () => {
    let n = 0
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () => {
        n++
        return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '0' } })
      }),
    )
    const gf = createGraphFetch({ recordAudit: async () => {}, retryDelayCapMs: 0 })
    await expect(
      gf.call({
        token: 't',
        method: 'GET',
        path: '/me/planner/tasks/X',
        actor: { type: 'user', userId: 'u' },
        connectorId: 'ms365-planner',
      }),
    ).rejects.toBeInstanceOf(GraphRateLimited)
    expect(n).toBe(4)
  })

  it('5xx retries with backoff and then GraphUnavailable', async () => {
    let n = 0
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () => {
        n++
        return new HttpResponse(null, { status: 503 })
      }),
    )
    const gf = createGraphFetch({ recordAudit: async () => {}, retryDelayCapMs: 0 })
    await expect(
      gf.call({
        token: 't',
        method: 'GET',
        path: '/me/planner/tasks/X',
        actor: { type: 'user', userId: 'u' },
        connectorId: 'ms365-planner',
      }),
    ).rejects.toBeInstanceOf(GraphUnavailable)
    expect(n).toBe(4)
  })

  it('5xx then 200 recovers', async () => {
    let n = 0
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/X', () => {
        n++
        if (n < 2) return new HttpResponse(null, { status: 500 })
        return HttpResponse.json({ id: 'X' }, { status: 200 })
      }),
    )
    const gf = createGraphFetch({ recordAudit: async () => {}, retryDelayCapMs: 0 })
    const res = await gf.call<{ id: string }>({
      token: 't',
      method: 'GET',
      path: '/me/planner/tasks/X',
      actor: { type: 'user', userId: 'u' },
      connectorId: 'ms365-planner',
    })
    expect(res.data.id).toBe('X')
  })

  it('POST does NOT retry on 4xx', async () => {
    let n = 0
    mswServer.use(
      http.post('https://graph.microsoft.com/v1.0/me/planner/tasks', () => {
        n++
        return new HttpResponse(null, { status: 400 })
      }),
    )
    const gf = createGraphFetch({ recordAudit: async () => {}, retryDelayCapMs: 0 })
    await expect(
      gf.call({
        token: 't',
        method: 'POST',
        path: '/me/planner/tasks',
        body: {},
        actor: { type: 'user', userId: 'u' },
        connectorId: 'ms365-planner',
      }),
    ).rejects.toBeTruthy()
    expect(n).toBe(1)
  })
})

describe('graphFetch.batch', () => {
  it('POSTs /$batch with the envelope and returns per-request results', async () => {
    let received: unknown = null
    mswServer.use(
      http.post('https://graph.microsoft.com/v1.0/$batch', async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({
          responses: [
            { id: '1', status: 200, body: { '@odata.etag': 'W/"new"', id: 'T1', title: 'a' } },
            { id: '2', status: 412, body: {} },
          ],
        })
      }),
    )
    const gf = createGraphFetch({ recordAudit: async () => {}, retryDelayCapMs: 0 })
    const out = await gf.batch({
      token: 't',
      actor: { type: 'user', userId: 'u' },
      connectorId: 'ms365-planner',
      requests: [
        {
          id: '1',
          method: 'PATCH',
          url: '/me/planner/tasks/T1',
          headers: { 'If-Match': 'W/"1"', Prefer: 'return=representation' },
          body: { title: 'a' },
        },
        {
          id: '2',
          method: 'PATCH',
          url: '/me/planner/tasks/T2',
          headers: { 'If-Match': 'W/"stale"' },
          body: { title: 'b' },
        },
      ],
    })
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: '1', status: 200, etag: 'W/"new"' })
    expect(out[1]).toMatchObject({ id: '2', status: 412 })
    expect((received as { requests: unknown[] }).requests).toHaveLength(2)
  })

  it('throws if requests.length > 20', async () => {
    const gf = createGraphFetch({ recordAudit: async () => {}, retryDelayCapMs: 0 })
    await expect(
      gf.batch({
        token: 't',
        actor: { type: 'user', userId: 'u' },
        connectorId: 'ms365-planner',
        requests: Array.from({ length: 21 }, (_, i) => ({
          id: String(i),
          method: 'GET' as const,
          url: '/x',
        })),
      }),
    ).rejects.toThrow(/<= 20/)
  })
})

describe('graphFetch.paginate', () => {
  it('follows @odata.nextLink across pages', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks', ({ request }) => {
        const url = new URL(request.url)
        if (!url.searchParams.has('$skiptoken')) {
          return HttpResponse.json({
            value: [{ id: 'A' }],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/planner/tasks?$skiptoken=tk',
          })
        }
        return HttpResponse.json({ value: [{ id: 'B' }] })
      }),
    )
    const gf = createGraphFetch({ recordAudit: async () => {}, retryDelayCapMs: 0 })
    const all: Array<{ id: string }> = []
    for await (const item of gf.paginate<{ id: string }>({
      token: 't',
      method: 'GET',
      path: '/me/planner/tasks',
      actor: { type: 'user', userId: 'u' },
      connectorId: 'ms365-planner',
    })) {
      all.push(item)
    }
    expect(all.map((x) => x.id)).toEqual(['A', 'B'])
  })
})
