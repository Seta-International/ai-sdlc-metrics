# `@seta/agent-vector` — Plan 3 — Search path

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `searchChunks(sql, query, opts?)` — pgvector cosine-similarity top-k search with the three load-bearing `SET LOCAL hnsw.*` tuning statements and a load-bearing **`iterative_scan` correctness test** that proves multi-tenant filtered queries return exactly `k` rows.

**Architecture:** `searchChunks` runs inside `withTenant(sql, tenantId, fn)`. Inside the tx, it issues `SET LOCAL hnsw.ef_search`, `hnsw.iterative_scan = strict_order`, and `hnsw.max_scan_tuples`, then runs a raw `tx\`SELECT … 1 - (embedding <=> $vec::vector) AS similarity … ORDER BY embedding <=> $vec::vector LIMIT k\`` query. `iterative_scan = strict_order` is correctness-critical: without it, the HNSW prefilter ignores the RLS `tenant_id` predicate and the filtered `LIMIT k` can return < k rows. Drizzle is not used here — pgvector operators and SET-LOCAL tuning belong in raw SQL.

**Tech Stack:** TypeScript (ESM), postgres-js 3.4.9 (raw tagged templates), pgvector 0.8.2 HNSW with `vector_cosine_ops`, Vitest.

**Prerequisites:** Plan 1 merged (schema + HNSW index + harness). Plan 2 ideally merged so `insertChunks` is available to seed test rows. If Plan 2 is not yet merged, this plan can be executed in a branch off Plan 1 by hand-inserting test rows via raw SQL — but coordinate with the reviewer.

**Spec:** [`docs/superpowers/specs/2026-05-15-agent-vector-implementation-design.md`](../specs/2026-05-15-agent-vector-implementation-design.md) §"`src/search.ts`" and §"Test strategy → search.test.ts".

---

## File Structure

**Create:**
- `platform/agent/vector/src/search.ts` — `searchChunks` + `SearchHit` + `SearchOptions`.
- `platform/agent/vector/tests/integration/search.test.ts` — 5 search/pgvector cases.

**Modify:**
- `platform/agent/vector/src/index.ts` — re-export `searchChunks`, `SearchHit`, `SearchOptions`.
- `platform/agent/vector/src/index.test.ts` — assert the new exports.

---

## Task 1: Add `searchChunks` and the `iterative_scan` correctness test

The `iterative_scan` test is the **load-bearing test** for this package (per `platform/agent/vector/SCOPE.md` "Test strategy"). Implement it first; everything else is incremental.

**Files:**
- Create: `platform/agent/vector/src/search.ts`
- Create: `platform/agent/vector/tests/integration/search.test.ts`

- [ ] **Step 1: Make sure the test DB is running and migrated**

```bash
pnpm db:up
pnpm migrate
```

- [ ] **Step 2: Write the failing test (TDD red) — `iterative_scan` correctness**

Create `platform/agent/vector/tests/integration/search.test.ts`:

```ts
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenant'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { insertChunks } from '../../src/ingest'
import { searchChunks } from '../../src/search'
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

describe('searchChunks — iterative_scan correctness under RLS (load-bearing)', () => {
  it('returns exactly k results all belonging to the querying tenant', async () => {
    const k = 8
    const perTenant = 10 * k // 80 rows per tenant — ≥10× k as required by SCOPE
    const queryEmbedding = seedEmbedding('query-seed')

    // Insert perTenant rows for tenantA and tenantB interleaved.
    await runAs(TENANT_A, () =>
      insertChunks(
        testSql(),
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
        testSql(),
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
      searchChunks(testSql(), queryEmbedding, { k, minSim: -1 }),
    )
    expect(hits.length).toBe(k)
    // Cross-check rows by joining IDs back to chunks (RLS still scoped to tenantA).
    const ids = hits.map((h) => h.id)
    const owners = await runAs(TENANT_A, () =>
      withTenant(testSql(), TENANT_A, async (tx) => {
        return tx<{ tenant_id: string }[]>`
          SELECT tenant_id FROM agent_vector.chunks
          WHERE id = ANY(${ids}::uuid[])
        `
      }),
    )
    expect(owners.every((r) => r.tenant_id === TENANT_A)).toBe(true)
  })
})
```

Note: `minSim: -1` disables the floor for this test — we want exactly k results, not "k results above a threshold."

- [ ] **Step 3: Run the test, confirm it fails**

```bash
pnpm --filter @seta/agent-vector test:integration -- search
```

Expected: FAIL — `Cannot find module '../../src/search'`.

- [ ] **Step 4: Implement `src/search.ts`**

```ts
import { type DbSql, withTenant } from '@seta/db'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { VectorQueryFailedError } from './errors.js'

const log = logger.child({ service: 'agent-vector' })

export interface SearchHit {
  id: string
  content: string
  similarity: number
}

export interface SearchOptions {
  k?: number      // default 8
  minSim?: number // default 0.3
}

type Row = { id: string; content: string; similarity: string | number }

export async function searchChunks(
  sql: DbSql,
  query: number[],
  opts: SearchOptions = {},
): Promise<SearchHit[]> {
  const tenantId = tenantContext.getTenantId()
  const k = opts.k ?? 8
  const minSim = opts.minSim ?? 0.3
  // pgvector text input is '[v1,v2,...]'.
  const vec = `[${query.join(',')}]`

  try {
    const rows = await withTenant(sql, tenantId, async (tx) => {
      // Per-tx HNSW tuning. iterative_scan = strict_order is LOAD-BEARING
      // for correctness under RLS — without it, filtered LIMIT k can return
      // < k rows (pgvector ≥ 0.8.0). See setup.md §6.
      await tx`SET LOCAL hnsw.ef_search       = 100`
      await tx`SET LOCAL hnsw.iterative_scan  = strict_order`
      await tx`SET LOCAL hnsw.max_scan_tuples = 20000`

      return tx<Row[]>`
        SELECT id,
               content,
               1 - (embedding <=> ${vec}::vector) AS similarity
        FROM agent_vector.chunks
        WHERE 1 - (embedding <=> ${vec}::vector) > ${minSim}
        ORDER BY embedding <=> ${vec}::vector
        LIMIT ${k}
      `
    })
    log.debug({ tenantId, k, minSim, returned: rows.length }, 'vector.search_chunks')
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      similarity: Number(r.similarity),
    }))
  } catch (err) {
    log.error({ err, tenantId, k, minSim }, 'vector.search_chunks.failed')
    throw new VectorQueryFailedError(err)
  }
}
```

- [ ] **Step 5: Run the test, confirm it passes**

```bash
pnpm --filter @seta/agent-vector test:integration -- search
```

Expected: 1 test PASS. **If it returns fewer than k rows, the `SET LOCAL hnsw.iterative_scan = strict_order` line is the suspect.** Check both that the line is present and that the postgres-js client honours `SET LOCAL` (the pool MUST use transactions — `withTenant` does, via `sql.begin`, so this should work).

- [ ] **Step 6: Commit**

```bash
git add platform/agent/vector/src/search.ts platform/agent/vector/tests/integration/search.test.ts
git commit -m "feat(agent-vector): add searchChunks with iterative_scan correctness test"
```

---

## Task 2: Similarity bounds

**Files:**
- Modify: `platform/agent/vector/tests/integration/search.test.ts`

- [ ] **Step 1: Add the test**

Append to `search.test.ts`:

```ts
describe('searchChunks — similarity bounds', () => {
  it('all returned similarities are in [0, 1] and the exact-match chunk scores ~1', async () => {
    const queryEmbedding = seedEmbedding('exact')

    await runAs(TENANT_A, () =>
      insertChunks(testSql(), [
        // Exact match for queryEmbedding.
        {
          tenantId: TENANT_A,
          sourceId: SOURCE_1,
          content: 'exact',
          contentHash: hashContent('exact'),
          tokenCount: 1,
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
      searchChunks(testSql(), queryEmbedding, { k: 4, minSim: -1 }),
    )
    expect(hits.length).toBe(4)
    for (const h of hits) {
      expect(h.similarity).toBeGreaterThanOrEqual(-1e-6)
      expect(h.similarity).toBeLessThanOrEqual(1 + 1e-6)
    }
    // The exact-match chunk should be first and have similarity ≈ 1.
    expect(hits[0]?.content).toBe('exact')
    expect(hits[0]?.similarity).toBeGreaterThan(0.999)
  })
})
```

- [ ] **Step 2: Run, confirm pass**

```bash
pnpm --filter @seta/agent-vector test:integration -- search
```

Expected: 2 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/vector/tests/integration/search.test.ts
git commit -m "test(agent-vector): similarity in [0,1] and exact-match scores ~1"
```

---

## Task 3: `minSim` floor

**Files:**
- Modify: `platform/agent/vector/tests/integration/search.test.ts`

- [ ] **Step 1: Add the test**

Append to `search.test.ts`:

```ts
describe('searchChunks — minSim floor', () => {
  it('returns only chunks above the minSim threshold', async () => {
    const queryEmbedding = seedEmbedding('query')

    await runAs(TENANT_A, () =>
      insertChunks(testSql(), [
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
      searchChunks(testSql(), queryEmbedding, { k: 8, minSim: 0.99 }),
    )
    // Only the exact-match clears the 0.99 floor.
    expect(hits.length).toBe(1)
    expect(hits[0]?.content).toBe('near')
  })
})
```

- [ ] **Step 2: Run, confirm pass**

```bash
pnpm --filter @seta/agent-vector test:integration -- search
```

Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/vector/tests/integration/search.test.ts
git commit -m "test(agent-vector): minSim filters chunks below the threshold"
```

---

## Task 4: RLS isolation in search

**Files:**
- Modify: `platform/agent/vector/tests/integration/search.test.ts`

- [ ] **Step 1: Add the test**

Append to `search.test.ts`:

```ts
describe('searchChunks — RLS isolation', () => {
  it('queries as tenantA see no rows when only tenantB has chunks', async () => {
    const queryEmbedding = seedEmbedding('q')

    // Populate ONLY tenantB.
    await runAs(TENANT_B, () =>
      insertChunks(
        testSql(),
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
      searchChunks(testSql(), queryEmbedding, { k: 8, minSim: -1 }),
    )
    expect(hits.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run, confirm pass**

```bash
pnpm --filter @seta/agent-vector test:integration -- search
```

Expected: 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/vector/tests/integration/search.test.ts
git commit -m "test(agent-vector): RLS isolates vector search across tenants"
```

---

## Task 5: Recall ordering on a known nearest-neighbour set

**Files:**
- Modify: `platform/agent/vector/tests/integration/search.test.ts`

- [ ] **Step 1: Add the test**

Append to `search.test.ts`:

```ts
describe('searchChunks — recall ordering', () => {
  it('orders results by descending similarity to the query', async () => {
    const queryEmbedding = seedEmbedding('center')

    await runAs(TENANT_A, () =>
      insertChunks(
        testSql(),
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
      searchChunks(testSql(), queryEmbedding, { k: 5, minSim: -1 }),
    )
    expect(hits.length).toBe(5)
    expect(hits[0]?.content).toBe('center')
    // Sorted descending by similarity.
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]!.similarity).toBeGreaterThanOrEqual(hits[i]!.similarity)
    }
  })
})
```

- [ ] **Step 2: Run, confirm pass**

```bash
pnpm --filter @seta/agent-vector test:integration -- search
```

Expected: 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/vector/tests/integration/search.test.ts
git commit -m "test(agent-vector): results ordered by descending similarity"
```

---

## Task 6: Export `searchChunks` from `src/index.ts`

**Files:**
- Modify: `platform/agent/vector/src/index.ts`
- Modify: `platform/agent/vector/src/index.test.ts`

- [ ] **Step 1: Update the failing index test (TDD red)**

Edit `platform/agent/vector/src/index.test.ts`:

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
    expect(api.searchChunks).toBeInstanceOf(Function)
  })
})
```

- [ ] **Step 2: Run, confirm it fails**

```bash
pnpm --filter @seta/agent-vector test:unit
```

Expected: FAIL — `searchChunks` not yet exported from `index.ts`.

- [ ] **Step 3: Update `src/index.ts`**

```ts
export type { Chunk, NewChunk } from './schema.js'
export { agentVectorSchema, chunks } from './schema.js'
export { findExistingHashes, insertChunks } from './ingest.js'
export type { SearchHit, SearchOptions } from './search.js'
export { searchChunks } from './search.js'
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
git commit -m "feat(agent-vector): export searchChunks + SearchHit + SearchOptions"
```

---

## Task 7: Final verification

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

Expected: PASS — schema (4), errors (4), index (1).

- [ ] **Step 4: Integration tests (full suite)**

```bash
pnpm db:up
pnpm --filter @seta/agent-vector test:integration
```

Expected: harness (6) + dedup (11) + search (5) = 22 tests PASS.

- [ ] **Step 5: Confirm clean git state**

```bash
git status
```

Expected: working tree clean.

---

## After Plan 3

`@seta/agent-vector` is fully P1-complete: schema, RLS, HNSW, dedup, and search are all landed and tested. The next consumer is `@seta/agent-rag.ingest`, covered by the companion spec [`2026-05-15-agent-rag-dedup-ingest-design.md`](../specs/2026-05-15-agent-rag-dedup-ingest-design.md).

## Notes on test stability

- **HNSW recall is probabilistic.** The `iterative_scan` correctness test asserts the **count** of returned rows, not their identity — that's deterministic. The recall-ordering test (Task 5) uses 30 deterministic seeds and asserts the top result is the exact-match seed; this is reliable because the seed-derived embeddings are deterministic (same input → same vector), not stochastic.
- **`postgres-js` numeric decoding.** Some Postgres configurations return `numeric` columns as strings. The `Number(r.similarity)` coercion in `search.ts` handles both string and number cases.
- **No `prepare: true`.** `@seta/db.createPool` already sets `prepare: false` (pgvector chokes on prepared statements). Don't override it in test helpers.
