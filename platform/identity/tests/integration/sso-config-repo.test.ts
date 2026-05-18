import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resolveSsoByEmail, upsertSsoConfig, upsertSsoEmailDomain } from '../../src/sso-config-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} })

const tenantId = '00000000-0000-4000-8000-000000000001'

describe('sso-config-repo (integration)', () => {
  beforeEach(async () => {
    await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id = ${tenantId} OR domain = 'acme.com'`
    await sql`DELETE FROM auth.sso_configs WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenant_members WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenant_connectors WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId} OR slug = 'sso-repo-acme'`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'sso-repo-acme', 'Acme')`
  })
  afterAll(async () => {
    await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id = ${tenantId} OR domain = 'acme.com'`
    await sql`DELETE FROM auth.sso_configs WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenant_members WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenant_connectors WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId} OR slug = 'sso-repo-acme'`
    await sql.end()
  })

  it('upserts a config and resolves by email domain', async () => {
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: 'tid-xyz', client_id: 'cid' },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await upsertSsoEmailDomain(sql, { domain: 'acme.com', tenantId })

    const hit = await resolveSsoByEmail(sql, 'alice@ACME.com')
    expect(hit).toMatchObject({ tenantId, provider: 'entra', enabled: true })
  })

  it('returns null on a miss', async () => {
    expect(await resolveSsoByEmail(sql, 'alice@nowhere.test')).toBeNull()
  })

  it('returns null when config is disabled', async () => {
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: 't', client_id: 'c' },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await sql`UPDATE auth.sso_configs SET enabled = false WHERE tenant_id = ${tenantId}`
    await upsertSsoEmailDomain(sql, { domain: 'acme.com', tenantId })
    expect(await resolveSsoByEmail(sql, 'alice@acme.com')).toBeNull()
  })
})
