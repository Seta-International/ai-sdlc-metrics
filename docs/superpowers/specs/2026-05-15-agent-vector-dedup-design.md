# Design — `@seta/agent-vector` content-hash dedup (P1)

> **Status:** Spec for an addition to the P1 `@seta/agent-vector` scope. The base
> scope is unchanged — this spec layers in two columns, one unique index, one new
> query function, and logging via `@seta/observability`. A companion spec
> [`2026-05-15-agent-rag-dedup-ingest-design.md`](./2026-05-15-agent-rag-dedup-ingest-design.md)
> covers how `@seta/agent-rag.ingest` consumes the new API.

## Why

The base `agent_vector.chunks(id, tenant_id, source_id, content, embedding)` shape
(per [`platform/agent/vector/SCOPE.md`](../../../platform/agent/vector/SCOPE.md))
has no notion of duplicate content. Re-ingesting the same `(tenant, source, text)`
re-embeds and inserts a second row. For the FAQ corpus this is observable as:

- **Cost waste** — OpenAI `text-embedding-3-small` is paid per token; re-embedding
  identical chunks pays twice for the same vector.
- **Retrieval noise** — search returns two near-identical hits competing for the
  same top-k slot, harming RRF fusion quality in `@seta/agent-rag`.
- **Storage drift** — the table grows without bound across repeated ingests of
  the same source.

The fix is a **content-addressable dedup key** stored alongside each chunk, with
Postgres enforcing uniqueness so the dedup is correct under concurrency.

## Scope (β — dedup by tenant + source + content)

Dedup granularity chosen for P1 (see brainstorming transcript 2026-05-15): the
unique key is `(tenant_id, source_id, content_hash)`. Two chunks with identical
text from **different sources** within the same tenant are NOT considered
duplicates — they get separate rows. Rationale:

- Citation accuracy: each row carries the `source_id` of the document it
  originated from. Sharing a row across sources (option α) would require a
  many-to-many `chunk_sources` join table and complicate citation rendering.
- The FAQ corpus is ingested once per source; cross-source content overlap
  (shared disclaimers, boilerplate) is rare enough that the cost saving from α
  doesn't justify the schema complexity in P1.
- Migration path to α stays open: adding a `chunk_sources(chunk_id, source_id)`
  join table and dropping `source_id` from the unique index is a forward-only
  change when the use case demands it.

## Schema changes

`@seta/agent-vector` is a placeholder today (no `package.json` body, no
migrations, no schema). The dedup design lands in the **initial** migration,
not as a delta against an existing one. The target shape:

```sql
CREATE SCHEMA IF NOT EXISTS agent_vector;

CREATE TABLE agent_vector.chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  source_id     uuid NOT NULL,
  content       text NOT NULL,
  content_hash  char(64)  NOT NULL,
  token_count   integer   NOT NULL,
  embedding     vector(1536) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX chunks_tenant_source_hash_unique
  ON agent_vector.chunks (tenant_id, source_id, content_hash);

-- HNSW index lands in a separate --custom migration block (see "Drizzle schema"
-- below for the rationale).
```

The columns introduced by this spec relative to the base SCOPE are
`content_hash`, `token_count`, `created_at`, plus the
`chunks_tenant_source_hash_unique` index. Everything else (`id`, `tenant_id`,
`source_id`, `content`, `embedding`, the HNSW index, RLS) is per the base
SCOPE.md.

**Column semantics:**

- `content_hash char(64)` — sha256 of `content` (UTF-8 bytes), lower-case hex.
  64 chars is invariant for sha256-hex, so `char(64)` not `varchar`. Hex chosen
  over base64 (Mastra's pattern) because Postgres `char(N)` is unambiguous and
  index lookups stay byte-comparable.
- `token_count integer` — supplied by the caller from `Chunk.tokenCount`
  (already computed by `@seta/agent-chunking`). Used for cost monitoring and
  audit, not for retrieval.
- `created_at timestamptz` — audit timestamp; useful when diagnosing whether a
  row pre-dates a re-ingest. Defaults at the DB layer so callers don't pass it.

**HNSW index, RLS, and `iterative_scan` tuning are unchanged** from base SCOPE.
Dedup affects only the write path.

## Drizzle schema

```ts
// platform/agent/vector/src/schema/chunks.ts
import { sql } from 'drizzle-orm'
import { char, integer, pgSchema, text, timestamp, uniqueIndex, uuid, vector }
  from 'drizzle-orm/pg-core'

export const agentVectorSchema = pgSchema('agent_vector')

export const chunks = agentVectorSchema.table(
  'chunks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    sourceId: uuid('source_id').notNull(),
    content: text('content').notNull(),
    contentHash: char('content_hash', { length: 64 }).notNull(),
    tokenCount: integer('token_count').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantSourceHashUnique: uniqueIndex('chunks_tenant_source_hash_unique')
      .on(t.tenantId, t.sourceId, t.contentHash),
  }),
)
```

The Drizzle schema **intentionally does not declare the HNSW index**. Drizzle
cannot express the storage parameters (`WITH (m = 16, ef_construction = 128)`)
or the `vector_cosine_ops` opclass; mixing a partial Drizzle declaration with
an `ALTER INDEX` custom migration creates a sync problem on regenerate. The
HNSW index lands entirely in a `drizzle-kit generate --custom --name
chunks_hnsw_index` migration block, per CLAUDE.md "Schema-driven" carve-out
for raw DDL. The RLS policy lands in the same way (a separate `--custom`
block).

## Public interface additions

```ts
// platform/agent/vector/src/index.ts — additions to the existing surface
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import { chunks } from './schema/chunks.js'

export type Chunk = InferSelectModel<typeof chunks>
export type NewChunk = InferInsertModel<typeof chunks>
//        — includes contentHash: string, tokenCount: number on the insert side

/**
 * Find which of `hashes` are already stored for the given (currentTenant, sourceId).
 * Returns the SUBSET that exists. Caller uses this to filter chunks before paying
 * for an OpenAI embedding call.
 *
 * tenantId is read from `tenantContext.getTenantId()` — never a parameter
 * (CLAUDE.md footgun).
 */
export function findExistingHashes(
  sourceId: string,
  hashes: string[],
): Promise<Set<string>>

/**
 * Existing function, behavior addition:
 *   ON CONFLICT (tenant_id, source_id, content_hash) DO NOTHING
 *
 * → idempotent under concurrent ingest. A race that loses to a peer insert
 * silently skips, never throws.
 */
export function insertChunks(rows: NewChunk[]): Promise<void>
```

`searchChunks` is unchanged — dedup is a write-side concern.

**Why the caller computes the hash, not `insertChunks`:** the hash is needed
*before* the embedding call so duplicates can be filtered out of the OpenAI
request. If `insertChunks` hashed internally, dedup would only kick in after the
embedding has already been paid for — defeating the cost-saving rationale.
`agent-rag.ingest` (the composer) owns the hash computation.

## Error handling + logging

Imports added to the SCOPE allow list:

- `@seta/observability` — for `logger` (structured pino + redaction defaults).
- `@seta/middleware/errors` — already allowed; used for the `DomainError` base.

Logging policy:

- `info` for start/done of public boundary functions.
- `debug` for intermediate counts (existing-hash lookup, batch sizes).
- `error` for DB failures, **always rethrown** as `DomainError`. Never swallowed.
- **Never log chunk content.** PII risk. Log counts, tenant id, source id, hashes
  only.

```ts
// platform/agent/vector/src/index.ts
import { logger } from '@seta/observability'
import { DomainError } from '@seta/middleware/errors'
import { and, eq, inArray } from 'drizzle-orm'
import { tenantContext } from '@seta/tenant'
import { withTenant } from '@seta/db'
import { chunks } from './schema/chunks.js'

const log = logger.child({ service: 'agent-vector' })

export async function findExistingHashes(
  sourceId: string,
  hashes: string[],
): Promise<Set<string>> {
  const tenantId = tenantContext.getTenantId()
  log.info({ sourceId, tenantId, hashCount: hashes.length },
           'findExistingHashes:start')

  if (hashes.length === 0) {
    log.info({ sourceId, tenantId }, 'findExistingHashes:done')
    return new Set()
  }

  try {
    const rows = await withTenant(async (tx) =>
      tx.select({ contentHash: chunks.contentHash })
        .from(chunks)
        .where(and(
          eq(chunks.sourceId, sourceId),
          inArray(chunks.contentHash, hashes),
        )),
    )
    const found = new Set(rows.map(r => r.contentHash))
    log.debug({ sourceId, tenantId, found: found.size, total: hashes.length },
              'findExistingHashes:result')
    log.info({ sourceId, tenantId, foundCount: found.size },
             'findExistingHashes:done')
    return found
  } catch (err) {
    log.error({ err, sourceId, tenantId }, 'findExistingHashes:failed')
    throw new DomainError(
      'VECTOR_QUERY_FAILED',
      'Failed to query existing chunk hashes',
      { cause: err },
    )
  }
}

export async function insertChunks(rows: NewChunk[]): Promise<void> {
  const tenantId = tenantContext.getTenantId()
  log.info({ tenantId, rowCount: rows.length }, 'insertChunks:start')

  if (rows.length === 0) {
    log.info({ tenantId }, 'insertChunks:done')
    return
  }

  try {
    await withTenant(async (tx) =>
      tx.insert(chunks)
        .values(rows.map(r => ({ ...r, tenantId })))
        .onConflictDoNothing({
          target: [chunks.tenantId, chunks.sourceId, chunks.contentHash],
        }),
    )
    log.debug({ tenantId, rowCount: rows.length, sourceIds: [...new Set(rows.map(r => r.sourceId))] },
              'insertChunks:committed')
    log.info({ tenantId, rowCount: rows.length }, 'insertChunks:done')
  } catch (err) {
    log.error({ err, tenantId, rowCount: rows.length }, 'insertChunks:failed')
    throw new DomainError(
      'VECTOR_INSERT_FAILED',
      'Failed to insert chunks',
      { cause: err },
    )
  }
}
```

`DomainError` codes introduced:

| Code | Meaning | HTTP mapping (RFC 7807) |
|---|---|---|
| `VECTOR_QUERY_FAILED` | dedup lookup or vector search hit a DB error | 500 |
| `VECTOR_INSERT_FAILED` | insert failed for a non-conflict reason | 500 |

Conflict on the unique index is **handled by `ON CONFLICT DO NOTHING` at the SQL
layer** — not by try/catch. This is the correct seam: Postgres knows about the
conflict atomically, application-level try/catch would race.

## SCOPE.md updates

`platform/agent/vector/SCOPE.md` needs these edits (delta only — full re-write
not required):

1. **Responsibilities → Owns** — extend the schema description to:
   `agent_vector.chunks(id, tenant_id, source_id, content, content_hash, token_count, embedding, created_at)`
   with unique index `(tenant_id, source_id, content_hash)`.
2. **Responsibilities → Owns** — add `findExistingHashes(sourceId, hashes)` to
   the public surface list.
3. **Imports → Allowed internal** — add `@seta/observability` (logger source).
   Keep `@seta/middleware/errors` (already present implicitly via the project
   contract).
4. **Patterns to follow** — new bullet:
   > **Dedup by `(tenant_id, source_id, content_hash)` enforced at the unique
   > index.** Caller (agent-rag) computes the sha256 hex hash and supplies it as
   > `NewChunk.contentHash`. `insertChunks` uses `ON CONFLICT DO NOTHING` so
   > concurrent inserts of the same `(tenant, source, hash)` cannot deadlock or
   > throw. Hash is content-only — chunk position/offset is intentionally
   > excluded (contrast Mastra's `TextNode.generateHash` which includes
   > offsets for node identity, not dedup).
5. **Patterns to avoid** — new bullet:
   > **Do NOT hash inside `insertChunks`.** The dedup pre-check must happen
   > before the OpenAI embedding call so duplicates can be filtered out of the
   > paid API request. Hashing inside the persistence layer makes dedup a
   > post-hoc dedup of stored rows, defeating the cost-saving rationale.
6. **Patterns to avoid** — new bullet:
   > **Do NOT log chunk content.** Embeddings encode FAQ-corpus PII. Log only
   > counts, tenant id, source id, and hashes.
7. **Open questions** — add: "When promoting to dedup option α
   (`chunk_sources` join table for cross-source content sharing), the migration
   path is: add the join table, populate from existing rows, drop `source_id`
   from `chunks_tenant_source_hash_unique` (or replace with
   `chunks_tenant_hash_unique`). No data loss; forward-only."

## Testing

All tests are **integration tests** against a real Postgres in
`platform/agent/vector/tests/integration/`. Unit tests for the pure surface
(types, schema export) can stay co-located in `src/`.

| # | Test | Asserts |
|---|---|---|
| 1 | **Dedup happy path** | Insert (tenant_A, source_1, "hello"). Call `findExistingHashes('source_1', [hash("hello")])` → returns the hash. Re-insert same row → `chunks` row count still 1. |
| 2 | **Partial overlap** | Insert rows for `["A","B","C"]`. `findExistingHashes('source_1', [hash("A"),hash("B"),hash("D")])` → returns `{hash("A"), hash("B")}`. Caller embeds only `D`. |
| 3 | **Different sources, same content** | Insert (tenant_A, source_1, "hello"). Insert (tenant_A, source_2, "hello") → BOTH rows exist. `findExistingHashes('source_2', [hash("hello")])` → returns the hash (it exists for source_2 too after the second insert). |
| 4 | **Different tenants, same content** | Run test 1 under tenant_A, then under tenant_B with same content. Two rows total; each tenant's `findExistingHashes` only sees its own. RLS enforces isolation. |
| 5 | **Race condition idempotency** | Fire two concurrent `insertChunks` calls with identical `(tenant, source, contentHash)`. Assert: exactly one row, no thrown error from either call. |
| 6 | **DomainError mapping** | Force a connection-level failure (e.g. transaction rolled back externally). Assert: `findExistingHashes` and `insertChunks` throw `DomainError` with code `VECTOR_QUERY_FAILED` / `VECTOR_INSERT_FAILED`, original error in `cause`. |
| 7 | **Empty input short-circuit** | `findExistingHashes('s', [])` returns empty set without DB hit; `insertChunks([])` returns without DB hit. (Verify via spy or query log.) |
| 8 | **Hash determinism** | Unit test (no DB): `sha256Hex('Xin chào')` deterministic across calls; differs by one trailing space. (Helper lives in agent-rag spec, but the assumption is tested here too since vector consumes it.) |

**No LLM fixtures needed** — the vector layer is below the model layer.

## Alternatives considered

- **Hash content + offsets** (Mastra's `TextNode.generateHash` pattern). Rejected:
  Mastra hashes for node identity in a document graph; identical text at
  different positions are distinct nodes. Our goal is the inverse — identical
  text anywhere should dedup to skip OpenAI cost. Including offsets would defeat
  the optimization.
- **xxhash instead of sha256** (Mastra's `@mastra/pg` uses xxhash for filter
  cache keys). Rejected: dedup requires collision-safe hashing. xxhash has a
  64-bit output and is not designed to resist content collisions across a
  growing corpus. sha256 (256-bit) gives ~10⁻⁷⁷ collision probability — safe
  for any plausible corpus size.
- **Hash in base64** (Mastra). Rejected: `char(64)` hex is unambiguous in
  Postgres, byte-comparable for index lookups, easier to inspect in psql. No
  meaningful cost difference vs base64's 44 chars.
- **Hash inside `insertChunks`**. Rejected: places the dedup decision *after*
  the OpenAI call. The caller must dedup *before* paying. The hash is a
  caller-supplied value; the persistence layer just enforces uniqueness.
- **Dedup option α** (`chunk_sources` join table, share rows across sources).
  Deferred: schema complexity not justified for the P1 FAQ corpus. Migration
  path documented in Open Questions.
- **Dedup option γ** (unique on `(tenant, hash)`, keep first source only).
  Rejected: citation correctness regression — search would attribute a chunk
  to the first source that ingested it, even when the user is querying a
  document that re-uses the same content.

## Out of scope

- Changes to `@seta/agent-rag.ingest` — covered in the companion spec
  [`2026-05-15-agent-rag-dedup-ingest-design.md`](./2026-05-15-agent-rag-dedup-ingest-design.md).
- Source-document blob storage (MinIO, S3). The brainstorming session
  established this is a separate concern (raw PDF/docx archive vs. chunked
  text); not addressed here.
- Token-count aggregation queries for billing. The column is stored; the
  aggregator is a future audit-layer concern.

## Cross-references

- Base scope: [`platform/agent/vector/SCOPE.md`](../../../platform/agent/vector/SCOPE.md)
- Companion spec (ingest flow): [`2026-05-15-agent-rag-dedup-ingest-design.md`](./2026-05-15-agent-rag-dedup-ingest-design.md)
- Upstream package: [`platform/agent/chunking/SCOPE.md`](../../../platform/agent/chunking/SCOPE.md) (provides `Chunk.tokenCount`)
- Downstream consumer: [`platform/agent/rag/SCOPE.md`](../../../platform/agent/rag/SCOPE.md)
- Logger source: [`platform/observability/SCOPE.md`](../../../platform/observability/SCOPE.md)
- Setup spec: [`docs/setup.md`](../../setup.md) §6 (RAG primitives, pgvector pattern)
- Mastra reference (compared, not adopted): `D:/Work/mastra/packages/rag/src/document/schema/node.ts:110` (TextNode hash for node identity)
