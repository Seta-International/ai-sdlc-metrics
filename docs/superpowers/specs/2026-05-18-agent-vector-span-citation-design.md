# Design — `@seta/agent-vector` citation-span column (P1)

**Status:** Spec for a delta on the already-implemented P1
`@seta/agent-vector` package. Adds one nullable column (`span jsonb`),
extends `searchChunks` to return `sourceId` + `span` on every hit, and
threads `span` through `insertChunks`. The base SCOPE
([`platform/agent/vector/SCOPE.md`](../../../platform/agent/vector/SCOPE.md))
and the dedup design
([`2026-05-15-agent-vector-dedup-design.md`](./2026-05-15-agent-vector-dedup-design.md))
remain in force; this spec is purely additive.

**Companion spec (consumer):**
[`2026-05-18-agent-rag-design.md`](./2026-05-18-agent-rag-design.md) —
`@seta/agent-rag.ingest` writes `span`, `@seta/agent-rag.retrieve` reads
it through to `RagHit.citation.span`. This vector-side spec must land
first; the rag PR depends on the new return shape.

## Why

`platform/agent/rag/SCOPE.md` open question #2 flagged citation-span
storage as undecided. The rag-side design selects the "store span on the
chunk row" path (vs side-table or retrieve-time re-derivation) because
spans are 1:1 with chunks, never change after ingest, and the join
overhead of a side-table buys no flexibility.

Without this change:

- `@seta/agent-rag.RagHit.citation.span` cannot be populated — the
  vector store loses `Chunk.startChar` / `Chunk.endChar` at ingest time.
- The FAQ Agent's `cite_sources` Adaptive Card can show a chunk excerpt
  but cannot highlight or hyperlink to a precise character range in the
  source document.
- `searchChunks` returns only `{ id, content, similarity }` — the rag
  layer would need a second round-trip to fetch `sourceId` for the
  citation contract.

This spec closes both gaps with one nullable column and one query
extension.

## Scope

This spec covers:

- Adding a nullable `span jsonb` column to `agent_vector.chunks`.
- Generating the migration via `drizzle-kit generate` (the second
  schema-only migration in the package; no `--custom` block needed).
- Updating the Drizzle schema (`src/schema.ts`) to declare the column
  and infer the shape into `NewChunk` / `Chunk`.
- Extending `insertChunks` to write `span` from `NewChunk`.
- Extending `searchChunks` to `SELECT source_id, span` and return them
  on `SearchHit` as new fields `sourceId` and `span`.
- A small Zod refinement at the public surface to validate `span`
  shape when present (`{ startChar: number ≥ 0; endChar: number > startChar }`).
- Backfill posture: legacy rows (ingested before this change) keep
  `span = NULL`; consumers (rag's `RagHit.citation.span`) tolerate
  `null`.
- Updates to the existing vector-package integration tests
  (`tests/integration/search.test.ts`, `tests/integration/dedup.test.ts`)
  to assert the new fields round-trip end to end.

Out of scope:

- `findExistingHashes` return shape — unchanged; dedup is hash-only.
- Adding a span backfill script for any legacy `agent_vector.chunks`
  rows. The P1 corpus has not been ingested yet; production rows do
  not exist outside development databases. Re-running EP-08.3's
  ingestion driver populates `span` for the current corpus, which is
  the only path that needs it.
- Span-based query operators (e.g., "find chunks whose span overlaps
  range X"). Not a P1 use case; defer until/if the FAQ card needs it.
- Changes to the HNSW index, `iterative_scan` tuning, or RLS policy —
  all unaffected by this column.
- `@seta/agent-rag` ingest/retrieve wiring — covered by the companion
  rag spec.

## Schema change

Target shape (only the added column shown; full table per existing
migrations):

```sql
ALTER TABLE agent_vector.chunks
  ADD COLUMN span jsonb;
```

**Column semantics:**

- **Nullable**, no default. New rows from rag's `ingest` write
  `{"startChar": N, "endChar": M}`; pre-existing rows keep `NULL`.
- **`jsonb`** rather than two `integer` columns (`start_char`,
  `end_char`) because the citation shape is a logical pair; future
  extensions (e.g., line/column for code corpora) can extend the JSON
  object without another migration. Storage cost on two small ints is
  ~50 bytes vs ~16 bytes for native ints, acceptable.
- **No CHECK constraint** in P1 — Zod validation at the public surface
  is sufficient; adding a CHECK would require either a function call
  (slow) or a generated column (over-engineered). Re-evaluate if a bad
  writer slips through.
- **No index** on `span`. It is read-only metadata, never queried.

Migration is generated via the standard flow — no `--custom`:

```sh
pnpm --filter @seta/agent-vector exec drizzle-kit generate --name add_chunks_span
```

Expected migration file: `migrations/0003_<adjective>_<noun>.sql`
containing only the `ALTER TABLE … ADD COLUMN span jsonb;` statement.
Per CLAUDE.md, neither the SQL nor `meta/_journal.json` are
hand-edited.

## Drizzle schema diff

```diff
 // platform/agent/vector/src/schema.ts
 import { tenantUser } from '@seta/db'
 import { sql } from 'drizzle-orm'
 import {
   char,
   integer,
+  jsonb,
   pgPolicy,
   pgSchema,
   text,
   timestamp,
   uniqueIndex,
   uuid,
   vector,
 } from 'drizzle-orm/pg-core'

 const EMBEDDING_DIMENSIONS = 1536 as const

 export const agentVectorSchema = pgSchema('agent_vector')

 export const chunks = agentVectorSchema.table(
   'chunks',
   {
     id: uuid('id').primaryKey().defaultRandom(),
     tenantId: uuid('tenant_id').notNull(),
     sourceId: uuid('source_id').notNull(),
     content: text('content').notNull(),
     contentHash: char('content_hash', { length: 64 }).notNull(),
     tokenCount: integer('token_count').notNull(),
+    span: jsonb('span').$type<{ startChar: number; endChar: number } | null>(),
     embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
     createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
   },
   (t) => [
     uniqueIndex('chunks_tenant_source_hash_unique').on(t.tenantId, t.sourceId, t.contentHash),
     pgPolicy('tenant_isolation_chunks', { /* unchanged */ }),
   ],
 )

 export type Chunk = typeof chunks.$inferSelect
 export type NewChunk = typeof chunks.$inferInsert
```

`Chunk.span` is `{ startChar: number; endChar: number } | null` —
`$inferSelect` includes nullability automatically because the column has
no `.notNull()`. `NewChunk.span` is the same nullable shape;
`insertChunks` rows from rag pass a non-null object, the (rare) caller
that doesn't have spans passes `null` or omits the field.

## Public API changes

### `SearchHit` — new fields

```diff
 export interface SearchHit {
   id: string
+  sourceId: string
   content: string
+  span: { startChar: number; endChar: number } | null
   similarity: number
 }
```

Field order in the interface mirrors the SELECT order in `searchChunks`
for diff readability. `sourceId` and `span` are non-optional on the
interface; `span` is nullable in value but always present as a key.

### `searchChunks` — extended SELECT

```ts
// src/search.ts (diff)
return tx<Row[]>`
  SELECT id,
         source_id,
         content,
         span,
         1 - (embedding <=> ${vec}::vector) AS similarity
  FROM agent_vector.chunks
  WHERE 1 - (embedding <=> ${vec}::vector) > ${minSim}
  ORDER BY embedding <=> ${vec}::vector
  LIMIT ${k}
`
```

The result mapper updates accordingly:

```ts
return rows.map((r) => ({
  id: r.id,
  sourceId: r.source_id,
  content: r.content,
  span: r.span as { startChar: number; endChar: number } | null,
  similarity: Number(r.similarity),
}))
```

`postgres@3.4.9` returns `jsonb` as a parsed object, not a string, so no
`JSON.parse` is needed. Narrow with `as` because the column is
`jsonb` (Postgres-side untyped). A runtime Zod check at the rag boundary
is the canonical safety net per CLAUDE.md "No `any`, no unjustified `as`
casts"; the cast here is justified because the value originates from our
own writer and is one DDL/CHECK away from being statically typed.

### `insertChunks` — write `span`

```ts
// src/ingest.ts (diff)
const values = rows.map((r) => ({
  tenant_id: r.tenantId,
  source_id: r.sourceId,
  content: r.content,
  content_hash: r.contentHash,
  token_count: r.tokenCount,
+ span: r.span ?? null,
  embedding: vectorLiteral(r.embedding as number[]),
}))
```

`postgres@3.4.9` serializes a JS object to `jsonb` automatically when
the column type is `jsonb`. No explicit `JSON.stringify` required.

### `findExistingHashes` — unchanged

Dedup is hash-only. Span is metadata, not part of the dedup key. Callers
that re-ingest identical content keep the original row (and original
span); this is correct — the original span already maps to the chunk
text.

### Zod refinement (optional, at insert boundary)

To keep `as` narrow and safe, `insertChunks` can validate `span` shape
when present:

```ts
// src/ingest.ts
import { z } from 'zod'
const spanSchema = z
  .object({
    startChar: z.number().int().min(0),
    endChar: z.number().int().min(1),
  })
  .refine((s) => s.endChar > s.startChar, 'endChar must exceed startChar')
  .nullable()

// inside insertChunks, before mapping:
for (const r of rows) {
  spanSchema.parse(r.span ?? null) // throws ZodError on bad shape
  // existing tenantId mismatch check stays
}
```

ZodError propagates to the caller as-is (no wrapping into
`VectorInsertFailedError` — it's a programmer bug at the boundary, not a
DB failure). Optional in the sense that we could rely solely on the
upstream rag layer's typing; included here as a small bulwark for any
direct vector-store consumer (e.g., a future corpus loader).

## Migration plan

1. Generate the migration:
   ```
   pnpm --filter @seta/agent-vector exec drizzle-kit generate --name add_chunks_span
   ```
2. Confirm the generated SQL contains only the `ADD COLUMN span jsonb;`
   statement.
3. Run `pnpm migrate` against the dev Postgres. Existing rows get
   `span = NULL`.
4. The migration is **forward-only** (CLAUDE.md "Forward-only schema").
   No down migration shipped.
5. RLS, HNSW, dedup unique index — all unaffected. No rebuild required.

The migration is safe to run while the table has data:

- `ALTER TABLE … ADD COLUMN <name> <type>` (no `NOT NULL`, no default)
  is **metadata-only** in Postgres ≥ 11: it does not rewrite the table
  or take an exclusive lock for the duration of a row update. Brief
  ACCESS EXCLUSIVE lock for the catalog update only.
- No backfill SQL — legacy rows stay `NULL` until re-ingested.

## Logging contract

Logging shape in `searchChunks` and `insertChunks` is unchanged. The
existing structured log lines (`vector.search_chunks`,
`vector.insert_chunks`, `vector.find_existing_hashes`) already include
`tenantId, sourceId, rowCount` — no new fields required for span.

Never log `span` content. Spans are derived from user-supplied corpus
text and are not sensitive on their own, but consistency with the "never
log chunk content" rule keeps the log surface uniform.

## Testing

All test changes happen in the existing
`platform/agent/vector/tests/integration/` files. No new test files.

### `tests/integration/dedup.test.ts` — add span round-trip

Add to existing fresh-insert assertions:

| # | Assert |
|---|---|
| 1 | `insertChunks` with `span: { startChar: 0, endChar: 100 }` round-trips: SELECT returns the same object. |
| 2 | `insertChunks` with `span: null` (or omitted) produces a row with `span IS NULL`. |
| 3 | Re-ingesting the same content (dedup hit) does not overwrite an existing row's `span`. The first writer's `span` is preserved. |

### `tests/integration/search.test.ts` — add return-shape coverage

| # | Assert |
|---|---|
| 4 | `SearchHit.sourceId` matches the `source_id` inserted; covers the new SELECT column. |
| 5 | `SearchHit.span` matches the inserted span object for rows that have one. |
| 6 | `SearchHit.span === null` for rows inserted without span (legacy-shape coverage). |

No new property tests — `span` is opaque to the query path.

No mocking of pgvector, Postgres, or any internal `@seta/*` package
(CLAUDE.md).

## Patterns to follow (SCOPE.md additions)

1. **`span` is nullable, never required.** Legacy rows keep `NULL`;
   consumers tolerate `null`. The rag layer's
   `RagHit.citation.span: ... | null` is the canonical consumer
   contract.
2. **`span` flows ingest → search verbatim.** No re-derivation in the
   query path; `searchChunks` returns whatever `insertChunks` stored.
3. **`jsonb` not two ints.** Forward-extensibility (line/column,
   nested ranges) without another migration.

## Patterns to avoid (SCOPE.md additions)

1. **Do NOT add a CHECK constraint on `span` shape in P1.** Zod at the
   insert boundary catches programmer bugs; a DB-level CHECK adds cost
   without proportional value.
2. **Do NOT add a backfill script.** No production data exists; the
   ingestion driver re-fills on next run.
3. **Do NOT make `span` part of the dedup key.** Span is metadata, not
   identity. Two ingests of the same chunk text with different
   (hypothetical) spans must dedup to one row.
4. **Do NOT index `span`.** It is read-only metadata, never queried.

## Alternatives considered

- **Two `integer` columns (`start_char`, `end_char`).** Rejected —
  `jsonb` reads identically (`postgres@3.4.9` returns a parsed object)
  and lets future extensions (line/column, multi-range) ship without
  another migration. Storage cost is negligible at corpus scale.
- **Side-table `agent_vector.chunk_spans(chunk_id, span)`.** Rejected
  per the rag SCOPE OQ #2 recommendation — adds a join to every
  retrieval query and splits chunk metadata across two tables for no
  flexibility gain. Spans are 1:1 with chunks; co-locate them.
- **Re-chunk at retrieve time to reconstruct spans.** Rejected — pays
  the chunker's tokenizer cost on every retrieve, wastes CPU, and risks
  divergence if the chunker is updated mid-flight (citation drift).
- **`NOT NULL` with a sentinel default `{}`.** Rejected — defeats the
  "legacy rows are explicit" property and complicates consumer
  handling. `NULL` means "unknown"; `{}` means "known and empty",
  which is a different thing.
- **DB-side CHECK constraint enforcing
  `(span->>'endChar')::int > (span->>'startChar')::int`.** Rejected —
  the cast cost on each insert is non-trivial for bulk ingest, and the
  Zod refinement at the rag boundary already catches the same bug.
- **Span as a generated column derived from `content` length.**
  Nonsensical — span is *into the original document*, not the chunk;
  the document text is not stored.

## Open questions

1. **Should `Chunk.span` be required (non-null) on `NewChunk`?**
   Rag's `ingest` always supplies it; a hypothetical non-rag consumer
   (a future internal admin tool seeding test data) may not.
   Recommendation: keep nullable; Zod at the boundary enforces shape
   when present. Re-evaluate if a second writer landed without spans
   becomes a recurring source of bugs.
2. **Should `span` participate in any retrieval filter?** Not in P1.
   FAQ cite tool reads `span` for rendering only.
3. **`endChar` exclusive vs inclusive?** Inherited from
   `@seta/agent-chunking` (`endChar` is exclusive — half-open
   `[startChar, endChar)`). Match that semantic; do not redefine.

## Cross-references

- **Companion (consumer):**
  [`2026-05-18-agent-rag-design.md`](./2026-05-18-agent-rag-design.md) —
  `@seta/agent-rag.ingest` writes `span`; `@seta/agent-rag.retrieve`
  reads it onto `RagHit.citation.span`.
- **Base scope:**
  [`platform/agent/vector/SCOPE.md`](../../../platform/agent/vector/SCOPE.md) —
  the binding contract; OQ #2 ("citation span storage") is closed by
  this spec.
- **Sibling vector specs:**
  [`2026-05-15-agent-vector-dedup-design.md`](./2026-05-15-agent-vector-dedup-design.md),
  [`2026-05-15-agent-vector-implementation-design.md`](./2026-05-15-agent-vector-implementation-design.md),
  [`2026-05-15-agent-vector-demo-design.md`](./2026-05-15-agent-vector-demo-design.md).
- **Upstream chunker:**
  [`platform/agent/chunking/SCOPE.md`](../../../platform/agent/chunking/SCOPE.md) —
  source of `Chunk.startChar` / `Chunk.endChar`.
- **Project Plan:**
  [`docs/plans/Project Plan.md`](../../plans/Project%20Plan.md) —
  EP-07 task 7.2 ("Citation provenance: each chunk carries
  `(source_id, char_range, score)`") is the named acceptance criterion
  this spec satisfies on the vector side.
- **CLAUDE.md sections referenced:** "Schema-driven (generate, never
  hand-write)", "Forward-only schema", "No `any`, no unjustified `as`
  casts", "Never mock internal `@seta/*` modules".
