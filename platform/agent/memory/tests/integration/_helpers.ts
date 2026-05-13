import { createPool, type DbSql, runMigrations } from '@seta/db'
import postgres from 'postgres'

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

let cachedSql: DbSql | undefined

/**
 * Returns a pooled connection running as `tenant_user` (RLS enforced).
 * Caller is responsible for using `withTenant(...)` for any tenant-scoped query.
 */
export function testSql(): DbSql {
  if (!cachedSql) {
    cachedSql = createPool(TEST_DATABASE_URL)
  }
  return cachedSql
}

/** Apply migrations for every owner up through agent_memory. */
export async function ensureMigrations(): Promise<void> {
  await runMigrations({
    url: TEST_DATABASE_URL,
    roleName: 'platform_admin',
    repoRoot: findRepoRoot(),
  })
}

/**
 * Truncate the three agent_memory tables and the audit log via platform_admin
 * (RLS bypass). Call inside beforeEach for clean state per test.
 */
export async function truncateMemoryTables(): Promise<void> {
  const admin = postgres(TEST_DATABASE_URL, { max: 1, prepare: false })
  try {
    await admin.unsafe(
      `TRUNCATE agent_memory.messages, agent_memory.threads, agent_memory.resources, audit.audit_log RESTART IDENTITY CASCADE`,
    )
  } finally {
    await admin.end()
  }
}

function findRepoRoot(): string {
  // tests run from the package dir; go up to repo root.
  // platform/agent/memory → up 3
  return new URL('../../../../', import.meta.url).pathname
}
