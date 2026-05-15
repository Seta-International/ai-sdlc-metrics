import { createPool, withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenant'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { insertChunks } from '../../src/ingest'
import { searchChunks } from '../../src/search'
import {
  ensureMigrations,
  hashContent,
  seedEmbedding,
  TEST_DATABASE_URL,
  testSql,
  truncateVectorTables,
} from './_helpers'

const TENANT_USER_URL = TEST_DATABASE_URL.replace(
  /(postgres:\/\/)[^:]+:[^@]+@/,
  '$1tenant_user:dev_only_change_me@',
)
const tenantUserSql = createPool(TENANT_USER_URL)

const TENANT_A = '00000000-0000-0000-0000-00000000000a'
const TENANT_B = '00000000-0000-0000-0000-00000000000b'
const SOURCE_1 = '00000000-0000-0000-0000-000000000001'

function runAs<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId }, fn)
}

beforeAll(async () => {
  await ensureMigrations()
})

afterAll(async () => {
  await testSql().end({ timeout: 2 })
  await tenantUserSql.end({ timeout: 2 })
})

beforeEach(async () => {
  await truncateVectorTables()
})

describe('searchChunks — iterative_scan correctness under RLS (load-bearing)', () => {
  it('returns exactly k results all belonging to the querying tenant', async () => {
    const k = 8
    const perTenant = 10 * k // 80 rows per tenant — ≥10× k as required by SCOPE
    const queryEmbedding = seedEmbedding('query-seed')

    // Insert perTenant rows for tenantA and tenantB interleaved.
    await runAs(TENANT_A, () =>
      insertChunks(
        tenantUserSql,
        Array.from({ length: perTenant }, (_, i) => ({
          tenantId: TENANT_A,
          sourceId: SOURCE_1,
          content: `a-${i}`,
          contentHash: hashContent(`a-${i}`),
          tokenCount: 1,
          embedding: seedEmbedding(`a-${i}`),
        })),
      ),
    )
    await runAs(TENANT_B, () =>
      insertChunks(
        tenantUserSql,
        Array.from({ length: perTenant }, (_, i) => ({
          tenantId: TENANT_B,
          sourceId: SOURCE_1,
          content: `b-${i}`,
          contentHash: hashContent(`b-${i}`),
          tokenCount: 1,
          embedding: seedEmbedding(`b-${i}`),
        })),
      ),
    )

    // Query as tenantA — assert exactly k results, all tenantA's.
    const hits = await runAs(TENANT_A, () =>
      searchChunks(tenantUserSql, queryEmbedding, { k, minSim: -1 }),
    )
    expect(hits.length).toBe(k)
    // Cross-check rows by joining IDs back to chunks (RLS still scoped to tenantA).
    const ids = hits.map((h) => h.id)
    const owners = await runAs(TENANT_A, () =>
      withTenant(tenantUserSql, TENANT_A, async (tx) => {
        return tx<{ tenant_id: string }[]>`
          SELECT tenant_id FROM agent_vector.chunks
          WHERE id = ANY(${ids}::uuid[])
        `
      }),
    )
    expect(owners.every((r) => r.tenant_id === TENANT_A)).toBe(true)
  })
})
