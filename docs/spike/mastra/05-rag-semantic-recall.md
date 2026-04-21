# Key 5 — RAG / Semantic Recall / Vector Memory

**Mastra area:** `packages/rag/`, `packages/memory/src/index.ts`, `packages/memory/src/processors/observational-memory/`, `packages/core/src/vector/`
**Our design area:** `agent-runtime.md` §5 (Memory Model — L2 deferred), §16 (Deferred work), §2 (Tenet #1 — gateway is the security boundary)
**Investigation date:** 2026-04-21
**Framing:** Our spec **defers** embeddings to v1.5. This finding pre-stages that decision — **what the future spike should investigate**, grounded in prior art — not "adopt mastra's RAG."

---

## 1. How mastra does it

Mastra ships **two separate embedding-based memory systems**, plus a general-purpose RAG toolkit. All three live side-by-side and can be mixed inside one `Memory` instance.

### 1a. Semantic recall — embed every message, retrieve on every turn

The default pattern. `packages/memory/src/index.ts:909-1050` `saveMessages()`:

1. On every `saveMessages`, extract text from each message's parts (`message.content.content` or concat of `text` parts).
2. Chunk it with `chunkText(text, tokenSize = 4096)` — a naive **word-split by whitespace**, 4096-token chunks, no overlap, no semantic boundaries (`packages/memory/src/index.ts:810-838`).
3. Embed each chunk with the configured `embedder` via `embedMany` (AI SDK v1/v2/v3 branches at `packages/memory/src/index.ts:874-886`).
4. Upsert into a single index named `memory_messages` (or `memory_messages_<dim>` if non-default dimension) with metadata `{ message_id, thread_id, resource_id }` (`packages/core/src/memory/memory.ts:321-327`).
5. On recall (`rememberMessages` at `packages/memory/src/index.ts:355-385`): embed the last user message as `vectorSearchString`, `vector.query({ indexName, queryVector, topK, filter })` where filter is `{ resource_id }` OR `{ thread_id }` depending on scope, then hydrate by joining `vectorResults[i].metadata.message_id` back to the messages table with a `withPreviousMessages` / `withNextMessages` range (default ±2) for context continuity.

**Critical observation:** the index is **shared across all tenants, all resources, all threads**. Isolation is a metadata post-filter, not a partition key. See `getEmbeddingIndexName` at `packages/core/src/memory/memory.ts:321-327`: no tenant, no user, no anything — just dimensions.

```ts
return isDefault
  ? `memory${separator}messages`
  : `memory${separator}messages${separator}${usedDimensions}`
```

The scope toggle at `packages/memory/src/index.ts:327-337`:

```ts
const resourceScope =
  (typeof config?.semanticRecall === 'object' && config?.semanticRecall?.scope !== `thread`) ||
  config.semanticRecall === true

if (resourceScope && !resourceId && config?.semanticRecall && vectorSearchString) {
  throw new Error(
    `Memory error: Resource-scoped semantic recall is enabled but no resourceId was provided. ...`,
  )
}
```

Default is `resource` scope. The guard only catches the missing-`resourceId` case; it does nothing about cross-tenant collision of `resourceId`.

### 1b. Observational memory — a separate, heavier memory layer

`packages/memory/src/processors/observational-memory/` — a 3500-LOC subsystem that runs an **observer LLM** and a **reflector LLM** as background agents:

- **Observer agent** (`observer-agent.ts`, 1460 LOC) watches conversation, summarises every `messageTokens` (default 30k) into durable "observations" stored on `ObservationalMemoryRecord`. Default model: `google/gemini-2.5-flash` at temperature 0.3 (`constants.ts:4-23`).
- **Reflector agent** (`reflector-agent.ts`, 380 LOC) compresses observations into longer-term groups once they exceed `observationTokens` (default 40k).
- **Processor** (`processor.ts`) hooks into `processInputStep` / `processOutputResult` — loads observations, injects them as system messages with a `<observations>` block and `OBSERVATION_CONTEXT_INSTRUCTIONS` (`constants.ts:67-75`) that _instruct the model to personalize_, and ends the turn.
- **Async buffering** — `bufferTokens: 0.2` of threshold triggers fire-and-forget observation so the critical path isn't blocked (`constants.ts:20-22`).
- **Recall tool** — `OBSERVATION_RETRIEVAL_INSTRUCTIONS` (`constants.ts:81-121`) teaches the model to call a `recall` tool with a `startId:endId` cursor to page back to raw messages when it needs exact detail. This is a clever split: observations = compressed gist, recall = exact text on demand.
- Observation groups are also embedded into a **second, separate index** named `memory_observations_<dim>` (`packages/memory/src/index.ts:1608-1632`) with metadata `{ group_id, range, thread_id, resource_id, observed_at, text }` — `searchMessages()` queries this index.
- Gateway escape hatch (`processor.ts:59-61, 112-116`) — if the model is a Mastra-hosted gateway, OM processing is **skipped locally** because the gateway runs it server-side. This doubles as a "who pays for OM tokens" decision: on gateway users, mastra eats them; self-host, you eat them.

What OM stores that plain chat history doesn't:

1. **Compressed semantic summaries** of old turns ("user lives in SF, mentioned diet start 2026-01-15").
2. **Temporal reasoning hints** — observations include relative dates and explicit instructions about "most recent supersedes older" (`constants.ts:68-71`).
3. **Planned-action inference** — "if user said 'I'll start Monday' and that was 2 weeks ago, assume they started" (`constants.ts:70-71`).
4. **Source-of-truth pointers** — the `range` metadata means observations know which raw messages they came from, enabling on-demand recall.

### 1c. General-purpose RAG — `packages/rag/`

Standalone document-RAG toolkit, independent of `Memory`. Five stages, clean separation:

- **Ingest / chunk** — `MDocument` (`packages/rag/src/document/document.ts:38-150`) with factory methods `fromText`, `fromHTML`, `fromMarkdown`, `fromJSON`, and a dozen transformers: `CharacterTransformer`, `RecursiveCharacterTransformer`, `HTMLHeaderTransformer`, `HTMLSectionTransformer`, `MarkdownHeaderTransformer`, `SemanticMarkdownTransformer`, `RecursiveJsonTransformer`, `LatexTransformer`, `SentenceTransformer`, `TokenTransformer` (document.ts:13-19). Metadata extractors (`TitleExtractor`, `SummaryExtractor`, `QuestionsAnsweredExtractor`, `KeywordExtractor`, `SchemaExtractor`) run LLM-augmented metadata enrichment on chunks.
- **Embed** — `vectorQuerySearch` at `packages/rag/src/utils/vector-search.ts:37-150` — branches on `model.specificationVersion` ('v1' | 'v2' | 'v3'), wraps in a `SpanType.RAG_EMBEDDING` span, supports `providerOptions` (e.g. OpenAI dimensions).
- **Store** — `MastraVector` abstract class (`packages/core/src/vector/vector.ts:72-197`). Pluggable. Method surface: `query`, `upsert`, `createIndex`, `listIndexes`, `describeIndex`, `deleteIndex`, `updateVector`, `deleteVector`, `deleteVectors`. No tenant parameter; just `indexName` (`types.ts:33-81`).
- **Retrieve** — `createVectorQueryTool` at `packages/rag/src/tools/vector-query.ts:22-164` exposes retrieval as an agent tool. All parameters (indexName, topK, filter, model, reranker) can be overridden via `requestContext.get(...)` (lines 41-52) — runtime-injected, not baked into the tool.
- **Rerank** — `packages/rag/src/rerank/index.ts:1-80` implements a weighted blend: `semantic: 0.4, vector: 0.4, position: 0.2`. `semantic` = LLM relevance score (via `MastraAgentRelevanceScorer` or Cohere), `vector` = original similarity, `position` = rank-position penalty. Weights configurable.
- **Graph-RAG** — `packages/rag/src/graph-rag/index.ts:39-60` builds a graph where edges are `semantic` similarity ≥ `threshold` (default 0.7). Walks from query-matched seed nodes to produce traversal-aware retrieval. The source file carries an explicit TODO (line 1) — this is an experimental layer.

### 1d. Hybrid retrieval hooks

- **Sparse vectors** (`SparseVector` at `packages/core/src/vector/types.ts:7-12`): `UpsertVectorParams.sparseVectors` (types.ts:39) + `QueryVectorParams.sparseVector` (types.ts:80). Pinecone-specific plumbing in `vector-search.ts:158-165` — only Pinecone's adapter surfaces it today.
- **Database-specific knobs** (`packages/rag/src/utils/vector-search.ts:152-203`): `pgvector.minScore/ef/probes`, `pinecone.namespace/sparseVector`, `chroma.where/whereDocument`. Every provider-specific feature is passed through as a nested `databaseConfig.<provider>` object, which keeps the core abstraction neutral.

### 1e. Observability integration

Every stage creates a typed span:

- `SpanType.RAG_EMBEDDING` (`vector-search.ts:53-63`) — attributes: mode, model, provider, dimensions, token usage.
- `SpanType.RAG_VECTOR_OPERATION` (`vector-search.ts:123-135`) — attributes: operation, indexName, topK, dimensions, returned count.
- `SpanType.MEMORY_OPERATION` for recall at the memory layer.
- Filter arguments go through `deepClean` for size/sanitization (comment at `vector-search.ts:126-127`).

---

## 2. What this tells us

### 2a. The tenant-isolation model matches — and validates — our §16 rejection

Mastra's vector index is `memory_messages`, singular, global. Tenant isolation = **metadata post-filter**. That is _exactly_ the leak shape our spec calls out. The spec says "Vector indexes shared across tenants = cross-tenant leak vector; single-tenant vector stores multiply operational cost with unclear return at this scale." Mastra is living proof of the first half: their isolation is one forgotten `filter: { resource_id }` from a cross-resource leak, and nothing stops a `resourceId` collision across tenants from becoming a cross-tenant leak.

**The implication is not "mastra is insecure"** — mastra is a library, tenancy is the caller's problem. The implication is: **any v1.5 we ship must make the tenant half of the filter a non-post-filter construct** — either a partition key (one pgvector schema per tenant), a separate index per tenant, or a tenant column enforced by pgvector's RLS.

### 2b. Two embedding pipelines, two purposes — we should not conflate them

Mastra separates:

- **Semantic recall over raw chat** (index `memory_messages`) — cheap, dumb, embed-everything-retrieve-nearest.
- **Observational memory** (index `memory_observations`) — expensive, LLM-derived summaries with a recall-to-source affordance.

Our v1 L3 fact store is conceptually closer to OM than to raw semantic recall. When the trigger fires, the question isn't "should we embed?" — it's "**embed raw messages or embed distilled observations?**" These have different cost/quality/safety profiles. An observational approach layers naturally on L3 we already plan to build; raw-message embedding requires a second write path on every `saveMessages`.

### 2c. The chunker is the weakest link, and mastra knows it

`chunkText` at `packages/memory/src/index.ts:810-838` is a **whitespace word-split with no overlap**. For chat messages this is fine (most messages fit in one chunk); for the RAG toolkit, `MDocument` has ten transformer strategies because one-size-fits-all chunking does not work for heterogeneous content. Any v1.5 spike needs a chunking decision per content type — chat messages, documents, Planner tasks, emails each want different strategies.

### 2d. Runtime-configurable retrieval via context is adoptable

`vector-query.ts:41-52` pattern — every parameter (indexName, topK, filter, model, reranker) defaults to the tool's options but can be overridden per-call via `requestContext.get('filter')`. This means the same tool can be bound to an agent once, then at runtime the gateway can inject `filter: { tenant_id: ctx.tenantId }` to force correct scoping. **This is the cleanest way to make the tenant filter non-forgetable at the call site** — without this, every agent author has to remember to set the filter.

### 2e. Reranking is worth evaluating even without embeddings

The weighted blend `0.4 semantic + 0.4 vector + 0.2 position` (`rerank/index.ts:10-14`) is a known-good baseline. For our v1, even L3 fact retrieval (no embeddings) would benefit from LLM-based relevance scoring over regex/fuzzy match, without committing to vector infra.

### 2f. Async buffering pattern is load-bearing for OM

OM's `bufferTokens: 0.2` / `bufferActivation: 0.8` pattern (`constants.ts:20-22`) means observation LLM calls happen **off the critical path** of user→response. If we ever ship OM-style summaries, we need pg-boss job infrastructure to host the observer. We already have pg-boss. This is a good fit.

### 2g. Gateway escape hatch is a business-model signal

`processor.ts:59-61` — "if model is mastra gateway, skip OM locally; gateway does it." This is **mastra's monetisation seam**: OM is expensive, so mastra-the-hosted-product runs it for you. We should note this for our own gateway architecture — if we ship OM, running it inside the gateway (one place, metered, cached) may be better than per-module invocation.

---

## 3. Proposed edits to agent-runtime.md

Minimal — the spec already defers this correctly. Just sharpen §16 with concrete triggers and decision criteria informed by mastra's prior art.

### Edit 1 — §16, expand the "Embeddings over L2" deferred item

Replace the current one-liner with:

> **Embeddings over L2 conversation history.** Recency + L3 sufficient for v1 chat lengths.
>
> **Trigger to revisit:** session token counts routinely approach 50% of the model context window for the top-quartile of sessions, OR user research shows >10% of chat questions require info from >20 turns back that recency doesn't surface.
>
> **When triggered, the spike answers these questions in order (do not skip, do not parallelize):**
>
> 1. **Raw-message recall or distilled-observation recall?** Mastra ships both as separate pipelines (`semanticRecall` vs `observationalMemory`). Observations layer on L3; raw-message recall needs a second write path on every save. Pick one. Not both in v1.5.
> 2. **Tenant partitioning strategy, before any other design decision.** A single index with a `tenant_id` metadata filter is a post-filter leak vector (mastra `memory_messages` is the cautionary tale — see spike 05). Candidates: one pgvector schema per tenant (matches our schema-per-module pattern); partitioned table with `tenant_id` as partition key + RLS; Qdrant collection per tenant. Reject post-filter-only designs.
> 3. **Embedding model.** `text-embedding-3-small` is already in the stack — dimension 1536, cheap, MSFT-compatible. Default unless a benchmark on Vietnamese / domain-specific text shows it underperforms.
> 4. **Chunking.** Chat messages ≠ documents ≠ Planner tasks. Mastra's `MDocument` ships ten strategies for a reason. Define the strategy per content type before writing any upsert code.
> 5. **Retrieval injection surface.** A tool the agent calls (mastra `createVectorQueryTool`) — not a system-prompt auto-inject. Tools have explicit traces, can be evaluated in the harness, and let the planner decide when recall is worth the tokens. The runtime-context-override pattern (`requestContext.get('filter')`) makes the tenant filter non-forgetable at the call site; adopt it.
> 6. **Reranking.** Default blend `0.4 semantic + 0.4 vector + 0.2 position` (mastra `packages/rag/src/rerank/index.ts:10-14`) is a reasonable baseline; if reranker LLM costs dominate, drop the semantic component and fall back to vector+position.
> 7. **Write path.** Fire-and-forget via pg-boss. Never on the request critical path.
> 8. **Reversibility.** The spike must land behind a flag (`EMBEDDINGS_ENABLED`) defaulted off, with the L2 read path able to skip the vector lookup entirely. If the flag is removed from a tenant, no queries are stranded.
>
> Prior art reviewed but not adopted: mastra's single-index-plus-metadata-filter model. See `docs/spike/mastra/05-rag-semantic-recall.md` for the full decision tree.

### Edit 2 — §5 (or wherever L2/L3 are defined), note the OM-vs-raw-recall distinction

Add a brief note when the L2 deferred item is listed:

> When we revisit L2 summarisation (§16), the question is **observational summaries or raw-message recall**. These are separate systems in mastra (`memory_observations_<dim>` vs `memory_messages`) with different cost/safety profiles. L3 fact extraction is closer to observational. Decide explicitly; do not ship both in one spike.

### Edit 3 — (Optional, can land standalone) adopt the runtime-context-override tool pattern now

`packages/rag/src/tools/vector-query.ts:41-52` shows a pattern worth internalising independent of embeddings: **tools accept a base config but resolve every parameter via `requestContext.get(...)` at call time, falling back to the base config.** This lets the gateway enforce tenant filters, topK limits, etc. at wire-time without each tool author having to remember. Worth adopting for any retrieval-shaped tool (L3 fact lookup, Planner task search) even before embeddings land.

---

## 4. What we are not borrowing

- **Single-index-with-metadata-filter tenant model.** Rejected, repeatedly, for the reason the spec already gives. Even mastra's own `resourceScope` guard (`packages/memory/src/index.ts:332-337`) only catches the missing-resourceId case; it does not catch cross-tenant `resourceId` collisions. This is a library, not a multi-tenant product.
- **`chunkText` as a chunker.** Whitespace word-split with no overlap (`packages/memory/src/index.ts:810-838`) is fine for mastra's embed-every-message use case; we would want semantic-boundary chunking even on chat if we ever do raw-message recall.
- **Embed-every-message-synchronously on `saveMessages`.** `packages/memory/src/index.ts:955-1000` runs `Promise.all` over embedding calls inside the save path. Our DB handler rules (CLAUDE.md — no `Promise.all` for DB-bound work) and the need to keep the save path fast both argue for a fire-and-forget outbox-event-driven write.
- **Graph-RAG as a v1.5 candidate.** The source file carries an explicit `TODO: GraphRAG Enhancements` (`packages/rag/src/graph-rag/index.ts:1-7`) listing "more edge types, custom edge types, richer connections." This is a research surface; we are not the team to productise it. Vanilla vector + rerank is more than enough before we talk graph.
- **Sparse-vector hybrid search in v1.5.** `SparseVector` (`packages/core/src/vector/types.ts:7-12`) is wired through mastra, but only Pinecone's adapter surfaces it (`vector-search.ts:158-165`). Ties us to Pinecone; pgvector doesn't have a clean story here. Defer.
- **LLM-extracted metadata on every chunk** (`TitleExtractor`, `SummaryExtractor`, `QuestionsAnsweredExtractor` in `document.ts`). Cost multiplier is 2-5× on ingest for marginal gain on chat content. Reserve for explicit document-RAG (`/kb` style) if we ever build one.
- **Observational memory as the default v1.5 shape.** OM is 3500+ LOC of observer + reflector + buffering coordinator + turn machinery (`observational-memory.ts` + `processor.ts` + `observer-agent.ts` + `reflector-agent.ts`). Running two extra LLMs per conversation is not v1.5; that's v2 scale. The compressed-gist-plus-recall pattern is worth studying, but the implementation is not portable as-is.

---

## 5. Open questions

The rich list — this is the "what should we know before we say yes to v1.5" checklist.

### 5a. Tenant partitioning — hard architectural question

- **Is one pgvector schema per tenant operationally sane at 100+ tenants?** pgvector creates indexes per-table; per-tenant schemas mean per-tenant indexes, which means per-tenant HNSW build time + memory. Need to benchmark with realistic fanout.
- **Or: one table, `tenant_id` as partition key, RLS on the partition?** Matches our existing Drizzle+RLS pattern, but pgvector's IVFFlat / HNSW index performance on partitioned tables is not a well-trodden path. Risk.
- **Or: separate vector DB (Qdrant/Pinecone/Weaviate) with collection-per-tenant?** Ops-simple, cost-multiplier on every tenant. Crosses our "ARM64 ECS" infrastructure posture — introduces a new service class.
- **Does cross-tenant "global knowledge" embedding even exist as a use case?** (e.g. "how should I handle a resignation" answered from a shared HR playbook.) If yes, it needs a separate read path with deliberate tenant-boundary crossing and audit trail, not a blended index.

### 5b. Embeddings budget

- **What's the marginal cost per active user per month of embedding every message at `text-embedding-3-small` rates?** Back-of-envelope, but needs real telemetry from v1 to size.
- **Batch-embed-on-idle vs embed-on-write?** Mastra embeds on `saveMessages`. Deferred batch embedding via pg-boss reduces p99 write latency but delays recall-after-write — probably fine for chat (user won't query their own last message).
- **Embedding cache scope.** Mastra uses xxhash of content → embeddings, in-memory, per-process (`packages/memory/src/index.ts:840-851`). Fine for a single process; wastes budget if we scale out. Do we want a Redis/pgvector cache by content-hash? Probably yes; needs a plan.

### 5c. Recall quality and evaluation

- **Does embedding over a 20-turn chat actually beat recency + L3 facts on representative queries?** Nobody has measured this for our domain. The v1.5 spike must include a harness test that compares retrieved-context-quality on a held-out set of real conversations _before_ committing to the embedding write path.
- **At what session length does the crossover happen?** Our trigger is "routinely approach context window." But maybe quality degrades at 30% of window, not 50%. Need data.
- **How often does recall inject bad context** (pulls an irrelevant older turn that derails the model)? Mastra has no published signal on this. Our harness must measure precision, not just recall.

### 5d. Reranker decision

- **LLM reranker (Cohere or self-hosted) cost vs. vector-only?** The 0.4/0.4/0.2 blend assumes you have a reranker model. Running Cohere rerank on every query is a per-query dollar cost. Self-hosting a small rerank model (bge-reranker-base, ~1GB) on ECS would keep it in-infra.
- **Does position-score even make sense for chat?** Mastra's position score (`rerank/index.ts:58-61`) rewards "this was near the top of the initial retrieval." For document RAG that correlates with quality; for chat, recency is the correlate, and we already bias retrieval by recency at query time. Might just weight vector at 0.7 and call it done.

### 5e. Raw-message recall vs observational memory

- **Can we meaningfully layer observational-style summaries on L3 without a dedicated observer LLM?** Our L3 is extracted facts. Mastra's OM is narrative prose summaries plus explicit "planned-action" inference. Are these the same thing or two things? If the same, we might get OM quality from L3 + a lightweight summarization pass. If different, OM is strictly more expensive and the comparison vs raw-message recall needs fresh evaluation.
- **If we go OM-style, do we re-run summarisation when underlying facts change?** Mastra's reflector compresses observations into groups; it does not detect when the world has moved on. Planned-action inference (`constants.ts:68-71`) is a text-prompt kludge, not a model capability.
- **What's the GDPR-erasure story for OM?** Raw-message recall: delete the message, delete the vector, done. OM: the observation is a distillation of N deleted messages; deleting the source messages leaves the observation intact unless you also track provenance and invalidate. Need a plan before any OM ships.

### 5f. Retrieval API surface

- **Tool-call pattern vs auto-inject?** Mastra's `createVectorQueryTool` lets the agent decide whether to recall; their OM processor auto-injects observations into system messages. Auto-inject = guaranteed recall, higher token cost; tool-call = agent-conditional, lower cost, but sometimes the agent doesn't know it's missing context. We should run both in the harness.
- **Topic-scoping at retrieval time?** If the user is asking about projects, should recall be filtered to `module: 'projects'`? Mastra's `filter` parameter supports this trivially; our question is whether we enforce it (gateway sets filter from routing decision) or leave it to prompt-craft.
- **Can a sub-agent inherit the parent agent's retrieval filter via context propagation?** Links to spike 01 (iterative topology) — when a delegation happens, the vector filter should not slip to the child agent's defaults. The mastra `requestContext` pattern handles this correctly; ours would need to.

### 5g. Operational

- **Index warm-up cost on deploy.** HNSW rebuilds on schema changes; IVFFlat needs `REINDEX` after big inserts. Our deploy cadence (multi-zone, frequent deploys) vs. index build time — is there a flash window where recall is degraded post-deploy?
- **Back-pressure when embeddings provider rate-limits.** Mastra retries 3× and throws. What does our outbox do? Pg-boss retry with exponential backoff — need to size the queue depth under sustained rate-limit pressure.
- **Observability.** Mastra has `SpanType.RAG_EMBEDDING` / `SpanType.RAG_VECTOR_OPERATION`. We have our `trace_id` stamp pattern. Need to mirror the span surface so that a slow-recall incident is diagnosable at the same grep as a slow-LLM-call incident.

### 5h. Meta-question

- **Would we rather spend the v1.5 budget on this, or on something upstream** (better L3 fact extraction, better prompt routing, better tool catalog)? Embeddings are alluring but may not be the bottleneck. The spike-scoping conversation itself should include this comparison, not assume embeddings are the answer.

---

## Status

- **Applied to agent-runtime.md:** none yet. Three edits above are proposed, all minimal — the spec already defers correctly; these strengthen the deferral with a decision tree.
- **Key takeaway:** our §16 deferral is validated by mastra's prior art. The leak-vector concern is real and visible in mastra's index design. When the trigger fires, open this document first — §3 Edit 1 contains the eight-question decision tree the v1.5 spike should work through in order.
