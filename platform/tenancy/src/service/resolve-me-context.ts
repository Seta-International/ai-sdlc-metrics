import type { Sql } from 'postgres'
import type { MeContext, MeContextProvider } from '../me-context-provider'

export type CreateMeContextProviderOpts = {
  sql: Sql
  deployedApps: string[]
}

export function createMeContextProvider(opts: CreateMeContextProviderOpts): MeContextProvider {
  return {
    async resolve(userId: string): Promise<MeContext> {
      const superRows = (await opts.sql`
        SELECT 1 AS ok FROM auth.superadmins WHERE user_id = ${userId} LIMIT 1
      `) as Array<{ ok: number }>
      if (superRows.length > 0) {
        return { tenant: null, isSuperadmin: true, apps: [] }
      }

      const rows = (await opts.sql`
        SELECT t.id::text       AS id,
               t.slug,
               t.display_name   AS "displayName",
               m.role
        FROM tenant.tenant_members m
        JOIN tenant.tenants t ON t.id = m.tenant_id
        WHERE m.user_id = ${userId}
        LIMIT 1
      `) as Array<{ id: string; slug: string; displayName: string | null; role: string }>

      const row = rows[0]
      if (!row) {
        return { tenant: null, isSuperadmin: false, apps: [] }
      }

      return {
        tenant: {
          id: row.id,
          slug: row.slug,
          name: row.displayName ?? row.slug,
          isAdmin: row.role === 'admin' || row.role === 'owner',
        },
        isSuperadmin: false,
        apps: opts.deployedApps,
      }
    },
  }
}
