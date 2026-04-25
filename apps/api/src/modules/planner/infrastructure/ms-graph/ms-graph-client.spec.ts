import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MsGraphClient } from './ms-graph-client'
import {
  GraphPreconditionFailedError,
  GraphAuthError,
  GraphNotFoundError,
  GraphServerError,
} from './errors'

describe('MsGraphClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let identityFacade: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tokenAcquirer: any

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    identityFacade = {
      getGraphCredential: vi.fn().mockResolvedValue({
        tenantAdId: 'aad',
        clientId: 'c',
        clientSecretRef: 'arn',
        scopes: [],
      }),
    }
    tokenAcquirer = { acquire: vi.fn().mockResolvedValue('tok') }
  })

  const client = () => new MsGraphClient(identityFacade, tokenAcquirer)

  it('GET returns body + etag', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'p1', '@odata.etag': 'W/"abc"' }),
    })
    const result = await client().get('t1', '/planner/plans/p1')
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ id: 'p1' })
    expect(result.etag).toBe('W/"abc"')
  })

  it('GET with If-None-Match returning 304 — null body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 304,
      headers: new Headers(),
      text: async () => '',
    })
    const result = await client().get('t1', '/planner/plans/p1', { ifNoneMatch: 'W/"abc"' })
    expect(result.status).toBe(304)
    expect(result.body).toBeNull()
  })

  it('PATCH with If-Match — 412 throws GraphPreconditionFailedError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 412,
      headers: new Headers(),
      text: async () => '{"error":"etag mismatch"}',
    })
    await expect(
      client().patch('t1', '/planner/tasks/x', { title: 'n' }, { ifMatch: 'W/"stale"' }),
    ).rejects.toBeInstanceOf(GraphPreconditionFailedError)
  })

  it('429 throws GraphThrottledError with retryAfter', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '42' }),
      text: async () => 'Too many',
    })
    await expect(client().get('t1', '/groups')).rejects.toMatchObject({
      name: 'GraphThrottledError',
      retryAfterSeconds: 42,
    })
  })

  it('401 throws GraphAuthError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => 'unauth',
    })
    await expect(client().get('t1', '/groups')).rejects.toBeInstanceOf(GraphAuthError)
  })

  it('403 with planner limit code throws GraphQuotaError carrying the code', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({ error: { code: 'MaximumTasksInProject', message: 'Plan full' } }),
    })
    await expect(client().post('t1', '/planner/tasks', { planId: 'x' })).rejects.toMatchObject({
      name: 'GraphQuotaError',
      limitCode: 'MaximumTasksInProject',
    })
  })

  it('404 throws GraphNotFoundError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: async () => '',
    })
    await expect(client().get('t1', '/planner/plans/nope')).rejects.toBeInstanceOf(
      GraphNotFoundError,
    )
  })

  it('500 throws GraphServerError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      text: async () => 'oops',
    })
    await expect(client().get('t1', '/groups')).rejects.toBeInstanceOf(GraphServerError)
  })

  it('paginate follows @odata.nextLink across pages', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          value: [{ id: 'a' }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/x?$skip=1',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ value: [{ id: 'b' }] }),
      })

    const items = await client().getAllPages<{ id: string }>('t1', '/x')
    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends If-Match when provided on PATCH', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: async () => '',
    })
    await client().patch('t1', '/planner/tasks/x', { title: 'n' }, { ifMatch: 'W/"abc"' })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/planner/tasks/x'),
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'If-Match': 'W/"abc"' }),
      }),
    )
  })
})
