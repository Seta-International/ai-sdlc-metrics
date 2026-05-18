import type { Sql } from 'postgres'
import { type MailerConfigDiscriminated, parseMailerConfig } from './mailer-config-schema'

export async function getMailerConfigByTenant(
  sql: Sql,
  tenantId: string,
): Promise<MailerConfigDiscriminated | null> {
  const rows = (await sql`
    SELECT provider, config FROM auth.mailer_configs
    WHERE tenant_id = ${tenantId} AND enabled
    LIMIT 1
  `) as Array<{ provider: string; config: unknown }>
  const r = rows[0]
  if (!r) return null
  return parseMailerConfig({ provider: r.provider, config: r.config })
}

export async function upsertMailerConfig(
  sql: Sql,
  input: {
    tenantId: string
    provider: 'graph'
    config: MailerConfigDiscriminated['config']
    enabled: boolean
  },
): Promise<void> {
  await sql`
    INSERT INTO auth.mailer_configs (tenant_id, provider, config, enabled)
    VALUES (${input.tenantId}, ${input.provider}, ${sql.json(input.config as never)}, ${input.enabled})
    ON CONFLICT (tenant_id, provider) DO UPDATE
      SET config = excluded.config,
          enabled = excluded.enabled,
          updated_at = now()
  `
}

export async function deleteMailerConfig(sql: Sql, tenantId: string): Promise<void> {
  await sql`DELETE FROM auth.mailer_configs WHERE tenant_id = ${tenantId}`
}
