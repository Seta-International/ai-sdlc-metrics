import { existsSync } from 'node:fs'
import * as path from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

export const OWNER_ORDER = [
  'identity',
  'tenancy',
  'directory',
  'oauth',
  'audit',
  'connector_ms365_directory',
  'connector_ms365_planner',
  'planner',
  'analytics',
  'agent_server',
  'agent_memory',
  'agent_workflows',
  'agent_vector',
] as const

export type Owner = (typeof OWNER_ORDER)[number]

const OWNER_PACKAGE_PATH: Record<Owner, string> = {
  identity: 'platform/identity/migrations',
  tenancy: 'platform/tenancy/migrations',
  directory: 'platform/directory/migrations',
  oauth: 'platform/oauth/migrations',
  audit: 'platform/audit/migrations',
  connector_ms365_directory: 'modules/connectors/ms365-directory/migrations',
  connector_ms365_planner: 'modules/connectors/ms365-planner/migrations',
  planner: 'modules/products/planner/migrations',
  analytics: 'modules/products/analytics/migrations',
  agent_server: 'platform/agent/server/migrations',
  agent_memory: 'platform/agent/memory/migrations',
  agent_workflows: 'platform/agent/workflows/migrations',
  agent_vector: 'platform/agent/vector/migrations',
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

  const sql = postgres(opts.url, { max: 1, prepare: false, onnotice: () => {} })
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
      // Skip owners that don't have a migrations dir yet.
      // drizzle-orm 0.45.2's migrator throws a plain Error when meta/_journal.json
      // is missing, so we check up-front rather than parsing error messages.
      if (!existsSync(path.join(migrationsFolder, 'meta', '_journal.json'))) continue
      // Per-owner migrations table: drizzle's migrator skips entries when the
      // last-applied row's created_at is later than the entry's folderMillis.
      // Sharing one table across owners makes a later-authored migration in
      // owner A silently skip earlier-timestamped migrations in owner B.
      await drizzleMigrate(db, {
        migrationsFolder,
        migrationsTable: `__drizzle_migrations_${owner}`,
      })
    }
  } finally {
    await sql.end()
  }
}
