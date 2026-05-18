#!/usr/bin/env tsx
import { createAuditWriter } from '@seta/audit'
import { directoryConnector } from '@seta/connector-ms365-directory'
import { plannerConnector } from '@seta/connector-ms365-planner'
import { createConnectorRegistry } from '@seta/connector-registry'
import { createPool } from '@seta/db'
import { createKmsClient, createTokenVault, EntraProvider } from '@seta/oauth'
import { z } from 'zod'
import './_env'

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  PLATFORM_CONNECTOR_CLIENT_ID: z.string().min(1),
  PLATFORM_CONNECTOR_CLIENT_SECRET: z.string().min(1),
  BOOTSTRAP_TENANT_SLUG: z.string().min(1),
  BOOTSTRAP_TENANT_NAME: z.string().min(1),
  BOOTSTRAP_ENTRA_DIRECTORY_ID: z.string().min(1),
  BOOTSTRAP_SSO_CLIENT_ID: z.string().min(1),
  BOOTSTRAP_SSO_CLIENT_SECRET: z.string().min(1),
  BOOTSTRAP_SSO_EMAIL_DOMAINS: z.string().min(1),
  BOOTSTRAP_SUPERADMIN_EMAILS: z.string().min(1),
  BOOTSTRAP_CONNECTORS: z.string().min(1),
  BOOTSTRAP_OFFLINE: z.enum(['0', '1']).default('0'),
  KMS_PROVIDER: z.enum(['aws', 'env']).default('env'),
  DEV_DEK_BASE64: z.string().optional(),
  AWS_REGION: z.string().optional(),
  KMS_KEY_ARN: z.string().optional(),
})

const env = Env.parse(process.env)

const connectorIds = env.BOOTSTRAP_CONNECTORS.split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const superadminEmails = env.BOOTSTRAP_SUPERADMIN_EMAILS.split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (superadminEmails.length === 0) {
  console.error('BOOTSTRAP_SUPERADMIN_EMAILS must contain at least one email')
  process.exit(1)
}

const ownerEmail = z.email().parse(superadminEmails[0])

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
  clientId: env.PLATFORM_CONNECTOR_CLIENT_ID,
  clientSecret: env.PLATFORM_CONNECTOR_CLIENT_SECRET,
})

const bootstrapSsoDomains = env.BOOTSTRAP_SSO_EMAIL_DOMAINS.split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

const SEED_MODE_OFFLINE = env.BOOTSTRAP_OFFLINE === '1'

async function main(): Promise<void> {
  for (const cid of connectorIds) registry.get(cid)

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
      if (!row)
        throw new Error(`tenant insert returned no row for slug=${env.BOOTSTRAP_TENANT_SLUG}`)
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

    const ownerRows = await tx<Array<{ id: string }>>`
      INSERT INTO auth.users (email, name, primary_provider)
      VALUES (${ownerEmail}, ${ownerEmail}, 'entra')
      ON CONFLICT (email) DO UPDATE SET name = excluded.name
      RETURNING id
    `
    const owner = ownerRows[0]
    if (!owner) throw new Error('owner insert returned no row')

    await tx`
      INSERT INTO auth.user_identities (provider, subject, user_id)
      VALUES ('entra', ${`bootstrap:${env.PLATFORM_CONNECTOR_CLIENT_ID}`}, ${owner.id})
      ON CONFLICT (provider, subject) DO NOTHING
    `

    await tx`
      INSERT INTO tenant.tenant_members (user_id, tenant_id, role, source)
      VALUES (${owner.id}, ${id}, 'owner', 'bootstrap')
      ON CONFLICT DO NOTHING
    `

    for (const email of superadminEmails) {
      const validEmail = z.email().parse(email)
      const rows = await tx<Array<{ id: string }>>`
        INSERT INTO auth.users (email, name, primary_provider)
        VALUES (${validEmail}, ${validEmail}, 'entra')
        ON CONFLICT (email) DO UPDATE SET email = excluded.email
        RETURNING id
      `
      const u = rows[0]
      if (!u) continue
      await tx`
        INSERT INTO auth.superadmins (user_id) VALUES (${u.id})
        ON CONFLICT (user_id) DO NOTHING
      `
    }

    await tx`
      INSERT INTO auth.sso_configs
        (tenant_id, provider, config, secret_vault_id, enabled, created_by_user_id)
      VALUES (
        ${id},
        'entra',
        ${tx.json({
          entra_tenant_id: env.BOOTSTRAP_ENTRA_DIRECTORY_ID,
          client_id: env.BOOTSTRAP_SSO_CLIENT_ID,
        } as never)},
        'sso-entra:sso',
        true,
        ${owner.id}
      )
      ON CONFLICT (tenant_id, provider) DO UPDATE
        SET config = excluded.config,
            secret_vault_id = excluded.secret_vault_id,
            enabled = excluded.enabled,
            updated_at = now()
    `

    for (const domain of bootstrapSsoDomains) {
      await tx`
        INSERT INTO auth.sso_email_domains (domain, tenant_id)
        VALUES (${domain}, ${id})
        ON CONFLICT (domain) DO NOTHING
      `
    }

    return id
  })) as unknown as string

  // SSO client secret has no inherent expiry; pick a far-future date so the
  // vault row remains valid until the operator rotates the secret.
  await vault.put(tenantId, 'sso-entra', 'sso', {
    accessToken: env.BOOTSTRAP_SSO_CLIENT_SECRET,
    refreshToken: null,
    scopes: [],
    expiresAt: new Date('2099-01-01T00:00:00Z'),
    meta: { kind: 'sso-client-secret' },
  })

  if (!SEED_MODE_OFFLINE) {
    const bundle = await entra.acquireAppOnly(env.BOOTSTRAP_ENTRA_DIRECTORY_ID, [
      'https://graph.microsoft.com/.default',
    ])
    await vault.put(tenantId, 'entra', `app:${env.PLATFORM_CONNECTOR_CLIENT_ID}`, bundle)
  }

  await audit.recordAudit({
    tenantId,
    actor: { type: 'system', label: 'seed-first-tenant' },
    providerId: 'entra',
    operation: 'tenant.bootstrap',
    result: 'ok',
    metadata: {
      slug: env.BOOTSTRAP_TENANT_SLUG,
      connectors: connectorIds,
      superadmins: superadminEmails.length,
    },
  })

  console.log(
    `✓ seeded tenant ${env.BOOTSTRAP_TENANT_SLUG} (${tenantId}) with ${superadminEmails.length} superadmin(s)`,
  )
  await sql.end()
}

main().catch((err) => {
  console.error('seed-first-tenant failed:', err)
  process.exit(1)
})
