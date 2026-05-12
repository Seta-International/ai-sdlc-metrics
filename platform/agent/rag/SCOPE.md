# SCOPE — platform/agent/rag  (@seta/agent-rag — P1)

> **Status:** **P1 — own package `@seta/agent-rag` lands under `platform/agent/rag/`.** The package.json + `src/` are NOT created in this PR; this SCOPE.md is the P1 contract and the directory placeholder. The package is created in a follow-up PR via `pnpm new:package` — see CLAUDE.md "CLI-only — packages and dependencies".
>
> **P1 scope override (2026-05-12):** setup.md §6 originally listed all four RAG packages (`agent-chunking`, `agent-embeddings`, `agent-vector`, `agent-rag`) as P2 primitives (table at `docs/setup.md:428-438`; §11 layout grouping these under P2). The spike report `09-memory.md:30, :68` echoed the deferral. User-directed scope change: the **Seta FAQ Agent** requires RAG in P1, so the full RAG track moves to P1. setup.md §6's P2 framing stays as-written; this SCOPE.md is the override citation point.

## Purpose

Composition layer over the three single-purpose RAG primitives (`@seta/agent-chunking`, `@seta/agent-embeddings`, `@seta/agent-vector`) plus Postgres-native FTS (tsvector + pg_trgm per setup.md §6) — turns a free-form document into stored chunks (`ingest`) and a free-form query into a ranked list of source-attributed hits (`retrieve`). Composition only: no schema of its own, no LLM calls, no transport.

In P1 the ranking step combines vector-similarity hits with FTS hits via **Reciprocal Rank Fusion (RRF)** per setup.md §6 ("Reranker — none in P1 (Cohere rerank-v3 in P2) — RRF fusion suffices"). RRF is parameter-light (just a `k` smoothing constant, typically 60) and produces a calibrated combined ranking without learned weights.

The Seta FAQ Agent (`modules/products/agent/src/agents/faq.ts`) consumes this package through two tools — `search_knowledge_base` (calls `retrieve`) and `cite_sources` (formats the returned hits as Adaptive Card citations).

## Responsibilities

- **Owns:**
  - The `ingest(sourceId: string, content: string, opts?: IngestOptions): Promise<void>` pipeline — `chunkText` → `embed` → `insertChunks`. Tenant-scoped via `withTenant` per the underlying packages.
  - The `retrieve(query: string, opts?: RetrieveOptions): Promise<RagHit[]>` pipeline — `embed([query])` → `searchChunks(vec)` (vector leg) ⊕ Postgres FTS query against the source corpus (FTS leg) → **RRF fusion**.
  - The RRF fusion algorithm itself — pure function, `fuseByRRF(rankings: RankedList[], k = 60): RagHit[]`. Cited shape: each hit carries `chunkId`, `sourceId`, `content`, `vectorRank?`, `ftsRank?`, `rrfScore`, `vectorSimilarity?`.
  - The `RagHit` shape, including a `citation` payload (`{ sourceId, span: { startChar, endChar } }`) used by the FAQ Agent's `cite_sources` formatter.
- **Does NOT own:**
  - Chunking logic — `@seta/agent-chunking`.
  - Embedding calls — `@seta/agent-embeddings`.
  - Vector schema / index / `searchChunks` — `@seta/agent-vector` (which also holds the `agent_vector` Postgres schema).
  - FTS column / index — those live on the consuming corpus's source-of-truth table (e.g., a hypothetical `faq.articles` table owned by the FAQ corpus loader). This package consumes the FTS via parameterised SQL through `@seta/db`, but does not migrate the corpus table.
  - Cohere `rerank-v3` — explicit P2 per setup.md §6.
  - Source acquisition (PDF parsing, web crawling, Markdown ingestion) — out of P1 RAG scope; products feed text in as strings.
  - LLM-driven answer synthesis — that is the FAQ Agent's system prompt + the kernel's responsibility. This package only retrieves; it does not generate.

## Current state (P1)

- **Directory placeholder only.** This SCOPE.md exists; no `package.json`, no `src/` lands in this PR. The package is created in the next PR via `pnpm new:package` (CLAUDE.md CLI-only).
- All three downstream RAG packages are P1 (per override); this composition layer is the topmost of the four and depends on every one of them.

## Public interface (when implementation lands — P1)

```ts
// declared in @seta/agent-rag/src/index.ts

export interface IngestOptions {
  maxTokens?: number      // chunk size; default 512
  overlapTokens?: number  // chunk overlap; default 64
  signal?: AbortSignal
}

export function ingest(sourceId: string, content: string, opts?: IngestOptions): Promise<void>
// chunkText(content, ...) → embed(chunks) → insertChunks(rows with sourceId, tenant_id from context)

export interface RetrieveOptions {
  k?: number              // top-k after fusion; default 8
  minSim?: number         // vector similarity floor; default 0.3
  ftsTable?: string       // qualified table for FTS leg (corpus-owner-provided)
  ftsColumn?: string      // tsvector column on that table; default 'fts'
  signal?: AbortSignal
}

export interface RagHit {
  chunkId: string
  sourceId: string
  content: string
  rrfScore: number             // fused rank score (higher = better)
  vectorRank?: number          // 1-based rank in vector leg; undefined if not present
  ftsRank?: number             // 1-based rank in FTS leg; undefined if not present
  vectorSimilarity?: number    // 0..1 cosine similarity from @seta/agent-vector
  citation: {
    sourceId: string
    span: { startChar: number; endChar: number }   // re-resolved from the stored chunk
  }
}

export function retrieve(query: string, opts?: RetrieveOptions): Promise<RagHit[]>

// Pure RRF helper, exported for testing + reuse
export function fuseByRRF(
  rankings: Array<Array<{ id: string }>>,
  k?: number,                  // RRF smoothing constant; default 60
): Array<{ id: string; rrfScore: number; ranks: Record<number, number> }>
```

`tenantId` never appears as a function parameter — read from `tenantContext.getTenantId()` (CLAUDE.md).

## Imports (when implementation lands — P1)

- **Allowed internal:** `@seta/agent-chunking` (upstream — `chunkText`), `@seta/agent-embeddings` (upstream — `embed`, `EMBEDDING_DIMENSIONS`), `@seta/agent-vector` (downstream — `searchChunks`, `insertChunks`, `Chunk` types), `@seta/db` (pool + `withTenant` for the FTS-leg query), `@seta/tenant` (context reads), `@seta/observability` (logger + OTel span for the fusion step).
- **Forbidden:** any `modules/*` package, `apps/*`, `@seta/middleware` (this is a library, not a route module). No model SDKs (`openai`, `@anthropic-ai/sdk`) — embedding goes through `@seta/agent-embeddings`.
- **External (pinned per setup.md §13):** `drizzle-orm@0.45.2`, `postgres@3.4.9` (transitively via `@seta/db`), `zod@4.4.3` (for option validation at the public surface).

Setup.md §11 dep direction confirms: `platform/agent/rag → platform/agent/{chunking, embeddings, vector} + platform/db`.

## Patterns to follow

- **Pure composition — no schema of its own.** Setup.md §6 splits the four packages "so any one is reusable inside the agent platform without dragging the others in". This package is the one that does drag them in — by design — and adds no incremental persistence surface.
- **RRF with `k = 60` default** — the de-facto standard smoothing constant. `rrfScore(rank) = 1 / (k + rank)`. Combine across legs by summing. Setup.md §6: "RRF fusion suffices" in lieu of a learned reranker.
- **Vector leg uses `@seta/agent-vector.searchChunks` verbatim** — three `SET LOCAL` HNSW tuning lines + `withTenant`; the iterative-scan correctness fix is non-negotiable (setup.md §6 lines 482-491; see also `platform/agent/vector/SCOPE.md` "patterns to follow").
- **FTS leg uses parameterised SQL through `@seta/db`** — `tx.execute(sql\`SELECT ${idCol}, ts_rank_cd(${ftsCol}, query) AS rank FROM ... WHERE ${ftsCol} @@ websearch_to_tsquery(${query}) ORDER BY rank DESC LIMIT ${k * 2}\`)` (shape; not code). Tenant scoping via `withTenant`. The corpus-owner provides `ftsTable` / `ftsColumn`.
- **Abort propagation through both legs** — `signal` threads into `embed` and into the FTS query. Setup.md §5: "Abort wiring is non-negotiable".
- **Citation span re-resolved at retrieve time** — `@seta/agent-vector.Chunk` carries the chunk content but not the original character span (the `agent_vector.chunks` table stores `content` but not `startChar`/`endChar`; those live on the original `@seta/agent-chunking.Chunk` produced at ingest). The chunk's `startChar`/`endChar` should be stored in the vector row's metadata column at ingest time (proposed `chunks.span jsonb`) so retrieval can return citation spans without re-chunking. **Open question — see below.**
- **No LLM call inside `retrieve`** — answer synthesis happens upstream in the FAQ Agent's kernel loop. RAG returns ranked hits; the agent's system prompt instructs it to cite them.
- **Idempotent `ingest`** — re-ingesting the same `(sourceId, content)` should not duplicate chunks. Implementation note: delete-by-`source_id` then insert, all inside the same `withTenant` tx. Setup.md §3 / CLAUDE.md "Idempotent external boundaries".

## Patterns to avoid

- **Do NOT add Cohere `rerank-v3` in P1** — explicit P2 per setup.md §6. RRF is the P1 ranking strategy; adding a learned reranker requires its own ADR + an additional `@seta/agent-rag-rerank` package or similar.
- **Do NOT call `openai` directly** — embedding goes through `@seta/agent-embeddings`. Direct calls break the testkit recording layer and bypass shared retry / classification (CLAUDE.md footguns; spike `06-llm-recording-replay.md`).
- **Do NOT introduce learned-to-rank in P1** — RRF is parameter-light by design. Learned ranking requires training data + an offline evaluation harness that does not yet exist.
- **Do NOT cross-schema FK from `agent_vector.chunks` to the FAQ corpus table** — `source_id` is a UUID with no FK (CLAUDE.md "Schema-per-module — no cross-schema foreign keys"). Resolution happens at query time in this layer if the caller needs the original document.
- **Do NOT mock `@seta/agent-vector` or `@seta/agent-embeddings` in tests** — CLAUDE.md: "Never mock internal `@seta/*` modules — if you need to, your seam is wrong." Integration tests use real pgvector + recorded OpenAI fixtures.
- **Do NOT cache retrieve results in-process** — tenant-leak risk. The kernel's prompt-cache layer (Anthropic ephemeral cache, OpenAI structured-output cache per setup.md §5) handles answer-level caching; RAG hits are not cached.
- **Do NOT add answer-synthesis** — generation is the agent's job. Crossing this boundary couples RAG to a specific model and prompt shape.
- **Do NOT introduce sub-second wall-clock SLAs for `ingest`** — bulk corpus ingest runs offline / on demand, not on the request hot path. The `retrieve` hot path is the latency-sensitive one.

## Test strategy (when implementation lands)

- **Unit (`src/**/*.test.ts`):** `fuseByRRF` is pure — exhaustive correctness tests (single-leg passthrough, multi-leg fusion, tied-rank handling, `k` smoothing parameter effect).
- **Integration (`tests/integration/**`, requires `DATABASE_URL`):** end-to-end ingest → retrieve against real pgvector + a fixture FAQ corpus loaded under tenant A. Assert RLS isolation by retrieving from tenant B (zero hits). Use `@seta/agent-core/testkit` `setupLLMRecording({ name })` to fixture the OpenAI embedding calls per spike `06-llm-recording-replay.md`.
- **RRF rank-stability** — re-running `retrieve` on the same query + same corpus must return byte-identical results (deterministic under fixed embeddings). Property test.
- **Recall floor** — fixture corpus with known relevant chunk; assert that chunk appears in top-`k` for the query.
- **No live OpenAI in CI** — recordings checked into `__recordings__/rag/`. Per spike `06-llm-recording-replay.md` SA-6: "`__recordings__/**` **must** be checked into git — otherwise turbo silently caches misses".
- **FAQ Agent integration tests** — live in `modules/products/agent/tests/integration/` and use this package end-to-end; see `modules/products/agent/SCOPE.md` § Test strategy.

## Open questions

1. **FTS leg corpus provenance** — `retrieve` accepts `ftsTable` / `ftsColumn` options; that pushes the FTS-column ownership onto the corpus-loader. Is there a dedicated `faq.articles` table owned by a new corpus loader (a `modules/connectors/seta-faq/` perhaps?), or does the FAQ corpus live inside the agent product? Defer to the RAG data-survey output (`modules/products/agent/SCOPE.md` open question "Seta knowledge-base corpus source").
2. **Citation span storage** — `@seta/agent-vector.chunks` currently has no `span jsonb` column in the setup.md §6 canonical pattern. Either (a) add a `span jsonb` column to `chunks` (vector-package schema change), or (b) store the span in a side-table owned by this package, or (c) re-chunk at retrieve time to reconstruct spans (wasteful). Recommend (a) — a single nullable `span jsonb` column on `chunks`. Flagged for `platform/agent/vector/SCOPE.md` open questions.
3. **RRF `k` smoothing constant** — 60 is the literature default; do we expose it as an option? Default: yes, advanced-only `rrfK?: number` on `RetrieveOptions`, undocumented in the FAQ Agent path.
4. **Hybrid weight asymmetry** — RRF treats both legs equally. If vector recall outperforms FTS at our scale (or vice versa), do we want a weight? Defer to telemetry after FAQ corpus lands; learned weights require an offline evaluation harness.
5. **Token-budget for query embedding** — `query` is bounded by OpenAI's 8192-token embedding limit; we do not chunk queries. If a query exceeds the limit, surface the `LlmError` from `@seta/agent-embeddings` unchanged.
6. **`@seta/db` `OWNER_ORDER` placement** — this package owns no schema, so it does not appear in `OWNER_ORDER`. Vector / embeddings / chunking placements are tracked in their own SCOPE files.

## Cross-references

- **Setup spec (load-bearing):** [`docs/setup.md`](../../../docs/setup.md) §6 (RAG primitives — full section; RRF rationale at line 438), §11 (`platform/agent/rag/` directory placement; dep direction), §13 (no incremental external pins beyond what the four packages already pin).
- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/09-memory.md`](../../../docs/explorations/2026-05-12-mastra-spike/09-memory.md):30, :68 — RAG track previously P2, now P1 per override.
- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md`](../../../docs/explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md) — testkit recordings for the embedding leg.
- **Sibling RAG packages:** [`platform/agent/chunking/SCOPE.md`](../chunking/SCOPE.md), [`platform/agent/embeddings/SCOPE.md`](../embeddings/SCOPE.md), [`platform/agent/vector/SCOPE.md`](../vector/SCOPE.md).
- **Product consumer:** [`modules/products/agent/SCOPE.md`](../../../modules/products/agent/SCOPE.md) § FAQ Agent — `search_knowledge_base` calls `retrieve`; `cite_sources` formats `RagHit[]` as Adaptive Card citations.
- **P1 override notice:** [`docs/explorations/2026-05-12-mastra-spike/README.md`](../../../docs/explorations/2026-05-12-mastra-spike/README.md) § "P1 scope override (2026-05-12)".
