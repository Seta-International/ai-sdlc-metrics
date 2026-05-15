# @seta/agent-embeddings — Plan C: Factory + orchestration with fake-client unit tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose Plan A's constants and Plan B's helpers into the public `createOpenAIEmbeddings(cfg)` factory and the internal `embed(client, texts, opts?)` orchestration loop. Add unit tests using an injected fake OpenAI client. Finalise `src/index.ts` with the full public surface.

**Architecture:** `client.ts` exports two functions — `createOpenAIEmbeddings(cfg)` (public; constructs `new OpenAI({ ...cfg, maxRetries: 0 })`) and `makeEmbeddingsClient(client)` (internal injection seam, not re-exported). `embed.ts` holds the sequential batch loop wrapped in `withRetry`, validates input via `parseInput`, chunks via `chunkBy`, threads `signal` into the SDK, asserts response-length parity, and aggregates `usage`. AbortErrors propagate unmapped; all other SDK errors flow through `mapOpenAIError`.

**Tech Stack:** TypeScript ESM, Vitest, `openai@6.37.0`, `@seta/agent-core` (`withRetry`, `LlmError`, `mapOpenAIError`).

**Spec:** [`docs/superpowers/specs/2026-05-14-agent-embeddings-design.md`](../specs/2026-05-14-agent-embeddings-design.md) §1 (public surface), §2 (algorithm + behaviour matrix).

**Prereqs:** Plans A + B complete.

---

## File Structure

Additions and changes in this plan:

```
platform/agent/embeddings/
└── src/
    ├── client.ts               # createOpenAIEmbeddings + makeEmbeddingsClient + types
    ├── client.test.ts          # construction sanity test
    ├── embed.ts                # orchestration: embed(client, texts, opts?)
    ├── embed.test.ts           # unit tests with injected fake client
    └── index.ts                # UPDATED — full public surface
```

`makeEmbeddingsClient` is exported from `client.ts` for test access via direct module import — it is **not** re-exported from `src/index.ts`. The public surface stays `createOpenAIEmbeddings` plus the four constants plus the types.

---

### Task C1: Define types + factory + injection seam

**Files:**
- Create: `platform/agent/embeddings/src/client.ts`
- Create: `platform/agent/embeddings/src/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `platform/agent/embeddings/src/client.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { createOpenAIEmbeddings, makeEmbeddingsClient } from './client'

describe('createOpenAIEmbeddings', () => {
  test('returns an EmbeddingsClient with an `embed` method', () => {
    const c = createOpenAIEmbeddings({ apiKey: 'sk-test' })
    expect(typeof c.embed).toBe('function')
  })

  test('accepts baseURL and timeoutMs overrides without throwing', () => {
    expect(() =>
      createOpenAIEmbeddings({
        apiKey: 'sk-test',
        baseURL: 'https://custom.example/v1',
        timeoutMs: 10_000,
      }),
    ).not.toThrow()
  })
})

describe('makeEmbeddingsClient', () => {
  test('accepts a minimal OpenAI-shaped client object', () => {
    // Minimal shape — sufficient for makeEmbeddingsClient's construction,
    // not exercised here (Task C2 covers the embed call path).
    const fake = { embeddings: { create: async () => ({ data: [], usage: {} }) } } as unknown as Parameters<typeof makeEmbeddingsClient>[0]
    const c = makeEmbeddingsClient(fake)
    expect(typeof c.embed).toBe('function')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

```powershell
pnpm --filter @seta/agent-embeddings test:unit
```

Expected: FAIL with `Cannot find module './client'`.

- [ ] **Step 3: Implement `client.ts`**

Create `platform/agent/embeddings/src/client.ts`:

```ts
import OpenAI from 'openai'
import { embed } from './embed'

export interface EmbeddingsConfig {
  apiKey: string
  baseURL?: string
  timeoutMs?: number
}

export interface EmbedOptions {
  signal?: AbortSignal
}

export interface EmbedUsage {
  promptTokens: number
  totalTokens: number
}

export interface EmbedResult {
  embeddings: number[][]
  usage: EmbedUsage
}

export interface EmbeddingsClient {
  embed(texts: string[], opts?: EmbedOptions): Promise<EmbedResult>
}

export function createOpenAIEmbeddings(cfg: EmbeddingsConfig): EmbeddingsClient {
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    ...(cfg.baseURL !== undefined ? { baseURL: cfg.baseURL } : {}),
    maxRetries: 0,
    timeout: cfg.timeoutMs ?? 60_000,
  })
  return makeEmbeddingsClient(client)
}

// Internal injection seam — NOT re-exported from `src/index.ts`. Consumed by
// `embed.test.ts` with a fake `OpenAI`-shaped object.
export function makeEmbeddingsClient(client: OpenAI): EmbeddingsClient {
  return {
    embed: (texts, opts) => embed(client, texts, opts),
  }
}
```

Note: importing `embed` from `./embed` creates a forward dependency on a file that does not yet exist. The test will fail in Step 4 because of that missing module — fine; Task C2 fills it in.

- [ ] **Step 4: Run the test and observe the expected failure**

```powershell
pnpm --filter @seta/agent-embeddings test:unit
```

Expected: FAIL with `Cannot find module './embed'`. This is intentional. Do **not** create a `embed.ts` stub here — Task C2 ships `embed.ts` together with its own tests (TDD discipline).

- [ ] **Step 5: Comment out the `embed` import temporarily so `client.test.ts` can pass**

Edit `client.ts`: comment out the import and replace `embed` reference in `makeEmbeddingsClient` with a thrown-stub:

```ts
// import { embed } from './embed' // re-enabled in Task C2

// ...

export function makeEmbeddingsClient(client: OpenAI): EmbeddingsClient {
  return {
    embed: () => {
      throw new Error('embed orchestration ships in Task C2')
    },
  }
}
```

Then re-run:

```powershell
pnpm --filter @seta/agent-embeddings test:unit
```

Expected: `client` tests PASS (they don't call `.embed()`). All earlier tests still PASS. **Do not commit this stub state** — proceed directly to Task C2; the stub is reverted there.

(If you prefer not to comment out the import, an alternative is to scaffold an empty `embed.ts` exporting an `embed` function that throws — but that creates a misleading commit. The temporary-comment approach is cleaner because the next commit replaces both files together.)

---

### Task C2: Implement `embed` orchestration

**Files:**
- Create: `platform/agent/embeddings/src/embed.ts`
- Create: `platform/agent/embeddings/src/embed.test.ts`
- Modify: `platform/agent/embeddings/src/client.ts` (re-enable the import; remove stub)

- [ ] **Step 1: Write the failing test**

Create `platform/agent/embeddings/src/embed.test.ts`:

```ts
import { LlmError } from '@seta/agent-core'
import OpenAI from 'openai'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { makeEmbeddingsClient } from './client'

// Minimal in-test fake of the OpenAI SDK's embeddings.create shape.
// We don't subclass `OpenAI` — we build an object literal cast to `OpenAI`
// and only `embeddings.create` is ever called.
type CreateArgs = Parameters<OpenAI['embeddings']['create']>[0]
type CreateOpts = Parameters<OpenAI['embeddings']['create']>[1]
type CreateResp = Awaited<ReturnType<OpenAI['embeddings']['create']>>

function makeFakeClient(create: (args: CreateArgs, opts?: CreateOpts) => Promise<CreateResp>) {
  return { embeddings: { create } } as unknown as OpenAI
}

function fakeEmbedding(dim = 4, seed = 0): number[] {
  return Array.from({ length: dim }, (_, i) => seed + i * 0.001)
}

function fakeResponse(inputs: string[], promptTokens = 7, totalTokens = 7): CreateResp {
  return {
    object: 'list',
    data: inputs.map((_, i) => ({
      object: 'embedding',
      index: i,
      embedding: fakeEmbedding(4, i),
    })),
    model: 'text-embedding-3-small',
    usage: { prompt_tokens: promptTokens, total_tokens: totalTokens },
  } as unknown as CreateResp
}

// ---- vi.useFakeTimers controls the withRetry backoff to keep tests fast.
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('embed — happy paths', () => {
  test('empty input short-circuits without calling the SDK', async () => {
    const create = vi.fn(async () => fakeResponse([]))
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const r = await client.embed([])
    expect(r.embeddings).toEqual([])
    expect(r.usage).toEqual({ promptTokens: 0, totalTokens: 0 })
    expect(create).not.toHaveBeenCalled()
  })

  test('single batch (3 inputs) → one create call, ordered embeddings, usage forwarded', async () => {
    const create = vi.fn(async (args: CreateArgs) => {
      const inputs = args.input as string[]
      return fakeResponse(inputs, 13, 13)
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const r = await client.embed(['a', 'b', 'c'])
    expect(create).toHaveBeenCalledTimes(1)
    expect(r.embeddings).toHaveLength(3)
    expect(r.embeddings[0]).toEqual(fakeEmbedding(4, 0))
    expect(r.embeddings[1]).toEqual(fakeEmbedding(4, 1))
    expect(r.embeddings[2]).toEqual(fakeEmbedding(4, 2))
    expect(r.usage).toEqual({ promptTokens: 13, totalTokens: 13 })
  })

  test('multi-batch (250 inputs) → 3 sequential create calls, usage aggregated', async () => {
    const calls: number[] = []
    const create = vi.fn(async (args: CreateArgs) => {
      const inputs = args.input as string[]
      calls.push(inputs.length)
      return fakeResponse(inputs, 10, 10)
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const inputs = Array.from({ length: 250 }, (_, i) => `text-${i}`)
    const r = await client.embed(inputs)
    expect(create).toHaveBeenCalledTimes(3)
    expect(calls).toEqual([100, 100, 50])
    expect(r.embeddings).toHaveLength(250)
    expect(r.usage).toEqual({ promptTokens: 30, totalTokens: 30 })
  })

  test('passes `signal` from EmbedOptions into client.embeddings.create', async () => {
    const ac = new AbortController()
    const create = vi.fn(async (args: CreateArgs, opts?: CreateOpts) => {
      expect(opts?.signal).toBe(ac.signal)
      return fakeResponse(args.input as string[])
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    await client.embed(['x'], { signal: ac.signal })
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('embed — validation failures', () => {
  test('blank string throws LlmError(LLM_BAD_REQUEST, USER) without calling SDK', async () => {
    const create = vi.fn(async () => fakeResponse([]))
    const client = makeEmbeddingsClient(makeFakeClient(create))
    await expect(client.embed(['', 'ok'])).rejects.toBeInstanceOf(LlmError)
    expect(create).not.toHaveBeenCalled()
  })

  test('whitespace-only string throws LlmError', async () => {
    const create = vi.fn(async () => fakeResponse([]))
    const client = makeEmbeddingsClient(makeFakeClient(create))
    await expect(client.embed(['   '])).rejects.toBeInstanceOf(LlmError)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('embed — error mapping', () => {
  // OpenAI.APIError constructor signature in openai@6.x:
  //   new APIError(status, error, message, headers)
  // We construct it directly so `instanceof OpenAI.APIError` succeeds inside
  // `mapOpenAIError` and `.status` is the top-level property `classifyError` reads.
  function apiError(status: number, message: string): OpenAI.APIError {
    return new OpenAI.APIError(
      status,
      { error: { message } },
      message,
      undefined as unknown as Headers,
    )
  }

  test('non-retryable 401 from SDK → LlmError(LLM_AUTH_FAILED), no retry', async () => {
    const create = vi.fn(async () => {
      throw apiError(401, 'unauthorized')
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const pending = client.embed(['x']).catch((e) => e)
    await vi.runAllTimersAsync()
    const got = (await pending) as LlmError
    expect(got).toBeInstanceOf(LlmError)
    expect(got.code).toBe('LLM_AUTH_FAILED')
    // classifyError sees status=401 → terminal → withRetry throws after first attempt.
    expect(create).toHaveBeenCalledTimes(1)
  })

  test('retryable 429 from SDK → withRetry retries up to 2 times then surfaces LlmError(LLM_RATE_LIMITED)', async () => {
    const create = vi.fn(async () => {
      throw apiError(429, 'rate limited')
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const pending = client.embed(['x']).catch((e) => e)
    await vi.runAllTimersAsync()
    const got = (await pending) as LlmError
    expect(got).toBeInstanceOf(LlmError)
    expect(got.code).toBe('LLM_RATE_LIMITED')
    // classifyError sees status=429 → transient → 1 initial + 2 retries = 3 calls.
    expect(create).toHaveBeenCalledTimes(3)
  })

  test('response-length mismatch throws LlmError(LLM_UNKNOWN, THIRD_PARTY)', async () => {
    const create = vi.fn(async (args: CreateArgs) => {
      const inputs = args.input as string[]
      // Return only the first embedding — simulate broken provider
      return fakeResponse(inputs.slice(0, 1))
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const pending = client.embed(['a', 'b']).catch((e) => e)
    await vi.runAllTimersAsync()
    const got = (await pending) as LlmError
    expect(got).toBeInstanceOf(LlmError)
    expect(got.code).toBe('LLM_UNKNOWN')
    expect(got.category).toBe('THIRD_PARTY')
  })
})

describe('embed — abort behaviour', () => {
  test('pre-aborted signal throws DOMException(AbortError) before any SDK call', async () => {
    const ac = new AbortController()
    ac.abort()
    const create = vi.fn(async () => fakeResponse([]))
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const pending = client.embed(['x'], { signal: ac.signal }).catch((e) => e)
    await vi.runAllTimersAsync()
    const got = await pending
    // Must NOT be mapped to LlmError.
    expect(got).not.toBeInstanceOf(LlmError)
    expect((got as { name?: string }).name).toBe('AbortError')
    expect(create).not.toHaveBeenCalled()
  })

  test('AbortError thrown by SDK mid-flight propagates unmapped', async () => {
    const create = vi.fn(async () => {
      const e = new Error('aborted')
      e.name = 'AbortError'
      throw e
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const pending = client.embed(['x']).catch((e) => e)
    await vi.runAllTimersAsync()
    const got = await pending
    // Outer catch in embed.ts sees name === 'AbortError' and re-throws unmapped.
    expect(got).not.toBeInstanceOf(LlmError)
    expect((got as { name?: string }).name).toBe('AbortError')
    // withRetry classified `AbortError` as terminal (no `.status`), so only 1 call.
    expect(create).toHaveBeenCalledTimes(1)
  })

  test('signal aborted between batches → throws before next batch starts', async () => {
    const ac = new AbortController()
    let callIdx = 0
    const create = vi.fn(async (args: CreateArgs) => {
      callIdx++
      if (callIdx === 1) {
        // After batch 1 completes successfully, the caller aborts.
        ac.abort()
        return fakeResponse(args.input as string[])
      }
      return fakeResponse(args.input as string[])
    })
    const client = makeEmbeddingsClient(makeFakeClient(create))
    const inputs = Array.from({ length: 150 }, (_, i) => `t-${i}`)
    const pending = client.embed(inputs, { signal: ac.signal }).catch((e) => e)
    await vi.runAllTimersAsync()
    const got = await pending
    // Exactly 1 call: batch 1 ran, between-batch check threw before batch 2.
    expect(create).toHaveBeenCalledTimes(1)
    expect((got as { name?: string }).name).toBe('AbortError')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

```powershell
pnpm --filter @seta/agent-embeddings test:unit
```

Expected: FAIL with `Cannot find module './embed'`.

- [ ] **Step 3: Implement `embed.ts`**

Create `platform/agent/embeddings/src/embed.ts`:

```ts
import { LlmError, mapOpenAIError, withRetry } from '@seta/agent-core'
import type OpenAI from 'openai'
import { chunkBy } from './batch'
import type { EmbedOptions, EmbedResult } from './client'
import { EMBEDDING_BATCH_SIZE, EMBEDDING_MODEL } from './constants'
import { parseInput } from './parse-input'

export async function embed(
  client: OpenAI,
  texts: string[],
  opts?: EmbedOptions,
): Promise<EmbedResult> {
  if (texts.length === 0) {
    return { embeddings: [], usage: { promptTokens: 0, totalTokens: 0 } }
  }
  parseInput(texts)

  const signal = opts?.signal ?? new AbortController().signal
  const out: number[][] = []
  let promptTokens = 0
  let totalTokens = 0

  for (const batch of chunkBy(texts, EMBEDDING_BATCH_SIZE)) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')

    let res: Awaited<ReturnType<OpenAI['embeddings']['create']>>
    try {
      // Throw the RAW SDK error to withRetry so `classifyError` reads
      // `err.status` (OpenAI.APIError has it as a top-level property and
      // is the only thing classifyError understands today). Mapping
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

Notes:
- **Retry classification depends on raw `err.status`.** `@seta/agent-core`'s `classifyError` (`platform/agent/core/src/errors/classify.ts:12-20`) reads `err.status` directly. `OpenAI.APIError` instances expose `.status` as a top-level property, but a mapped `LlmError` would put status inside `.details.status` — invisible to `classifyError`. Therefore the retry callback throws the **raw** SDK error and the outer `catch` maps to `LlmError` only after `withRetry` gives up. This preserves both the contract (caller sees `LlmError`) and the retry behaviour (429/5xx → transient).
- The `Promise<EmbedResult>` type comes from `./client`. `client.ts` already imports `embed` from `./embed` (Task C1) — the cycle is fine because `client.ts` only imports the `embed` function at the value level, and `embed.ts` imports types from `client.ts` via `import type` which is erased at runtime.
- `new AbortController().signal` as the default ensures `signal` is always defined; the controller is never aborted, so `signal.aborted` stays `false`.
- The behaviour of `withRetry` (`maxRetries + 1` total attempts on transient errors) is what produces 3 total calls on the persistent-429 test.
- **AbortError carve-out is in the outer `catch`, not inside the retry callback.** `withRetry`'s own logic short-circuits on `signal.aborted` before classification, so the raw `AbortError` already escapes correctly; the outer `catch` re-throws it unmapped.

- [ ] **Step 4: Re-enable the import in `client.ts`**

Open `platform/agent/embeddings/src/client.ts`. Reverse the temporary stub from Task C1 Step 5:

Restore the line:

```ts
import { embed } from './embed'
```

And restore `makeEmbeddingsClient`:

```ts
export function makeEmbeddingsClient(client: OpenAI): EmbeddingsClient {
  return {
    embed: (texts, opts) => embed(client, texts, opts),
  }
}
```

- [ ] **Step 5: Run the tests and verify they pass**

```powershell
pnpm --filter @seta/agent-embeddings test:unit
```

Expected: all `embed` tests (10) + `client` tests (3) + earlier tests PASS. Tests run fast because `vi.useFakeTimers()` short-circuits `withRetry`'s `setTimeout` backoff.

If any test hangs longer than ~2 seconds, the fake-timers setup is wrong — verify the `beforeEach(() => vi.useFakeTimers())` is at file scope (not nested inside a `describe`). The `vi.runAllTimersAsync()` calls in retry tests are what advance simulated time past the backoff.

- [ ] **Step 6: Run typecheck and lint**

```powershell
pnpm --filter @seta/agent-embeddings typecheck
pnpm --filter @seta/agent-embeddings lint
```

Both must pass. Likely Biome flag: the `as unknown as` cast in the fake-client helper — accept it; the cast is the documented seam for fakes of complex SDK types.

- [ ] **Step 7: Commit**

```powershell
git add platform/agent/embeddings/src/embed.ts platform/agent/embeddings/src/embed.test.ts platform/agent/embeddings/src/client.ts platform/agent/embeddings/src/client.test.ts
git commit -m "feat(agent-embeddings): add createOpenAIEmbeddings + embed orchestration"
```

---

### Task C3: Finalise `src/index.ts` public surface

**Files:**
- Modify: `platform/agent/embeddings/src/index.ts`

- [ ] **Step 1: Overwrite `src/index.ts`**

Replace the contents of `platform/agent/embeddings/src/index.ts` with:

```ts
export {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MAX_INPUT_TOKENS,
  EMBEDDING_MODEL,
} from './constants'

export { createOpenAIEmbeddings } from './client'

export type {
  EmbedOptions,
  EmbedResult,
  EmbedUsage,
  EmbeddingsClient,
  EmbeddingsConfig,
} from './client'
```

Five types + five values + one factory function. `parseInput`, `chunkBy`, `embed`, and `makeEmbeddingsClient` stay internal.

- [ ] **Step 2: Write a small public-surface test**

Create `platform/agent/embeddings/src/index.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import * as api from './index'

describe('public surface', () => {
  test('exports the factory and constants', () => {
    expect(typeof api.createOpenAIEmbeddings).toBe('function')
    expect(api.EMBEDDING_MODEL).toBe('text-embedding-3-small')
    expect(api.EMBEDDING_DIMENSIONS).toBe(1536)
    expect(api.EMBEDDING_BATCH_SIZE).toBe(100)
    expect(api.EMBEDDING_MAX_INPUT_TOKENS).toBe(8191)
  })

  test('does not leak internals (parseInput / chunkBy / embed / makeEmbeddingsClient)', () => {
    expect((api as Record<string, unknown>).parseInput).toBeUndefined()
    expect((api as Record<string, unknown>).chunkBy).toBeUndefined()
    expect((api as Record<string, unknown>).embed).toBeUndefined()
    expect((api as Record<string, unknown>).makeEmbeddingsClient).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the tests and verify they pass**

```powershell
pnpm --filter @seta/agent-embeddings test:unit
```

Expected: all tests including the new `public surface` set PASS.

- [ ] **Step 4: Run typecheck, lint, build**

```powershell
pnpm --filter @seta/agent-embeddings typecheck
pnpm --filter @seta/agent-embeddings lint
pnpm --filter @seta/agent-embeddings build
```

All three must pass. Check `dist/index.d.ts` contains:
- `export declare function createOpenAIEmbeddings(cfg: EmbeddingsConfig): EmbeddingsClient`
- `export declare const EMBEDDING_MODEL: "text-embedding-3-small"`
- the four type aliases (`EmbedOptions`, `EmbedResult`, `EmbedUsage`, `EmbeddingsClient`, `EmbeddingsConfig`)

If types are missing, tsup likely missed transitive type exports — re-run build with `--clean`:

```powershell
pnpm --filter @seta/agent-embeddings build --clean
```

- [ ] **Step 5: Commit**

```powershell
git add platform/agent/embeddings/src/index.ts platform/agent/embeddings/src/index.test.ts
git commit -m "feat(agent-embeddings): freeze public surface (factory, types, constants)"
```

---

## End-of-plan verification

After Task C3:

```powershell
pnpm --filter @seta/agent-embeddings typecheck
pnpm --filter @seta/agent-embeddings lint
pnpm --filter @seta/agent-embeddings test:unit
pnpm --filter @seta/agent-embeddings build
```

All four must pass.

The package is now feature-complete for unit-test purposes: the orchestration loop, retry, abort, validation, error mapping, and aggregation are all exercised against an injected fake. The only thing Plan D adds is verification against the actual OpenAI HTTP contract via msw recordings.

Test counts at end of Plan C: at least **40** unit tests passing (5 constants + 12 parseInput + 8 batch + 3 client + 12 embed + 2 index = 42; small drift OK if tests get split during implementation).
