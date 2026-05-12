# SCOPE — platform/agent/embeddings  (@seta/agent-embeddings — P1)

> **Status:** **P1 — own package `@seta/agent-embeddings` lands under `platform/agent/embeddings/`.** The package.json + `src/` are NOT created in this PR; this SCOPE.md is the P1 contract and the directory placeholder. The package is created in a follow-up PR via `pnpm new:package` — see CLAUDE.md "CLI-only — packages and dependencies".
>
> **P1 scope override (2026-05-12):** setup.md §6 originally listed embeddings as a P2 RAG primitive (table at `docs/setup.md:428-438`; §11 layout grouping `embeddings/` under P2). The spike report `09-memory.md:68` echoed the deferral. User-directed scope change: the **Seta FAQ Agent** requires RAG in P1, so embeddings move to P1 alongside chunking / vector / rag. setup.md §6's P2 framing stays as-written; this SCOPE.md is the override citation point.

## Purpose

Embedding client wrapping OpenAI `text-embedding-3-small` (1536-dimensional vectors per setup.md §6, "Cheap, strong recall"). Single responsibility: turn `string[]` into `number[][]` deterministically (modulo provider non-determinism in the model itself), with abort wiring, batching to the API's per-request limit, and retry classification compatible with `@seta/agent-core`'s `withRetry`.

A separate package — not folded into `@seta/agent-vector` or `@seta/agent-rag` — because the cost of producing an embedding is dominated by the network round-trip; chunking and storage want to schedule embedding calls independently (parallelism, retry policy, recording fixtures).

## Responsibilities

- **Owns:**
  - The `embed(texts: string[]): Promise<number[][]>` entry point.
  - Batching to OpenAI's per-request input limit (currently 100 inputs per `/v1/embeddings` call; setup.md §6 OpenAI client integration). Inputs > 100 are split into sequential or `p-queue`-bounded batches.
  - Retry on transient errors via the `withRetry` helper from `@seta/agent-core` (mirror the kernel's `maxRetries: 2`, only on 429 / 5xx / fetch-timeout per spike `03-run-loop.md`).
  - Abort-signal threading — `AbortSignal` propagated into the OpenAI fetch call so cancelled requests don't keep the network busy.
  - Model identifier pinning — `text-embedding-3-small` only in P1; widening to `-large` or `-3-curated` is a follow-up decision.
- **Does NOT own:**
  - Chunking of long inputs — that is `@seta/agent-chunking`'s job; this package expects inputs that already fit the per-embedding token limit (8192 tokens for `text-embedding-3-small`).
  - Storing embeddings — `@seta/agent-vector` owns the `agent_vector.chunks` table.
  - RAG composition — `@seta/agent-rag`.
  - Tenant scoping — embeddings are stateless calls to OpenAI; the tenant context applies at the *storage* layer (vector) and the *retrieval* layer (rag).
  - Model billing / cost accounting — read off the OpenAI response `usage` field and forwarded to `@seta/audit` by the *caller*, not here.

## Current state (P1)

- **Directory placeholder only.** This SCOPE.md exists; no `package.json`, no `src/` lands in this PR. The package is created in the next PR via `pnpm new:package` (CLAUDE.md CLI-only).
- **HTTP-callable** — every integration test in this package must run through the `@seta/agent-core/testkit` `setupLLMRecording({ name })` helper (msw-backed, md5 fixture map per spike `06-llm-recording-replay.md`). Live OpenAI calls in CI are forbidden by CLAUDE.md "LLM in tests: only via `@seta/agent-core/testkit` recordings. Never live model APIs in CI."

## Public interface (when implementation lands)

```ts
// declared in @seta/agent-embeddings/src/index.ts
export interface EmbedOptions {
  signal?: AbortSignal
  // P1 fixes the model; P2 may widen this to a union.
}

export function embed(texts: string[], opts?: EmbedOptions): Promise<number[][]>
// Returns one 1536-dimensional vector per input, in input order.
// Empty `texts` returns `[]` (no API call).
// Throws KernelError-derived `LlmError` on non-retryable failure;
// retryable errors are handled internally up to `maxRetries`.

// Optional re-export so consumers can sanity-check the configured model
// before they wire it through to @seta/agent-vector's `dimensions: 1536` column.
export const EMBEDDING_MODEL = 'text-embedding-3-small' as const
export const EMBEDDING_DIMENSIONS = 1536 as const
```

The package consumes a typed `env` (OpenAI API key) from the composition root — never reads `process.env.OPENAI_API_KEY` directly (CLAUDE.md footgun "`process.env` → typed `env`").

## Imports (when implementation lands — P1)

- **Allowed internal:** `@seta/agent-core` — for the shared `withRetry` / `classifyError` helpers and `LlmError` subclass (spike `02-agent-core.md` punch list; setup.md §5 retry-policy subsection).
- **Forbidden:** any `modules/*` package, `apps/*`, `@seta/middleware` (this is a library), `@seta/db` (no persistence), `@seta/observability` (caller wraps with logger), any other `@seta/agent-*` (would create a cycle through the RAG layer).
- **External (pinned per setup.md §13):** `openai@6.37.0` (the official OpenAI SDK; same pin as the kernel `OpenAIAdapter`), `zod@4.4.3` (for optional input validation at the public surface).

Note: setup.md §11 dep direction is `platform/agent/embeddings → (no internal deps; pure TS + openai)`. The P1 override adds `@seta/agent-core` as the *only* internal dep so the retry / classification logic is shared, not duplicated.

## Patterns to follow

- **Batched by inputs-per-call**, not tokens-per-call — OpenAI's `/v1/embeddings` accepts up to 100 input strings per request. Splitting at this boundary keeps each fixture (per spike `06-llm-recording-replay.md`) replayable and bounded.
- **Abort propagation is non-negotiable** — `signal` threads into the underlying `fetch`. Setup.md §5: "Abort wiring is non-negotiable" + spike `03-run-loop.md` "re-check `signal.aborted` on every consumed chunk". Embeddings are non-streaming, but the abort still cancels the in-flight request.
- **Retry via shared `withRetry`** — never hand-roll. Re-uses `@seta/agent-core`'s `classifyError` so the retry policy stays uniform across LLM and embedding calls.
- **Deterministic input ordering preserved in the response** — `result[i]` corresponds to `texts[i]`. OpenAI guarantees this; the package re-asserts it at the type boundary.
- **`fetch` only — no SDK-internal transports.** Setup.md §5 + spike `06-llm-recording-replay.md`: the testkit replaces global `fetch` via msw. SDK-internal HTTP libraries (like `node-fetch` or `undici` with custom dispatchers) bypass the recording layer.
- **Token-pre-counting is the caller's job.** Chunking already counted; this package does not re-tokenize. If an input exceeds 8192 tokens the OpenAI API returns an error which surfaces as `LlmError`.

## Patterns to avoid

- **Do NOT add a second provider (Voyage, Cohere, etc.) in P1** — single-provider keeps the recording fixtures, retry classification, and dimension contract trivial. Multi-provider is P2 if a cost or recall change forces it.
- **Do NOT cache embeddings in-process** — caching is the storage layer's concern (`@seta/agent-vector`). LRU here would leak tenant data on pool reuse (setup.md §3 footgun discussion).
- **Do NOT log inputs or outputs** — embeddings can encode PII from FAQ corpora. Caller is responsible for any audit/log writes via `@seta/audit`.
- **Do NOT bypass the testkit recording** — live OpenAI calls in CI break determinism and burn credits. CLAUDE.md footgun: "LLM in tests: only via `@seta/agent-core/testkit` recordings."
- **Do NOT couple to `@seta/agent-vector` schema constants** — the 1536 dimension is exported here as `EMBEDDING_DIMENSIONS`; vector schema imports this constant, not the other way around. Prevents an import cycle through the RAG layer.

## Test strategy (when implementation lands)

- **Unit (`src/**/*.test.ts`):** batching at the 100-input boundary, ordering preservation, abort propagation, empty-input short-circuit, error classification (4xx → no retry; 429 / 5xx / `AbortError` → handled).
- **Integration (`tests/integration/**`):** end-to-end via `setupLLMRecording({ name })` from `@seta/agent-core/testkit` — msw intercepts `api.openai.com/v1/embeddings`, fixture lookup via `md5(url + canonicalize(body)).slice(0,16)` per spike `06-llm-recording-replay.md` punch list. Recordings live in `__recordings__/` and **must be checked into git** (spike `06-llm-recording-replay.md` SA-6: "turbo silently caches misses").
- **Re-record fixture:** `RECORD=1 pnpm vitest run -t <name>` per CLAUDE.md commands table.
- **No live OpenAI in CI** — env-var gate `RECORD=1` (record-if-missing) / `RECORD=force` (re-record) / default strict-replay (fail on missing fixture).

## Open questions

1. **Model upgrade to `text-embedding-3-large` (3072d)?** Defer — `-small` is the §6 P1 pick and 1536 matches the `@seta/agent-vector` column dimension. Upgrading is a coordinated schema change (different `vector(N)` column).
2. **Per-request input limit — 100 or 2048?** OpenAI lifts the cap occasionally; pin to 100 in P1 (most conservative) and revisit if batching becomes a latency bottleneck for FAQ ingest.
3. **Should `embed` return `Float32Array[]` instead of `number[][]`?** `number[][]` is the simpler contract (JSON-serialisable, drizzle-orm's `vector` type takes `number[]`). Optimise to `Float32Array` only if profiling shows GC pressure.
4. **Retry-after honouring on 429** — OpenAI sets `Retry-After` headers; `@seta/agent-core`'s `withRetry` may need to consume this. Flagged for the kernel retry-policy implementation (spike `03-run-loop.md`).

## Cross-references

- **Setup spec:** [`docs/setup.md`](../../../docs/setup.md) §6 (RAG primitives — embeddings pick + 1536d rationale), §11 (`platform/agent/embeddings/` directory placement; dep direction), §13 (`openai@6.37.0` pin).
- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md`](../../../docs/explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md) — msw + md5-fixture testkit; HTTP-callable packages reuse this.
- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/02-agent-core.md`](../../../docs/explorations/2026-05-12-mastra-spike/02-agent-core.md) — `withRetry` / `classifyError` / `LlmError` shared infrastructure.
- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/03-run-loop.md`](../../../docs/explorations/2026-05-12-mastra-spike/03-run-loop.md) — abort propagation + transient-error classification.
- **Sibling RAG packages:** [`platform/agent/chunking/SCOPE.md`](../chunking/SCOPE.md) (upstream), [`platform/agent/vector/SCOPE.md`](../vector/SCOPE.md) (downstream consumer), [`platform/agent/rag/SCOPE.md`](../rag/SCOPE.md) (composition).
- **P1 override notice:** [`docs/explorations/2026-05-12-mastra-spike/README.md`](../../../docs/explorations/2026-05-12-mastra-spike/README.md) § "P1 scope override (2026-05-12)".
