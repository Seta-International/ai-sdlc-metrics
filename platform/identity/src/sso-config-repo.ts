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
