import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

function resolveScript(): string {
  const candidates = [
    path.resolve(process.cwd(), 'tooling/scripts/seed-first-tenant.ts'),
    path.resolve(process.cwd(), '../../tooling/scripts/seed-first-tenant.ts'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  throw new Error('seed-first-tenant.ts not found')
}

describe('seed-first-tenant.ts', () => {
  const sql = postgres(URL, { max: 1, prepare: false, onnotice: () => {} })

  beforeAll(async () => {
    await sql`DELETE FROM oauth.oauth_tokens WHERE tenant_id IN (SELECT id FROM tenant.tenants WHERE slug = 'seed-test')`
    await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id IN (SELECT id FROM tenant.tenants WHERE slug = 'seed-test')`
    await sql`DELETE FROM auth.sso_configs WHERE tenant_id IN (SELECT id FROM tenant.tenants WHERE slug = 'seed-test')`
    await sql`DELETE FROM tenant.tenant_members WHERE tenant_id IN (SELECT id FROM tenant.tenants WHERE slug = 'seed-test')`
    await sql`DELETE FROM tenant.tenant_connectors WHERE tenant_id IN (SELECT id FROM tenant.tenants WHERE slug = 'seed-test')`
    await sql`DELETE FROM audit.audit_log WHERE tenant_id IN (SELECT id FROM tenant.tenants WHERE slug = 'seed-test')`
    await sql`DELETE FROM tenant.tenants WHERE slug = 'seed-test'`
  })

  afterAll(() => sql.end())

  it('is idempotent — second run is a no-op', async () => {
    const env = {
      ...process.env,
      DATABASE_URL: URL,
      ENTRA_CLIENT_ID: 'connector-client-seed',
      ENTRA_CLIENT_SECRET: 'connector-secret-seed',
      BOOTSTRAP_TENANT_SLUG: 'seed-test',
      BOOTSTRAP_TENANT_NAME: 'Seed Test Tenant',
      BOOTSTRAP_ENTRA_DIRECTORY_ID: 'tid-seed',
      BOOTSTRAP_SSO_CLIENT_ID: 'sso-client-seed',
      BOOTSTRAP_SSO_CLIENT_SECRET: 'sso-secret-seed',
      BOOTSTRAP_SSO_EMAIL_DOMAINS: 'seed.example',
      BOOTSTRAP_SUPERADMIN_EMAILS: 'admin@seed.example',
      BOOTSTRAP_CONNECTORS: 'ms365-planner,ms365-directory',
      BOOTSTRAP_OFFLINE: '1',
      KMS_PROVIDER: 'env',
      DEV_DEK_BASE64: Buffer.alloc(32, 1).toString('base64'),
    } as NodeJS.ProcessEnv

    const script = resolveScript()
    const tooling = path.dirname(path.dirname(script))
    execSync(`pnpm tsx ${script}`, { env, stdio: 'pipe', cwd: tooling })

    const after1 = await sql<
      Array<{ id: string }>
    >`SELECT id FROM tenant.tenants WHERE slug = 'seed-test'`
    expect(after1).toHaveLength(1)
    const firstId = after1[0]?.id
    expect(firstId).toBeDefined()

    const tcs1 = await sql<Array<{ connector_id: string }>>`
      SELECT connector_id FROM tenant.tenant_connectors WHERE tenant_id = ${firstId as string}
    `
    expect(tcs1.map((t) => t.connector_id).sort()).toEqual(['ms365-directory', 'ms365-planner'])

    const ssoRows = await sql<Array<{ provider: string }>>`
      SELECT provider FROM auth.sso_configs WHERE tenant_id = ${firstId as string}
    `
    expect(ssoRows.map((r) => r.provider)).toEqual(['entra'])

    const domainRows = await sql<Array<{ domain: string }>>`
      SELECT domain FROM auth.sso_email_domains WHERE tenant_id = ${firstId as string}
    `
    expect(domainRows.map((r) => r.domain)).toEqual(['seed.example'])

    execSync(`pnpm tsx ${script}`, { env, stdio: 'pipe', cwd: tooling })
    const after2 = await sql<
      Array<{ id: string }>
    >`SELECT id FROM tenant.tenants WHERE slug = 'seed-test'`
    expect(after2).toHaveLength(1)
    expect(after2[0]?.id).toBe(firstId)
  })
})
