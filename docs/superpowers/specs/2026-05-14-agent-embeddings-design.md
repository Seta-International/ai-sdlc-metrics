# Design — @seta/agent-embeddings (P1 implementation)

**Status:** Draft for implementation. Authored 2026-05-14. Supersedes the implementation-shape questions in `platform/agent/embeddings/SCOPE.md`; the SCOPE's contract (purpose, responsibilities, dep direction, P1 override citation) remains the binding context — this doc fills in the construction shape, retry/abort wiring, return type, error mapping, and test strategy.

**Scope:** Land `@seta/agent-embeddings` under `platform/agent/embeddings/` as an OpenAI `text-embedding-3-small` client (1536d) with batching, retry via `@seta/agent-core`'s `withRetry`, abort propagation, Zod input validation, and usage reporting. Consumed by `@seta/agent-rag.ingest` and the query-time retrieval path (separate specs).

**Out of scope (P1):** Multi-provider (Voyage / Cohere), `text-embedding-3-large` (3072d), `dimensions` parameter, bounded-parallel batching, in-process embedding cache, `Retry-After` honouring (kernel follow-up), per-call telemetry hooks.

---

## 1. Architecture

A single ESM package `@seta/agent-embeddings` at `platform/agent/embeddings/`. One internal dep (`@seta/agent-core`), no other `@seta/*` imports.

### Public surface (frozen)

```ts
// platform/agent/embeddings/src/index.ts

export interface EmbeddingsConfig {
  apiKey: string
  baseURL?: string
  timeoutMs?: number          // defaults to 60_000 (matches agent-core LLM adapter)
}

export interface EmbedOptions {
  signal?: AbortSignal
  // P1 fixes the model + dimensions; widening is P2.
}

export interface EmbedUsage {
  promptTokens: number
  totalTokens: number
}

export interface EmbedResult {
  embeddings: number[][]      // result.embeddings[i] is the embedding of texts[i]
  usage: EmbedUsage           // aggregated across all internal batches
}

export interface EmbeddingsClient {
  embed(texts: string[], opts?: EmbedOptions): Promise<EmbedResult>
}

export function createOpenAIEmbeddings(cfg: EmbeddingsConfig): EmbeddingsClient

export const EMBEDDING_MODEL = 'text-embedding-3-small' as const
export const EMBEDDING_DIMENSIONS = 1536 as const
export const EMBEDDING_BATCH_SIZE = 100 as const
export const EMBEDDING_MAX_INPUT_TOKENS = 8191 as const  // informational; caller enforces
```

### SCOPE deviations (deliberate)

1. **Factory + `EmbedResult` object instead of `embed(texts, opts?): Promise<number[][]>` free function.** SCOPE's literal signature has no place for API-key injection without module-level state, and no path for the caller to read `usage` (which SCOPE explicitly says the caller forwards to `@seta/audit`). The factory pattern matches `createOpenAIAdapter` in `agent-core`; the `EmbedResult` object surfaces usage without forcing a side-channel.
2. **No new `EmbeddingsError` subclass.** SCOPE says `LlmError`-derived; we use `LlmError` directly via `mapOpenAIError` plus one `LLM_BAD_REQUEST` path for the Zod boundary failures. No new error class needed.

### Imports

- **Allowed internal:** `@seta/agent-core` (public surface: `withRetry`, `LlmError`, `mapOpenAIError`, `classifyError`).
- **External (pinned per `docs/setup.md` §13):** `openai@6.37.0`, `zod@4.4.3`.
- **Forbidden:** any `modules/*`, any `apps/*`, `@seta/db`, `@seta/observability`, `@seta/middleware` (route helpers), any other `@seta/agent-*` (would create a cycle through the RAG layer).

---

## 2. Algorithm — sequential batch loop with shared retry

### Construction split (internal)

Mirroring `createOpenAIAdapter` / `makeOpenAICompatibleAdapter` in `platform/agent/core/src/models/openai.ts:104-115`:

```ts
// client.ts
export function createOpenAIEmbeddings(cfg: EmbeddingsConfig): EmbeddingsClient {
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    maxRetries: 0,             // we own retry; SDK retry disabled
    timeout: cfg.timeoutMs ?? 60_000,
  })
  return makeEmbeddingsClient(client)
}

// internal — used by embed.test.ts to inject a fake; NOT re-exported from index.ts
export function makeEmbeddingsClient(client: OpenAI): EmbeddingsClient {
  return { embed: (texts, opts) => embed(client, texts, opts) }
}
```

`makeEmbeddingsClient` is the test seam. Public surface stays `createOpenAIEmbeddings` only.

### `embed` orchestration

```ts
// embed.ts (essential shape)
async function embed(
  client: OpenAI,
  texts: string[],
  opts?: EmbedOptions,
): Promise<EmbedResult> {
  if (texts.length === 0) {
    return { embeddings: [], usage: { promptTokens: 0, totalTokens: 0 } }
  }
  parseInput(texts)                    // Zod; throws LlmError(LLM_BAD_REQUEST, USER) on failure

  const signal = opts?.signal ?? new AbortController().signal
  const out: number[][] = []
  let promptTokens = 0
  let totalTokens = 0

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE)

    let res: Awaited<ReturnType<typeof client.embeddings.create>>
    try {
      // Throw the RAW SDK error to withRetry so `classifyError` reads
      // `err.status` (OpenAI.APIError exposes status as a top-level
      // property; a mapped LlmError would hide it inside `.details.status`
      // and classifyError would treat every error as terminal). Mapping
      // happens once retries are exhausted — outer catch below.
      res = await withRetry(
        () =>
          client.embeddings.create({ model: EMBEDDING_MODEL, input: batch }, { signal }),
        { maxRetries: 2, signal },
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      throw mapOpenAIError(err, EMBEDDING_MODEL, 'openai')
    }

    if (res.data.length !== batch.length) {
      throw new LlmError({
        code: 'LLM_UNKNOWN',
        category: 'THIRD_PARTY',
        message: `OpenAI returned ${res.data.length} embeddings for ${batch.length} inputs`,
        details: { provider: 'openai', model: EMBEDDING_MODEL },
      })
    }

    for (const item of res.data) out.push(item.embedding)
    promptTokens += res.usage?.prompt_tokens ?? 0
    totalTokens += res.usage?.total_tokens ?? 0
  }

  return { embeddings: out, usage: { promptTokens, totalTokens } }
}
```

### Behaviour matrix

| Concern | Behaviour |
|---|---|
| Retry budget | `withRetry({ maxRetries: 2 })` only. SDK `maxRetries: 0`. Backoff per `retry.ts`: 250ms × 2^n, capped at 4s, ±20% jitter. |
| Retry classification | `classifyError` from agent-core reads `err.status` directly. `OpenAI.APIError` exposes `.status` as a top-level property, so the retry callback throws the **raw** SDK error (not a mapped `LlmError`). 408/429/500/502/503/504 → transient; everything else → terminal. |
| Abort within batch | `signal` threads into `client.embeddings.create(..., { signal })`. SDK throws `AbortError`; `withRetry` short-circuits when `signal.aborted` becomes true and re-throws unchanged. The outer `catch` checks `err.name === 'AbortError'` and re-throws without mapping. |
| Abort between batches | Explicit `signal.aborted` check at the top of every iteration — fail fast before the next `.create` call. |
| Partial results on abort | None. `result.embeddings[i]` must correspond to `texts[i]`; a partial array silently breaks that invariant. |
| Error mapping | Happens **after** `withRetry` exhausts the budget, not inside the retry callback. All non-abort SDK errors → `mapOpenAIError` → `LlmError(LLM_AUTH_FAILED \| LLM_BAD_REQUEST \| LLM_RATE_LIMITED \| LLM_SERVER_ERROR \| LLM_CONTENT_POLICY \| LLM_TRANSIENT_EXHAUSTED \| LLM_UNKNOWN)`. |
| `Retry-After` honouring | Not honoured in P1. Tracked as kernel-side follow-up; benefits both this package and the LLM adapter when `withRetry` learns to consume the header. |
| Response-length invariant | Defensive assert `res.data.length === batch.length` per batch. OpenAI guarantees order; we re-assert at the type boundary. |
| Logging | None inside the package. Caller wraps. `withRetry`'s `onAttempt` is not exposed in `EmbedOptions` for P1. |
| Empty input array | Short-circuits to `{ embeddings: [], usage: { 0, 0 } }` without calling Zod or the API. |

### Boundary validation (Zod)

```ts
// parse-input.ts
const InputSchema = z.array(z.string().regex(/\S/, 'must be non-blank'))

export function parseInput(texts: unknown): asserts texts is string[] {
  const result = InputSchema.safeParse(texts)
  if (!result.success) {
    throw new LlmError({
      code: 'LLM_BAD_REQUEST',
      category: 'USER',
      message: 'invalid embeddings input',
      details: { provider: 'openai', model: EMBEDDING_MODEL, issues: result.error.issues },
    })
  }
}
```

Rejects: non-array, non-string items, empty strings (`''`), whitespace-only strings (`'   '`). Saves a round-trip on obvious caller bugs and produces a more actionable error message than the OpenAI 400 surface.

Token-budget pre-counting (≤ 8191 per input) is **not** performed — caller's responsibility per SCOPE. An over-token input surfaces as `LlmError(LLM_BAD_REQUEST)` from the OpenAI 400.

### Error mapping reuse

`mapOpenAIError` is promoted from `platform/agent/core/src/models/openai.ts` to `@seta/agent-core`'s public surface in a single-line addition to `src/index.ts`:

```ts
export { mapOpenAIError } from './models/openai'
```

Non-breaking addition; lands in the same PR or the PR immediately preceding embeddings. `@seta/agent-core` needs a `minor` changeset for this promotion.

---

## 3. Test strategy

All tests follow CLAUDE.md conventions: unit co-located in `src/`, integration in `tests/integration/`, no live OpenAI calls in CI.

### Unit tests (`src/**/*.test.ts`)

Fake-client injection through `makeEmbeddingsClient(client)` — pass `{ embeddings: { create: vi.fn() } }`. The orchestration logic does not need msw.

| File | Coverage |
|---|---|
| `parse-input.test.ts` | non-array → throws `LlmError(LLM_BAD_REQUEST, USER)`; non-string items → throws; `''` → throws; `'   '` → throws; valid array passes. |
| `batch.test.ts` | `chunkBy(texts, 100)` pure helper: exact multiples, off-by-one (101 → `[100, 1]`), empty array, single element. Property: concatenation of batches equals input; every batch ≤ 100. |
| `embed.test.ts` | Empty-input short-circuit (no `.create` call); single-batch happy path; multi-batch sequential ordering; usage aggregation across batches; response-length-mismatch → `LlmError(LLM_UNKNOWN)`; AbortError propagated unmapped; abort-between-batches (signal aborted after batch 1 → throws before batch 2's `.create` runs); `mapOpenAIError` wired (fake throws `OpenAI.APIError` with status 429 → caller sees `LlmError(LLM_RATE_LIMITED)`). |

### Integration tests (`tests/integration/**`)

`setupLLMRecording({ name })` from `@seta/agent-core/testkit` — msw intercepts `api.openai.com/v1/embeddings`, fixtures under `__recordings__/`, fingerprinted by `md5(url + canonicalize(body))`.

| Scenario | Why it needs the wire |
|---|---|
| Single batch, ≤ 100 inputs, happy path | Validates OpenAI response shape decoding (`data[].embedding`, `usage.prompt_tokens`). |
| Multi-batch, 250 inputs → 3 sequential `.create` calls | Validates batch order, usage aggregation, ordering against real OpenAI semantics. |
| 401 → `LlmError(LLM_AUTH_FAILED)`, terminal (no retry) | Recorded error response; asserts `withRetry` does not re-issue. |
| 429 → retry succeeds on second attempt | Two recordings under the same hash sequence; verifies `withRetry` consumes the first failure and replays. |
| Abort mid-request | Caller controls `AbortController`; asserts the SDK surfaces `AbortError` and we re-throw unmapped. |
| Empty-input short-circuit | Asserts msw saw zero requests. |

Fixtures checked into git per spike `06-llm-recording-replay.md` SA-6. Recording flow: `RECORD=1 pnpm vitest run -t <name>`.

### What we don't test

- **Live OpenAI** — forbidden by CLAUDE.md.
- **Token counts of inputs** — caller's job; chunking package owns it.
- **Embedding quality / cosine distances** — `@seta/agent-rag` concern.
- **`withRetry` backoff timing** — already tested in `agent-core/src/models/retry.test.ts`.
- **`mapOpenAIError` mappings per status code** — already tested in agent-core's existing `openai.test.ts`.

---

## 4. File layout

```
platform/agent/embeddings/
├── SCOPE.md                              # exists; remains binding contract
├── package.json                          # created via `pnpm new:package`
├── tsconfig.json
├── vitest.config.ts                      # leaf override of test.name only
├── src/
│   ├── index.ts                          # public surface re-exports
│   ├── client.ts                         # createOpenAIEmbeddings + makeEmbeddingsClient (internal)
│   ├── embed.ts                          # orchestration: validate → loop → withRetry → aggregate
│   ├── embed.test.ts                     # unit, fake-client injected
│   ├── batch.ts                          # chunkBy(texts, size)
│   ├── batch.test.ts
│   ├── parse-input.ts                    # Zod schema + parseInput
│   ├── parse-input.test.ts
│   └── constants.ts                      # EMBEDDING_MODEL / DIMENSIONS / BATCH_SIZE / MAX_INPUT_TOKENS
└── tests/
    └── integration/
        ├── embed.integration.test.ts
        └── __recordings__/               # checked into git
            └── *.json
```

`client.ts` exports `createOpenAIEmbeddings` (public) and `makeEmbeddingsClient` (internal seam, not re-exported from `index.ts`).

---

## 5. Package metadata, deps, CI guards

### `package.json` shape (after `pnpm new:package`)

```jsonc
{
  "name": "@seta/agent-embeddings",
  "version": "0.1.0",
  "description": "OpenAI embeddings client with batching, retry, and abort wiring",
  "type": "module",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --sourcemap",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "test:unit": "vitest run src/",
    "test:integration": "vitest run tests/",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@seta/agent-core": "workspace:*",
    "openai": "6.37.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@seta/tsconfig": "workspace:*",
    "@types/node": "^24.12.3",
    "tsup": "8.5.1",
    "typescript": "6.0.3",
    "vitest": "4.1.6"
  }
}
```

### CLI install sequence (CLAUDE.md "Never hand-edit `package.json`")

```
pnpm new:package
pnpm --filter @seta/agent-embeddings add openai@6.37.0 zod@4.4.3
pnpm --filter @seta/agent-embeddings add @seta/agent-core@workspace:*
pnpm --filter @seta/agent-embeddings add -D vitest@4.1.6 tsup@8.5.1 typescript@6.0.3 \
  @seta/tsconfig@workspace:* @types/node@^24.12.3
```

`msw` is **not** a dep here — it's pulled in transitively via `@seta/agent-core/testkit` only when integration tests call `setupLLMRecording`.

### Dep direction

```
platform/agent/embeddings → @seta/agent-core (only)
```

setup.md §11 line 1096 originally lists `platform/agent/embeddings → (no internal deps; pure TS + openai)`. The `@seta/agent-core` edge is the same P1-override deviation that `agent-chunking` took for `KernelError` — here for `withRetry` + `LlmError` + `mapOpenAIError`.

### CI guards (already in place)

- `check-no-manual-pkg-edit.ts` — all deps added via CLI.
- ESM-only, `import type`, no `console.log` — Biome enforces.
- Module-boundary import rules — `platform/agent/*` cannot import `modules/*` or `apps/*`. No `@seta/middleware` route helpers.
- `"private": true` — no changeset needed for this package itself. `@seta/agent-core` needs a `minor` changeset for the `mapOpenAIError` promotion.

---

## 6. Open questions (carried into implementation, not blockers)

1. **`Retry-After` honouring on 429.** Kernel-side follow-up; `withRetry` learning to consume `Retry-After` benefits this package and the LLM adapter. P1 falls back to fixed backoff with jitter.
2. **Per-request input limit 100 vs 2048.** P1 pins 100 via `EMBEDDING_BATCH_SIZE`. OpenAI has lifted the cap to 2048; bumping is a constant edit + integration-fixture re-record, no surface change.
3. **Bounded parallelism for large ingests.** P2. Add when wall-time pressure shows up; localised change, no surface impact. The recording-fixture determinism trade-off (md5-keyed `recordings[]` ordering shuffles under parallel dispatch) is the constraint to plan around.
4. **Model widening (`-large` / future) and the `dimensions` parameter.** P2. Would change `EMBEDDING_DIMENSIONS` from a constant to a return value / per-call option. Coordinated with `@seta/agent-vector`'s `vector(N)` column dimension.
5. **`onAttempt` hook through `EmbedOptions`.** Not exposed P1. Adding it later is non-breaking; deferred until a concrete consumer needs retry telemetry.

---

## 7. Cross-references

- **SCOPE (binding):** [`platform/agent/embeddings/SCOPE.md`](../../../platform/agent/embeddings/SCOPE.md)
- **Sibling design doc (pattern reference):** [`docs/superpowers/specs/2026-05-13-agent-chunking-design.md`](./2026-05-13-agent-chunking-design.md)
- **Mastra reference (decisions consulted, not ported):**
  - `D:/Work/mastra/packages/rag/src/utils/vector-search.ts:65-93` — delegates to AI SDK `embedV*` with `maxRetries` passed through; mastra runs no second retry layer.
  - `D:/Work/mastra/packages/core/src/llm/model/embedding-router.ts:92-227` — provider construction; `maxEmbeddingsPerCall: 2048`, `supportsParallelCalls: true`. We diverge for P1 (100, sequential).
- **Setup spec:** [`docs/setup.md`](../../setup.md) §6 (RAG primitives — embeddings pick + 1536d rationale), §11 (`platform/agent/embeddings/` directory placement; dep direction), §13 (`openai@6.37.0` pin), line 1821 (install line).
- **Spike reports:**
  - [`docs/explorations/2026-05-12-mastra-spike/02-agent-core.md`](../../explorations/2026-05-12-mastra-spike/02-agent-core.md) — `withRetry` / `classifyError` / `LlmError` shared infrastructure.
  - [`docs/explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md`](../../explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md) — msw + md5-fixture testkit.
  - [`docs/explorations/2026-05-12-mastra-spike/03-run-loop.md`](../../explorations/2026-05-12-mastra-spike/03-run-loop.md) — abort propagation + transient-error classification.
- **Existing agent-core code referenced:**
  - `platform/agent/core/src/models/openai.ts:27-102` — `mapOpenAIError` (to be promoted to public).
  - `platform/agent/core/src/models/openai.ts:104-115` — `createOpenAIAdapter` / `makeOpenAICompatibleAdapter` split (pattern we copy).
  - `platform/agent/core/src/models/retry.ts` — `withRetry`.
  - `platform/agent/core/src/errors/index.ts` — `LlmError`, `KernelError`.
  - `platform/agent/core/src/errors/classify.ts` — `classifyError`.
  - `platform/agent/core/src/testkit/recording/setup.ts` — `setupLLMRecording`.
- **P1 override notice:** [`docs/explorations/2026-05-12-mastra-spike/README.md`](../../explorations/2026-05-12-mastra-spike/README.md) § "P1 scope override (2026-05-12)".
- **CLAUDE.md conventions:** ESM-only, schema-driven (Zod for boundary), no path aliases, unit tests co-located, integration tests under `tests/integration/`, no live LLM in CI, never hand-edit `package.json`.
