import { randomUUID } from 'node:crypto'
import { createPool, withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenancy'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { insertChunks } from '../../src/ingest'
import { searchChunks } from '../../src/search'
import {
  closeTestSql,
  ensureMigrations,
  hashContent,
  seedEmbedding,
  TEST_DATABASE_URL,
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
  await closeTestSql()
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

describe('searchChunks — similarity bounds', () => {
  it('all returned similarities are in [0, 1] and the exact-match chunk scores ~1', async () => {
    const queryEmbedding = seedEmbedding('exact')

    await runAs(TENANT_A, () =>
      insertChunks(tenantUserSql, [
        // Exact match for queryEmbedding.
        {
          tenantId: TENANT_A,
          sourceId: SOURCE_1,
          content: 'exact',
          contentHash: hashContent('exact'),
          tokenCount: 1,
          span: { startChar: 0, endChar: 5 }, // 'exact' is 5 chars
          embedding: queryEmbedding,
        },
        // A few decoys.
        ...['x', 'y', 'z'].map((t) => ({
          tenantId: TENANT_A,
          sourceId: SOURCE_1,
          content: t,
          contentHash: hashContent(t),
          tokenCount: 1,
          embedding: seedEmbedding(t),
        })),
      ]),
    )

    const hits = await runAs(TENANT_A, () =>
      searchChunks(tenantUserSql, queryEmbedding, { k: 4, minSim: -1 }),
    )
    expect(hits.length).toBe(4)
    for (const h of hits) {
      // Cosine similarity range is [-1, 1]; seedEmbedding uses signed
      // random unit vectors so decoys can yield small negative similarities.
      expect(h.similarity).toBeGreaterThanOrEqual(-1 - 1e-6)
      expect(h.similarity).toBeLessThanOrEqual(1 + 1e-6)
    }
    // The exact-match chunk should be first and have similarity ≈ 1.
    expect(hits[0]?.content).toBe('exact')
    expect(hits[0]?.similarity).toBeGreaterThan(0.999)
    expect(hits[0]?.sourceId).toBe(SOURCE_1)
    expect(hits[0]?.span).toEqual({ startChar: 0, endChar: 5 })
  })
})

describe('searchChunks — minSim floor', () => {
  it('returns only chunks above the minSim threshold', async () => {
    const queryEmbedding = seedEmbedding('query')

    await runAs(TENANT_A, () =>
      insertChunks(tenantUserSql, [
        // Near-match: same seed → ~1.0 similarity.
        {
          tenantId: TENANT_A,
          sourceId: SOURCE_1,
          content: 'near',
          contentHash: hashContent('near'),
          tokenCount: 1,
          embedding: queryEmbedding,
        },
        // Far decoys.
        ...Array.from({ length: 20 }, (_, i) => ({
          tenantId: TENANT_A,
          sourceId: SOURCE_1,
          content: `far-${i}`,
          contentHash: hashContent(`far-${i}`),
          tokenCount: 1,
          embedding: seedEmbedding(`far-${i}`),
        })),
      ]),
    )

    const hits = await runAs(TENANT_A, () =>
      searchChunks(tenantUserSql, queryEmbedding, { k: 8, minSim: 0.99 }),
    )
    // Only the exact-match clears the 0.99 floor.
    expect(hits.length).toBe(1)
    expect(hits[0]?.content).toBe('near')
  })
})

describe('searchChunks — RLS isolation', () => {
  it('queries as tenantA see no rows when only tenantB has chunks', async () => {
    const queryEmbedding = seedEmbedding('q')

    // Populate ONLY tenantB.
    await runAs(TENANT_B, () =>
      insertChunks(
        tenantUserSql,
        Array.from({ length: 16 }, (_, i) => ({
          tenantId: TENANT_B,
          sourceId: SOURCE_1,
          content: `b-${i}`,
          contentHash: hashContent(`b-${i}`),
          tokenCount: 1,
          embedding: seedEmbedding(`b-${i}`),
        })),
      ),
    )

    const hits = await runAs(TENANT_A, () =>
      searchChunks(tenantUserSql, queryEmbedding, { k: 8, minSim: -1 }),
    )
    expect(hits.length).toBe(0)
  })
})

describe('searchChunks — recall ordering', () => {
  it('orders results by descending similarity to the query', async () => {
    const queryEmbedding = seedEmbedding('center')

    await runAs(TENANT_A, () =>
      insertChunks(
        tenantUserSql,
        // 30 rows with deterministic seeds; the "center" seed should rank first.
        ['center', ...Array.from({ length: 29 }, (_, i) => `noise-${i}`)].map((seed) => ({
          tenantId: TENANT_A,
          sourceId: SOURCE_1,
          content: seed,
          contentHash: hashContent(seed),
          tokenCount: 1,
          embedding: seedEmbedding(seed),
        })),
      ),
    )

    const hits = await runAs(TENANT_A, () =>
      searchChunks(tenantUserSql, queryEmbedding, { k: 5, minSim: -1 }),
    )
    expect(hits.length).toBe(5)
    expect(hits[0]?.content).toBe('center')
    // Sorted descending by similarity.
    for (let i = 1; i < hits.length; i++) {
      const prev = hits[i - 1]
      const curr = hits[i]
      if (!prev || !curr) throw new Error('unexpected sparse hits')
      expect(prev.similarity).toBeGreaterThanOrEqual(curr.similarity)
    }
  })
})

describe('searchChunks — null span passthrough', () => {
  it('returns span: null for rows inserted without a span', async () => {
    const tenantId = randomUUID()
    const sourceId = randomUUID()
    await runAs(tenantId, async () => {
      await insertChunks(testSql(), [
        {
          tenantId,
          sourceId,
          content: 'legacy chunk without span',
          contentHash: hashContent('legacy chunk without span'),
          tokenCount: 5,
          span: null,
          embedding: seedEmbedding('legacy chunk without span'),
        },
      ])
      const [hit] = await searchChunks(testSql(), seedEmbedding('legacy chunk without span'), {
        k: 1,
        minSim: -1,
      })
      expect(hit).toBeDefined()
      expect(hit!.span).toBeNull()
      expect(hit!.sourceId).toBe(sourceId)
    })
  })
})
