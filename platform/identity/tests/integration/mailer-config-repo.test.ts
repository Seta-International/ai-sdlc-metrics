import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  deleteMailerConfig,
  getMailerConfigByTenant,
  upsertMailerConfig,
} from '../../src/mailer-config-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} })
const tenantId = '00000000-0000-4000-8000-0000000000e1'

describe('mailer-config-repo (integration)', () => {
  beforeEach(async () => {
    await sql`DELETE FROM auth.mailer_configs WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenant_members WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenant_connectors WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId} OR slug = 'mailer-repo-acme'`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'mailer-repo-acme', 'Acme')`
  })
  afterAll(async () => {
    await sql`DELETE FROM auth.mailer_configs WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenant_members WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenant_connectors WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId} OR slug = 'mailer-repo-acme'`
    await sql.end()
  })

  it('upserts and retrieves a graph config', async () => {
    await upsertMailerConfig(sql, {
      tenantId,
      provider: 'graph',
      config: { mailbox_user_id: 'noreply@acme.com', from_address: 'noreply@acme.com' },
      enabled: true,
    })
    const r = await getMailerConfigByTenant(sql, tenantId)
    expect(r).toMatchObject({ provider: 'graph' })
    expect(r?.config.mailbox_user_id).toBe('noreply@acme.com')
  })

  it('returns null when no row exists', async () => {
    expect(await getMailerConfigByTenant(sql, tenantId)).toBeNull()
  })

  it('returns null when disabled', async () => {
    await upsertMailerConfig(sql, {
      tenantId,
      provider: 'graph',
      config: { mailbox_user_id: 'noreply@acme.com', from_address: 'noreply@acme.com' },
      enabled: false,
    })
    expect(await getMailerConfigByTenant(sql, tenantId)).toBeNull()
  })

  it('deleteMailerConfig removes the row', async () => {
    await upsertMailerConfig(sql, {
      tenantId,
      provider: 'graph',
      config: { mailbox_user_id: 'a@b.c', from_address: 'a@b.c' },
      enabled: true,
    })
    await deleteMailerConfig(sql, tenantId)
    expect(await getMailerConfigByTenant(sql, tenantId)).toBeNull()
  })
})
