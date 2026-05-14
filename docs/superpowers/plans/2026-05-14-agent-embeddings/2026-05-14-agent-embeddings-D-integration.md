# @seta/agent-embeddings — Plan D: Integration tests via setupLLMRecording

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an integration test suite that exercises `createOpenAIEmbeddings(...).embed(...)` against `api.openai.com/v1/embeddings` via `setupLLMRecording` from `@seta/agent-core/testkit`. Cover 6 scenarios spanning happy path, multi-batch ordering, terminal error (401), retryable error (429 → succeed), abort, and empty-input short-circuit. Record fixtures once and commit them to git so CI replays without network access.

**Architecture:** msw intercepts `api.openai.com/v1/embeddings`, replays fixtures from `tests/integration/__recordings__/*.json`. `RECORD=1` re-captures missing fixtures via real OpenAI calls. The default mode is strict replay — CI never hits the network. Each test gates on `shouldRun(name)` (recording exists OR `RECORD` env var set) so the suite is green even before fixtures are captured.

**Tech Stack:** Vitest, msw (transitively via `@seta/agent-core/testkit`), `openai@6.37.0`.

**Spec:** [`docs/superpowers/specs/2026-05-14-agent-embeddings-design.md`](../specs/2026-05-14-agent-embeddings-design.md) §3 (integration tests), §4 (file layout).

**Prereqs:** Plans A + B + C complete.

---

## File Structure

Additions in this plan:

```
platform/agent/embeddings/
├── package.json                # +1 script: "test:integration"
├── vitest.config.ts            # extended with projects: unit + integration
└── tests/
    └── integration/
        ├── embed.integration.test.ts
        └── __recordings__/                       # checked into git after Task D4
            ├── embed-single-batch-ok.json
            ├── embed-multi-batch-ok.json
            ├── embed-auth-failed.json
            ├── embed-rate-limited-then-ok.json
            └── embed-abort-midflight.json
            # empty-input scenario produces no recording (no HTTP call)
```

---

### Task D1: Extend `vitest.config.ts` and add `test:integration` script

**Files:**
- Modify: `platform/agent/embeddings/vitest.config.ts`
- Modify: `platform/agent/embeddings/package.json` (via CLI only)

- [ ] **Step 1: Inspect how agent-core wires its integration project**

Reference file: `platform/agent/core/vitest.config.ts`. Read it; replicate the same shape but scoped to our package.

In particular, `platform/agent/core/package.json`'s scripts include:

```json
"test:unit": "vitest run src/",
"test:integration": "vitest run tests/"
```

That dual-glob pattern is what we mirror — no need for `vitest projects` configuration; the script-level glob is sufficient.

- [ ] **Step 2: Update `vitest.config.ts` (no change required if scaffolder output already works)**

Open `platform/agent/embeddings/vitest.config.ts`. After Plan A it reads:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: '@seta/agent-embeddings' },
})
```

No edits needed — both `vitest run src/` (unit) and `vitest run tests/` (integration) use the same config; the `name` is the only required setting. If the file differs from the above, restore it to that exact content.

- [ ] **Step 3: Update `package.json` scripts via CLI**

The scaffolder already wrote `test:unit` as `vitest run`. Narrow it to `vitest run src/` and add `test:integration` for `vitest run tests/`:

```powershell
pnpm --filter @seta/agent-embeddings pkg set scripts.test:unit='vitest run src/'
pnpm --filter @seta/agent-embeddings pkg set scripts.test:integration='vitest run tests/'
```

Verify by reading `platform/agent/embeddings/package.json`. The `scripts` block must contain:

```json
{
  "test:unit": "vitest run src/",
  "test:integration": "vitest run tests/"
}
```

- [ ] **Step 4: Confirm unit tests still run under the narrowed glob**

```powershell
pnpm --filter @seta/agent-embeddings test:unit
```

Expected: all Plan A/B/C tests still PASS.

- [ ] **Step 5: Run `test:integration` (no tests yet)**

```powershell
pnpm --filter @seta/agent-embeddings test:integration
```

Expected: "No test files found, matching ..." — that's fine. Vitest exits with code 1 in some versions; treat as warning, not error. Task D2 adds the test file.

- [ ] **Step 6: Commit**

```powershell
git add platform/agent/embeddings/package.json platform/agent/embeddings/vitest.config.ts
git commit -m "feat(agent-embeddings): add test:integration script + narrowed test:unit glob"
```

---

### Task D2: Add integration test file with all 6 scenarios

**Files:**
- Create: `platform/agent/embeddings/tests/integration/embed.integration.test.ts`

- [ ] **Step 1: Create the integration test file**

Create `platform/agent/embeddings/tests/integration/embed.integration.test.ts`:

```ts
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LlmError } from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenAIEmbeddings, EMBEDDING_BATCH_SIZE } from '../../src'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RECORDINGS_DIR = path.resolve(__dirname, '__recordings__')

function hasRecording(name: string): boolean {
  return existsSync(path.join(RECORDINGS_DIR, `${name}.json`))
}

function shouldRun(name: string): boolean {
  return process.env.RECORD !== undefined || hasRecording(name)
}

function buildClient() {
  return createOpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY ?? 'sk-test',
  })
}

let recording = setupLLMRecording({ name: 'unused', recordingsDir: RECORDINGS_DIR })

describe('@seta/agent-embeddings — integration (replay)', () => {
  afterEach(() => recording.stop())

  it.skipIf(!shouldRun('embed-single-batch-ok'))(
    'single batch (≤100 inputs) returns ordered embeddings and usage',
    async () => {
      recording = setupLLMRecording({
        name: 'embed-single-batch-ok',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      const client = buildClient()
      const r = await client.embed(['the quick brown fox', 'jumps over the lazy dog'])
      expect(r.embeddings).toHaveLength(2)
      expect(r.embeddings[0]).toHaveLength(1536)
      expect(r.embeddings[1]).toHaveLength(1536)
      expect(r.usage.promptTokens).toBeGreaterThan(0)
      expect(r.usage.totalTokens).toBeGreaterThanOrEqual(r.usage.promptTokens)
    },
  )

  it.skipIf(!shouldRun('embed-multi-batch-ok'))(
    'multi-batch (250 inputs) produces 3 sequential calls with aggregated usage',
    async () => {
      recording = setupLLMRecording({
        name: 'embed-multi-batch-ok',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      const client = buildClient()
      // 2 full batches of 100 + 1 partial batch of 50.
      const inputs = Array.from({ length: 250 }, (_, i) => `text fragment ${i}`)
      const r = await client.embed(inputs)
      expect(r.embeddings).toHaveLength(250)
      // Sanity: first and last embeddings differ (different inputs).
      expect(r.embeddings[0]).not.toEqual(r.embeddings.at(-1))
      // Usage is the sum across 3 batches — strictly positive.
      expect(r.usage.promptTokens).toBeGreaterThan(0)
      // Confirm batch size constant is what we think.
      expect(EMBEDDING_BATCH_SIZE).toBe(100)
    },
    30_000,
  )

  it.skipIf(!shouldRun('embed-auth-failed'))(
    'bad API key surfaces as LlmError(LLM_AUTH_FAILED) — terminal, no retry',
    async () => {
      recording = setupLLMRecording({
        name: 'embed-auth-failed',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      // To capture this fixture: temporarily set OPENAI_API_KEY to an
      // invalid value (e.g. "sk-invalid"). After recording, replay uses
      // the fixture regardless of the env var.
      const client = createOpenAIEmbeddings({
        apiKey: process.env.OPENAI_API_KEY ?? 'sk-invalid',
      })
      let caught: unknown
      try {
        await client.embed(['hello'])
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(LlmError)
      const le = caught as LlmError
      expect(le.code).toBe('LLM_AUTH_FAILED')
      expect(le.domain).toBe('LLM')
    },
  )

  it.skipIf(!shouldRun('embed-rate-limited-then-ok'))(
    '429 then 200 — withRetry consumes the first failure and succeeds',
    async () => {
      recording = setupLLMRecording({
        name: 'embed-rate-limited-then-ok',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      // Use fake timers so withRetry's backoff sleep doesn't slow the suite.
      vi.useFakeTimers()
      try {
        const client = buildClient()
        const pending = client.embed(['hello']).catch((e) => e)
        await vi.runAllTimersAsync()
        const got = await pending
        // If retry succeeded, `got` is an EmbedResult.
        expect(got).toMatchObject({
          embeddings: expect.any(Array),
          usage: expect.objectContaining({
            promptTokens: expect.any(Number),
            totalTokens: expect.any(Number),
          }),
        })
        expect((got as { embeddings: number[][] }).embeddings[0]).toHaveLength(1536)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it.skipIf(!shouldRun('embed-abort-midflight'))(
    'abort mid-request — SDK surfaces AbortError and we re-throw unmapped',
    async () => {
      recording = setupLLMRecording({
        name: 'embed-abort-midflight',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      const ac = new AbortController()
      const client = buildClient()
      // Trigger abort on the next microtask so the fetch is in flight.
      queueMicrotask(() => ac.abort())
      let caught: unknown
      try {
        await client.embed(['hello'], { signal: ac.signal })
      } catch (e) {
        caught = e
      }
      // Must NOT be an LlmError — confirms AbortError carve-out works.
      expect(caught).not.toBeInstanceOf(LlmError)
      // Best-effort shape check: name is AbortError.
      const err = caught as { name?: string } | null
      expect(err?.name).toBe('AbortError')
    },
  )

  it('empty input array short-circuits without any HTTP call', async () => {
    // No recording started — if any HTTP call were made, msw would not be
    // installed and the test would still pass; but `setupLLMRecording` not
    // being active means a real fetch could leak in. To make this test
    // unambiguous, start a recording with an obviously-wrong fixture name
    // — any HTTP request would miss in replay mode and throw.
    recording = setupLLMRecording({
      name: 'embed-empty-input-MUST-NOT-RECORD',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()
    const client = buildClient()
    const r = await client.embed([])
    expect(r.embeddings).toEqual([])
    expect(r.usage).toEqual({ promptTokens: 0, totalTokens: 0 })
    // Confirm no fixture file was written (no HTTP call made).
    expect(hasRecording('embed-empty-input-MUST-NOT-RECORD')).toBe(false)
  })
})
```

- [ ] **Step 2: Run integration tests in default (replay) mode — all should skip**

```powershell
pnpm --filter @seta/agent-embeddings test:integration
```

Expected: 5 tests `SKIPPED` (`it.skipIf` because no fixtures exist) + 1 test PASS (the empty-input case, which doesn't depend on recording presence). Total: 1 passed, 5 skipped, 0 failed.

If any test fails with "no matching recording" instead of skipping, `shouldRun` is wrong — re-read the function and confirm `process.env.RECORD !== undefined || hasRecording(name)` evaluates to `false` when both conditions are absent.

- [ ] **Step 3: Run typecheck and lint**

```powershell
pnpm --filter @seta/agent-embeddings typecheck
pnpm --filter @seta/agent-embeddings lint
```

Both must pass. Common Biome flags:
- `as { name?: string } | null` cast — accept; the caught value is genuinely `unknown`.
- `vi.useFakeTimers()` inside the test — accept; the fake-timer pattern matches Plan C's unit tests.

- [ ] **Step 4: Commit (no fixtures yet — tests skip in replay)**

```powershell
git add platform/agent/embeddings/tests/integration/embed.integration.test.ts
git commit -m "feat(agent-embeddings): add integration test scenarios (replay-mode skipped until D3)"
```

---

### Task D3: Record fixtures from real OpenAI API

**Files:**
- Create: 5 files under `platform/agent/embeddings/tests/integration/__recordings__/*.json`

- [ ] **Step 1: Confirm `OPENAI_API_KEY` is available**

```powershell
if ($env:OPENAI_API_KEY) { 'set' } else { 'MISSING' }
```

Expected: `set`. If MISSING, obtain a key (this is a one-time recording capture; the key never enters CI). Set it in the current shell:

```powershell
$env:OPENAI_API_KEY = '<your-key>'
```

If no key is available, **stop here** and ask the user. The fixtures cannot be captured without one. The previous commit's skip-mode behaviour means CI is green either way; this task simply cannot complete without a key.

- [ ] **Step 2: Record the four happy/error fixtures**

```powershell
$env:RECORD = '1'
pnpm --filter @seta/agent-embeddings test:integration -t 'single batch'
pnpm --filter @seta/agent-embeddings test:integration -t 'multi-batch'
pnpm --filter @seta/agent-embeddings test:integration -t 'abort mid-request'
```

Expected: three new files in `tests/integration/__recordings__/`:
- `embed-single-batch-ok.json`
- `embed-multi-batch-ok.json`
- `embed-abort-midflight.json`

Each file should be valid JSON with a top-level `meta` and `recordings[]`. Open one and confirm `meta.provider` is `'openai'` and `meta.model` is `'text-embedding-3-small'`.

- [ ] **Step 3: Record the auth-failure fixture**

This one needs a bad key. Temporarily override:

```powershell
$env:OPENAI_API_KEY_BACKUP = $env:OPENAI_API_KEY
$env:OPENAI_API_KEY = 'sk-invalid-for-recording'
pnpm --filter @seta/agent-embeddings test:integration -t 'bad API key'
$env:OPENAI_API_KEY = $env:OPENAI_API_KEY_BACKUP
Remove-Item Env:OPENAI_API_KEY_BACKUP
```

Expected: `embed-auth-failed.json` created with `recordings[0].response.status === 401`.

- [ ] **Step 4: Record the rate-limit-then-recover fixture**

This is the only fixture that doesn't naturally occur from a normal API call. Hand-author it.

Run the happy-path single-batch test once more to capture a 200 response we can reuse:

```powershell
$env:RECORD = '1'
pnpm --filter @seta/agent-embeddings test:integration -t 'single batch'
Remove-Item Env:RECORD
```

Then create `platform/agent/embeddings/tests/integration/__recordings__/embed-rate-limited-then-ok.json` by hand. Copy the structure from `embed-single-batch-ok.json` and prepend a synthetic 429 recording. The file must contain TWO entries with the SAME `request.hash` so `withRetry`'s second attempt hits the second recording:

Open `embed-single-batch-ok.json`. Note the `recordings[0].hash`, `recordings[0].request`, and `recordings[0].response.body`. In the new file:

```json
{
  "meta": {
    "name": "embed-rate-limited-then-ok",
    "createdAt": "2026-05-14T00:00:00.000Z",
    "provider": "openai",
    "model": "text-embedding-3-small"
  },
  "recordings": [
    {
      "hash": "<COPY FROM embed-single-batch-ok.json recordings[0].hash>",
      "request": <COPY FROM embed-single-batch-ok.json recordings[0].request>,
      "response": {
        "status": 429,
        "statusText": "Too Many Requests",
        "headers": { "content-type": "application/json" },
        "body": { "error": { "message": "Rate limit reached", "type": "rate_limit_exceeded", "code": "rate_limit_exceeded" } },
        "isStreaming": false
      }
    },
    {
      "hash": "<SAME hash as above>",
      "request": <SAME request as above>,
      "response": <COPY FROM embed-single-batch-ok.json recordings[0].response>
    }
  ]
}
```

The msw `lookupRecording` returns the **first** match by hash; after consumption it would normally serve the same recording again, but the recording-replay logic in `platform/agent/core/src/testkit/recording/setup.ts:189` is `find` — first hit always wins. Therefore the 429-then-200 sequence requires a **bespoke server middleware**, which the testkit does not currently provide.

**Decision point:** if exercising the retry path against real msw replay is more work than its value, downgrade this test to a unit test instead. The unit test in Plan C `embed.test.ts` already covers `429 → withRetry retries up to 2 times then surfaces LLM_RATE_LIMITED` against a fake client, which is the load-bearing assertion. Delete the integration-level retry test and its fixture, and remove the `it.skipIf(...)` block from `embed.integration.test.ts`.

- [ ] **Step 4b: If you delete the retry integration test, commit the deletion**

```powershell
# In embed.integration.test.ts, remove the `it.skipIf(!shouldRun('embed-rate-limited-then-ok'))(...)` block entirely.
```

Then proceed without `embed-rate-limited-then-ok.json`.

- [ ] **Step 5: Verify all recorded fixtures replay green**

Unset `RECORD` and run integration tests in strict-replay mode:

```powershell
Remove-Item Env:RECORD -ErrorAction SilentlyContinue
pnpm --filter @seta/agent-embeddings test:integration
```

Expected: 5 tests PASS (4 recorded + 1 empty-input short-circuit). If the retry test was deleted in D4b, expected is 4 PASS.

- [ ] **Step 6: Commit fixtures**

```powershell
git add platform/agent/embeddings/tests/integration/__recordings__/
git add platform/agent/embeddings/tests/integration/embed.integration.test.ts
git commit -m "test(agent-embeddings): record integration fixtures"
```

---

### Task D4: Final verification

**Files:** (none modified)

- [ ] **Step 1: Run the full test matrix**

```powershell
pnpm --filter @seta/agent-core typecheck
pnpm --filter @seta/agent-core lint
pnpm --filter @seta/agent-core test:unit
pnpm --filter @seta/agent-embeddings typecheck
pnpm --filter @seta/agent-embeddings lint
pnpm --filter @seta/agent-embeddings test:unit
pnpm --filter @seta/agent-embeddings test:integration
pnpm --filter @seta/agent-embeddings build
```

All eight must pass.

- [ ] **Step 2: Confirm the public surface is what the spec promised**

Read `platform/agent/embeddings/dist/index.d.ts`. The file must contain (in some order):

```ts
export declare function createOpenAIEmbeddings(cfg: EmbeddingsConfig): EmbeddingsClient
export interface EmbeddingsConfig { apiKey: string; baseURL?: string; timeoutMs?: number }
export interface EmbedOptions { signal?: AbortSignal }
export interface EmbedUsage { promptTokens: number; totalTokens: number }
export interface EmbedResult { embeddings: number[][]; usage: EmbedUsage }
export interface EmbeddingsClient { embed(texts: string[], opts?: EmbedOptions): Promise<EmbedResult> }
export declare const EMBEDDING_MODEL: "text-embedding-3-small"
export declare const EMBEDDING_DIMENSIONS: 1536
export declare const EMBEDDING_BATCH_SIZE: 100
export declare const EMBEDDING_MAX_INPUT_TOKENS: 8191
```

No leaked internals (`parseInput`, `chunkBy`, `embed`, `makeEmbeddingsClient`).

- [ ] **Step 3: Update `platform/agent/embeddings/SCOPE.md`'s "Current state" block**

The current SCOPE.md says "Directory placeholder only. This SCOPE.md exists; no `package.json`, no `src/` lands in this PR." Update that section to reflect the implemented state — see `platform/agent/chunking/SCOPE.md` "Current state (P1)" block for the precedent shape (it lists the public surface and test count).

Edit `platform/agent/embeddings/SCOPE.md`'s "Current state (P1)" section to read approximately:

```markdown
## Current state (P1)

- **Package implemented.** `package.json`, `src/`, `tests/integration/`, and recordings all exist at `platform/agent/embeddings/`.
- Public surface: `createOpenAIEmbeddings`, `EmbeddingsClient`, `EmbeddingsConfig`, `EmbedOptions`, `EmbedResult`, `EmbedUsage`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `EMBEDDING_BATCH_SIZE`, `EMBEDDING_MAX_INPUT_TOKENS`.
- 40+ unit tests pass (constants, parseInput, chunkBy, client, embed orchestration with fake-client, public-surface guard).
- Integration tests cover happy path (single + multi-batch), 401 terminal, abort mid-request, empty-input short-circuit. Fixtures replay deterministically from `tests/integration/__recordings__/`.
- `@seta/agent-core` `mapOpenAIError` is the source of OpenAI SDK → `LlmError` mapping.
```

Keep the rest of SCOPE.md as-is. Don't rewrite "Public interface" or "Patterns to follow" — they're still binding context.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/embeddings/SCOPE.md
git commit -m "docs(agent-embeddings): update SCOPE current-state to reflect implementation"
```

- [ ] **Step 5: Optional — drop the parallel-embeddings-pin note into setup.md**

`docs/setup.md` line 1821 already lists the install line for `openai@6.37.0 zod@4.4.3`. No new pin landed in this package — `openai` and `zod` are existing pins, `@seta/agent-core` is workspace. Verify by reading setup.md §13. No edit required unless §13 is now inaccurate.

---

## End-of-plan verification

After Task D4, the package is feature-complete per the design spec:

```powershell
pnpm --filter @seta/agent-core test:unit
pnpm --filter @seta/agent-embeddings test:unit
pnpm --filter @seta/agent-embeddings test:integration
pnpm --filter @seta/agent-embeddings build
```

All four green. The package is ready to be consumed by `@seta/agent-rag.ingest` and the query-time retrieval path in subsequent PRs.

## Decision recap (so future readers don't re-litigate)

- Sequential batching at `EMBEDDING_BATCH_SIZE = 100`. Parallelism deferred (spec §6 Q3).
- `withRetry` from agent-core owns the retry budget; OpenAI SDK retry is off (`maxRetries: 0`).
- `Retry-After` not honoured — kernel-side follow-up (spec §6 Q1).
- AbortError is the only SDK error not mapped through `mapOpenAIError`.
- Zod boundary rejects empty / whitespace-only strings locally before any HTTP round-trip.
- `mapOpenAIError` lives in `@seta/agent-core` (promoted to public in Plan A) — embeddings imports it, doesn't duplicate.
