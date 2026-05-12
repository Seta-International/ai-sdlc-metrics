# SCOPE — platform/agent/vector  (@seta/agent-vector — P1)

> **Status:** **P1 — own package `@seta/agent-vector` lands under `platform/agent/vector/`.** The package.json + `src/` + `migrations/` are NOT created in this PR; this SCOPE.md is the P1 contract and the directory placeholder. The package is created in a follow-up PR via `pnpm new:package` — see CLAUDE.md "CLI-only — packages and dependencies".
>
> **P1 scope override (2026-05-12):** setup.md §6 originally framed `@seta/agent-vector` as a P2 RAG primitive (the canonical pgvector pattern at `docs/setup.md:444-475` is prefaced with "When `@seta/agent-vector` lands in P2"). The spike report `09-memory.md:30, :60, :68` echoed the deferral. User-directed scope change: the **Seta FAQ Agent** requires RAG in P1, so the vector store moves to P1 alongside chunking / embeddings / rag. setup.md §6's P2 framing stays as-written; this SCOPE.md is the override citation point.

## Purpose

Pgvector-backed vector store for the RAG track: schema for chunks + embeddings, HNSW index with `vector_cosine_ops`, and the tenant-scoped `searchChunks` query. Owns the `agent_vector` Postgres schema and its Drizzle definitions + migrations. The canonical pattern at `docs/setup.md:444-501` is reproduced verbatim by this package — it is the contract.

Critical correctness detail: pgvector's HNSW prefilter does NOT understand RLS / multi-tenant `WHERE tenant_id = $1` predicates. Without `SET LOCAL hnsw.iterative_scan = strict_order` (pgvector ≥ 0.8.0), a tenant-filtered `LIMIT k` query can return < k matching rows even when many exist — pgvector returns its top-k unfiltered candidates, then Postgres filters them down. This is **a correctness fix, not just an optimization** (setup.md §6 "HNSW tuning + `iterative_scan` for tenant-filtered search" subsection at `docs/setup.md:480-518`).

## Responsibilities

- **Owns:**
  - The `agent_vector` Postgres schema — `agent_vector.chunks(id uuid pk, tenant_id uuid not null, source_id uuid not null, content text not null, embedding vector(1536))` plus the HNSW index `chunks_embedding_idx USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 128)`. RLS policy per setup.md §3 (tenant-isolation select / modify policies referencing `current_setting('app.tenant_id', true)::uuid`).
  - Drizzle schema file (`src/schema/chunks.ts`), `drizzle.config.ts` (with `schemaFilter: ['agent_vector']`), and `migrations/` directory per CLAUDE.md "Schema-per-module (DDD)".
  - The `searchChunks(query: number[], k = 8, minSim = 0.3)` query that issues the three `SET LOCAL` HNSW tuning statements inside the `withTenant` transaction (setup.md §6 canonical pattern at lines 486-500).
  - Insert / upsert path for ingest — `insertChunks(rows: NewChunk[])` accepting batches.
  - The build-time SQL for index creation + the documented `maintenance_work_mem = '8GB'` / `max_parallel_maintenance_workers = 7` one-shot for bulk-build performance (setup.md §6 build-tuning block at lines 505-513).
- **Does NOT own:**
  - Embedding generation — `@seta/agent-embeddings`. This package consumes `number[]` query vectors at the public boundary.
  - Chunking — `@seta/agent-chunking`. Inputs to `insertChunks` are pre-chunked.
  - RAG composition / RRF fusion — `@seta/agent-rag`. Hybrid (vector + FTS) ranking is upstream.
  - FTS (`tsvector + pg_trgm`) — Postgres-native, used by `@seta/agent-rag` for the BM25-ish leg of RRF. This package does not host an FTS column.
  - Cohere `rerank-v3` — explicit P2 per setup.md §6 ("Reranker: none in P1 (Cohere rerank-v3 in P2) — RRF fusion suffices").
  - Cross-tenant search — every query is tenant-scoped via `withTenant`; multi-tenant aggregation is out of scope.

## Current state (P1)

- **Directory placeholder only.** This SCOPE.md exists; no `package.json`, no `src/`, no migrations land in this PR. The package is created in the next PR via `pnpm new:package` (CLAUDE.md CLI-only).
- The setup.md §6 pgvector pattern (Drizzle schema + `searchChunks` with `iterative_scan`) is the implementation contract — the package re-creates that code verbatim, **with** the iterative-scan tuning lines from the second code block (which is the corrected version of the first).

## Public interface (when implementation lands — P1)

```ts
// declared in @seta/agent-vector/src/index.ts
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import { chunks } from './schema/chunks.js'

export type Chunk = InferSelectModel<typeof chunks>
export type NewChunk = InferInsertModel<typeof chunks>

export interface SearchHit {
  id: string
  content: string
  similarity: number   // 0..1, where 1 = identical (= 1 - cosineDistance)
}

export function searchChunks(
  query: number[],          // 1536-dim — matches @seta/agent-embeddings EMBEDDING_DIMENSIONS
  k?: number,               // default 8
  minSim?: number,          // default 0.3 — filter floor before LIMIT
): Promise<SearchHit[]>

export function insertChunks(rows: NewChunk[]): Promise<void>
// Batch insert; caller is responsible for tenant_id on each row
// (the package asserts tenant_id matches tenantContext.getTenantId() at boundary).

// Drizzle exports for cross-package fixture construction
export { chunks, agentVectorSchema } from './schema/chunks.js'
```

`tenantId` is never a function parameter — read from `tenantContext.getTenantId()` per CLAUDE.md ("Tenant id is never a function parameter"). RLS is the backstop; `withTenant` is the primary enforcement.

## Imports (when implementation lands — P1)

- **Allowed internal:** `@seta/db` (pool + `withTenant` + role exports + migration runner integration), `@seta/tenant` (context reads), `@seta/agent-embeddings` (the `EMBEDDING_DIMENSIONS = 1536` constant only — keeps the dimension contract one-sided).
- **Forbidden:** `@seta/middleware` (this is a library, not a route module), any `modules/channels/*`, any `modules/products/*`, `apps/*`. No model SDKs. No HTTP server framework.
- **External (pinned per setup.md §13):** `drizzle-orm@0.45.2`, `postgres@3.4.9` (transitively via `@seta/db`), `zod@4.4.3` (for `NewChunk` runtime refinement at the public surface).

Setup.md §11 dep direction confirms: `platform/agent/vector → platform/db`.

## Patterns to follow

- **Three `SET LOCAL` tuning statements inside every `searchChunks` call** — the verbatim setup.md §6 pattern (`hnsw.ef_search = 100`, `hnsw.iterative_scan = strict_order`, `hnsw.max_scan_tuples = 20000`). The `iterative_scan` line is **load-bearing for correctness** under multi-tenant RLS filtering, not just a tuning knob. See setup.md §6 lines 480-501 ("This is a correctness fix, not just an optimization").
- **`strict_order` over `relaxed_order`** — setup.md §6 line 518 "Always set `iterative_scan = strict_order` for tenant-filtered queries — `relaxed_order` only when ordering accuracy isn't critical". Tenant-filtered FAQ retrieval is always strict.
- **Similarity = `1 - cosineDistance`** — setup.md §6 line 478 footgun #2: "cosine *distance* is 0–2, similarity is 0–1 — flipping these is the most common pgvector bug". Hard-coded; not a tunable.
- **HNSW + `vector_cosine_ops` opclass match** — setup.md §6 line 478 footgun #1: "using the wrong opclass silently disables index acceleration". The opclass on the index MUST match the distance operator at query time.
- **All persistence through `withTenant`** — RLS is the backstop; never query the raw `sql` client. Setup.md §6 line 478 footgun #3: "the query goes through `withTenant`, so RLS still applies to vector search".
- **Schema-per-module migrations** — `drizzle-kit generate` produces `migrations/*.sql` in this package; the top-level runner in `@seta/db` applies them in `OWNER_ORDER`. Never hand-edit migration SQL (CLAUDE.md "Schema-driven").
- **Build-time tuning documented, not enforced at runtime** — `maintenance_work_mem = '8GB'` and `max_parallel_maintenance_workers = 7` (setup.md §6 lines 511-512) are operator-applied SET statements for the bulk-build session; the migration ships with `m = 16, ef_construction = 128` `WITH (...)` defaults baked in.
- **No cross-schema FKs** — `chunks.source_id` references an FAQ-corpus row by id, not by FK. CLAUDE.md "Schema-per-module — no cross-schema foreign keys; cross-context references by ID only".
- **1536d is hard-coded** — matches OpenAI `text-embedding-3-small`. Changing the model is a coordinated schema migration (different `vector(N)` column + index rebuild).

## Patterns to avoid

- **Do NOT skip `SET LOCAL hnsw.iterative_scan = strict_order`** — without it, tenant-filtered `LIMIT k` queries silently under-return. Setup.md §6 lines 482-491 lays out the correctness bug; the SCOPE.md tightens it to a hard rule.
- **Do NOT use `vector_l2_ops` or `vector_ip_ops`** — OpenAI embeddings are L2-normalized; cosine is the correct distance. Mixing opclasses with the wrong distance call silently disables the index (setup.md §6 line 478).
- **Do NOT bypass `withTenant`** — direct `sql` clients lose the `SET LOCAL app.tenant_id`, RLS rejects everything (setup.md §3 footgun discussion).
- **Do NOT introduce IVFFlat** — setup.md §6 picks HNSW: "Lower latency than IVFFlat at our scale". Changing the index type is a coordinated migration.
- **Do NOT cache search results in-process** — cross-request tenant leak risk. Caching is the consumer's concern (and even there, only with tenant-scoped LRU keys).
- **Do NOT add Cohere rerank-v3 calls here** — explicit P2 per setup.md §6. The reranker, when it lands, sits in `@seta/agent-rag`, not in the vector layer.
- **Do NOT add an FTS column to `chunks`** — FTS lives at the table level in the FAQ corpus owner (the consuming product's source-of-truth table). Vector and FTS results are unioned at the RAG layer via RRF (setup.md §6 "RRF fusion suffices").
- **Do NOT cross-schema FK** into `@seta/agent`'s `agent.write_continuations`, `@seta/agent-memory`'s `agent_memory.*`, or any product schema — reference by id (CLAUDE.md "Schema-per-module"; setup.md §3:123).

## Test strategy (when implementation lands)

- **Integration tests required** — pgvector behaviour is non-mockable. Use the dockerized pg in `/tests/integration/` per setup.md §17 / §18.
- **`iterative_scan` correctness test** — load ≥ 10× `k` rows with mixed tenants, query as one tenant, assert exactly `k` results returned (regression for the filtered-LIMIT bug). This is the load-bearing test.
- **RLS isolation** — query as tenant A after inserting under tenant B; assert zero results.
- **Recall floor** — fixture corpus with known nearest-neighbour set; assert `searchChunks` returns the expected top-k with `similarity > minSim`.
- **HNSW build smoke test** — assert the migration creates the index with the `vector_cosine_ops` opclass and `m = 16, ef_construction = 128` storage parameters.
- **No LLM fixtures needed** — vector layer is below the model layer. `@seta/agent-core/testkit` recordings are not used here.

## Open questions

1. **`agent_vector` schema name confirmed.** Setup.md §3 line 117's "future" schema list (referenced in `platform/agent/memory/SCOPE.md` open question #5) should be amended in a follow-up setup.md PR to include `agent_vector` alongside `agent_memory` and `agent_workflows`.
2. **`@seta/db` `OWNER_ORDER` placement.** The runner list in `platform/db/SCOPE.md` must include `agent_vector` (added after `agent_memory` if memory depends on vector for P2 semantic recall — which it does shape-wise, even though P1 wiring is dormant; otherwise free placement). See `platform/db/SCOPE.md` for the canonical order.
3. **`source_id` polymorphism** — chunks can come from FAQ articles, Planner task descriptions (future), Teams transcripts (future). `source_id` is an opaque UUID with no FK; the consumer table owns the resolution. Confirm this matches the FAQ corpus structure when RAG-survey output lands.
4. **`ef_search` per-tenant override** — setup.md §6 line 517 hints at "bump to 200 for low-cardinality tenants". Should `searchChunks` accept a per-call `efSearch?: number` override, or pin to 100 in P1? Default: pin to 100, revisit after telemetry.
5. **`hnsw.max_scan_tuples = 20000` worst-case latency budget** — confirm against telemetry once FAQ corpus size is known.
6. **Recall vs latency target** — setup.md §6 line 515: "1536-d cosine, ~1M vectors, 95th-percentile recall ≥0.95". Confirm the FAQ corpus is ≤ 1M chunks; if larger, the tuning parameters change.

## Cross-references

- **Setup spec (load-bearing):** [`docs/setup.md`](../../../docs/setup.md) §6 (RAG primitives — full section, especially the pgvector HNSW pattern at lines 444-475 and the `iterative_scan` correctness fix at lines 480-518), §3 (RLS pattern, schema list — to be amended), §11 (`platform/agent/vector/` directory placement; dep direction), §13 (`drizzle-orm@0.45.2`, `postgres@3.4.9` pins).
- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/09-memory.md`](../../../docs/explorations/2026-05-12-mastra-spike/09-memory.md):30, :60, :68 — RAG track previously P2, now P1 per override; future semantic-recall path inside `@seta/agent-memory` calls `searchChunks()` from here.
- **Sibling RAG packages:** [`platform/agent/chunking/SCOPE.md`](../chunking/SCOPE.md), [`platform/agent/embeddings/SCOPE.md`](../embeddings/SCOPE.md) (provides `EMBEDDING_DIMENSIONS = 1536` constant), [`platform/agent/rag/SCOPE.md`](../rag/SCOPE.md) (composition + RRF).
- **Migration runner:** [`platform/db/SCOPE.md`](../../db/SCOPE.md) — `OWNER_ORDER` must include `agent_vector`.
- **Product consumer:** [`modules/products/agent/SCOPE.md`](../../../modules/products/agent/SCOPE.md) § FAQ Agent — consumes via `@seta/agent-rag` (not directly).
- **P1 override notice:** [`docs/explorations/2026-05-12-mastra-spike/README.md`](../../../docs/explorations/2026-05-12-mastra-spike/README.md) § "P1 scope override (2026-05-12)".
