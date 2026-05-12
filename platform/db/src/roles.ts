import { pgRole } from 'drizzle-orm/pg-core'

/** Application connection role. RLS-enforced. */
export const tenantUser = pgRole('tenant_user')

/**
 * Platform operator role. BYPASSRLS — used for migrations + ops only.
 *
 * BYPASSRLS is set at role creation in infra/postgres/init.sql; drizzle's
 * pgRole config in 0.45.2 doesn't model that attribute, so it lives in SQL.
 */
export const platformAdmin = pgRole('platform_admin')
