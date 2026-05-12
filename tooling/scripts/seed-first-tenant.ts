#!/usr/bin/env tsx
import 'dotenv/config'
import { createAuditWriter } from '@seta/audit'
import { directoryConnector } from '@seta/connector-ms365-directory'
import { plannerConnector } from '@seta/connector-ms365-planner'
import { createConnectorRegistry } from '@seta/connector-registry'
import { createPool } from '@seta/db'
import { createKmsClient, createTokenVault, EntraProvider } from '@seta/oauth'
import { z } from 'zod'

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  BOOTSTRAP_TENANT_SLUG: z.string().min(1),
  BOOTSTRAP_TENANT_NAME: z.string().min(1),
  BOOTSTRAP_ENTRA_TENANT_ID: z.string().min(1),
  BOOTSTRAP_ENTRA_CLIENT_ID: z.string().min(1),
  BOOTSTRAP_ENTRA_CLIENT_SECRET: z.string().min(1),
  BOOTSTRAP_ADMIN_EMAIL: z.email(),
  BOOTSTRAP_CONNECTORS: z.string().min(1),
  BOOTSTRAP_OFFLINE: z.string().optional(),
  KMS_PROVIDER: z.enum(['aws', 'env']).default('env'),
  DEV_DEK_BASE64: z.string().optional(),
  AWS_REGION: z.string().optional(),
  KMS_KEY_ARN: z.string().optional(),
})

const env = Env.parse(process.env)
const connectorIds = env.BOOTSTRAP_CONNECTORS.split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const sql = createPool(env.DATABASE_URL)
const kms = createKmsClient({
  KMS_PROVIDER: env.KMS_PROVIDER,
  ...(env.AWS_REGION ? { AWS_REGION: env.AWS_REGION } : {}),
  ...(env.KMS_KEY_ARN ? { KMS_KEY_ARN: env.KMS_KEY_ARN } : {}),
  ...(env.DEV_DEK_BASE64 ? { DEV_DEK_BASE64: env.DEV_DEK_BASE64 } : {}),
})
const vault = createTokenVault({ sql, kms })
const audit = createAuditWriter(sql)
const registry = createConnectorRegistry()
registry.register(plannerConnector)
registry.register(directoryConnector)

const entra = new EntraProvider({
  clientId: env.BOOTSTRAP_ENTRA_CLIENT_ID,
  clientSecret: env.BOOTSTRAP_ENTRA_CLIENT_SECRET,
})

const SEED_MODE_OFFLINE = env.BOOTSTRAP_OFFLINE === '1'

async function main(): Promise<void> {
  const tenantId = (await sql.begin(async (tx) => {
    const existing = await tx<
      Array<{ id: string }>
    >`SELECT id FROM tenant.tenants WHERE slug = ${env.BOOTSTRAP_TENANT_SLUG}`
    let id: string
    const found = existing[0]
    if (found) {
      id = found.id
    } else {
      const rows = await tx<Array<{ id: string }>>`
        INSERT INTO tenant.tenants (slug, display_name, status)
        VALUES (${env.BOOTSTRAP_TENANT_SLUG}, ${env.BOOTSTRAP_TENANT_NAME}, 'active')
        RETURNING id
      `
      const row = rows[0]
      if (!row) throw new Error('tenant insert returned no row')
      id = row.id
    }

    for (const cid of connectorIds) {
      const def = registry.get(cid)
      await tx`
        INSERT INTO tenant.tenant_connectors (tenant_id, connector_id, status, consented_at, scope_set)
        VALUES (${id}, ${cid}, 'active', now(), ${tx.json(def.requiredScopes as never)})
        ON CONFLICT (tenant_id, connector_id) DO UPDATE
          SET status     = 'active',
              scope_set  = excluded.scope_set,
              updated_at = now()
      `
    }

    await tx`
      INSERT INTO auth.users (tenant_id, external_provider, external_subject, email, display_name, status)
      VALUES (
        ${id},
        'entra',
        ${`bootstrap:${env.BOOTSTRAP_ENTRA_CLIENT_ID}`},
        ${env.BOOTSTRAP_ADMIN_EMAIL},
        ${env.BOOTSTRAP_ADMIN_EMAIL},
        'active'
      )
      ON CONFLICT (external_provider, external_subject) DO NOTHING
    `

    return id
  })) as unknown as string

  if (!SEED_MODE_OFFLINE) {
    const bundle = await entra.acquireAppOnly(env.BOOTSTRAP_ENTRA_TENANT_ID, [
      'https://graph.microsoft.com/.default',
    ])
    await vault.put(tenantId, 'entra', `app:${env.BOOTSTRAP_ENTRA_CLIENT_ID}`, bundle)
  }

  await audit.recordAudit({
    tenantId,
    actor: { type: 'system', label: 'seed-first-tenant' },
    providerId: 'entra',
    operation: 'tenant.bootstrap',
    result: 'ok',
    metadata: { slug: env.BOOTSTRAP_TENANT_SLUG, connectors: connectorIds },
  })

  console.log(`✓ seeded tenant ${env.BOOTSTRAP_TENANT_SLUG} (${tenantId})`)
  await sql.end()
}

main().catch((err) => {
  console.error('seed-first-tenant failed:', err)
  process.exit(1)
})
