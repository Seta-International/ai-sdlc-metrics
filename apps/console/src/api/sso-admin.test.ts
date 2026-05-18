import { describe, expect, it, vi } from 'vitest'
import {
  deleteSsoTenant,
  getSsoTenant,
  listSsoTenants,
  rotateSsoSecret,
  testSsoTenant,
  upsertSsoTenant,
} from './sso-admin'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('sso-admin API client', () => {
  it('listSsoTenants GETs /admin/sso/tenants', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [] }))
    const r = await listSsoTenants({ fetch: fetchImpl as never })
    expect(r.items).toEqual([])
    expect(fetchImpl).toHaveBeenCalledWith(
      '/admin/sso/tenants',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('getSsoTenant GETs by id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ tenantId: 't-1' }))
    await getSsoTenant('t-1', { fetch: fetchImpl as never })
    expect(fetchImpl).toHaveBeenCalledWith(
      '/admin/sso/tenants/t-1',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('upsertSsoTenant omits clientSecret when not provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    await upsertSsoTenant(
      't-1',
      {
        provider: 'entra',
        config: { entra_tenant_id: 'tid', client_id: 'cid' },
        domains: ['acme.com'],
        enabled: true,
      },
      { fetch: fetchImpl as never },
    )
    const [, init] = fetchImpl.mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body).not.toHaveProperty('clientSecret')
    expect(init.method).toBe('PUT')
  })

  it('upsertSsoTenant includes clientSecret when provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    await upsertSsoTenant(
      't-1',
      {
        provider: 'entra',
        config: { entra_tenant_id: 'tid', client_id: 'cid' },
        domains: [],
        enabled: true,
        clientSecret: 'topsecret',
      },
      { fetch: fetchImpl as never },
    )
    const [, init] = fetchImpl.mock.calls[0]!
    expect(JSON.parse(init.body as string).clientSecret).toBe('topsecret')
  })

  it('testSsoTenant POSTs to /test', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ result: 'ok', testedAt: '2026-01-01T00:00:00Z' }))
    const r = await testSsoTenant('t-1', { fetch: fetchImpl as never })
    expect(r.result).toBe('ok')
    expect(fetchImpl).toHaveBeenCalledWith(
      '/admin/sso/tenants/t-1/test',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('deleteSsoTenant DELETEs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    await deleteSsoTenant('t-1', { fetch: fetchImpl as never })
    expect(fetchImpl).toHaveBeenCalledWith(
      '/admin/sso/tenants/t-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('rotateSsoSecret POSTs the secret', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    await rotateSsoSecret('t-1', 'new', { fetch: fetchImpl as never })
    const [, init] = fetchImpl.mock.calls[0]!
    expect(JSON.parse(init.body as string)).toEqual({ clientSecret: 'new' })
  })

  it('throws on non-ok responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }))
    let caught: Error | undefined
    try {
      await listSsoTenants({ fetch: fetchImpl as never })
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeDefined()
    expect(caught?.message).toMatch(/500/)
  })
})
