import { fileURLToPath } from 'node:url'
import { createOpenAIEmbeddings, type EmbeddingsClient } from '@seta/agent-embeddings'
import { createPool, type DbSql, runMigrations } from '@seta/db'
import postgres from 'postgres'

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

let cachedSql: DbSql | undefined
let cachedTenantUserSql: DbSql | undefined

/** Pooled superuser connection (bypasses RLS). Use for setup/ingest under one tenant. */
export function testSql(): DbSql {
  if (!cachedSql) {
    cachedSql = createPool(TEST_DATABASE_URL)
  }
  return cachedSql
}

/**
 * Pooled connection running as `tenant_user` — RLS enforced.
 * Required for tests that assert cross-tenant isolation.
 */
export function tenantUserSql(): DbSql {
  if (!cachedTenantUserSql) {
    const url = TEST_DATABASE_URL.replace(
      /(postgres:\/\/)[^:]+:[^@]+@/,
      '$1tenant_user:dev_only_change_me@',
    )
    cachedTenantUserSql = createPool(url)
  }
  return cachedTenantUserSql
}

/** Apply every owner's migrations through agent_vector. */
export async function ensureMigrations(): Promise<void> {
  await runMigrations({
    url: TEST_DATABASE_URL,
    roleName: 'platform_admin',
    repoRoot: findRepoRoot(),
  })
}

/** Truncate the agent_vector tables via platform_admin (RLS bypass). */
export async function truncateVectorTables(): Promise<void> {
  const admin = postgres(TEST_DATABASE_URL, { max: 1, prepare: false })
  try {
    await admin.unsafe(`TRUNCATE agent_vector.chunks RESTART IDENTITY CASCADE`)
  } finally {
    await admin.end()
  }
}

/** Build the embeddings client used by the test ingest path. */
export function buildEmbeddings(): EmbeddingsClient {
  return createOpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY ?? 'sk-test',
  })
}

function findRepoRoot(): string {
  // _helpers.ts is at platform/agent/rag/tests/integration/_helpers.ts
  // 5 hops up: integration/ → tests/ → rag/ → agent/ → platform/ → repo root
  return fileURLToPath(new URL('../../../../../', import.meta.url))
}
