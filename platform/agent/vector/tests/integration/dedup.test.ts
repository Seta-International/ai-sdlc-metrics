import { randomUUID } from 'node:crypto'
import { createPool, withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenancy'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { findExistingHashes, insertChunks } from '../../src/ingest'
import {
  closeTestSql,
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
const SOURCE_2 = '00000000-0000-0000-0000-000000000002'

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

describe('findExistingHashes — happy path', () => {
  it('returns the hash of a previously-inserted chunk', async () => {
    const h = hashContent('hello')
    await runAs(TENANT_A, async () => {
      await insertChunks(testSql(), [
        {
          tenantId: TENANT_A,
          sourceId: SOURCE_1,
          content: 'hello',
          contentHash: h,
          tokenCount: 1,
          embedding: seedEmbedding('hello'),
        },
      ])
      const found = await findExistingHashes(testSql(), SOURCE_1, [h])
      expect(found).toEqual(new Set([h]))
    })
  })
})

describe('insertChunks — idempotency', () => {
  it('re-inserting the same (tenant, source, hash) is a no-op (row count stays 1)', async () => {
    const h = hashContent('hello')
    const row = {
      tenantId: TENANT_A,
      sourceId: SOURCE_1,
      content: 'hello',
      contentHash: h,
      tokenCount: 1,
      embedding: seedEmbedding('hello'),
    }
    await runAs(TENANT_A, async () => {
      await insertChunks(testSql(), [row])
      await insertChunks(testSql(), [row])
      const count = await withTenant(testSql(), TENANT_A, async (tx) => {
        const rows = await tx<{ n: string }[]>`
          SELECT COUNT(*)::text AS n FROM agent_vector.chunks
          WHERE source_id = ${SOURCE_1}
        `
        return Number(rows[0]?.n ?? 0)
      })
      expect(count).toBe(1)
    })
  })
})

describe('findExistingHashes — partial overlap', () => {
  it('returns only the subset of hashes that exist in the source', async () => {
    const hA = hashContent('A')
    const hB = hashContent('B')
    const hC = hashContent('C')
    const hD = hashContent('D')
    await runAs(TENANT_A, async () => {
      await insertChunks(
        testSql(),
        ['A', 'B', 'C'].map((t) => ({
          tenantId: TENANT_A,
          sourceId: SOURCE_1,
          content: t,
          contentHash: hashContent(t),
          tokenCount: 1,
          embedding: seedEmbedding(t),
        })),
      )
      const found = await findExistingHashes(testSql(), SOURCE_1, [hA, hB, hD])
      expect(found).toEqual(new Set([hA, hB]))
      expect(found.has(hC)).toBe(false)
    })
  })
})

describe('insertChunks — cross-source dedup boundary', () => {
  it('same content under different sources produces two rows', async () => {
    const h = hashContent('hello')
    await runAs(TENANT_A, async () => {
      await insertChunks(testSql(), [
        {
          tenantId: TENANT_A,
          sourceId: SOURCE_1,
          content: 'hello',
          contentHash: h,
          tokenCount: 1,
          embedding: seedEmbedding('hello'),
        },
      ])
      await insertChunks(testSql(), [
        {
          tenantId: TENANT_A,
          sourceId: SOURCE_2,
          content: 'hello',
          contentHash: h,
          tokenCount: 1,
          embedding: seedEmbedding('hello'),
        },
      ])

      const total = await withTenant(testSql(), TENANT_A, async (tx) => {
        const rows = await tx<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM agent_vector.chunks`
        return Number(rows[0]?.n ?? 0)
      })
      expect(total).toBe(2)

      const inS2 = await findExistingHashes(testSql(), SOURCE_2, [h])
      expect(inS2).toEqual(new Set([h]))
    })
  })
})

describe('insertChunks — tenant isolation (RLS)', () => {
  it('same content under different tenants stays isolated', async () => {
    const h = hashContent('hello')
    const baseRow = {
      sourceId: SOURCE_1,
      content: 'hello',
      contentHash: h,
      tokenCount: 1,
      embedding: seedEmbedding('hello'),
    } as const

    await runAs(TENANT_A, async () => {
      await insertChunks(tenantUserSql, [{ ...baseRow, tenantId: TENANT_A }])
    })
    await runAs(TENANT_B, async () => {
      await insertChunks(tenantUserSql, [{ ...baseRow, tenantId: TENANT_B }])
    })

    const aRows = await runAs(TENANT_A, () =>
      withTenant(tenantUserSql, TENANT_A, async (tx) => {
        return tx<{ tenant_id: string }[]>`SELECT tenant_id FROM agent_vector.chunks`
      }),
    )
    expect(aRows.map((r) => r.tenant_id)).toEqual([TENANT_A])

    const bRows = await runAs(TENANT_B, () =>
      withTenant(tenantUserSql, TENANT_B, async (tx) => {
        return tx<{ tenant_id: string }[]>`SELECT tenant_id FROM agent_vector.chunks`
      }),
    )
    expect(bRows.map((r) => r.tenant_id)).toEqual([TENANT_B])
  })
})

describe('insertChunks — concurrent inserts', () => {
  it('two concurrent inserts of the same (tenant, source, hash) produce exactly 1 row, no throw', async () => {
    const h = hashContent('race')
    const row = {
      tenantId: TENANT_A,
      sourceId: SOURCE_1,
      content: 'race',
      contentHash: h,
      tokenCount: 1,
      embedding: seedEmbedding('race'),
    }

    await runAs(TENANT_A, async () => {
      await Promise.all([insertChunks(testSql(), [row]), insertChunks(testSql(), [row])])

      const count = await withTenant(testSql(), TENANT_A, async (tx) => {
        const rows = await tx<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM agent_vector.chunks`
        return Number(rows[0]?.n ?? 0)
      })
      expect(count).toBe(1)
    })
  })
})

describe('empty-input short-circuit', () => {
  it('findExistingHashes returns empty set without opening a transaction', async () => {
    await runAs(TENANT_A, async () => {
      const before = await activeQueryCount()
      const found = await findExistingHashes(testSql(), SOURCE_1, [])
      const after = await activeQueryCount()
      expect(found.size).toBe(0)
      expect(after).toBe(before)
    })
  })

  it('insertChunks returns immediately on empty rows array', async () => {
    await runAs(TENANT_A, async () => {
      const before = await activeQueryCount()
      await insertChunks(testSql(), [])
      const after = await activeQueryCount()
      expect(after).toBe(before)
    })
  })
})

describe('insertChunks — boundary tenantId assertion', () => {
  it('throws VectorInsertFailedError when a row tenantId differs from context, with no row written', async () => {
    const h = hashContent('mismatch')
    const row = {
      tenantId: TENANT_B,
      sourceId: SOURCE_1,
      content: 'mismatch',
      contentHash: h,
      tokenCount: 1,
      embedding: seedEmbedding('mismatch'),
    }

    await runAs(TENANT_A, async () => {
      await expect(insertChunks(testSql(), [row])).rejects.toMatchObject({
        code: 'VECTOR_INSERT_FAILED',
        category: 'SYSTEM',
      })

      const total = await withTenant(testSql(), TENANT_A, async (tx) => {
        const rows = await tx<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM agent_vector.chunks`
        return Number(rows[0]?.n ?? 0)
      })
      expect(total).toBe(0)
    })
  })
})

describe('DB failure wraps as the correct AgentError subclass', () => {
  it('findExistingHashes throws VectorQueryFailedError when the pool is closed', async () => {
    const deadPool = createPool('postgres://seta:dev@localhost:5432/seta')
    await deadPool.end({ timeout: 1 })
    await runAs(TENANT_A, async () => {
      await expect(
        findExistingHashes(deadPool, SOURCE_1, [hashContent('x')]),
      ).rejects.toMatchObject({
        code: 'VECTOR_QUERY_FAILED',
        category: 'SYSTEM',
      })
    })
  })

  it('insertChunks throws VectorInsertFailedError when the pool is closed', async () => {
    const deadPool = createPool('postgres://seta:dev@localhost:5432/seta')
    await deadPool.end({ timeout: 1 })
    await runAs(TENANT_A, async () => {
      await expect(
        insertChunks(deadPool, [
          {
            tenantId: TENANT_A,
            sourceId: SOURCE_1,
            content: 'x',
            contentHash: hashContent('x'),
            tokenCount: 1,
            embedding: seedEmbedding('x'),
          },
        ]),
      ).rejects.toMatchObject({
        code: 'VECTOR_INSERT_FAILED',
        category: 'SYSTEM',
      })
    })
  })
})

describe('insertChunks — span round-trip', () => {
  it('round-trips span on fresh insert', async () => {
    const tenantId = randomUUID()
    const sourceId = randomUUID()
    await runAs(tenantId, async () => {
      await insertChunks(testSql(), [
        {
          tenantId,
          sourceId,
          content: 'hello world',
          contentHash: hashContent('hello world'),
          tokenCount: 2,
          span: { startChar: 0, endChar: 11 },
          embedding: seedEmbedding('hello world'),
        },
      ])
      const rows = await withTenant(testSql(), tenantId, async (tx) => {
        return tx<{ span: { startChar: number; endChar: number } | null }[]>`
          SELECT span FROM agent_vector.chunks WHERE source_id = ${sourceId}
        `
      })
      expect(rows).toHaveLength(1)
      expect(rows[0]!.span).toEqual({ startChar: 0, endChar: 11 })
    })
  })

  it('accepts null span and stores NULL', async () => {
    const tenantId = randomUUID()
    const sourceId = randomUUID()
    await runAs(tenantId, async () => {
      await insertChunks(testSql(), [
        {
          tenantId,
          sourceId,
          content: 'no-span content',
          contentHash: hashContent('no-span content'),
          tokenCount: 3,
          span: null,
          embedding: seedEmbedding('no-span content'),
        },
      ])
      const rows = await withTenant(testSql(), tenantId, async (tx) => {
        return tx<{ span: unknown }[]>`
          SELECT span FROM agent_vector.chunks WHERE source_id = ${sourceId}
        `
      })
      expect(rows).toHaveLength(1)
      expect(rows[0]!.span).toBeNull()
    })
  })

  it('dedup hit does not overwrite the original row span', async () => {
    const tenantId = randomUUID()
    const sourceId = randomUUID()
    const text = 'idempotent content'
    const hash = hashContent(text)
    const originalSpan = { startChar: 10, endChar: 28 }
    await runAs(tenantId, async () => {
      await insertChunks(testSql(), [
        {
          tenantId,
          sourceId,
          content: text,
          contentHash: hash,
          tokenCount: 2,
          span: originalSpan,
          embedding: seedEmbedding(text),
        },
      ])
      await insertChunks(testSql(), [
        {
          tenantId,
          sourceId,
          content: text,
          contentHash: hash,
          tokenCount: 2,
          span: { startChar: 999, endChar: 1000 },
          embedding: seedEmbedding(text),
        },
      ])
      const rows = await withTenant(testSql(), tenantId, async (tx) => {
        return tx<{ span: { startChar: number; endChar: number } | null }[]>`
          SELECT span FROM agent_vector.chunks WHERE source_id = ${sourceId}
        `
      })
      expect(rows).toHaveLength(1)
      expect(rows[0]!.span).toEqual(originalSpan)
    })
  })
})

async function activeQueryCount(): Promise<number> {
  const rows = await testSql()<{ xact: string }[]>`
    SELECT (xact_commit + xact_rollback)::text AS xact
    FROM pg_stat_database
    WHERE datname = current_database()
  `
  return Number(rows[0]?.xact ?? 0)
}
