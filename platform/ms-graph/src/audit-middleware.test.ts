import type { AuditEntry } from '@seta/audit'
import { tenantContext } from '@seta/tenant'
import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { normalizePath } from './audit-middleware'
import { createGraphFetch } from './graph-fetch'
import { mswServer } from './test/msw-server'

const withTenant = <T>(fn: () => Promise<T>): Promise<T> =>
  tenantContext.run({ tenantId: 'test-tenant-id' }, fn)

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())

describe('normalizePath', () => {
  it('replaces UUID-like segments with :id', () => {
    expect(normalizePath('/me/planner/tasks/abc-123-def-456')).toBe('/me/planner/tasks/:id')
  })

  it('replaces segments after known parent resource names', () => {
    expect(normalizePath('/me/planner/tasks/T1')).toBe('/me/planner/tasks/:id')
    expect(normalizePath('/me/planner/plans/P1')).toBe('/me/planner/plans/:id')
    expect(normalizePath('/me/planner/buckets/B1')).toBe('/me/planner/buckets/:id')
    expect(normalizePath('/users/U1/planner/tasks')).toBe('/users/:id/planner/tasks')
    expect(normalizePath('/groups/G1/planner/plans')).toBe('/groups/:id/planner/plans')
    expect(normalizePath('/me/planner/tasks/T1/details')).toBe('/me/planner/tasks/:id/details')
  })

  it('does not replace me or planner segments', () => {
    expect(normalizePath('/me/planner/tasks')).toBe('/me/planner/tasks')
  })
})

describe('audit middleware', () => {
  it('writes one audit row per call with normalized path', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/T1', () =>
        HttpResponse.json({ id: 'T1' }, { status: 200 }),
      ),
    )
    const recordAudit = vi.fn(async () => {})
    const gf = createGraphFetch({ recordAudit })
    await withTenant(() =>
      gf.call({
        token: 't',
        method: 'GET',
        path: '/me/planner/tasks/T1',
        actor: { type: 'user', userId: 'u' },
        connectorId: 'ms365-planner',
      }),
    )
    expect(recordAudit).toHaveBeenCalledOnce()
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: 'ms365-planner',
        providerId: 'entra',
        operation: 'graph.GET./me/planner/tasks/:id',
        result: 'ok',
        metadata: expect.objectContaining({ status: 200 }),
      }),
    )
  })

  it('writes one audit row per inner $batch request', async () => {
    mswServer.use(
      http.post('https://graph.microsoft.com/v1.0/$batch', () =>
        HttpResponse.json({
          responses: [
            { id: '1', status: 200, body: { id: 'T1' } },
            { id: '2', status: 403, body: {} },
          ],
        }),
      ),
    )
    const recordAudit = vi.fn(async () => {})
    const gf = createGraphFetch({ recordAudit })
    await withTenant(() =>
      gf.batch({
        token: 't',
        actor: { type: 'user', userId: 'u' },
        connectorId: 'ms365-planner',
        requests: [
          { id: '1', method: 'GET', url: '/me/planner/tasks/T1' },
          { id: '2', method: 'GET', url: '/me/planner/tasks/T2' },
        ],
      }),
    )
    expect(recordAudit).toHaveBeenCalledTimes(2)
    const calls = recordAudit.mock.calls as unknown as [[AuditEntry], [AuditEntry]]
    const allEntries = calls.map((c) => c[0])
    const ok = allEntries.find((c) => c.metadata?.status === 200)
    const fail = allEntries.find((c) => c.metadata?.status === 403)
    expect(ok?.result).toBe('ok')
    expect(fail?.result).toBe('failure')
  })

  it('failure status maps result=failure', async () => {
    mswServer.use(
      http.get('https://graph.microsoft.com/v1.0/me/planner/tasks/T1', () =>
        HttpResponse.json({ error: { code: 'Forbidden' } }, { status: 403 }),
      ),
    )
    const recordAudit = vi.fn(async () => {})
    const gf = createGraphFetch({ recordAudit })
    await withTenant(() =>
      expect(
        gf.call({
          token: 't',
          method: 'GET',
          path: '/me/planner/tasks/T1',
          actor: { type: 'user', userId: 'u' },
          connectorId: 'ms365-planner',
        }),
      ).rejects.toBeTruthy(),
    )
    expect(recordAudit).toHaveBeenCalledOnce()
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ result: 'failure' }))
  })
})
