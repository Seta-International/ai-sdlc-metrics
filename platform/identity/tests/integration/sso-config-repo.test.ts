import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  deleteSsoConfig,
  deleteSsoEmailDomain,
  getSsoConfigDetail,
  listSsoConfigsWithCounts,
  resolveSsoByEmail,
  setSsoLastTestResult,
  upsertSsoConfig,
  upsertSsoEmailDomain,
} from '../../src/sso-config-repo'

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

  describe('admin helpers', () => {
    const otherTenantId = '00000000-0000-4000-8000-0000000000c2'

    beforeEach(async () => {
      await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id = ${otherTenantId}`
      await sql`DELETE FROM auth.sso_configs WHERE tenant_id = ${otherTenantId}`
      await sql`DELETE FROM tenant.tenant_members WHERE tenant_id = ${otherTenantId}`
      await sql`DELETE FROM tenant.tenant_connectors WHERE tenant_id = ${otherTenantId}`
      await sql`DELETE FROM tenant.tenants WHERE id = ${otherTenantId} OR slug = 'sso-repo-other'`
      await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${otherTenantId}, 'sso-repo-other', 'Other')`
      await upsertSsoConfig(sql, {
        tenantId,
        provider: 'entra',
        config: { entra_tenant_id: 'tid-xyz', client_id: 'cid' },
        secretVaultId: 'sso-entra:sso',
        createdByUserId: null,
      })
      await upsertSsoEmailDomain(sql, { domain: 'acme.com', tenantId })
    })

    it('listSsoConfigsWithCounts returns one row per tenant with status and domain count', async () => {
      const rows = await listSsoConfigsWithCounts(sql)
      const acme = rows.find((r) => r.tenantId === tenantId)
      expect(acme).toMatchObject({ provider: 'entra', enabled: true, domainCount: 1 })
      const other = rows.find((r) => r.tenantId === otherTenantId)
      expect(other).toMatchObject({ provider: null, enabled: false, domainCount: 0 })
    })

    it('getSsoConfigDetail returns the parsed config + domains + hasSecret', async () => {
      const detail = await getSsoConfigDetail(sql, tenantId)
      expect(detail).toMatchObject({
        tenantId,
        provider: 'entra',
        config: { entra_tenant_id: 'tid-xyz', client_id: 'cid' },
        enabled: true,
        hasSecret: true,
        domains: ['acme.com'],
      })
    })

    it('getSsoConfigDetail returns null when no row exists', async () => {
      expect(await getSsoConfigDetail(sql, otherTenantId)).toBeNull()
    })

    it('deleteSsoConfig / deleteSsoEmailDomain remove the row and its domains', async () => {
      await deleteSsoEmailDomain(sql, 'acme.com')
      await deleteSsoConfig(sql, tenantId)
      expect(await getSsoConfigDetail(sql, tenantId)).toBeNull()
      const domains =
        (await sql`SELECT domain FROM auth.sso_email_domains WHERE tenant_id = ${tenantId}`) as Array<{
          domain: string
        }>
      expect(domains).toHaveLength(0)
    })

    it('setSsoLastTestResult persists last_tested_at and last_test_result columns', async () => {
      await setSsoLastTestResult(sql, { tenantId, result: 'ok' })
      const rows = (await sql`
        SELECT last_test_result, last_tested_at
        FROM auth.sso_configs WHERE tenant_id = ${tenantId}
      `) as Array<{ last_test_result: string; last_tested_at: Date }>
      expect(rows[0]?.last_test_result).toBe('ok')
      expect(rows[0]?.last_tested_at).toBeInstanceOf(Date)
    })
  })
})
