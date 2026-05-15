import { NotFound } from '@seta/middleware'

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
type SqlTransaction = Sql & { begin: (fn: (tx: Sql) => Promise<void>) => Promise<void> }

export type TenantMembershipRole = 'owner' | 'admin' | 'member'

export type TenantMembershipRow = {
  id: string
  name: string
  role: TenantMembershipRole
}

export async function listTenantsForUser(sql: Sql, userId: string): Promise<TenantMembershipRow[]> {
  const rows = (await sql`
    SELECT t.id::text AS id,
           COALESCE(t.display_name, t.slug) AS name,
           m.role AS role
    FROM tenant.tenant_members m
    JOIN tenant.tenants t ON t.id = m.tenant_id
    WHERE m.user_id = ${userId}
      AND t.status = 'active'
    ORDER BY name ASC
  `) as Array<{ id: string; name: string; role: TenantMembershipRole }>
  return rows.map((r) => ({ id: r.id, name: r.name, role: r.role }))
}

export async function isConnectorConsented(
  sql: Sql,
  tenantId: string,
  connectorId: string,
): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 AS ok FROM tenant.tenant_connectors
    WHERE tenant_id = ${tenantId}
      AND connector_id = ${connectorId}
      AND status = 'active'
    LIMIT 1
  `) as Array<{ ok: number }>
  return rows.length > 0
}

export async function getActiveTenantIds(sql: Sql): Promise<string[]> {
  const rows = (await sql`
    SELECT DISTINCT id::text FROM tenant.tenants WHERE status = 'active'
  `) as Array<{ id: string }>
  return rows.map((r) => r.id)
}

export async function recordConsent(
  sql: SqlTransaction,
  input: {
    tenantId: string
    connectorIds: string[]
    scopesGranted: { delegated: string[]; application: string[] }
  },
): Promise<void> {
  await sql.begin(async (tx) => {
    const exists =
      (await tx`SELECT 1 FROM tenant.tenants WHERE id = ${input.tenantId} LIMIT 1`) as Array<unknown>
    if (exists.length === 0) throw new NotFound('tenant')
    for (const connectorId of input.connectorIds) {
      await tx`
        INSERT INTO tenant.tenant_connectors
          (tenant_id, connector_id, status, consented_at, scope_set)
        VALUES (${input.tenantId}, ${connectorId}, 'active', now(), ${JSON.stringify(input.scopesGranted)}::jsonb)
        ON CONFLICT (tenant_id, connector_id) DO UPDATE
          SET status       = 'active',
              consented_at = excluded.consented_at,
              scope_set    = excluded.scope_set,
              updated_at   = now()
      `
    }
  })
}

export * from './members'
