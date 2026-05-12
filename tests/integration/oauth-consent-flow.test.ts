import { createAuditWriter } from '@seta/audit'
import { directoryConnector } from '@seta/connector-ms365-directory'
import { plannerConnector } from '@seta/connector-ms365-planner'
import { createConnectorRegistry } from '@seta/connector-registry'
import { createPool } from '@seta/db'
import { onError } from '@seta/middleware'
import {
  createKmsClient,
  createOAuthRoutes,
  createStateStore,
  createTokenVault,
  EntraProvider,
} from '@seta/oauth'
import { Hono } from 'hono'
import { afterAll, describe, expect, it, vi } from 'vitest'

const URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const tenantIdGuid = '77777777-7777-7777-7777-777777777777'

describe('OAuth consent flow — end-to-end', () => {
  const sql = createPool(URL)

  afterAll(async () => {
    // Cleanup
    await sql`DELETE FROM oauth.oauth_tokens WHERE tenant_id = ${tenantIdGuid}`
    await sql`DELETE FROM tenant.tenant_connectors WHERE tenant_id = ${tenantIdGuid}`
    await sql`DELETE FROM audit.audit_log WHERE tenant_id = ${tenantIdGuid}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantIdGuid}`
    await sql.end()
  })

  it('consent-url → callback writes tenant + tenant_connectors + vault row + audit', async () => {
    // Pre-test cleanup so a previous run doesn't poison state
    await sql`DELETE FROM oauth.oauth_tokens WHERE tenant_id = ${tenantIdGuid}`
    await sql`DELETE FROM tenant.tenant_connectors WHERE tenant_id = ${tenantIdGuid}`
    await sql`DELETE FROM audit.audit_log WHERE tenant_id = ${tenantIdGuid}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantIdGuid}`

    const kms = createKmsClient({
      KMS_PROVIDER: 'env',
      DEV_DEK_BASE64: Buffer.alloc(32, 21).toString('base64'),
    })
    const vault = createTokenVault({ sql, kms })
    const stateStore = createStateStore(sql)
    const audit = createAuditWriter(sql)

    const registry = createConnectorRegistry(async () => true)
    registry.register(plannerConnector)
    registry.register(directoryConnector)

    const fakeCca = () => ({
      acquireTokenByClientCredential: vi.fn().mockResolvedValue({
        accessToken: 'e2e-app-token',
        expiresOn: new Date(Date.now() + 3600_000),
        scopes: ['https://graph.microsoft.com/.default'],
        account: { tenantId: tenantIdGuid, homeAccountId: `cred:${tenantIdGuid}` },
        tenantId: tenantIdGuid,
      }),
    })
    const entra = new EntraProvider({
      clientId: 'client-e2e',
      clientSecret: 'secret',
      ccaFactory: fakeCca as never,
    })

    const app = new Hono().onError(onError).route(
      '/oauth',
      createOAuthRoutes({
        providers: { entra },
        registry,
        stateStore,
        vault,
        audit,
        redirectBase: 'http://localhost',
        onConsented: async ({ tenantId, connectorIds, scopesGranted }) => {
          await sql.begin(async (tx) => {
            await tx`
              INSERT INTO tenant.tenants (id, slug, display_name, status)
              VALUES (${tenantId}, ${`e2e-${tenantId}`}, ${tenantId}, 'active')
              ON CONFLICT (id) DO NOTHING
            `
            for (const cid of connectorIds) {
              await tx`
                INSERT INTO tenant.tenant_connectors (tenant_id, connector_id, status, consented_at, scope_set)
                VALUES (${tenantId}, ${cid}, 'active', now(), ${tx.json(scopesGranted as never)})
                ON CONFLICT (tenant_id, connector_id) DO UPDATE
                  SET status = 'active', updated_at = now()
              `
            }
          })
        },
      }),
    )

    // 1. consent-url
    const urlRes = await app.request('/oauth/entra/consent-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connectors: ['ms365-planner', 'ms365-directory'] }),
    })
    expect(urlRes.status).toBe(200)
    const { url, state } = (await urlRes.json()) as { url: string; state: string }
    expect(url).toContain('adminconsent')

    // 2. callback
    const cbRes = await app.request(
      `/oauth/entra/callback?admin_consent=True&tenant=${tenantIdGuid}&state=${state}`,
    )
    expect(cbRes.status).toBe(200)
    expect(await cbRes.text()).toContain('Connected')

    // 3. verify side-effects
    const tenants = await sql<
      Array<{ id: string }>
    >`SELECT id FROM tenant.tenants WHERE id = ${tenantIdGuid}`
    expect(tenants).toHaveLength(1)

    const tcs = await sql<Array<{ connector_id: string; status: string }>>`
      SELECT connector_id, status FROM tenant.tenant_connectors WHERE tenant_id = ${tenantIdGuid}
    `
    expect(tcs.map((t) => t.connector_id).sort()).toEqual(['ms365-directory', 'ms365-planner'])
    expect(tcs.every((t) => t.status === 'active')).toBe(true)

    const bundle = await vault.get(tenantIdGuid, 'entra', 'app:client-e2e')
    expect(bundle?.accessToken).toBe('e2e-app-token')

    const auditRows = await sql<Array<{ operation: string }>>`
      SELECT operation FROM audit.audit_log WHERE tenant_id = ${tenantIdGuid} ORDER BY ts DESC LIMIT 1
    `
    expect(auditRows[0]?.operation).toBe('oauth.admin_consent')
  })
})
