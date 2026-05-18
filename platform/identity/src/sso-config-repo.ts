import type { Sql } from 'postgres'
import { parseSsoConfig, type SsoConfigDiscriminated } from './sso-config-schema'
import { normalizeEmailDomain } from './sso-domain-denylist'

export type SsoResolution = {
  tenantId: string
  provider: 'entra'
  enabled: boolean
}

export async function resolveSsoByEmail(sql: Sql, email: string): Promise<SsoResolution | null> {
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const domain = normalizeEmailDomain(email.slice(at + 1))
  if (!domain) return null
  const rows =
    (await sql`SELECT tenant_id, provider, enabled FROM auth.resolve_sso_by_domain(${domain})`) as Array<{
      tenant_id: string
      provider: 'entra'
      enabled: boolean
    }>
  const row = rows[0]
  if (!row) return null
  if (!row.enabled) return null
  return { tenantId: row.tenant_id, provider: row.provider, enabled: row.enabled }
}

export async function getSsoConfigByTenant(
  sql: Sql,
  tenantId: string,
): Promise<{ row: SsoConfigDiscriminated; secretVaultId: string | null } | null> {
  const rows = (await sql`
    SELECT provider, config, secret_vault_id
    FROM auth.sso_configs
    WHERE tenant_id = ${tenantId} AND enabled
    LIMIT 1
  `) as Array<{ provider: string; config: unknown; secret_vault_id: string | null }>
  const r = rows[0]
  if (!r) return null
  const parsed = parseSsoConfig({ provider: r.provider, config: r.config })
  return { row: parsed, secretVaultId: r.secret_vault_id }
}

export async function upsertSsoConfig(
  sql: Sql,
  input: {
    tenantId: string
    provider: 'entra'
    config: SsoConfigDiscriminated['config']
    secretVaultId: string
    createdByUserId: string | null
  },
): Promise<void> {
  await sql`
    INSERT INTO auth.sso_configs (tenant_id, provider, config, secret_vault_id, enabled, created_by_user_id)
    VALUES (${input.tenantId}, ${input.provider}, ${sql.json(input.config as never)}, ${input.secretVaultId}, true, ${input.createdByUserId})
    ON CONFLICT (tenant_id, provider) DO UPDATE
      SET config = excluded.config,
          secret_vault_id = excluded.secret_vault_id,
          enabled = excluded.enabled,
          updated_at = now()
  `
}

export async function upsertSsoEmailDomain(
  sql: Sql,
  input: { domain: string; tenantId: string },
): Promise<void> {
  const d = (input.domain ?? '').toLowerCase()
  if (!d) return
  await sql`
    INSERT INTO auth.sso_email_domains (domain, tenant_id)
    VALUES (${d}, ${input.tenantId})
    ON CONFLICT (domain) DO NOTHING
  `
}

export type SsoListItemRow = {
  tenantId: string
  slug: string
  displayName: string
  provider: 'entra' | null
  enabled: boolean
  domainCount: number
}

export async function listSsoConfigsWithCounts(sql: Sql): Promise<SsoListItemRow[]> {
  const rows = (await sql`
    SELECT t.id AS tenant_id, t.slug, t.display_name,
           c.provider, COALESCE(c.enabled, false) AS enabled,
           COALESCE(d.cnt, 0)::int AS domain_count
    FROM tenant.tenants t
    LEFT JOIN auth.sso_configs c ON c.tenant_id = t.id
    LEFT JOIN (
      SELECT tenant_id, COUNT(*)::int AS cnt
      FROM auth.sso_email_domains GROUP BY tenant_id
    ) d ON d.tenant_id = t.id
    ORDER BY t.display_name, t.slug
  `) as Array<{
    tenant_id: string
    slug: string
    display_name: string
    provider: 'entra' | null
    enabled: boolean
    domain_count: number
  }>
  return rows.map((r) => ({
    tenantId: r.tenant_id,
    slug: r.slug,
    displayName: r.display_name,
    provider: r.provider,
    enabled: r.enabled,
    domainCount: r.domain_count,
  }))
}

export type SsoConfigDetailRow = {
  tenantId: string
  provider: 'entra'
  config: { entra_tenant_id: string; client_id: string }
  enabled: boolean
  hasSecret: boolean
  domains: string[]
  lastTestedAt: string | null
  lastTestResult: string | null
}

export async function getSsoConfigDetail(
  sql: Sql,
  tenantId: string,
): Promise<SsoConfigDetailRow | null> {
  const rows = (await sql`
    SELECT c.provider, c.config, c.secret_vault_id, c.enabled,
           c.last_tested_at, c.last_test_result
    FROM auth.sso_configs c
    WHERE c.tenant_id = ${tenantId}
    LIMIT 1
  `) as Array<{
    provider: string
    config: unknown
    secret_vault_id: string | null
    enabled: boolean
    last_tested_at: Date | null
    last_test_result: string | null
  }>
  const r = rows[0]
  if (!r) return null
  const parsed = parseSsoConfig({ provider: r.provider, config: r.config })
  if (parsed.provider !== 'entra') return null
  const domainRows = (await sql`
    SELECT domain FROM auth.sso_email_domains WHERE tenant_id = ${tenantId} ORDER BY domain
  `) as Array<{ domain: string }>
  return {
    tenantId,
    provider: 'entra',
    config: parsed.config,
    enabled: r.enabled,
    hasSecret: r.secret_vault_id !== null,
    domains: domainRows.map((d) => d.domain),
    lastTestedAt: r.last_tested_at?.toISOString() ?? null,
    lastTestResult: r.last_test_result,
  }
}

export async function deleteSsoConfig(sql: Sql, tenantId: string): Promise<void> {
  await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id = ${tenantId}`
  await sql`DELETE FROM auth.sso_configs WHERE tenant_id = ${tenantId}`
}

export async function deleteSsoEmailDomain(sql: Sql, domain: string): Promise<void> {
  await sql`DELETE FROM auth.sso_email_domains WHERE domain = ${domain.toLowerCase()}`
}

export async function setSsoLastTestResult(
  sql: Sql,
  input: { tenantId: string; result: string },
): Promise<void> {
  await sql`
    UPDATE auth.sso_configs
       SET last_test_result = ${input.result},
           last_tested_at   = now()
     WHERE tenant_id = ${input.tenantId}
  `
}
