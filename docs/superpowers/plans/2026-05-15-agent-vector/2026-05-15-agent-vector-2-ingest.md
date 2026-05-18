# `@seta/agent-vector` — Plan 2 — Ingest path

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `insertChunks(sql, rows)` and `findExistingHashes(sql, sourceId, hashes)` functions, with `ON CONFLICT DO NOTHING` idempotency at the unique index and a boundary assert that every row's `tenantId` matches `tenantContext.getTenantId()`. Cover the 8 dedup cases from the spec with integration tests against a real Postgres.

**Architecture:** Both functions wrap their work in `withTenant(sql, tenantId, fn)`. Inside the tx, we lift the postgres-js `tx` to Drizzle via `drizzle(tx)` and use the query builder. Errors wrap as `VectorQueryFailedError` / `VectorInsertFailedError` (already defined in Plan 1). Empty input short-circuits before opening a transaction. No chunk content is logged.

**Tech Stack:** TypeScript (ESM), Drizzle ORM 0.45.2, postgres-js 3.4.9, Vitest, `@seta/observability` logger.

**Prerequisites:** Plan 1 merged. `pnpm migrate` applies the `agent_vector` schema with `chunks` table, unique index, RLS policy, FORCE RLS, and HNSW index in place.

**Spec:** [`docs/superpowers/specs/2026-05-15-agent-vector-implementation-design.md`](../specs/2026-05-15-agent-vector-implementation-design.md) §"`src/ingest.ts`" and §"Test strategy → dedup.test.ts".

---

## File Structure

**Create:**
- `platform/agent/vector/src/ingest.ts` — `insertChunks` + `findExistingHashes`.
- `platform/agent/vector/tests/integration/dedup.test.ts` — 8 dedup cases.

**Modify:**
- `platform/agent/vector/src/index.ts` — re-export the two new functions.
- `platform/agent/vector/src/index.test.ts` — assert the new exports.

---

## Task 1: Add `findExistingHashes` (happy path, TDD)

**Files:**
- Create: `platform/agent/vector/src/ingest.ts`
- Create: `platform/agent/vector/tests/integration/dedup.test.ts`

- [ ] **Step 1: Make sure the test DB is up**

```bash
pnpm db:up
```

- [ ] **Step 2: Write the failing test (TDD red)**

Create `platform/agent/vector/tests/integration/dedup.test.ts`:

```ts
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenant'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { findExistingHashes, insertChunks } from '../../src/ingest'
import {
  ensureMigrations,
  hashContent,
  seedEmbedding,
  testSql,
  truncateVectorTables,
} from './_helpers'

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
  await testSql().end({ timeout: 2 })
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
```

- [ ] **Step 3: Confirm the import path for `tenantContext.run`**

```bash
grep -n "tenantContext.run\|tenantContext\\.\\(get\\|run\\)" platform/tenant/src/*.ts | head -10
```

Expected: `tenantContext.run({ tenantId }, fn)` is the documented usage. If the actual API differs (e.g., `tenantContext.run(tenantId, fn)`), adjust `runAs` accordingly. **Don't proceed until this matches the real API.**

- [ ] **Step 4: Run the test, confirm it fails**

```bash
pnpm --filter @seta/agent-vector test:integration -- dedup
```

Expected: FAIL — `Cannot find module '../../src/ingest'`.

- [ ] **Step 5: Implement `findExistingHashes` (minimal — happy-path only)**

Create `platform/agent/vector/src/ingest.ts`:

```ts
import { type DbSql, withTenant } from '@seta/db'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { and, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { VectorInsertFailedError, VectorQueryFailedError } from './errors.js'
import { chunks, type NewChunk } from './schema.js'

const log = logger.child({ service: 'agent-vector' })

export async function findExistingHashes(
  sql: DbSql,
  sourceId: string,
  hashes: string[],
): Promise<Set<string>> {
  const tenantId = tenantContext.getTenantId()
  if (hashes.length === 0) return new Set()

  try {
    const rows = await withTenant(sql, tenantId, async (tx) => {
      const db = drizzle(tx)
      return db
        .select({ contentHash: chunks.contentHash })
        .from(chunks)
        .where(and(eq(chunks.sourceId, sourceId), inArray(chunks.contentHash, hashes)))
    })
    const found = new Set(rows.map((r) => r.contentHash))
    log.debug(
      { tenantId, sourceId, requested: hashes.length, found: found.size },
      'vector.find_existing_hashes',
    )
    return found
  } catch (err) {
    log.error(
      { err, tenantId, sourceId, requested: hashes.length },
      'vector.find_existing_hashes.failed',
    )
    throw new VectorQueryFailedError(err)
  }
}

export async function insertChunks(sql: DbSql, rows: NewChunk[]): Promise<void> {
  const tenantId = tenantContext.getTenantId()
  if (rows.length === 0) return

  for (const r of rows) {
    if (r.tenantId !== tenantId) {
      throw new VectorInsertFailedError(
        new Error(
          `row tenantId ${r.tenantId} does not match context tenantId ${tenantId}`,
        ),
      )
    }
  }

  try {
    await withTenant(sql, tenantId, async (tx) => {
      const db = drizzle(tx)
      await db.insert(chunks).values(rows).onConflictDoNothing({
        target: [chunks.tenantId, chunks.sourceId, chunks.contentHash],
      })
    })
    log.debug({ tenantId, rowCount: rows.length }, 'vector.insert_chunks')
  } catch (err) {
    log.error({ err, tenantId, rowCount: rows.length }, 'vector.insert_chunks.failed')
    throw new VectorInsertFailedError(err)
  }
}
```

(Both functions are implemented here in one step because the test needs `insertChunks` to populate the row before `findExistingHashes` can find it.)

- [ ] **Step 6: Run the test, confirm it passes**

```bash
pnpm --filter @seta/agent-vector test:integration -- dedup
```

Expected: 1 test PASS.

- [ ] **Step 7: Commit**

```bash
git add platform/agent/vector/src/ingest.ts platform/agent/vector/tests/integration/dedup.test.ts
git commit -m "feat(agent-vector): add insertChunks + findExistingHashes (happy path)"
```

---

## Task 2: Idempotent re-insert (`ON CONFLICT DO NOTHING`)

**Files:**
- Modify: `platform/agent/vector/tests/integration/dedup.test.ts` — append a new `describe` block.

- [ ] **Step 1: Add the failing test**

Append to `dedup.test.ts`:

```ts
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
      await insertChunks(testSql(), [row]) // ON CONFLICT DO NOTHING — must not throw
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
```

- [ ] **Step 2: Run, confirm pass (impl already supports this from Task 1)**

```bash
pnpm --filter @seta/agent-vector test:integration -- dedup
```

Expected: 2 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/vector/tests/integration/dedup.test.ts
git commit -m "test(agent-vector): idempotent re-insert via ON CONFLICT DO NOTHING"
```

---

## Task 3: Partial overlap

**Files:**
- Modify: `platform/agent/vector/tests/integration/dedup.test.ts`

- [ ] **Step 1: Add the test**

Append to `dedup.test.ts`:

```ts
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
      expect(found.has(hC)).toBe(false) // present in DB but not in the query set
    })
  })
})
```

- [ ] **Step 2: Run, confirm pass**

```bash
pnpm --filter @seta/agent-vector test:integration -- dedup
```

Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/vector/tests/integration/dedup.test.ts
git commit -m "test(agent-vector): partial-overlap dedup lookup"
```

---

## Task 4: Different sources, same content

**Files:**
- Modify: `platform/agent/vector/tests/integration/dedup.test.ts`

- [ ] **Step 1: Add the test**

Append to `dedup.test.ts`:

```ts
describe('insertChunks — cross-source dedup boundary', () => {
  it('same content under different sources produces two rows (sourceId scopes the unique index)', async () => {
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
```

- [ ] **Step 2: Run, confirm pass**

```bash
pnpm --filter @seta/agent-vector test:integration -- dedup
```

Expected: 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/vector/tests/integration/dedup.test.ts
git commit -m "test(agent-vector): same content across different sources keeps both rows"
```

---

## Task 5: Different tenants, RLS isolation

**Files:**
- Modify: `platform/agent/vector/tests/integration/dedup.test.ts`

- [ ] **Step 1: Add the test**

Append to `dedup.test.ts`:

```ts
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
      await insertChunks(testSql(), [{ ...baseRow, tenantId: TENANT_A }])
    })
    await runAs(TENANT_B, async () => {
      await insertChunks(testSql(), [{ ...baseRow, tenantId: TENANT_B }])
    })

    const aRows = await runAs(TENANT_A, () =>
      withTenant(testSql(), TENANT_A, async (tx) => {
        return tx<{ tenant_id: string }[]>`SELECT tenant_id FROM agent_vector.chunks`
      }),
    )
    expect(aRows.map((r) => r.tenant_id)).toEqual([TENANT_A])

    const bRows = await runAs(TENANT_B, () =>
      withTenant(testSql(), TENANT_B, async (tx) => {
        return tx<{ tenant_id: string }[]>`SELECT tenant_id FROM agent_vector.chunks`
      }),
    )
    expect(bRows.map((r) => r.tenant_id)).toEqual([TENANT_B])
  })
})
```

- [ ] **Step 2: Run, confirm pass**

```bash
pnpm --filter @seta/agent-vector test:integration -- dedup
```

Expected: 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/vector/tests/integration/dedup.test.ts
git commit -m "test(agent-vector): RLS isolates same content across tenants"
```

---

## Task 6: Race-condition idempotency

**Files:**
- Modify: `platform/agent/vector/tests/integration/dedup.test.ts`

- [ ] **Step 1: Add the test**

Append to `dedup.test.ts`:

```ts
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
      // Both inserts race; the loser silently no-ops via ON CONFLICT DO NOTHING.
      await Promise.all([insertChunks(testSql(), [row]), insertChunks(testSql(), [row])])

      const count = await withTenant(testSql(), TENANT_A, async (tx) => {
        const rows = await tx<{ n: string }[]>`SELECT COUNT(*)::text AS n FROM agent_vector.chunks`
        return Number(rows[0]?.n ?? 0)
      })
      expect(count).toBe(1)
    })
  })
})
```

- [ ] **Step 2: Run, confirm pass**

```bash
pnpm --filter @seta/agent-vector test:integration -- dedup
```

Expected: 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/vector/tests/integration/dedup.test.ts
git commit -m "test(agent-vector): concurrent inserts are idempotent"
```

---

## Task 7: Empty-input short-circuit

**Files:**
- Modify: `platform/agent/vector/tests/integration/dedup.test.ts`

- [ ] **Step 1: Add the test**

Append to `dedup.test.ts`:

```ts
describe('empty-input short-circuit', () => {
  it('findExistingHashes returns empty set without opening a transaction', async () => {
    await runAs(TENANT_A, async () => {
      const before = await activeQueryCount()
      const found = await findExistingHashes(testSql(), SOURCE_1, [])
      const after = await activeQueryCount()
      expect(found.size).toBe(0)
      // No new BEGIN/COMMIT pair — query counter strictly unchanged.
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

// Helper: read pg_stat_database.xact_commit + xact_rollback for the test db.
// A no-op call to the package must NOT advance either counter.
async function activeQueryCount(): Promise<number> {
  const rows = await testSql()<{ xact: string }[]>`
    SELECT (xact_commit + xact_rollback)::text AS xact
    FROM pg_stat_database
    WHERE datname = current_database()
  `
  return Number(rows[0]?.xact ?? 0)
}
```

- [ ] **Step 2: Run, confirm pass**

```bash
pnpm --filter @seta/agent-vector test:integration -- dedup
```

Expected: 8 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/vector/tests/integration/dedup.test.ts
git commit -m "test(agent-vector): empty input short-circuits before opening a tx"
```

---

## Task 8: Boundary `tenantId` mismatch

**Files:**
- Modify: `platform/agent/vector/tests/integration/dedup.test.ts`

- [ ] **Step 1: Add the test**

Append to `dedup.test.ts`:

```ts
describe('insertChunks — boundary tenantId assertion', () => {
  it('throws VectorInsertFailedError when a row tenantId differs from context, with no row written', async () => {
    const h = hashContent('mismatch')
    const row = {
      tenantId: TENANT_B, // wrong on purpose
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
```

- [ ] **Step 2: Run, confirm pass**

```bash
pnpm --filter @seta/agent-vector test:integration -- dedup
```

Expected: 9 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/vector/tests/integration/dedup.test.ts
git commit -m "test(agent-vector): boundary tenantId mismatch rejected before write"
```

---

## Task 9: DB failure → wrapped error

**Files:**
- Modify: `platform/agent/vector/tests/integration/dedup.test.ts`

- [ ] **Step 1: Add the test**

Append to `dedup.test.ts`:

```ts
import { createPool } from '@seta/db'

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
```

Move the `import { createPool } from '@seta/db'` to the top of the file with the other imports (don't leave it inline).

- [ ] **Step 2: Run, confirm pass**

```bash
pnpm --filter @seta/agent-vector test:integration -- dedup
```

Expected: 11 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/vector/tests/integration/dedup.test.ts
git commit -m "test(agent-vector): DB failures wrap into VectorQuery/InsertFailedError"
```

---

## Task 10: Export the new functions from `src/index.ts`

**Files:**
- Modify: `platform/agent/vector/src/index.ts`
- Modify: `platform/agent/vector/src/index.test.ts`

- [ ] **Step 1: Update the failing index test (TDD red)**

Edit `platform/agent/vector/src/index.test.ts` — extend the export check:

```ts
import { describe, expect, test } from 'vitest'
import * as api from './index'

describe('@seta/agent-vector public surface', () => {
  test('exposes the documented exports', () => {
    expect(api.agentVectorSchema).toBeDefined()
    expect(api.chunks).toBeDefined()
    expect(api.VectorQueryFailedError).toBeDefined()
    expect(api.VectorInsertFailedError).toBeDefined()
    expect(api.findExistingHashes).toBeInstanceOf(Function)
    expect(api.insertChunks).toBeInstanceOf(Function)
  })
})
```

- [ ] **Step 2: Run, confirm it fails**

```bash
pnpm --filter @seta/agent-vector test:unit
```

Expected: FAIL — `findExistingHashes` / `insertChunks` not yet exported from `index.ts`.

- [ ] **Step 3: Update `src/index.ts`**

```ts
export type { Chunk, NewChunk } from './schema.js'
export { agentVectorSchema, chunks } from './schema.js'
export { findExistingHashes, insertChunks } from './ingest.js'
export { VectorInsertFailedError, VectorQueryFailedError } from './errors.js'
```

- [ ] **Step 4: Run, confirm pass**

```bash
pnpm --filter @seta/agent-vector test:unit
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @seta/agent-vector typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add platform/agent/vector/src/index.ts platform/agent/vector/src/index.test.ts
git commit -m "feat(agent-vector): export findExistingHashes + insertChunks from index"
```

---

## Task 11: Final verification

- [ ] **Step 1: Lint**

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @seta/agent-vector typecheck
```

Expected: PASS.

- [ ] **Step 3: Unit tests**

```bash
pnpm --filter @seta/agent-vector test:unit
```

Expected: PASS — schema (4), errors (4), index (1) cases.

- [ ] **Step 4: Integration tests**

```bash
pnpm db:up
pnpm --filter @seta/agent-vector test:integration
```

Expected: harness (6) + dedup (11) = 17 tests PASS. If a dedup test fails on its second run because earlier tests left state, double-check that `truncateVectorTables()` runs in `beforeEach`.

- [ ] **Step 5: Confirm clean git state**

```bash
git status
```

Expected: working tree clean.

---

## What this plan does NOT cover

- `searchChunks` implementation and integration tests — Plan 3.
- `@seta/agent-rag` ingest wiring — separate companion plan.

After Plan 2, the package can: store chunks, dedupe at the unique index under concurrency, look up which hashes already exist, and reject mis-tenant rows at the boundary. Search lands in Plan 3.
