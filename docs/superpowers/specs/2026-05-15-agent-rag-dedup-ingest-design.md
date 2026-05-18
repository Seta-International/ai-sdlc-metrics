# Design — `@seta/agent-rag.ingest` dedup-aware ingest flow (P1)

> **Superseded by [`2026-05-18-agent-rag-design.md`](./2026-05-18-agent-rag-design.md).** The dedup pre-check decisions and inline `sha256hex` rationale documented here are carried forward verbatim; the only material change is that ingest consumes `EmbeddingsClient.embed` (factory pattern) instead of the original free `embed()` function shown below. Read the new spec for the implemented surface.
>
> **Status:** Spec for the composition layer's use of the content-hash dedup
> introduced in
> [`2026-05-15-agent-vector-dedup-design.md`](./2026-05-15-agent-vector-dedup-design.md).
> This spec assumes that companion spec lands first — `findExistingHashes` and
> the `NewChunk.contentHash` field must exist on `@seta/agent-vector` before
> `agent-rag.ingest` can use them.

## Why

`@seta/agent-rag.ingest(sourceId, content)` is the only place where
`chunkText`, `embed`, and `insertChunks` are composed. The OpenAI embedding
call is the single most expensive step in the RAG pipeline (network
round-trip + per-token pricing). Today the call happens unconditionally for
every chunk produced by chunking.

With dedup landed in `@seta/agent-vector`, `ingest` can:

1. Hash chunks locally (cheap, sync — `node:crypto`).
2. Ask the vector store which hashes are already stored for this
   `(tenant, source)`.
3. Send only the **new** chunks to OpenAI.
4. Insert the resulting rows; the unique index in the vector store backstops
   races.

The expected savings are observable: a re-ingest of the same FAQ document
should result in zero OpenAI calls, zero new rows, and a clearly-logged
`dedup-result` line showing the skip count.

## Scope

This spec covers:

- The new `ingest` flow (hash → filter → embed → insert).
- A small inline `sha256Hex` helper in `agent-rag` (no separate utility
  module — explicit user preference from the brainstorming session).
- Logging contract via `@seta/observability`, including the
  `ingest:dedup-result` line that exposes the cost-saving metric.
- Error handling: rethrow `DomainError` / `LlmError` from downstream packages
  unchanged; log at the boundary; never swallow.
- SCOPE.md updates for `@seta/agent-rag`.

Out of scope:

- The vector store's schema, columns, unique index — see the companion spec.
- The `retrieve` path — dedup is a write-side concern; retrieval is unchanged.
- Cost-aggregation queries / billing rollups — the log line provides the
  signal; downstream audit consumption is a separate concern.

## Updated `ingest` flow

```ts
// platform/agent/rag/src/ingest.ts
import { createHash } from 'node:crypto'
import { chunkText } from '@seta/agent-chunking'
import { embed } from '@seta/agent-embeddings'
import { findExistingHashes, insertChunks } from '@seta/agent-vector'
import { tenantContext } from '@seta/tenant'
import { logger } from '@seta/observability'

const log = logger.child({ service: 'agent-rag' })

export interface IngestOptions {
  maxTokens?: number
  overlapTokens?: number
  signal?: AbortSignal
}

export async function ingest(
  sourceId: string,
  content: string,
  opts: IngestOptions = {},
): Promise<void> {
  const tenantId = tenantContext.getTenantId()
  log.info(
    { sourceId, tenantId, contentLength: content.length },
    'ingest:start',
  )

  try {
    // 1. Chunk — pure, no I/O.
    const chunks = chunkText(content, {
      maxTokens: opts.maxTokens ?? 512,
      overlapTokens: opts.overlapTokens ?? 64,
      model: 'text-embedding-3-small',
    })
    log.debug({ sourceId, tenantId, chunkCount: chunks.length }, 'ingest:chunked')

    // 2. Hash — cheap, local, sha256 hex (inline, no helper module per spec).
    const hashed = chunks.map((c) => ({
      ...c,
      contentHash: createHash('sha256').update(c.content, 'utf8').digest('hex'),
    }))

    // 3. Dedup pre-check — ask the vector store which hashes already exist.
    const existing = await findExistingHashes(
      sourceId,
      hashed.map((h) => h.contentHash),
    )

    const toEmbed = hashed.filter((h) => !existing.has(h.contentHash))

    // 4. Cost-saving metric — load-bearing observability line.
    log.info(
      {
        sourceId,
        tenantId,
        total: chunks.length,
        skipped: existing.size,
        toEmbed: toEmbed.length,
      },
      'ingest:dedup-result',
    )

    // 5. All-deduped short-circuit — no OpenAI call, no insert.
    if (toEmbed.length === 0) {
      log.info({ sourceId, tenantId }, 'ingest:all-deduped')
      log.info({ sourceId, tenantId, embedded: 0 }, 'ingest:done')
      return
    }

    // 6. Embed only the new chunks. Abort signal propagates to OpenAI fetch.
    log.debug({ sourceId, tenantId, batchSize: toEmbed.length }, 'ingest:embedding')
    const vectors = await embed(
      toEmbed.map((c) => c.content),
      { signal: opts.signal },
    )

    // 7. Insert — ON CONFLICT DO NOTHING in agent-vector backstops races.
    await insertChunks(
      toEmbed.map((c, i) => ({
        sourceId,
        content: c.content,
        contentHash: c.contentHash,
        tokenCount: c.tokenCount,
        embedding: vectors[i],
      })),
    )

    log.info(
      { sourceId, tenantId, embedded: toEmbed.length, skipped: existing.size },
      'ingest:done',
    )
  } catch (err) {
    log.error({ err, sourceId, tenantId }, 'ingest:failed')
    throw err
  }
}
```

**Notes on the implementation:**

- **`sha256Hex` is inlined**, not factored into a helper module. Per
  brainstorming: the call site is short and the abstraction would add a file
  without adding clarity. If a second consumer in `agent-rag` needs the same
  hash later, factor it then.
- **`createHash` is `import`ed from `node:crypto`**, the Node built-in. No new
  external dependency. Same library Node's own `crypto` exports; works
  identically in tests.
- **The dedup pre-check is one round-trip**, regardless of chunk count, because
  `findExistingHashes` takes the full hash array and returns the subset that
  exists. Don't loop per-chunk.
- **Abort propagation** only matters from step 6 onward — chunking and hashing
  are sync. The signal is plumbed into `embed`, which threads it into the
  OpenAI fetch (per `@seta/agent-embeddings/SCOPE.md`). If the caller aborts
  after the pre-check but before embed, the abort fires on the next async
  boundary — acceptable.
- **`ingest:dedup-result` is the load-bearing log line**: it's the only signal
  that proves the feature is working in production. The structured fields
  (`total`, `skipped`, `toEmbed`) are pulled by the audit layer for cost
  reporting.

## Logging contract

| Event | Level | Fields | Purpose |
|---|---|---|---|
| `ingest:start` | info | `sourceId, tenantId, contentLength` | Boundary entry |
| `ingest:chunked` | debug | `sourceId, tenantId, chunkCount` | Diagnostic |
| `ingest:dedup-result` | info | `sourceId, tenantId, total, skipped, toEmbed` | **Cost metric — load-bearing** |
| `ingest:all-deduped` | info | `sourceId, tenantId` | Explicit no-op branch |
| `ingest:embedding` | debug | `sourceId, tenantId, batchSize` | Diagnostic |
| `ingest:done` | info | `sourceId, tenantId, embedded, skipped` | Boundary exit |
| `ingest:failed` | error | `err, sourceId, tenantId` | Boundary failure |

**Never log chunk content.** Same PII reasoning as the vector layer. Counts
and ids only.

**Error semantics:**

- `agent-vector` throws `DomainError` (`VECTOR_QUERY_FAILED`,
  `VECTOR_INSERT_FAILED`) — passed through unchanged.
- `agent-embeddings` throws `LlmError` subclass — passed through unchanged.
- `chunkText` throws on invalid options at the call boundary — passed through.
- `ingest` itself never wraps these in a new error type. It logs the failure
  at the boundary and rethrows. The caller (the FAQ Agent or a route handler)
  decides whether to map to HTTP / Adaptive Card.

## SCOPE.md updates

`platform/agent/rag/SCOPE.md` is currently a directory placeholder; the
package isn't created yet (per
[`platform/agent/rag/SCOPE.md`](../../../platform/agent/rag/SCOPE.md) §
"Current state"). When the package is created, the SCOPE additions are:

1. **Imports → Allowed internal** — explicit list:
   - `@seta/agent-chunking`
   - `@seta/agent-embeddings`
   - `@seta/agent-vector`
   - `@seta/tenant` (read tenant id from ALS)
   - `@seta/observability` (logger)
2. **Imports → External** — `node:crypto` (built-in; no pin required).
3. **Patterns to follow** — new bullet:
   > **Dedup pre-check before embedding.** `ingest` hashes chunks locally
   > (sha256 hex via `node:crypto`), calls
   > `agent-vector.findExistingHashes(sourceId, hashes)`, and embeds only the
   > subset that is not yet stored. The `ingest:dedup-result` log line
   > carries the cost-saving counts.
4. **Patterns to follow** — new bullet:
   > **Hash is inline, not factored.** `createHash('sha256').update(c.content,
   > 'utf8').digest('hex')` lives at the call site. No helper module until a
   > second consumer needs the same hash.
5. **Patterns to avoid** — new bullet:
   > **Do NOT skip the dedup pre-check, even for "small" ingests.** Embedding
   > cost is the single largest per-call cost in the pipeline; the pre-check
   > is one round-trip independent of chunk count.

## Testing

Integration tests in `platform/agent/rag/tests/integration/`, using:

- Real Postgres (per CLAUDE.md "Mocks: never mock Postgres in integration
  tests").
- `setupLLMRecording({ name })` from `@seta/agent-core/testkit` (msw
  intercepts `api.openai.com/v1/embeddings`; recordings checked into git per
  CLAUDE.md footgun discussion).

| # | Test | Asserts |
|---|---|---|
| 1 | **Fresh ingest** | `ingest('s1', "...")` → produces N chunks, embed called once with N inputs, N rows inserted. Recording captures one OpenAI request. |
| 2 | **Re-ingest same content** | Repeat test 1. Second call: no OpenAI request in the recording (recording is in strict-replay mode; an unexpected request fails the test). No new rows. `ingest:dedup-result` log line shows `skipped == N`, `toEmbed == 0`. |
| 3 | **Partial overlap** | First ingest of `["A","B","C"]`. Second ingest of `["A","B","D"]` for the same source. Embed call carries only `["D"]`. Three rows total. |
| 4 | **Cross-source same content** | Ingest content X for `source_1`, then for `source_2` (same tenant). Embed called twice (β semantics — different sources are not duplicates). Two rows. |
| 5 | **Cross-tenant isolation** | Same content under tenant A and tenant B. Two embed calls, two rows. Tenant A's `findExistingHashes` does not see B's row (RLS). |
| 6 | **All-deduped short-circuit** | Ingest content, then re-ingest. Assert: `embed` is never called the second time (msw recording shows no request); `ingest:all-deduped` log present. |
| 7 | **Abort during embedding** | Pass an `AbortSignal` that aborts after the dedup pre-check but before embed. Assert: `ingest` throws an abort error; no rows inserted. |
| 8 | **Failure propagation** | Force `findExistingHashes` to throw `DomainError('VECTOR_QUERY_FAILED')`. Assert: `ingest` rethrows the same error; `ingest:failed` log present. |
| 9 | **Empty content** | `ingest('s1', '')` → `chunkText` returns empty array, dedup pre-check short-circuits, no embed call, no insert. `ingest:done` with `embedded: 0`. |

**Test data hygiene:** each test uses fresh `(tenantId, sourceId)` UUIDs to
avoid interference. The integration test harness wraps each test in a
transaction that rolls back, or truncates `agent_vector.chunks` between tests
— follow whatever pattern `@seta/agent-vector`'s own integration tests
establish.

## Alternatives considered

- **Factor `sha256Hex` into `platform/agent/rag/src/hash.ts`.** Rejected per
  user preference (brainstorming session): single call site, no second
  consumer yet. Premature abstraction.
- **Hash inside `findExistingHashes`** (have `agent-vector` accept chunk
  contents and hash them server-side). Rejected: forces `agent-vector` to
  re-hash for the eventual `insertChunks`; doubles the work. Caller hashes
  once and passes the result.
- **Skip the pre-check, rely on `ON CONFLICT DO NOTHING` to dedup at insert
  time.** Rejected: dedup at insert time still incurs the OpenAI cost. The
  whole point is to skip the paid API call.
- **Cache `findExistingHashes` results in-process.** Rejected (per CLAUDE.md
  "Stateless request path", `@seta/agent-vector/SCOPE.md` "Do NOT cache search
  results in-process"). Cross-request tenant leak risk and small ROI — the
  query is index-bound and fast.
- **Batch the `ingest:dedup-result` log line into a single audit row.**
  Deferred: the log line is the contract today; an audit aggregator can
  consume it later without changing the producer.

## Cross-references

- Companion spec (schema + API): [`2026-05-15-agent-vector-dedup-design.md`](./2026-05-15-agent-vector-dedup-design.md)
- Base scope (placeholder, to be created): [`platform/agent/rag/SCOPE.md`](../../../platform/agent/rag/SCOPE.md)
- Upstream packages: [`platform/agent/chunking/SCOPE.md`](../../../platform/agent/chunking/SCOPE.md), [`platform/agent/embeddings/SCOPE.md`](../../../platform/agent/embeddings/SCOPE.md)
- Downstream vector store: [`platform/agent/vector/SCOPE.md`](../../../platform/agent/vector/SCOPE.md)
- Logger source: [`platform/observability/SCOPE.md`](../../../platform/observability/SCOPE.md)
- LLM recording testkit: [`docs/explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md`](../../explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md)
- Mastra reference (compared, not adopted): `D:/Work/mastra/packages/rag/src/document/schema/node.ts:110` (TextNode hash for node identity, not dedup)
