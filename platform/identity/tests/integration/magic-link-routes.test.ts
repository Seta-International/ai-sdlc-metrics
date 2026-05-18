import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMagicLinkRoutes, type MagicLinkMailer } from '../../src/magic-link-routes'
import { upsertSsoConfig, upsertSsoEmailDomain } from '../../src/sso-config-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const tenantId = '00000000-0000-4000-8000-0000000000aa'
const ownerId = '00000000-0000-4000-8000-0000000000ab'
const memberId = '00000000-0000-4000-8000-0000000000ac'

function buildApp(sql: postgres.Sql, mailer: MagicLinkMailer) {
  const app = new Hono().onError(onError)
  app.route(
    '/',
    createMagicLinkRoutes({
      sql,
      audit: { recordAudit: async () => {} },
      sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
      redirectBase: 'http://localhost:8080',
      getMailerForTenant: async () => mailer,
      getTenantBrief: async () => ({ slug: 'magic-acme', displayName: 'Acme' }),
    }),
  )
  return app
}

describe('magic-link routes (integration)', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

  beforeEach(async () => {
    await sql`TRUNCATE auth.magic_links, auth.sessions, auth.user_identities, auth.users, auth.sso_email_domains, auth.sso_configs CASCADE`
    await sql`DELETE FROM tenant.tenant_members WHERE user_id IN (${ownerId}, ${memberId})`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'magic-acme', 'Acme')`
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: '99999999-8888-7777-6666-555555555555', client_id: 'cid' },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await upsertSsoEmailDomain(sql, { domain: 'magic-acme.test', tenantId })

    await sql`
      INSERT INTO auth.users (id, email, name, primary_provider)
      VALUES (${ownerId}, 'owner@magic-acme.test', 'Owner', 'entra'),
             (${memberId}, 'member@magic-acme.test', 'Member', 'entra')
    `
    await sql`
      INSERT INTO tenant.tenant_members (user_id, tenant_id, role, source)
      VALUES (${ownerId}, ${tenantId}, 'owner', 'manual'),
             (${memberId}, ${tenantId}, 'member', 'manual')
    `
  })
  afterAll(async () => {
    await sql.end()
  })

  it('owner request: returns 200, inserts a row, calls mailer.send once', async () => {
    const send = vi.fn(async () => {})
    const app = buildApp(sql, { send } as never)
    const res = await app.request('/sso/magic/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@magic-acme.test' }),
    })
    expect(res.status).toBe(200)
    const rows =
      (await sql`SELECT 1 FROM auth.magic_links WHERE user_id = ${ownerId}`) as Array<unknown>
    expect(rows.length).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('non-owner request: 200 but no row, no mailer call', async () => {
    const send = vi.fn(async () => {})
    const app = buildApp(sql, { send } as never)
    const res = await app.request('/sso/magic/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'member@magic-acme.test' }),
    })
    expect(res.status).toBe(200)
    expect(send).not.toHaveBeenCalled()
  })

  it('unknown email: 200, no row, no send', async () => {
    const send = vi.fn(async () => {})
    const app = buildApp(sql, { send } as never)
    const res = await app.request('/sso/magic/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@magic-acme.test' }),
    })
    expect(res.status).toBe(200)
    expect(send).not.toHaveBeenCalled()
  })

  it('consume: redeems token once, sets session cookie, redirects to /admin/tenants/<id>/sso', async () => {
    let capturedLink: string | null = null
    const send = vi.fn(async (msg: { text: string }) => {
      const m = msg.text.match(/(http\S+)/)
      capturedLink = m?.[1] ?? null
    })
    const app = buildApp(sql, { send } as never)
    await app.request('/sso/magic/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@magic-acme.test' }),
    })
    if (!capturedLink) throw new Error('mailer never received a link')
    const u = new URL(capturedLink)
    const path = u.pathname + u.search
    const res = await app.request(path)
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toBe(`/console/admin/tenants/${tenantId}/sso`)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/seta_sess=/)
    expect(setCookie).toMatch(/seta_last_login=/)

    const replay = await app.request(path)
    expect(replay.status).toBe(302)
    expect(replay.headers.get('location') ?? '').toMatch(/magic_failed=1/)
  })
})
