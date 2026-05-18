# Design — `@seta/agent-rag` (P1, EP-07)

**Status:** Draft for implementation. Authored 2026-05-18. Supersedes
[`2026-05-15-agent-rag-dedup-ingest-design.md`](./2026-05-15-agent-rag-dedup-ingest-design.md)
(ingest path; the embeddings API has since shifted from a free `embed()`
function to a `createOpenAIEmbeddings()` factory returning an
`EmbeddingsClient`). The binding contract remains
[`platform/agent/rag/SCOPE.md`](../../../platform/agent/rag/SCOPE.md); this
doc fills in the construction shape, retrieve path, RRF helper, testkit,
error handling, and the companion vector-side change required to surface
citation spans.

**Depends on (must land first):** companion spec
[`2026-05-18-agent-vector-span-citation-design.md`](./2026-05-18-agent-vector-span-citation-design.md)
— adds `span jsonb` column to `agent_vector.chunks` and extends
`searchChunks` to return `sourceId` + `span`. Drafted alongside this
spec; PR 1 in the implementation-sequence section.

## Why

EP-07 is the composition layer over the three single-purpose RAG primitives
(`@seta/agent-chunking`, `@seta/agent-embeddings`, `@seta/agent-vector`). It
is the only entry point into the FAQ-Agent retrieval surface. Without this
package, every agent that wants RAG must wire chunking + embeddings + vector
itself, duplicating the dedup pre-check and the citation provenance
contract.

The Seta FAQ Agent (EP-12, `modules/products/faq`) consumes this package
through two tools — `search_knowledge_base` (calls `retrieve`) and
`cite_sources` (renders `RagHit[]` as Adaptive Card citations). EP-08's
corpus ingestion driver (`apps/api/scripts/rag-ingest.ts`) also consumes
`ingest` to populate the vector store from curated markdown.

## Scope

This spec covers:

- The `@seta/agent-rag` package: scaffold, public surface, ingest path,
  retrieve path, RRF helper, testkit, type-only subpath, error contract,
  logging, tests.
- The `cite_sources` field contract that `modules/products/faq` consumes
  (field names + nullability, not the Adaptive Card renderer).
- SCOPE.md updates for `@seta/agent-rag`.
- The `Superseded by ...` header on the prior dedup-ingest spec.

Out of scope:

- **FTS leg / hybrid retrieve.** Deferred to P2 — the P1 corpus has no
  natural FTS owner (no `modules/products/faq` table yet; corpus lives only
  in `agent_vector.chunks`, which SCOPE forbids from hosting tsvector).
  `fuseByRRF` still ships as a pure helper running in single-leg
  passthrough mode so the field shape is uniform with P2 hybrid retrieve.
- Vector-side schema and API changes (`span jsonb`, `searchChunks` return
  shape) — covered by the companion `agent-vector-span-citation` spec and
  PR 1 below. This spec depends on that change but does not embed it.
- FAQ Agent profile, system prompt, retrieval tool, cite Adaptive Card,
  BK-7 citation-rate eval — EP-12.
- FAQ corpus survey / curation / ingestion driver — EP-08.
- Cohere `rerank-v3` — explicit P2 per setup.md §6.
- Streaming retrieve / async iterators — not in P1.
- Per-tenant retrieve metrics / counters — `ingest:dedup-result` log line
  is the cost signal; downstream audit consumer can roll up later.

## Architecture

`@seta/agent-rag` is a thin composition layer that:

- **Owns no schema.** Every persistent surface is owned upstream
  (`agent_vector.chunks`).
- **Makes no direct LLM calls.** Embedding goes through `EmbeddingsClient`.
- **Exposes no transport.** Library only — no Hono routes, no OpenAPI.
- **Takes deps by injection.** `createAgentRag({ sql, embeddings })` is
  the only construction entry point.

```
                      ┌────────────────────────┐
   ingest(srcId, text)│                        │ retrieve(query, opts)
            ──────────▶                        ◀──────────
                      │     @seta/agent-rag    │
                      │ createAgentRag({sql,   │
                      │   embeddings})         │
                      │                        │
                      └──┬──────┬──────────┬───┘
              chunkText  │      │ embed    │ searchChunks/insertChunks/
                         ▼      ▼          ▼ findExistingHashes
                  ┌──────────┐ ┌────────────┐ ┌───────────────┐
                  │ chunking │ │ embeddings │ │    vector     │
                  │  (pure)  │ │  (OpenAI)  │ │  (pgvector)   │
                  └──────────┘ └────────────┘ └───────────────┘
```

**Construction site.** `apps/api/src/main.ts` builds the singleton once at
boot:

```ts
import { createPool } from '@seta/db' // already in apps/api/src/db.ts
import { createOpenAIEmbeddings } from '@seta/agent-embeddings'
import { createAgentRag } from '@seta/agent-rag'

const sql = /* from apps/api/src/db.ts */
const embeddings = createOpenAIEmbeddings({ apiKey: env.OPENAI_API_KEY })
const rag = createAgentRag({ sql, embeddings })
// `rag.ingest` / `rag.retrieve` are bound to the FAQ Agent tool registry.
```

**Tenant scoping.** Implicit via `tenantContext.getTenantId()` inside each
downstream call. Never a function parameter. RLS on `agent_vector.chunks`
is the backstop.

**Allowed imports** (internal): `@seta/agent-chunking`,
`@seta/agent-embeddings` (types only — `EmbeddingsClient`),
`@seta/agent-vector`, `@seta/db` (`DbSql` type), `@seta/tenancy`,
`@seta/observability`. `@seta/middleware/errors` is allowed if a new error
class becomes necessary, but this spec adds none.

**Forbidden imports:** any `modules/*` package, `apps/*`. No model SDKs
(`openai`, `@anthropic-ai/sdk`). No HTTP/route framework. No
`@seta/middleware` route helpers — library, not route module.

**External pins:** `zod@4.4.3` for `IngestOptions` / `RetrieveOptions`
runtime validation at the public surface. `node:crypto` (Node built-in)
for sha256 dedup hash. No new pins beyond what siblings already declare.

## Public surface

Three subpath exports: main (`@seta/agent-rag`), types-only
(`@seta/agent-rag/types`), testkit (`@seta/agent-rag/testkit`).

### Main entrypoint — `@seta/agent-rag`

```ts
// src/index.ts
export { createAgentRag } from './factory.js'
export { fuseByRRF } from './rrf.js'
export type {
  RagApi,
  RagDeps,
  RagHit,
  RagCitation,
  IngestOptions,
  RetrieveOptions,
  RankedItem,
  FusedItem,
} from './types.js'
```

### Types entrypoint — `@seta/agent-rag/types`

Type-only — zero runtime cost. Downstream packages
(`modules/products/faq`, contract publishers per the AG-S unblock plan)
import from here without pulling the implementation into their
type-check graph.

```ts
// src/types.ts
import type { DbSql } from '@seta/db'
import type { EmbeddingsClient } from '@seta/agent-embeddings'

export interface RagDeps {
  sql: DbSql
  embeddings: EmbeddingsClient
}

export interface IngestOptions {
  /** Chunk size in tokens. Default: 512. */
  maxTokens?: number
  /** Rolling-window overlap in tokens. Default: 64. */
  overlapTokens?: number
  signal?: AbortSignal
}

export interface RetrieveOptions {
  /** Top-k after fusion. Default: 8. */
  k?: number
  /** Vector similarity floor (0..1). Default: 0.3. */
  minSim?: number
  /** RRF smoothing constant. Default: 60 (literature standard). Advanced. */
  rrfK?: number
  signal?: AbortSignal
}

export interface RagCitation {
  sourceId: string
  /**
   * Character span into the original ingested content.
   * `null` only for chunks ingested before the `span jsonb` column landed
   * (transitional; the companion spec backfills new rows).
   */
  span: { startChar: number; endChar: number } | null
}

export interface RagHit {
  chunkId: string
  sourceId: string
  content: string
  /** Fused rank score (higher = better). */
  rrfScore: number
  /** 1-based rank in the vector leg. Always present in P1. */
  vectorRank?: number
  /** Reserved for P2 hybrid retrieve. `undefined` in P1. */
  ftsRank?: number
  /** 0..1 cosine similarity from `searchChunks`. */
  vectorSimilarity?: number
  citation: RagCitation
}

export interface RagApi {
  ingest(sourceId: string, content: string, opts?: IngestOptions): Promise<void>
  retrieve(query: string, opts?: RetrieveOptions): Promise<RagHit[]>
}

/** Input to `fuseByRRF`: one ranked list per leg. */
export interface RankedItem { id: string }

/** Output of `fuseByRRF`. */
export interface FusedItem {
  id: string
  rrfScore: number
  /** `ranks[legIndex] = 1-based rank within that leg`. */
  ranks: Record<number, number>
}
```

### Testkit entrypoint — `@seta/agent-rag/testkit`

In-memory fake. Matches `RagApi` exactly. FAQ Agent tests bind to this
instead of mocking internal `@seta/*` packages.

```ts
// src/testkit.ts
import type { RagApi, RagHit } from './types.js'

export interface FakeRagOptions {
  /** Canned hits returned by `retrieve` regardless of query. */
  hits?: RagHit[]
  /** Optional dynamic responder; takes precedence over `hits` when set. */
  retrieve?: (query: string) => RagHit[] | Promise<RagHit[]>
}

export function createFakeAgentRag(opts?: FakeRagOptions): RagApi & {
  __calls: { ingest: Array<{ sourceId: string; content: string }> }
}
```

`ingest` is a no-op that records calls on `__calls.ingest`. The `__calls`
surface is intentional: it lets contract tests assert "the agent did /
did not call ingest" without instrumenting the production code path.

### `fuseByRRF` — pure helper

```ts
// src/rrf.ts
export function fuseByRRF(
  rankings: RankedItem[][],   // one ranked list per leg, 1-based ordering implicit
  k = 60,                     // smoothing constant; literature default
): FusedItem[]
```

Algorithm: for each `legIndex`, walk that leg's list. Accumulate
`score[id] += 1 / (k + rank)` and record `ranks[id][legIndex] = rank`.
Return items sorted by `rrfScore` descending, stable on first-leg order
(deterministic tie-break).

Always runs in `retrieve`, even with a single leg, so the output shape is
uniform between P1 (vector-only) and P2 (hybrid). Single-leg input
produces the input order with `rrfScore = 1/(k+rank)`.

### `cite_sources` field contract (consumed by EP-12)

This package does **not** own the Adaptive Card renderer. The contract
freezes the field names `cite_sources` reads from `RagHit[]`:

- `chunkId` — stable identity; key for de-dupe across multi-tool turns.
- `sourceId` — the corpus row id; FAQ Agent resolves to display title/URL.
- `content` — the chunk excerpt; rendered as the expandable body.
- `citation.span` — non-null: the FAQ card *may* highlight the slice;
  null: the full chunk is rendered as the citation excerpt.

`rrfScore`, `vectorRank`, `vectorSimilarity` are debug/telemetry — not
rendered.

## Data flow

### Ingest

```
ingest(sourceId, content, opts)
  │
  ├─ tenantId ← tenantContext.getTenantId()                       (ALS read)
  ├─ chunks   ← chunkText(content, {                              (pure, sync)
  │              maxTokens: opts.maxTokens ?? 512,
  │              overlapTokens: opts.overlapTokens ?? 64,
  │              model: 'text-embedding-3-small',
  │             })                                                → Chunk[]
  ├─ hashed   ← chunks.map(c => ({ ...c,
  │              contentHash: sha256hex(c.content) }))            (node:crypto, inline)
  ├─ existing ← findExistingHashes(sql, sourceId,                 (1 round-trip)
  │              hashed.map(h => h.contentHash))
  ├─ toEmbed  ← hashed.filter(h => !existing.has(h.contentHash))
  │
  ├─ log 'ingest:dedup-result' { total, skipped, toEmbed }        ← load-bearing
  │
  ├─ if toEmbed.length === 0 → log 'ingest:all-deduped'; return
  │
  ├─ { embeddings: vecs } ← embeddings.embed(                     (OpenAI call,
  │     toEmbed.map(c => c.content),                                with abort)
  │     { signal: opts.signal })
  │
  └─ insertChunks(sql, toEmbed.map((c, i) => ({                   (ON CONFLICT
       tenantId, sourceId,                                          DO NOTHING
       content: c.content,                                          backstops races)
       contentHash: c.contentHash,
       tokenCount: c.tokenCount,
       span: { startChar: c.startChar, endChar: c.endChar },
       embedding: vecs[i],
     })))
```

Invariants:

- **Hashing inline, not factored.** `sha256hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex')` at file scope in `ingest.ts`. Single call site. Carried from the superseded dedup spec.
- **Dedup pre-check before embed.** One round-trip independent of chunk count. The OpenAI call is the dominant cost; the entire reason this layer exists is to skip known hashes.
- **`span` flows `chunkText` → `insertChunks.span`.** `Chunk.startChar` / `Chunk.endChar` are exact offsets into the original `content`. No transformation.
- **Abort wiring.** `opts.signal` consulted from `embeddings.embed` onward. Chunking + hashing + dedup query are sync or sub-second. Signal threads into the OpenAI fetch via `@seta/agent-embeddings`. If the caller aborts between pre-check and embed, abort surfaces at the next async boundary — acceptable.
- **Tenant validation.** Already enforced by `insertChunks` (rejects rows whose `tenantId` mismatches ALS). Rag does not double-check.
- **Empty content short-circuit.** `chunkText` returns `[]`; dedup query is skipped (hashes array is empty); no embed call; no insert. `ingest:done` with `embedded: 0`.

### Retrieve (P1 — vector-only)

```
retrieve(query, opts)
  │
  ├─ k        ← opts.k       ?? 8
  ├─ minSim   ← opts.minSim  ?? 0.3
  ├─ rrfK     ← opts.rrfK    ?? 60
  │
  ├─ { embeddings: [vec] } ← embeddings.embed([query],            (single-item batch)
  │                            { signal: opts.signal })
  │
  ├─ hits ← searchChunks(sql, vec, { k, minSim })                 (returns
  │                                                                 { id, sourceId,
  │                                                                   content, span,
  │                                                                   similarity })
  │
  ├─ ranked ← hits.map((h, i) => ({ id: h.id, rank: i + 1 }))     (vector leg's
  │                                                                rank list)
  ├─ fused  ← fuseByRRF([ranked.map(r => ({ id: r.id }))], rrfK)  (single-leg passthrough;
  │                                                                same shape as P2 hybrid)
  │
  └─ return fused.map(f => {
       const h = hitsById.get(f.id)!
       return {
         chunkId:  h.id,
         sourceId: h.sourceId,
         content:  h.content,
         rrfScore: f.rrfScore,
         vectorRank: f.ranks[0],          // legIndex 0 = vector
         ftsRank: undefined,              // reserved for P2
         vectorSimilarity: h.similarity,
         citation: { sourceId: h.sourceId, span: h.span },
       }
     })
```

Invariants:

- **`fuseByRRF` always runs.** Single-leg passthrough mathematically equals identity-in-order but yields the same `rrfScore`/`ranks` shape as the future hybrid case. Avoids two code paths.
- **`embed([query])`.** Same client as ingest. Single-input batch, returns `1×1536`. `EmbeddingsClient.embed` already short-circuits empty arrays; single-item is a normal batch.
- **`minSim` filtering happens at the vector layer.** Rag trusts inputs are already filtered to "candidates worth considering". Matches `searchChunks` behaviour.
- **Query token bound.** OpenAI `text-embedding-3-small` accepts ≤ 8192 tokens. Out-of-bound queries surface as `LlmError` from embeddings; rag passes through unchanged.
- **No retrieve caching.** Tenant-leak risk. Kernel prompt-cache handles answer-level caching; rag hits are computed per call.

## Error handling

Library code. No catch-and-translate, no wrapping. Errors propagate from
downstream packages unchanged; rag logs at boundaries and rethrows.

| Origin | Error type | Rag behaviour |
|---|---|---|
| `chunkText` (invalid options) | `ChunkingError` | Pass through; log `ingest:failed` |
| `embeddings.embed` | `LlmError` (terminal) or abort | Pass through; log `ingest:failed` / `retrieve:failed` |
| `findExistingHashes` / `insertChunks` | `VectorQueryFailedError` / `VectorInsertFailedError` (both extend `DomainError`) | Pass through; log boundary failure |
| `searchChunks` | `VectorQueryFailedError` | Pass through; log `retrieve:failed` |
| Aborted `AbortSignal` | `DOMException('AbortError')` or `AbortError` | Pass through; log at `info`, not `error` — abort is normal control flow |
| Tenant-context missing | `tenantContext.getTenantId()` throws | Pass through; this is a configuration bug, not a runtime condition |

**No new error classes in `@seta/agent-rag`.** Callers (FAQ Agent tool
wrapper, route handlers) decide whether to map to RFC 7807 or Adaptive
Card decline messages.

**Never swallow.** Every `catch` logs and rethrows. No empty catches, no
`.catch(() => {})`.

## Logging contract

One child logger at module scope. Structured fields only. Never logs
chunk content (PII risk on FAQ corpora).

```ts
import { logger } from '@seta/observability'
const log = logger.child({ service: 'agent-rag' })
```

| Event | Level | Fields | Purpose |
|---|---|---|---|
| `ingest:start` | info | `sourceId, tenantId, contentLength` | Boundary entry |
| `ingest:chunked` | debug | `sourceId, tenantId, chunkCount` | Diagnostic |
| `ingest:dedup-result` | info | `sourceId, tenantId, total, skipped, toEmbed` | **Cost metric — load-bearing** |
| `ingest:all-deduped` | info | `sourceId, tenantId` | Explicit no-op branch |
| `ingest:embedding` | debug | `sourceId, tenantId, batchSize` | Diagnostic |
| `ingest:done` | info | `sourceId, tenantId, embedded, skipped` | Boundary exit |
| `ingest:failed` | error | `err, sourceId, tenantId` | Boundary failure |
| `retrieve:start` | info | `tenantId, queryLength, k, minSim` | Boundary entry; `queryLength`, not query text |
| `retrieve:embedded` | debug | `tenantId` | Diagnostic — query embedding produced |
| `retrieve:searched` | debug | `tenantId, k, returned` | Diagnostic — vector-leg results |
| `retrieve:done` | info | `tenantId, k, returned` | Boundary exit |
| `retrieve:aborted` | info | `tenantId` | Caller aborted; not an error |
| `retrieve:failed` | error | `err, tenantId` | Boundary failure |

**Never log:** chunk `content`, raw query text, embedding vectors, hash
preimages. `sourceId` (UUID) and `tenantId` (UUID) are fine.

Auto-redaction in `@seta/observability` already strips `client_secret`,
`access_token`, etc. — no new fields needed.

## OpenTelemetry spans

Two spans, both `internal`:

| Span | Attributes | Wraps |
|---|---|---|
| `agent-rag.ingest` | `agent_rag.source_id`, `agent_rag.tenant_id`, `agent_rag.chunks.total`, `agent_rag.chunks.skipped`, `agent_rag.chunks.embedded` | `ingest` body |
| `agent-rag.retrieve` | `agent_rag.tenant_id`, `agent_rag.k`, `agent_rag.min_sim`, `agent_rag.returned` | `retrieve` body |

Downstream calls (`embed`, `searchChunks`, `findExistingHashes`,
`insertChunks`) emit their own spans; rag's spans are parents. No span
for `fuseByRRF` — sub-microsecond and noisy.

Span status: `OK` on success; `ERROR` with `err.message` on rethrow;
`OK` with `event: 'aborted'` on `AbortError` (matches kernel pattern).

## Counter / histogram metrics

Out of scope for P1. The `ingest:dedup-result` log line is the
cost-saving signal; an audit aggregator can roll it up later. Adding
counters here would create a second source of truth for the same data —
defer until the audit consumer is named.

## Testing

Three tiers, all colocated with the package. Recordings checked into git
per CLAUDE.md footgun "`__recordings__/**` must be checked into git".

### Unit tests — `src/**/*.test.ts`

| File | Asserts |
|---|---|
| `rrf.test.ts` | Pure function. Single-leg passthrough preserves order; two-leg fusion sums scores; tied-rank items get equal `rrfScore`; deterministic (same input → byte-identical output); `k` parameter effect (smaller k → larger spread); empty rankings → empty output; one empty leg → other leg's order preserved. |
| `factory.test.ts` | `createAgentRag` returns an object with callable `ingest` / `retrieve`. Pass a fake `EmbeddingsClient` and an unused `DbSql`; assert shape. No I/O exercised. |
| `testkit.test.ts` | `createFakeAgentRag({ hits })` returns those hits regardless of query; `{ retrieve: fn }` takes precedence; `ingest` no-ops and records calls on `__calls.ingest`. |
| `ingest.test.ts` | Inline `sha256hex` produces canonical 64-char hex digest for fixture inputs. |

No DB, no network. Vitest defaults.

### Property tests — `src/rrf.property.test.ts`

`fast-check`, ≥ 200 runs (matches `agent-chunking` precedent):

- Every output `rrfScore > 0`.
- Output is sorted by `rrfScore` descending.
- Output `id`s = union of `id`s across legs.
- Adding the same constant to every rank in every leg rescales scores
  monotonically (no rank inversion).

### Integration tests — `tests/integration/**`

Real Postgres + pgvector + recorded OpenAI embeddings via
`setupLLMRecording({ name })` from `@seta/agent-core/testkit`.
Recordings live in `tests/integration/__recordings__/` and **must be
checked into git**.

Test fixtures use fresh `(tenantId, sourceId)` UUIDs per test; the
harness follows whatever truncate / rollback pattern
`@seta/agent-vector`'s integration suite establishes.

| # | Test | Asserts |
|---|---|---|
| 1 | **Fresh ingest** | `ingest('s1', "...")` → N chunks, embed called once with N inputs, N rows inserted with non-null `span`. Recording captures one OpenAI request. |
| 2 | **Re-ingest same content** | Second call: zero OpenAI requests (strict-replay; unexpected request fails); no new rows; `ingest:dedup-result` shows `skipped == N, toEmbed == 0`. |
| 3 | **Partial overlap ingest** | First `["A","B","C"]`. Second `["A","B","D"]` same source. Embed call carries only `["D"]`. Three rows total. |
| 4 | **Cross-source same content** | Same content under `source_1` and `source_2` (same tenant). Two embed calls, two rows — different `sourceId` ⇒ not a duplicate. |
| 5 | **Abort during embedding** | `AbortSignal` aborts between dedup pre-check and embed. `ingest` throws abort error; zero rows inserted. |
| 6 | **Vector-error propagation** | Force `findExistingHashes` to throw `VectorQueryFailedError` (e.g., pool closed). `ingest` rethrows same error; `ingest:failed` log present. |
| 7 | **Empty content ingest** | `ingest('s1', '')` → `chunkText` returns `[]`; no dedup query, no embed, no insert. `ingest:done` with `embedded: 0`. |
| 8 | **Retrieve end-to-end** | Ingest fixture corpus (3 docs, known answers). `retrieve('what is X?')` returns `RagHit[]` with non-empty `content`, populated `citation.span`, `vectorRank: 1` on expected top hit. |
| 9 | **Retrieve cross-tenant isolation** | Ingest under tenant A; `retrieve` under tenant B returns `[]`. RLS asserted. |
| 10 | **Retrieve recall floor** | Fixture corpus contains a chunk whose embedding is closest to a known query. Assert that chunk's `chunkId` appears in top-`k`. |
| 11 | **Retrieve rank stability** | Run `retrieve` twice on identical query + corpus. Assert byte-identical `RagHit[]` (deterministic under fixed embeddings via recording replay; pgvector HNSW + same `ef_search` is deterministic). |
| 12 | **Retrieve abort** | Pre-cancel `AbortSignal`. `retrieve` throws abort error; `retrieve:aborted` log line present (not `retrieve:failed`). |
| 13 | **Retrieve below-minSim filter** | Corpus has only low-similarity matches. With default `minSim: 0.3`, `retrieve` returns `[]`. |

### Test budget

| Tier | File count | Wall time |
|---|---|---|
| Unit | 4 files, ~30 tests | < 1 s |
| Property (`rrf`) | 1 file, ~5 properties × 200 runs | < 2 s |
| Integration | 2 files, ~13 tests | ~10–15 s (pg + recorded embeddings) |

No live OpenAI in CI. No mocking of internal `@seta/*` packages. No
mocking of Postgres in integration. Per CLAUDE.md.

### What is **not** tested in this package

- **FAQ Agent end-to-end** (Teams → FAQ → retrieve → cite) — lives in
  `modules/products/faq/tests/integration/`.
- **BK-7 citation-rate eval** — WBS 12.4, owned by AG-S, separate eval doc.
- **HNSW correctness / `iterative_scan`** — owned by `@seta/agent-vector`
  integration suite (gate test WBS 6.4).
- **Tokenizer parity** — owned by `@seta/agent-chunking`.

## Patterns to follow (SCOPE.md additions)

1. **Pure composition — no schema of its own.** Every persistent surface
   is owned upstream.
2. **Factory injection, not module-level singletons.**
   `createAgentRag({ sql, embeddings })` is the only construction entry
   point. No imported global `sql` or `embeddings`.
3. **Dedup pre-check before embed.** Inline `sha256hex` at the call
   site; one round-trip via `findExistingHashes`. `ingest:dedup-result`
   log line carries the cost-saving counts.
4. **RRF runs even with one leg.** Single-leg passthrough keeps the
   field shape uniform with future hybrid retrieve.
5. **Abort propagation through both flows.** `signal` threads into
   `embeddings.embed`. Sync stages are not interruptible.
6. **Tenant context is implicit.** `tenantContext.getTenantId()`
   resolved inside each downstream call. Never a parameter.
7. **Idempotent ingest.** Re-ingest of identical `(sourceId, content)`
   produces zero embeds and zero new rows.
8. **Citation spans flow `chunkText` → `insertChunks.span` →
   `searchChunks.span` → `RagHit.citation.span`.** One value, one path;
   no re-derivation at retrieve time.

## Patterns to avoid (SCOPE.md additions)

1. **Do NOT add the FTS leg in P1.** Vector-only retrieve; `fuseByRRF`
   keeps the shape ready for P2.
2. **Do NOT add Cohere `rerank-v3`.** Explicit P2 per setup.md §6.
3. **Do NOT call `openai` directly.** Embedding goes through
   `EmbeddingsClient`.
4. **Do NOT mock internal `@seta/*` packages.** Integration tests use
   pgvector + recorded OpenAI fixtures.
5. **Do NOT cache retrieve results in-process.** Tenant-leak risk.
6. **Do NOT log chunk content, query text, or embedding vectors.**
7. **Do NOT introduce new error classes.** Pass `DomainError` /
   `LlmError` through unchanged.
8. **Do NOT add answer synthesis or LLM completion calls.** Library
   returns hits; generation lives in the FAQ Agent.

## File layout

```
platform/agent/rag/
├── SCOPE.md                        (already exists; updated by this work)
├── package.json                    (created via `pnpm new:package`)
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                    main entrypoint
│   ├── types.ts                    type-only; re-exported from `/types` subpath
│   ├── factory.ts                  createAgentRag({ sql, embeddings })
│   ├── ingest.ts                   ingest closure (chunk → hash → dedup → embed → insert);
│   │                               inline sha256hex at file scope
│   ├── retrieve.ts                 retrieve closure
│   ├── rrf.ts                      fuseByRRF (pure)
│   ├── testkit.ts                  createFakeAgentRag
│   ├── rrf.test.ts
│   ├── rrf.property.test.ts
│   ├── factory.test.ts
│   ├── testkit.test.ts
│   └── ingest.test.ts              (unit; hash assertions live here)
├── tests/integration/
│   ├── ingest.test.ts              cases 1–7
│   ├── retrieve.test.ts            cases 8–13
│   └── __recordings__/             checked into git
```

`package.json` exports map (set via `pnpm pkg`):

```json
{
  "exports": {
    ".":         { "types": "./dist/index.d.ts",   "import": "./dist/index.js" },
    "./types":   { "types": "./dist/types.d.ts",   "import": "./dist/types.js" },
    "./testkit": { "types": "./dist/testkit.d.ts", "import": "./dist/testkit.js" }
  }
}
```

## Implementation sequence (two PRs)

### PR 1 — Vector-side companion (`agent-vector-span-citation`)

1. Companion spec at
   [`docs/superpowers/specs/2026-05-18-agent-vector-span-citation-design.md`](./2026-05-18-agent-vector-span-citation-design.md).
2. Add nullable `span jsonb` column to `agent_vector.chunks` via
   `drizzle-kit generate`.
3. Extend `searchChunks` to `SELECT source_id, span` and return them on
   `SearchHit` (new fields: `sourceId`, `span`).
4. Add `span` to `NewChunk`; pass it through `insertChunks`.
5. Update vector-package integration tests for the new fields.

### PR 2 — `@seta/agent-rag` package

1. `pnpm new:package @seta/agent-rag` under `platform/agent/rag/`.
2. Add deps via CLI: `@seta/agent-chunking`, `@seta/agent-embeddings`,
   `@seta/agent-vector`, `@seta/db`, `@seta/tenancy`, `@seta/observability`,
   `zod`.
3. `src/types.ts` + `src/index.ts` (type surface + factory re-export).
4. `src/rrf.ts` + `rrf.test.ts` + `rrf.property.test.ts`.
5. `src/testkit.ts` + `testkit.test.ts`.
6. `src/ingest.ts` (carried from superseded spec, swapped to
   `EmbeddingsClient.embed`).
7. `src/retrieve.ts`.
8. `src/factory.ts` + `factory.test.ts`.
9. `tests/integration/{ingest,retrieve}.test.ts` + `__recordings__/`.
10. Update `platform/agent/rag/SCOPE.md` — supersede note pointing at
    this spec; FTS-deferred bullet; cross-link the vector companion spec.
11. Update
    `docs/superpowers/specs/2026-05-15-agent-rag-dedup-ingest-design.md` —
    add `Superseded by ...` header.
12. Wire into `apps/api/src/main.ts` (build the singleton, bind to FAQ
    tool registry).

Per CLAUDE.md "one change, one PR". PR 1 ships and migrates before PR 2
starts consuming the new column.

## Alternatives considered

- **Hybrid vector + FTS retrieve in P1.** Rejected — no FAQ-corpus table
  exists to host a tsvector column; the SCOPE forbids adding FTS to
  `agent_vector.chunks`. Adding FTS to a new corpus-owner table would
  expand EP-07 scope and couple it to EP-08 corpus definitions before
  they exist. Deferred to P2.
- **Drop citation spans in P1.** Rejected — `RagHit.citation.span` is
  part of the public contract; weakening it now creates immediate
  technical debt. The `span jsonb` column is one nullable column in a
  schema already being migrated for dedup.
- **Side-table for spans (`agent_rag.chunk_spans`).** Rejected — splits
  chunk metadata across two schemas and adds a join. The `span jsonb`
  column on `chunks` is the simpler home.
- **Free functions with per-call `{ sql, embeddings }` injection.**
  Rejected — verbose at every call site. Factory pattern matches
  `createOpenAIEmbeddings`, the kernel adapters, and connector clients.
- **Module-level singleton `sql` and `embeddings` (old `embed()`-style
  API).** Rejected — hides DI, breaks tests, doesn't match sibling
  patterns.
- **Factor `sha256hex` into `src/hash.ts`.** Rejected per the
  superseded dedup spec: single call site, no second consumer yet.
  Premature abstraction. Re-evaluate if/when retrieve or a corpus
  loader needs the same hash.
- **`fuseByRRF` skipped for single-leg P1.** Rejected — running it
  always keeps the output shape uniform with P2 hybrid and avoids two
  code paths.
- **New error classes (`RagIngestError`, `RagRetrieveError`).**
  Rejected — adds wrap layers without adding information. Downstream
  errors already carry enough context.
- **In-process LRU cache on retrieve hits.** Rejected — tenant-leak
  risk per CLAUDE.md "Stateless request path" and
  `@seta/agent-vector/SCOPE.md` "Do NOT cache search results in-process".

## Open questions (deferred with reasons)

1. **FTS leg corpus provenance** — deferred to P2 along with hybrid
   retrieve. SCOPE.md OQ #1.
2. **Hybrid weight asymmetry / learned weights** — defer until telemetry
   exists. SCOPE.md OQ #4.
3. **Token-budget for query embedding** — caller's job; `LlmError`
   surfaces if exceeded. SCOPE.md OQ #5.
4. **`OWNER_ORDER` placement** — no entry; package owns no schema.
   SCOPE.md OQ #6.
5. **`hash.ts` extraction** — re-evaluate when a second consumer needs
   sha256hex.

## Cross-references

- **Binding contract:** [`platform/agent/rag/SCOPE.md`](../../../platform/agent/rag/SCOPE.md)
- **Superseded:** [`2026-05-15-agent-rag-dedup-ingest-design.md`](./2026-05-15-agent-rag-dedup-ingest-design.md) — ingest path; embeddings API is stale (free `embed()` vs factory `createOpenAIEmbeddings`).
- **Companion (must land first):** [`2026-05-18-agent-vector-span-citation-design.md`](./2026-05-18-agent-vector-span-citation-design.md) (drafted alongside this spec)
- **Upstream packages:**
  - [`platform/agent/chunking/SCOPE.md`](../../../platform/agent/chunking/SCOPE.md) — `chunkText`, `Chunk { content, tokenCount, startChar, endChar }`
  - [`platform/agent/embeddings/SCOPE.md`](../../../platform/agent/embeddings/SCOPE.md) — `createOpenAIEmbeddings`, `EmbeddingsClient`
  - [`platform/agent/vector/SCOPE.md`](../../../platform/agent/vector/SCOPE.md) — `searchChunks`, `insertChunks`, `findExistingHashes`
- **Downstream consumers:**
  - `modules/products/faq` (EP-12) — `search_knowledge_base` + `cite_sources` tools
  - `apps/api/scripts/rag-ingest.ts` (EP-08.3) — corpus ingestion driver
- **Project Plan:** [`docs/plans/Project Plan.md`](../../plans/Project%20Plan.md) — EP-07 (7.1–7.3, D10–D12)
- **Setup spec:** [`docs/setup.md`](../../setup.md) §6 (RAG primitives; RRF rationale at line 442)
- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md`](../../explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md) — testkit recording layer
- **AG-S unblock plan:** [`docs/plans/Project Plan.md`](../../plans/Project%20Plan.md) §5.2.6 — type-only contract, testkit fake, D12 09:30 RAG → FAQ handoff
