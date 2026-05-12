import { existsSync } from 'node:fs'
import * as path from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

export const OWNER_ORDER = [
  'auth',
  'tenant',
  'directory',
  'oauth',
  'audit',
  'connector_ms365_directory',
  'connector_ms365_planner',
  'agent',
] as const

export type Owner = (typeof OWNER_ORDER)[number]

const OWNER_PACKAGE_PATH: Record<Owner, string> = {
  auth: 'platform/auth/migrations',
  tenant: 'platform/tenant/migrations',
  directory: 'platform/directory/migrations',
  oauth: 'platform/oauth/migrations',
  audit: 'platform/audit/migrations',
  connector_ms365_directory: 'modules/connectors/ms365-directory/migrations',
  connector_ms365_planner: 'modules/connectors/ms365-planner/migrations',
  agent: 'modules/products/agent/migrations',
}

export type RunMigrationsOpts = {
  url: string
  roleName?: string
  repoRoot?: string
  owners?: readonly Owner[]
}

/** Applies every owner's migrations in dependency order. */
export async function runMigrations(opts: RunMigrationsOpts): Promise<void> {
  const repoRoot = opts.repoRoot ?? process.cwd()
  const owners = opts.owners ?? OWNER_ORDER

  const sql = postgres(opts.url, { max: 1, prepare: false })
  try {
    if (opts.roleName) {
      // Use unsafe() because SET ROLE doesn't accept bind parameters and the
      // role name is operator-controlled (not user-controlled). Caller must
      // pass a trusted role name.
      await sql.unsafe(`SET ROLE "${opts.roleName.replace(/"/g, '""')}"`)
    }
    const db = drizzle(sql)

    for (const owner of owners) {
      const migrationsFolder = path.join(repoRoot, OWNER_PACKAGE_PATH[owner])
      // Skip owners that don't have a migrations dir yet (e.g., agent in Epic 1).
      // drizzle-orm 0.45.2's migrator throws a plain Error when meta/_journal.json
      // is missing, so we check up-front rather than parsing error messages.
      if (!existsSync(path.join(migrationsFolder, 'meta', '_journal.json'))) continue
      await drizzleMigrate(db, { migrationsFolder })
    }
  } finally {
    await sql.end()
  }
}
