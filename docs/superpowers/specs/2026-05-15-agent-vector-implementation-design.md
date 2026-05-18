# Design — `@seta/agent-vector` P1 implementation

> **Status:** Implementation spec for the full P1 surface of `@seta/agent-vector`
> (pgvector-backed RAG store). Combines the base scope at
> [`platform/agent/vector/SCOPE.md`](../../../platform/agent/vector/SCOPE.md) and
> the dedup addition at
> [`2026-05-15-agent-vector-dedup-design.md`](./2026-05-15-agent-vector-dedup-design.md)
> into a single landing plan. Companion ingest spec
> [`2026-05-15-agent-rag-dedup-ingest-design.md`](./2026-05-15-agent-rag-dedup-ingest-design.md)
> covers how `@seta/agent-rag.ingest` will consume this package.

## Why

`@seta/agent-vector` is a directory placeholder today (only `SCOPE.md`,
`package.json`, and a stale `VectorStore` interface stub in `src/index.ts` that
contradicts both SCOPE.md and CLAUDE.md). The Seta FAQ Agent requires RAG in P1
(scope override per setup.md §6 / 09-memory.md), so this PR lands the entire P1
package in one coherent commit: schema, RLS, HNSW index, and the three public
queries (`searchChunks`, `insertChunks`, `findExistingHashes`).

The dedup design is folded in from the start — there is no "schema without
`content_hash`" intermediate state to migrate through.

## Scope of this PR

**In scope:**

- `agent_vector` Postgres schema with `chunks` table.
- Drizzle schema (`src/schema.ts`) with `pgPolicy` for RLS and a unique index
  on `(tenant_id, source_id, content_hash)`.
- Three migrations: generated schema migration, `--custom` security hardening
  (`FORCE RLS` + `GRANT`), `--custom` HNSW index.
- Three public functions: `searchChunks`, `insertChunks` (with
  `ON CONFLICT DO NOTHING`), `findExistingHashes`.
- Two `AgentError` subclasses: `VectorQueryFailedError`,
  `VectorInsertFailedError` (extending the agent-platform error base — mirrors
  `MemoryPersistFailedError` in `@seta/agent-memory`).
- Unit tests (co-located) + integration tests against real Postgres.
- `@seta/db` `OWNER_ORDER` update to include `'agent_vector'`.
- Replace the stale placeholder `VectorStore` interface in `src/index.ts`.

**Out of scope:**

- `agent-rag.ingest` consumer wiring → companion spec.
- `sha256Hex` helper → owned by `@seta/agent-rag` (agent-vector accepts
  `content_hash` as a caller-supplied string).
- Cohere rerank-v3 (P2 per setup.md §6).
- `chunk_sources` join table (dedup option α — future, forward-only migration).
- Per-call `efSearch` override (pinned at 100 in P1; revisit after telemetry).
- Source-document blob storage (MinIO/S3).
- Token-count aggregation queries for billing (column stored; aggregator
  future).

## Architecture

`@seta/agent-vector` is a stateless library — no class, no DI container. Three
top-level functions each accept the pool (`sql: DbSql`) and read `tenantId`
from `tenantContext.getTenantId()`. Each function wraps its work in
`withTenant(sql, tenantId, fn)` internally so callers never see the
transaction.

The `sql: DbSql` pool is injected per call (not a module-level singleton) so
test harnesses can drive the package with their own pool without monkey-patch.

**Query style — mixed by query type, all inside `withTenant`:**

- **`insertChunks` and `findExistingHashes`** — Drizzle query builder via
  `drizzle(tx)` inside `withTenant`. Schema-backed, type-safe, clean
  `ON CONFLICT DO NOTHING` ergonomics.
- **`searchChunks`** — raw `tx\`SELECT…\`` postgres-js queries. pgvector
  operators (`<=>`), `SET LOCAL hnsw.*` tuning, and the
  `1 - cosineDistance` similarity expression are SQL-specific and stay
  explicit. Drizzle's `cosineDistance` helper exists but combining it with the
  required `SET LOCAL` tuning per call adds no clarity.

CLAUDE.md prefers the builder; this hybrid only steps out of Drizzle where
pgvector idiom demands it.

## Package shape

```
platform/agent/vector/
├── SCOPE.md
├── package.json                  # deps added via pnpm CLI (CLAUDE.md)
├── drizzle.config.ts
├── tsconfig.json
├── vitest.config.ts
├── migrations/
│   ├── 0000_<generated-name>.sql # drizzle-kit generate
│   ├── 0001_security_hardening.sql              # --custom: FORCE RLS + GRANT
│   ├── 0002_chunks_hnsw_index.sql               # --custom: HNSW + WITH
│   └── meta/
│       ├── _journal.json
│       ├── 0000_snapshot.json
│       ├── 0001_snapshot.json
│       └── 0002_snapshot.json
├── src/
│   ├── schema.ts                 # Drizzle table + pgPolicy + $infer types
│   ├── errors.ts                 # AgentError subclasses
│   ├── ingest.ts                 # insertChunks + findExistingHashes
│   ├── search.ts                 # searchChunks (raw SQL + HNSW SET LOCAL)
│   ├── index.ts                  # public re-exports only
│   ├── schema.test.ts
│   ├── errors.test.ts
│   └── index.test.ts             # replaces placeholder
└── tests/
    └── integration/
        ├── _helpers.ts           # testSql, ensureMigrations, truncate, embed
        ├── harness.test.ts       # schema/RLS/index smoke
        ├── dedup.test.ts         # 8 dedup cases
        └── search.test.ts        # iterative_scan correctness + RLS isolation
```

### Package dependencies (added via pnpm CLI per CLAUDE.md)

```bash
pnpm --filter @seta/agent-vector add \
  @seta/db@workspace:* \
  @seta/tenant@workspace:* \
  @seta/observability@workspace:* \
  @seta/agent-core@workspace:* \
  @seta/agent-embeddings@workspace:* \
  drizzle-orm@0.45.2 \
  postgres@3.4.9 \
  zod@4.4.3

pnpm --filter @seta/agent-vector add -D \
  drizzle-kit@0.31.10 \
  dotenv@17.4.2 \
  typescript@6.0.3
```

Pins match `platform/agent/memory/package.json` (the closest sibling).

## Public interface

```ts
// platform/agent/vector/src/index.ts — public re-exports only
export type { Chunk, NewChunk } from './schema.js'
export { chunks, agentVectorSchema } from './schema.js'
export type { SearchHit, SearchOptions } from './search.js'
export { searchChunks } from './search.js'
export { findExistingHashes, insertChunks } from './ingest.js'
export { VectorQueryFailedError, VectorInsertFailedError } from './errors.js'
```

```ts
// Signatures (drawn from search.ts + ingest.ts)
import type { DbSql } from '@seta/db'

export interface SearchHit { id: string; content: string; similarity: number }
export interface SearchOptions { k?: number; minSim?: number }

export function searchChunks(
  sql: DbSql,
  query: number[],                  // EMBEDDING_DIMENSIONS-length
  opts?: SearchOptions,             // default { k: 8, minSim: 0.3 }
): Promise<SearchHit[]>

export function insertChunks(sql: DbSql, rows: NewChunk[]): Promise<void>
//   ON CONFLICT (tenant_id, source_id, content_hash) DO NOTHING

export function findExistingHashes(
  sql: DbSql,
  sourceId: string,
  hashes: string[],
): Promise<Set<string>>
```

`tenantId` is never a function parameter — read from
`tenantContext.getTenantId()` per CLAUDE.md.

## Schema (Drizzle)

```ts
// platform/agent/vector/src/schema.ts
import { tenantUser } from '@seta/db'
import { EMBEDDING_DIMENSIONS } from '@seta/agent-embeddings'
import { sql } from 'drizzle-orm'
import {
  char, integer, pgPolicy, pgSchema, text, timestamp,
  uniqueIndex, uuid, vector,
} from 'drizzle-orm/pg-core'

export const agentVectorSchema = pgSchema('agent_vector')

export const chunks = agentVectorSchema.table(
  'chunks',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    tenantId:    uuid('tenant_id').notNull(),
    sourceId:    uuid('source_id').notNull(),
    content:     text('content').notNull(),
    contentHash: char('content_hash', { length: 64 }).notNull(),
    tokenCount:  integer('token_count').notNull(),
    embedding:   vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chunks_tenant_source_hash_unique')
      .on(t.tenantId, t.sourceId, t.contentHash),
    pgPolicy('tenant_isolation_chunks', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export type Chunk = typeof chunks.$inferSelect
export type NewChunk = typeof chunks.$inferInsert
```

`EMBEDDING_DIMENSIONS` (= 1536) imported from `@seta/agent-embeddings` so the
dimension contract has a single owner.

The HNSW index is **intentionally not declared in the Drizzle schema** — Drizzle
cannot express `WITH (m = 16, ef_construction = 128)` or pin
`vector_cosine_ops` opclass. The index lands in a `--custom` migration.

`FORCE ROW LEVEL SECURITY` and `GRANT` statements likewise sit in a `--custom`
migration (per CLAUDE.md "Schema-driven" carve-out for raw DDL; mirrors
`platform/agent/memory/migrations/0001_security_hardening.sql`).

## Migrations

### `migrations/0000_<generated-name>.sql` — generated

`pnpm --filter @seta/agent-vector drizzle-kit generate` produces this. Creates:

- `CREATE SCHEMA "agent_vector"`
- `CREATE TABLE "agent_vector"."chunks" (…)`
- `CREATE UNIQUE INDEX "chunks_tenant_source_hash_unique" ON … (tenant_id, source_id, content_hash)`
- `ALTER TABLE "agent_vector"."chunks" ENABLE ROW LEVEL SECURITY`
- `CREATE POLICY "tenant_isolation_chunks" ON "agent_vector"."chunks" AS PERMISSIVE FOR ALL TO "tenant_user" USING (…) WITH CHECK (…)`

Never hand-edited.

### `migrations/0001_security_hardening.sql` — `--custom`

```bash
pnpm --filter @seta/agent-vector drizzle-kit generate --custom --name security_hardening
```

Body (mirrors `platform/agent/memory/migrations/0001_security_hardening.sql`):

```sql
-- FORCE RLS plus tenant_user GRANTs. drizzle-kit 0.31.10 does not model
-- these clauses, so they live in a hand-authored migration. Mirrors the
-- platform/oauth and platform/agent/memory 0001_security_hardening.sql
-- pattern.
ALTER TABLE "agent_vector"."chunks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT USAGE ON SCHEMA "agent_vector" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_vector"."chunks" TO "tenant_user";
```

### `migrations/0002_chunks_hnsw_index.sql` — `--custom`

```bash
pnpm --filter @seta/agent-vector drizzle-kit generate --custom --name chunks_hnsw_index
```

Body:

```sql
-- HNSW index on the embedding column, cosine opclass. WITH parameters are
-- not expressible in Drizzle 0.45.2.
--
-- Bulk-build tuning (operator-applied in a platform_admin session BEFORE
-- running this migration on a populated table; not part of the migration):
--   SET maintenance_work_mem = '8GB';
--   SET max_parallel_maintenance_workers = 7;
-- Defaults (m, ef_construction) match setup.md §6.
CREATE INDEX "chunks_embedding_idx" ON "agent_vector"."chunks"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);
```

### `drizzle.config.ts`

Identical to `platform/agent/memory/drizzle.config.ts` with the schema name
swapped:

```ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  schemaFilter: ['agent_vector'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta',
  },
  verbose: true,
  strict: true,
})
```

### `@seta/db` `OWNER_ORDER` update

`platform/db/src/migrate.ts`:

```ts
export const OWNER_ORDER = [
  'auth',
  'tenant',
  'directory',
  'oauth',
  'audit',
  'connector_ms365_directory',
  'connector_ms365_planner',
  'agent',
  'agent_memory',
  'agent_workflows',
  'agent_vector',          // ← added
] as const

const OWNER_PACKAGE_PATH: Record<Owner, string> = {
  // …
  agent_vector: 'platform/agent/vector/migrations',
}
```

`platform/db/src/migrate.test.ts` updates the pinned array and adds:

```ts
it('places agent_vector after agent_workflows', () => {
  const wfIdx = OWNER_ORDER.indexOf('agent_workflows')
  const vecIdx = OWNER_ORDER.indexOf('agent_vector')
  expect(vecIdx).toBeGreaterThan(wfIdx)
})
```

`agent-vector` has no dependency on `agent_workflows`; placement is by
package-name convention (alphabetical tiebreak within the `agent_*` group is
not strict, but new owners append after existing `agent_*` owners).

## Query implementations

### `src/ingest.ts`

```ts
import { logger } from '@seta/observability'
import { type DbSql, withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenant'
import { and, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { chunks, type NewChunk } from './schema.js'
import { VectorInsertFailedError, VectorQueryFailedError } from './errors.js'

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
        .where(and(
          eq(chunks.sourceId, sourceId),
          inArray(chunks.contentHash, hashes),
        ))
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

  // Boundary assert — every row's tenantId must match context. RLS would
  // also block this, but failing fast with a clear error beats a Postgres
  // policy violation.
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
    log.error(
      { err, tenantId, rowCount: rows.length },
      'vector.insert_chunks.failed',
    )
    throw new VectorInsertFailedError(err)
  }
}
```

### `src/search.ts`

```ts
import { logger } from '@seta/observability'
import { type DbSql, withTenant } from '@seta/db'
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
  // pgvector text input format is '[v1,v2,...]'.
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
    log.debug(
      { tenantId, k, minSim, returned: rows.length },
      'vector.search_chunks',
    )
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

**Notes:**

- `<=>` is pgvector's cosine-distance operator and matches the
  `vector_cosine_ops` opclass on the HNSW index. Mixing operators silently
  disables index acceleration (setup.md §6 footgun #1).
- `ORDER BY embedding <=> $vec` uses the raw distance expression (not the
  `similarity` alias) so pgvector recognises the index-eligible form.
- `prepare: false` is already set in `@seta/db`'s `createPool` — pgvector
  operators require it.
- Postgres returns numeric similarity as a string under some configurations
  (`postgres-js` `numeric` decoding). The `Number(r.similarity)` coercion is
  defensive and cheap.

### `src/errors.ts`

```ts
import { AgentError } from '@seta/agent-core'

export class VectorQueryFailedError extends AgentError {
  constructor(cause: unknown) {
    super({
      code: 'VECTOR_QUERY_FAILED',
      category: 'SYSTEM',
      message: 'Failed to query vector store',
      cause,
    })
  }
}

export class VectorInsertFailedError extends AgentError {
  constructor(cause: unknown) {
    super({
      code: 'VECTOR_INSERT_FAILED',
      category: 'SYSTEM',
      message: 'Failed to insert chunks',
      cause,
    })
  }
}
```

`AgentError` extends `DomainError` (HTTPException) with `code` + `category`
fields and a stable `id`. Status defaults to 500. Mirrors
`MemoryPersistFailedError` in `@seta/agent-memory/src/errors.ts`.

| Code                  | Meaning                                              | HTTP (RFC 7807) |
| --------------------- | ---------------------------------------------------- | --------------- |
| `VECTOR_QUERY_FAILED` | dedup lookup or vector search hit a DB error         | 500             |
| `VECTOR_INSERT_FAILED`| insert failed for a non-conflict reason or boundary  | 500             |

Conflict on the unique index is **handled by `ON CONFLICT DO NOTHING` in SQL**
— never by application-level try/catch (which would race with concurrent
inserts).

### `src/index.ts` — public surface

```ts
export type { Chunk, NewChunk } from './schema.js'
export { chunks, agentVectorSchema } from './schema.js'
export type { SearchHit, SearchOptions } from './search.js'
export { searchChunks } from './search.js'
export { findExistingHashes, insertChunks } from './ingest.js'
export { VectorQueryFailedError, VectorInsertFailedError } from './errors.js'
```

The existing placeholder `VectorStore` / `VectorChunk` / `VectorUpsertInput` /
`VectorSearchParams` interfaces (which take `tenantId` as a parameter and
violate CLAUDE.md) are **removed in this PR**. No backwards-compatibility
shim, no deprecation period (pre-1.0 per CLAUDE.md).

## Logging policy

- One child logger per query file: `logger.child({ service: 'agent-vector' })`.
- `debug` on every successful boundary call with counts only (`tenantId`,
  `sourceId`, `k`, `minSim`, `rowCount`, `returned`, `found`).
- `error` on every catch path before rethrowing as a `Vector*FailedError`.
  The `err` field is auto-redacted by `@seta/observability`.
- **Never log `content`, `embedding`, or `hashes` arrays.** PII risk.
- No `info` logs on the hot path — `agent-rag.ingest` calls
  `findExistingHashes` once per batch and the cumulative log noise at `info`
  level would be high. `debug` is the right level for a library this
  fine-grained.

## SCOPE.md updates

`platform/agent/vector/SCOPE.md` needs these edits as part of this PR (delta
only — full rewrite not required):

1. **Status block** — change "Directory placeholder only" to a one-line
   "Implemented in this PR" pointer, retaining the P1 override paragraph.
2. **Owns** — extend the schema description to include `content_hash`,
   `token_count`, `created_at` columns and the
   `chunks_tenant_source_hash_unique` unique index.
3. **Owns** — add `findExistingHashes(sourceId, hashes)` and the two
   `AgentError` subclasses to the public surface list.
4. **Imports → Allowed internal** — add `@seta/observability` and
   `@seta/agent-core` (for the `AgentError` base) to the list.
5. **Public interface** — replace the old block with the final shape from this
   spec (functions take `sql: DbSql`).
6. **Patterns to follow** — add bullets:
   - Dedup by `(tenant_id, source_id, content_hash)` enforced at the unique
     index. Caller (`agent-rag`) computes the sha256 hex hash and supplies it
     as `NewChunk.contentHash`. `insertChunks` uses `ON CONFLICT DO NOTHING`
     so concurrent inserts cannot deadlock or throw.
   - Drizzle builder for `insertChunks` and `findExistingHashes`; raw
     `tx\`SELECT…\`` for `searchChunks` because pgvector operators and
     `SET LOCAL hnsw.*` tuning are SQL-specific.
7. **Patterns to avoid** — add bullets:
   - Do NOT hash inside `insertChunks` — dedup must happen before the OpenAI
     embedding call.
   - Do NOT log chunk content. Embeddings encode FAQ-corpus PII.
8. **Open questions** — close question #1 (`agent_vector` schema confirmed)
   and #2 (placement in `OWNER_ORDER` decided: after `agent_workflows`).
   Replace open question #4 with: "`efSearch` pinned to 100 in P1; revisit
   after telemetry."

## Test strategy

### Unit tests (co-located, no DB)

- `src/schema.test.ts` — types compile against representative rows; column
  list on the inferred `NewChunk` matches the spec.
- `src/errors.test.ts` — `VectorQueryFailedError` and `VectorInsertFailedError`
  are instances of `AgentError` (and transitively `DomainError`), carry the
  correct `code`, `category: 'SYSTEM'`, `message`, and `cause`.
- `src/index.test.ts` — replaces the placeholder; asserts the public surface
  exports the documented names. Snapshot is fine.

### Integration tests (`tests/integration/`, real Postgres)

`_helpers.ts` (modeled on `platform/agent/memory/tests/integration/_helpers.ts`):

```ts
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

export function testSql(): DbSql            // cached pooled connection as tenant_user
export function ensureMigrations(): Promise<void>
export function truncateVectorTables(): Promise<void>  // platform_admin truncate
export function withTestTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T>
export function seedEmbedding(text: string): number[]   // deterministic 1536-d vector
```

`seedEmbedding` derives a stable 1536-float vector from a text seed (hash →
PRNG → normalize). Not a real embedding — sufficient for ordering and RLS
tests because nearest-neighbour relationships are derived from the seed
identity, not semantic content.

### `harness.test.ts` — schema/RLS/index smoke

- `agent_vector` schema exists.
- `chunks` table has `relrowsecurity = true` AND `relforcerowsecurity = true`.
- `tenant_isolation_chunks` policy exists, scoped to `tenant_user`.
- `chunks_tenant_source_hash_unique` index exists with the correct
  `(tenant_id, source_id, content_hash)` column list.
- `chunks_embedding_idx` exists with access method `hnsw` and opclass
  `vector_cosine_ops`.
- `tenant_user` has `SELECT, INSERT, UPDATE, DELETE` on the table.

### `dedup.test.ts` — 8 cases

| # | Test | Asserts |
|---|---|---|
| 1 | Happy path | Insert (tenantA, source1, "hello", hashH); `findExistingHashes(source1, [H])` → `{H}`; re-insert same row; row count stays 1. |
| 2 | Partial overlap | Insert chunks for A/B/C; `findExistingHashes(source1, [hash(A), hash(B), hash(D)])` → `{hash(A), hash(B)}`. |
| 3 | Different sources, same content | Insert (tenantA, source1, "hello"); insert (tenantA, source2, "hello") — both rows present; each source's `findExistingHashes` sees its own. |
| 4 | Different tenants, same content | Insert as tenantA; insert same content as tenantB. tenantA's `findExistingHashes` returns the hash; tenantB's also does — but querying the chunks table directly via `withTenant(tenantA)` returns only tenantA's row (RLS). |
| 5 | Race condition idempotency | `Promise.all([insertChunks(rowSet), insertChunks(rowSet)])` with identical `(tenant, source, hash)`; assert exactly 1 row, neither call throws. |
| 6 | Empty input short-circuit | `findExistingHashes(s, [])` → `new Set()` and `insertChunks([])` returns without opening a transaction (verify via tx-spy or `pg_stat_activity` counter). |
| 7 | Boundary tenantId mismatch | `insertChunks([{ tenantId: tenantB, … }])` while context = tenantA; assert `VectorInsertFailedError` thrown, no row written. |
| 8 | DB failure → wrapped error | End the pool, call each function; assert correct `Vector*FailedError` subclass with `cause` set to the underlying error. |

### `search.test.ts` — pgvector correctness

| # | Test | Asserts |
|---|---|---|
| 1 | **`iterative_scan` correctness** (LOAD-BEARING per SCOPE) | Load ≥ 10× k rows for tenantA + tenantB interleaved; query as tenantA with `k = 8`; assert exactly 8 results, all from tenantA. Regression for the filtered-LIMIT bug. |
| 2 | Similarity bounds | All returned `similarity` values are in `[0, 1]`; the chunk whose embedding equals the query has `similarity ≈ 1` (within float tolerance). |
| 3 | `minSim` floor | Set `minSim = 0.95`; assert only near-duplicate chunks returned. |
| 4 | RLS isolation in search | Insert chunks under tenantB only; query as tenantA; assert empty result. |
| 5 | Recall ordering | Seed corpus with known nearest-neighbour set; assert `searchChunks` returns the expected top-k ordering. |

**No LLM fixtures.** The vector layer is below the model layer;
`@seta/agent-core/testkit` recordings are not used.

## Verification before completion

Per CLAUDE.md "Done" rule + `superpowers:verification-before-completion`:

```bash
pnpm install --frozen-lockfile
pnpm --filter @seta/agent-vector typecheck
pnpm --filter @seta/db typecheck                # OWNER_ORDER change
pnpm lint
pnpm --filter @seta/agent-vector test:unit
pnpm --filter @seta/db test:unit                # migrate.test.ts pin
pnpm db:up && pnpm migrate
pnpm --filter @seta/agent-vector test:integration
```

## Open questions (deferred — tracked for follow-up)

1. **`efSearch` per-call override** — pinned at 100 in P1. Revisit after FAQ
   corpus telemetry: low-cardinality tenants may benefit from 200.
2. **`hnsw.max_scan_tuples = 20000` worst-case latency budget** — confirm
   against telemetry once FAQ corpus size is known.
3. **Token-count aggregation** — `token_count` column stored; aggregator and
   billing query land in a future audit-layer concern.
4. **Dedup option α** — `chunk_sources` join table for cross-source content
   sharing. Schema migration path: add the join table, populate from existing
   rows, drop `source_id` from `chunks_tenant_source_hash_unique`. Forward-only.

## Alternatives considered

- **Class-based `VectorStore` (Mastra-style, current placeholder)** —
  rejected: introduces `new VectorStore({sql})` ceremony at every caller for
  zero benefit. The package is stateless; functions taking `sql: DbSql` are
  cleaner. Also: the placeholder's explicit `tenantId` parameter violates
  CLAUDE.md.
- **All-Drizzle queries (including `searchChunks`)** — rejected: Drizzle's
  `cosineDistance` helper exists but composing it with the three required
  `SET LOCAL hnsw.*` calls and reading back `1 - cosineDistance` as a numeric
  similarity adds indirection without removing SQL. Raw `tx\`…\`` is the
  honest expression.
- **All-raw-SQL queries (including `insertChunks` / `findExistingHashes`)** —
  rejected: CLAUDE.md prefers the builder. The ON-CONFLICT-DO-NOTHING idiom in
  raw SQL is verbose; Drizzle's `.onConflictDoNothing({ target })` is exactly
  the right shape.
- **Module-level singleton pool** — rejected: forces a singleton on every
  consumer, complicates test harnesses, hides the dependency. Pass the pool
  per call.

## Cross-references

- Base scope: [`platform/agent/vector/SCOPE.md`](../../../platform/agent/vector/SCOPE.md)
- Dedup design (folded in): [`2026-05-15-agent-vector-dedup-design.md`](./2026-05-15-agent-vector-dedup-design.md)
- Companion (ingest): [`2026-05-15-agent-rag-dedup-ingest-design.md`](./2026-05-15-agent-rag-dedup-ingest-design.md)
- Sibling precedent: [`platform/agent/memory/`](../../../platform/agent/memory/) (schema + migrations + test harness shape)
- Migration runner: [`platform/db/src/migrate.ts`](../../../platform/db/src/migrate.ts), [`platform/db/SCOPE.md`](../../../platform/db/SCOPE.md)
- Canonical pgvector pattern: [`docs/setup.md`](../../setup.md) §6
