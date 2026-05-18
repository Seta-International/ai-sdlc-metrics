import { describe, expect, it, vi } from 'vitest'
import { deleteMailerConfig, getMailerConfig, upsertMailerConfig } from './mailer-admin'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('mailer-admin API client', () => {
  it('getMailerConfig GETs by tenant id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ tenantId: 't-1' }))
    await getMailerConfig('t-1', { fetch: fetchImpl as never })
    expect(fetchImpl).toHaveBeenCalledWith(
      '/admin/mailer/tenants/t-1',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('upsertMailerConfig PUTs the body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}))
    await upsertMailerConfig(
      't-1',
      {
        provider: 'graph',
        config: { mailbox_user_id: 'mbox@a.com', from_address: 'mbox@a.com' },
        enabled: true,
      },
      { fetch: fetchImpl as never },
    )
    const [, init] = fetchImpl.mock.calls[0]!
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toMatchObject({ provider: 'graph', enabled: true })
  })

  it('deleteMailerConfig DELETEs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    await deleteMailerConfig('t-1', { fetch: fetchImpl as never })
    expect(fetchImpl).toHaveBeenCalledWith(
      '/admin/mailer/tenants/t-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('throws on non-ok responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }))
    let caught: Error | undefined
    try {
      await getMailerConfig('t-1', { fetch: fetchImpl as never })
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeDefined()
    expect(caught?.message).toMatch(/500/)
  })
})
