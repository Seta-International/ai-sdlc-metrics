import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createPool, type DbSql, runMigrations } from '@seta/db'
import postgres from 'postgres'

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

let cachedSql: DbSql | undefined

/**
 * Pooled connection running as `tenant_user` (RLS enforced).
 * Use `withTenant(...)` for any tenant-scoped query.
 */
export function testSql(): DbSql {
  if (!cachedSql) {
    cachedSql = createPool(TEST_DATABASE_URL)
  }
  return cachedSql
}

// With singleFork+isolate:false the module-level pool is shared across test
// files; ending it in one file's afterAll would leave subsequent files with a
// dead pool. Reset the cache on close so the next caller re-creates.
export async function closeTestSql(): Promise<void> {
  if (cachedSql) {
    const sql = cachedSql
    cachedSql = undefined
    await sql.end({ timeout: 2 })
  }
}

/** Apply every owner's migrations up through agent_vector. */
export async function ensureMigrations(): Promise<void> {
  await runMigrations({
    url: TEST_DATABASE_URL,
    roleName: 'platform_admin',
    repoRoot: findRepoRoot(),
  })
}

/**
 * Truncate the agent_vector tables via platform_admin (RLS bypass).
 * Call inside beforeEach for clean state per test.
 */
export async function truncateVectorTables(): Promise<void> {
  const admin = postgres(TEST_DATABASE_URL, { max: 1, prepare: false })
  try {
    await admin.unsafe(`TRUNCATE agent_vector.chunks RESTART IDENTITY CASCADE`)
  } finally {
    await admin.end()
  }
}

/**
 * Deterministic 1536-d unit vector derived from a text seed.
 * Not a real embedding — used by integration tests for stable nearest-
 * neighbour relationships without depending on OpenAI.
 */
export function seedEmbedding(seed: string): number[] {
  const dims = 1536
  const out = new Array<number>(dims)
  const digest = createHash('sha256').update(seed).digest()
  let state = digest.readUInt32BE(0) || 1
  for (let i = 0; i < dims; i++) {
    // xorshift32
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state = state >>> 0
    out[i] = (state / 0xffffffff) * 2 - 1
  }
  // L2-normalize so cosine similarity is in a sane range.
  let mag = 0
  for (const v of out) mag += v * v
  mag = Math.sqrt(mag) || 1
  for (const [i, v] of out.entries()) out[i] = v / mag
  return out
}

/** sha256 hex of UTF-8 bytes — caller-side hash for test fixtures. */
export function hashContent(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function findRepoRoot(): string {
  // _helpers.ts is at platform/agent/vector/tests/integration/_helpers.ts
  // new URL('../', fileUrl) goes up one directory from the file's parent.
  // 5 hops: integration/ → tests/ → vector/ → agent/ → platform/ → repo root
  return fileURLToPath(new URL('../../../../../', import.meta.url))
}
