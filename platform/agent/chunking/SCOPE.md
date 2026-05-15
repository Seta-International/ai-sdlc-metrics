# SCOPE — platform/agent/chunking  (@seta/agent-chunking — P1)

> **Status:** **P1 — `@seta/agent-chunking` is implemented at `platform/agent/chunking/`.** Public surface frozen per [`docs/superpowers/specs/2026-05-13-agent-chunking-design.md`](../../../docs/superpowers/specs/2026-05-13-agent-chunking-design.md). Consumed by `@seta/agent-rag.ingest` (Plan E, separate spec).
>
> **P1 scope override (2026-05-12):** setup.md §6 originally listed `@seta/agent-chunking` as a P2 RAG primitive (see setup.md §6 table at `docs/setup.md:428-438` and §11's `platform/agent/` layout which groups `chunking/`, `embeddings/`, `vector/`, `rag/` under "P2"). The spike report `09-memory.md:30, :68` mirrored that — RAG track is P2 per §6. User-directed scope change: the **Seta FAQ Agent** is required in P1 and depends on RAG. The full RAG track (`@seta/agent-chunking`, `@seta/agent-embeddings`, `@seta/agent-vector`, `@seta/agent-rag`) moves to P1 alongside the new agent-memory and agent-workflows overrides. setup.md §6's P2-defer language remains as-written; this SCOPE.md is the override citation point.

## Purpose

Split free-form text (knowledge-base articles, long tool outputs, ingested documents) into bounded-token chunks suitable for embedding and retrieval. Hand-rolled around `js-tiktoken` per setup.md §6 — LangChain splitters and the broader `@langchain/textsplitters` family are explicitly rejected as "too heavy" for our scale.

A chunk preserves token-budget invariants (≤ `maxTokens`, with a configurable `overlapTokens` window so adjacent chunks share context across boundaries) and keeps the original character offsets so the citation layer in `@seta/agent-rag` can resolve a chunk back to its source span when the FAQ Agent renders "cite_sources".

## Responsibilities

- **Owns:**
  - The token-counting + segmentation algorithm (greedy fill to `maxTokens` with `overlapTokens` rolling window; semantic-boundary preferred when paragraph breaks land within the slack).
  - The `Chunk` and `ChunkOptions` Zod schemas + inferred types.
  - Tokenizer model selection — currently `text-embedding-3-small` and `gpt-5` per setup.md §6 + §5 model router.
- **Does NOT own:**
  - Embedding generation — `@seta/agent-embeddings`.
  - Vector storage / search — `@seta/agent-vector` (which owns the `agent_vector` Postgres schema per setup.md §6 pgvector pattern).
  - RAG composition or RRF fusion — `@seta/agent-rag`.
  - Source acquisition (PDF parsing, web crawling, Markdown ingestion) — out of P1 RAG scope; products feed text in as strings.
  - LLM-driven semantic chunking (LLM-as-segmenter) — not in P1, possibly never; defeats the cost-savings rationale of chunking.

## Current state (P1)

- **Package implemented.** `package.json`, `src/`, `dist/`, and tests all exist at `platform/agent/chunking/`.
- Public surface: `Chunk`, `ChunkOptions`, `SupportedModel`, `ChunkingError`, `chunkText`, `parseChunkOptions`, `ChunkOptionsSchema`, `DEFAULT_MAX_TOKENS`, `DEFAULT_OVERLAP_TOKENS`, `SUPPORTED_MODELS`.
- 67 unit + property tests pass (including 200-run `fast-check` invariants for token-budget, content/offset roundtrip, coverage, stride correctness, and determinism).
- The `js-tiktoken` pin moves to `@seta/agent-core` per spike `10-llm-model-router.md` punch list SA-10 (kernel needs it for pre/post-request token estimation). This package re-uses the same pin via the workspace; setup.md §13's `@seta/agent-chunking` entry declares `js-tiktoken@1.0.21` as a direct dep (chunking is the heaviest tokenizer consumer).

## Public interface (when implementation lands)

```ts
// declared in @seta/agent-chunking/src/types.ts
export interface Chunk {
  content: string         // the slice of source text
  tokenCount: number      // js-tiktoken count under the chosen model
  startChar: number       // inclusive offset into the original input
  endChar: number         // exclusive offset
}

export interface ChunkOptions {
  maxTokens: number       // hard upper bound per chunk; e.g. 512 for embeddings
  overlapTokens: number   // rolling window across chunk boundaries; 0 disables
  model: 'text-embedding-3-small' | 'gpt-5'   // tokenizer encoding selection
}

export function chunkText(input: string, opts: ChunkOptions): Chunk[]
```

`chunkText` is pure and synchronous — no I/O, no model calls. Deterministic given identical input + options. Errors thrown for invalid options (`maxTokens <= overlapTokens`, etc.) via Zod refinement at the call boundary.

## Imports (when implementation lands — P1)

- **Allowed internal:** none. This package is intentionally a leaf under `platform/agent/` (setup.md §11 dep direction: `platform/agent/chunking → (no internal deps; pure TS)`).
- **Forbidden:** any other `@seta/*` package, any `modules/*`, any `apps/*`. No model SDKs. No DB clients. No logger (pure compute).
- **External (pinned per setup.md §13):** `js-tiktoken@1.0.21`, `zod@4.4.3` (for `ChunkOptions` runtime validation only; consumers may opt out by calling the typed function directly).

## Patterns to follow

- **Single tokenizer pinned per model** — `js-tiktoken` encoders are loaded lazily, memoized per `ChunkOptions.model`. Setup.md §6 footgun discussion: tokenizer mismatch silently produces under/over-sized embedding inputs.
- **Character offsets always preserved** — `startChar` / `endChar` index into the original `input` string (not the decoded token stream). Required for citation rendering by the FAQ Agent's `cite_sources` tool (`modules/products/agent/SCOPE.md` § Responsibilities — FAQ tools).
- **Overlap is token-based, not character-based** — setup.md §6 "hand-roll via js-tiktoken" implies the same tokenizer for both budgeting and overlap. Mixing character-overlap with token-budget breaks at multi-byte boundaries.
- **Deterministic output** — same input + options ⇒ byte-identical `Chunk[]`. Required so that the recording/replay testkit (`docs/explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md`) can fingerprint chunked corpora without re-embedding.
- **No streaming API in P1** — chunking is in-memory, sync. Streaming chunkers (for documents larger than memory) are P2; the FAQ corpus is small enough to load whole.

## Patterns to avoid

- **Do NOT pull in `@langchain/textsplitters` or any LangChain package** — setup.md §6: "LangChain splitters too heavy". Re-evaluating this requires an ADR.
- **Do NOT call out to embeddings inside `chunkText`** — `@seta/agent-embeddings` is a separate stage. Mixing them defeats the four-package split rationale (setup.md §6 first paragraph: "Split into single-purpose packages so any one is reusable without dragging the others in").
- **Do NOT add LLM-driven semantic chunking** — out of scope; reopens the cost / latency model that the deterministic chunker avoids.
- **Do NOT import `@seta/observability` or any logger** — pure compute, no side effects. If a consumer needs telemetry, wrap the call site, not the function.
- **Do NOT cache chunked corpora in-process** — caching is the consumer's responsibility (RAG layer ingest stores chunks in pgvector via `@seta/agent-vector`).

## Test strategy (when implementation lands)

- **Unit tests only** — pure function with no I/O. `<pkg>/src/**/*.test.ts` per CLAUDE.md conventions.
- **Property tests** — for any `input` and any valid `opts`: (1) `tokenCount(chunk) <= opts.maxTokens` for every chunk; (2) `content === input.slice(startChar, endChar)`; (3) `concat(chunks.content)` reconstructs the input minus overlap deltas.
- **Tokenizer parity** — assert `js-tiktoken` encoding parity for both pinned models (`text-embedding-3-small`, `gpt-5`) against a hand-rolled fixture of known token counts.
- **No LLM fixtures needed** — chunker is below the model layer. `@seta/agent-core/testkit` (spike `06-llm-recording-replay.md`) is not used here.

## Open questions

1. **Default `maxTokens` for FAQ corpus** — 512 is the OpenAI embedding-input sweet spot, but the FAQ Agent's `search_knowledge_base` retrieval may want smaller (256) for precision or larger (1024) for context. Defer to RAG-survey output (see `modules/products/agent/SCOPE.md` open questions — "Seta knowledge-base corpus source").
2. **Default `overlapTokens`** — 64 is a common starting point (≈ 12% of a 512-token chunk). Confirm against retrieval recall measurements after FAQ corpus lands.
3. **Should `model` be widened to `string` to accept future tokenizer models?** Keep the union narrow in P1 — adding a model is a one-line change, narrowing later is breaking.
4. **Tokenizer encoding for `gpt-5`** — `js-tiktoken@1.0.21` does not yet ship a `gpt-5` encoding; fall back to `o200k_base` (gpt-4o/o1 family) until upstream lands a dedicated encoding. Cite the fallback in the implementation.

## Cross-references

- **Setup spec:** [`docs/setup.md`](../../../docs/setup.md) §6 (RAG primitives — tokenizer + chunker rationale), §11 (`platform/agent/chunking/` directory placement), §13 (`js-tiktoken@1.0.21` pin).
- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/09-memory.md`](../../../docs/explorations/2026-05-12-mastra-spike/09-memory.md):30, :68 — RAG track previously P2, now P1 per override.
- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/10-llm-model-router.md`](../../../docs/explorations/2026-05-12-mastra-spike/10-llm-model-router.md) — `js-tiktoken` pin co-located in `@seta/agent-core`; chunker is the secondary consumer.
- **Sibling RAG packages:** [`platform/agent/embeddings/SCOPE.md`](../embeddings/SCOPE.md), [`platform/agent/vector/SCOPE.md`](../vector/SCOPE.md), [`platform/agent/rag/SCOPE.md`](../rag/SCOPE.md).
- **Product consumer:** [`modules/products/agent/SCOPE.md`](../../../modules/products/agent/SCOPE.md) § FAQ Agent — consumes via `@seta/agent-rag` (not directly).
- **P1 override notice:** [`docs/explorations/2026-05-12-mastra-spike/README.md`](../../../docs/explorations/2026-05-12-mastra-spike/README.md) § "P1 scope override (2026-05-12)".
