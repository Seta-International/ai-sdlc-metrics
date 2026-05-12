# `@seta/agent-core` K1.5 — LLM recording testkit design

**Status:** Draft
**Date:** 2026-05-12
**Authors:** AG-F1 (testkit) + brainstorm session
**Supersedes:** none (K1.5 is the first testkit-recording PR)
**Related:**
- `platform/agent/core/SCOPE.md` § Testkit (authoritative public contract)
- `docs/explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md` (reference design)
- `docs/superpowers/specs/2026-05-12-agent-core-k1-design.md` (K1 design, just landed)
- `docs/setup.md` §5 (kernel patterns, lines 2169 + 2185–2198 + 2208–2213 — testkit is the single LLM stub seam)
- Reference implementation: `/Users/canh/Projects/Seta/mastra/packages/_llm-recorder/src/llm-recorder.ts`

---

## 1. Goal

Ship the K1.5 increment of `@seta/agent-core`: an **MSW-backed LLM record/replay** layer under `src/testkit/recording/`. After this PR, any test in any seta-os package can write:

```ts
import { setupLLMRecording } from '@seta/agent-core/testkit'

const rec = setupLLMRecording({ name: 'my-test' })
beforeAll(() => rec.start())
afterAll(() => rec.stop())
```

…and every outbound HTTP call to `api.anthropic.com` or `api.openai.com` is intercepted via MSW, hashed by canonicalized URL+body, and either replayed from `__recordings__/my-test.json` or recorded into it (per the mode gate).

The PR is internally self-contained — no edits to other packages or `apps/api`. K2 (Anthropic adapter) is the first real consumer; it lands next and exercises the testkit end-to-end.

## 2. Non-goals

- **Concrete LLM SDK adapters** — K2 (Anthropic) / K3 (OpenAI). K1.5 ships the *testkit* and an integration test that proves SDK fetch is interceptable; it does not ship `models/anthropic.ts` itself.
- **Auto-recording** — no Vite plugin, no `beforeEach`/`afterEach` auto-injection. SCOPE.md forbids; spike `06:48` forbids.
- **Per-test / per-describe helpers** — no `useLLMRecording`, no `withLLMRecording`, no `enableAutoRecording`. SCOPE.md § Testkit explicitly: "Tiny surface — no per-test/per-describe helpers, no auto-naming."
- **Fuzzy / similarity matching** — exact-hash-or-fail. Spike `06:49`. If a hash misses, the fix is `transformRequest`, not a 60%-threshold fallback.
- **Binary sidecar artifacts** — TTS/STT (audio mp3/wav/ogg) deferred to P2. Spike `06:51`.
- **Provider expansion** — Anthropic + OpenAI only. No Google `generativelanguage.googleapis.com`, no OpenRouter. Spike `06:52`.
- **`LLM_TEST_MODE=live` in CI** — single explicit ban (setup.md §5 line 2198).
- **Legacy plain-array file migration** — pre-1.0, no legacy on disk. The reader accepts only `{ meta, recordings }`.
- **Contract-validation tooling** (`validateLLMContract`, `extractSchema` — Mastra's `llm-contract.ts`) — P2-defer per spike `06:73`.
- **`transformRequest` wired into `vitest.config.ts`** as a plugin — P1 callers pass it inline. Spike `06:72`.

## 3. Constraints (CLAUDE.md + SCOPE.md)

- **`platform/*` depends on nothing in `modules/*` or `apps/*`.** The testkit is internal to `@seta/agent-core` and exposed via the `/testkit` subpath only.
- **No console.log** — `logger` from `@seta/observability` for any informational log (mode banner, recording write).
- **ESM only**, `import type` for type-only imports, no TS path aliases.
- **Co-located unit tests** at `src/testkit/recording/**/*.test.ts`. The one SDK-via-fetch verification test lives at `tests/integration/sdk-intercept.test.ts` per CLAUDE.md "Conventions / Tests".
- **External SDK pins** already in `package.json`: `@anthropic-ai/sdk@0.95.1`, `openai@6.37.0` (both latest). Both must already use global `fetch` (verified in the integration test).
- **Single-version policy.** Every external library pinned to its latest stable. No code paths supporting older SDK majors, older msw majors, older Node, or legacy file formats. Whenever a new version drops, bump in a dedicated PR; never carry two side-by-side.
- **No mocking of internal `@seta/*` modules.** The testkit replaces external HTTP only.
- **No `vi.mock` against `openai` / `@anthropic-ai/sdk`** — setup.md §5 line 2169 + 2212: those SDKs are stubbed *only* via the testkit.
- **`__recordings__/**` is checked into git** — already pinned in `turbo.json` test inputs (setup.md §12 lines 1214–1223); the testkit must not write outside this directory and must emit pretty-printed JSON.

**New deps this PR:**
- `msw@2.14.6` (runtime — latest stable; only used inside `src/testkit/recording/`, but declared as a regular dep so test consumers in sibling packages can import the testkit subpath). Installed via:
  ```
  pnpm --filter @seta/agent-core add msw@2.14.6
  ```
  Per project policy: always the latest version of every external library; no multi-version compatibility shims.
- **No** `string-similarity`, **no** `diff` — fuzzy match dropped.

## 4. File layout

```
platform/agent/core/
├── src/
│   └── testkit/
│       ├── index.ts                         # barrel — re-exports FakeAdapter + new recording API
│       ├── fake-adapter.ts                  # (unchanged, from K1)
│       ├── fake-adapter.test.ts             # (unchanged)
│       └── recording/
│           ├── index.ts                     # internal barrel
│           ├── setup.ts                     # setupLLMRecording() + MSW server wiring
│           ├── setup.test.ts                # unit: lifecycle, host filter, mode dispatch
│           ├── hash.ts                      # serializeRequestContent, hashRequest, stableSortKeys, canonicalizeISODateString
│           ├── hash.test.ts                 # unit: canonicalization, transformRequest application
│           ├── store.ts                     # loadRecordingFile, saveRecordingFile, file path resolution
│           ├── store.test.ts                # unit: fresh-file create, append-on-miss, idempotent save
│           ├── streaming.ts                 # captureStreamingResponse, createStreamingResponse
│           ├── streaming.test.ts            # unit: chunk capture, replay-as-ReadableStream
│           ├── mode.ts                      # getRecordingMode() → 'replay' | 'record' | 'force'
│           ├── mode.test.ts                 # unit: env-var precedence
│           └── types.ts                     # RecordingFile, LLMRecording, RecordingMeta, options
└── tests/
    └── integration/
        ├── sdk-intercept.test.ts            # real Anthropic + OpenAI SDK calls under MSW
        └── __recordings__/
            ├── sdk-intercept-anthropic.json # canned recording for the Anthropic SDK call
            └── sdk-intercept-openai.json    # canned recording for the OpenAI SDK call
```

Plus:
- `platform/agent/core/package.json`: add `msw@2.12.11` to `dependencies`; add `"test:integration": "vitest run tests/"` script; change `"test:unit": "vitest run"` → `"test:unit": "vitest run src/"` (keeps unit fast, gates the integration test behind explicit `pnpm test:integration`).
- `platform/agent/core/vitest.config.ts`: unchanged (project name only).

**Out of scope this PR:** any edit to `apps/api/src/main.ts`, any edit outside `platform/agent/core/`.

## 5. Public interface

All exports are re-exported from `@seta/agent-core/testkit`.

### 5.1 `setupLLMRecording`

```ts
// src/testkit/recording/setup.ts
export interface SetupLLMRecordingOptions {
  /** Unique recording name. Used as `<recordingsDir>/<name>.json`. Required — no auto-naming. */
  name: string
  /** Override the recordings directory. Default: `path.join(process.cwd(), '__recordings__')`. */
  recordingsDir?: string
  /**
   * Normalize the URL + body before hashing, applied on BOTH record and replay.
   * Use to strip per-run volatile fields (tenant_id, run_id, timestamps) that
   * the kernel injects but that must not affect matching.
   */
  transformRequest?: (req: { url: string; body: unknown }) => { url: string; body: unknown }
}

export interface LLMRecordingHandle {
  /** Install MSW handlers. Call in `beforeAll`. */
  start(): void
  /** Remove MSW handlers; flush any pending writes to disk. Call in `afterAll`. */
  stop(): void
}

export function setupLLMRecording(opts: SetupLLMRecordingOptions): LLMRecordingHandle
```

**Lifecycle semantics:**
- `start()` boots a `setupServer()` with handlers over `https://api.anthropic.com/*` and `https://api.openai.com/*`, plus `onUnhandledRequest: 'bypass'` so non-LLM traffic flows through.
- `stop()` calls `server.close()` and, in `record` / `force` mode, atomically writes the (possibly mutated) recording file to disk. Writes are queued during the test run and flushed in `stop()` — never mid-test — so a thrown test doesn't half-write.
- The testkit does **not** import `vitest`. Callers wire `beforeAll`/`afterAll` themselves (Mastra imports vitest's lifecycle — we drop that to keep the testkit framework-agnostic).

### 5.2 `serializeRequestContent` / `hashRequest`

```ts
// src/testkit/recording/hash.ts

/** Apply `transformRequest`-style normalization to URL + body, then canonical-stringify. */
export function serializeRequestContent(url: string, body: unknown): string

/** `md5(serializeRequestContent(url, body)).slice(0, 16)`. */
export function hashRequest(url: string, body: unknown): string
```

Both exported per SCOPE.md so consumers can hash manually (e.g. debug fixture mismatches in CI logs). `transformRequest` is **not** part of these helpers' signatures — callers feed pre-transformed `(url, body)` if needed. The `setupLLMRecording` runtime applies `transformRequest` before calling `hashRequest` internally.

### 5.3 Record file shape

```ts
// src/testkit/recording/types.ts
export interface RecordingFile {
  meta: RecordingMeta
  recordings: LLMRecording[]
}

export interface RecordingMeta {
  name: string
  createdAt: string   // ISO
  updatedAt?: string  // ISO; set on every write in record/force mode
  provider?: string   // populated by first request's hostname
  model?: string      // populated by first request's body.model if present
}

export interface LLMRecording {
  hash: string                  // 16-char hex prefix of md5
  request: {
    url: string                 // post-transformRequest URL
    method: string
    body: unknown               // post-transformRequest body (JSON-serializable)
  }
  response: {
    status: number
    statusText: string
    headers: Record<string, string>  // filtered (see §5.4)
    body?: unknown                    // non-streaming: parsed JSON
    chunks?: string[]                 // streaming: one entry per reader.read() decode
    chunkTimings?: number[]           // wall-clock ms deltas between chunks
    isStreaming: boolean
  }
}
```

No `testFile` / `testName` / `binaryArtifact` / `request.timestamp` fields — all dropped from Mastra's shape. Files are pretty-printed at 2-space indent.

### 5.4 Header filtering

Lifted verbatim from Mastra (`llm-recorder.ts:339`):

```ts
const SKIP_HEADERS = [
  'authorization',
  'x-api-key',
  'api-key',
  'content-encoding',
  'transfer-encoding',
  'set-cookie',
]
```

Stored response headers exclude these (case-insensitive). All other headers are kept verbatim, including `anthropic-ratelimit-*`, `openai-*`, `request-id`, `date` — keeping them preserves provider-meaningful information for adapter tests, at the cost of some diff churn when re-recording.

### 5.5 Mode gate

```ts
// src/testkit/recording/mode.ts
export type RecordingMode = 'replay' | 'record' | 'force'

export function getRecordingMode(): RecordingMode {
  const v = process.env.RECORD
  if (v === 'force') return 'force'
  if (v === '1') return 'record'
  return 'replay'
}
```

Three modes, one env var:
- **`replay`** (default, including CI): on hash hit → return canned response; on miss → throw a descriptive error (`KernelError`-like, but inline since the testkit can't depend on `errors/`). Strict.
- **`record`** (`RECORD=1`): on hash hit → still replay (don't re-record). On miss → forward the request to the real network, capture the response, append a new entry to `recordings[]`. The on-disk file is rewritten at `stop()`. **On-disk file may not exist yet** — first run creates it.
- **`force`** (`RECORD=force`): ignore existing recordings entirely; forward every request, overwrite the recordings array at `stop()`. Used when intentionally re-recording.

**Rejected modes** (vs Mastra's five): `auto`, `live`, `update` (alias), `record` (Mastra's "force" alias), `RECORD_LLM=true` legacy. SCOPE.md keeps the surface tight.

### 5.6 MSW handlers

Single `setupServer()` with two catch-all handlers:

```ts
import { http, HttpResponse, bypass } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  http.all('https://api.anthropic.com/*', handler),
  http.all('https://api.openai.com/*', handler),
)
```

Where `handler` is one closure that:
1. parses the incoming `Request` body (JSON only — binary requests are P2),
2. applies `transformRequest`,
3. computes `hashRequest`,
4. looks up in `recordings[]`:
   - hit → reconstruct `Response` (or `ReadableStream` for streaming) from the recording,
   - miss + mode=`replay` → throw with a structured message listing `name`, `hash`, `url`, body preview,
   - miss + mode=`record`/`force` → `await fetch(bypass(request))`, capture, append.

`onUnhandledRequest: 'bypass'` ensures any non-LLM HTTP (e.g. `@seta/observability` exporters) passes through unaffected.

### 5.7 Streaming capture / replay

Lifted directly from Mastra (`captureStreamingResponse` `llm-recorder.ts:518–549`, `createStreamingResponse` `:554+`) with two changes:
- **`maxChunkDelay: 0`** — never sleep between chunks during replay. Mastra defaults to 10ms; we want CI fast.
- **No `replayWithTiming` option** — single behavior. Timings are still captured (for diagnostic value when reviewing a recording PR) but never re-emitted with delays.

Detection of streaming: `content-type` includes `text/event-stream` or `text/plain` (Anthropic SDK uses the former, OpenAI uses both depending on endpoint).

Chunks are stored as **whatever one decoded `reader.read()` produced** — not framed-by-event. This is faithful to the wire and matches Mastra; SDK parsers handle arbitrary boundaries.

### 5.8 Hashing details

```ts
// All identical to Mastra `llm-recorder.ts:370-453`:
function stableSortKeys(value: unknown): unknown                   // deep sort + canonicalize ISO dates + Date→ISO
function canonicalizeISODateString(value: string): string          // normalize `Z` form
function normalizeRequestBody(body: unknown): unknown              // dispatcher
export function serializeRequestContent(url: string, body: unknown): string  // `${url}:${stableJSON(body)}`
export function hashRequest(url: string, body: unknown): string    // md5(serializeRequestContent).slice(0,16)
```

`transformRequest` applies **before** `serializeRequestContent`. URL and body are independently transformable. If `transformRequest` returns an unchanged shape, hashing is deterministic across runs.

## 6. Integration test (`tests/integration/sdk-intercept.test.ts`)

Verifies the open question from spike `06:55` ("does the SDK use global fetch?") with the actual pinned SDK versions:

1. `setupLLMRecording({ name: 'sdk-intercept-anthropic' }).start()`.
2. Construct `new Anthropic({ apiKey: 'sk-test-fake' })`.
3. `await client.messages.create({ model: 'claude-3-5-haiku-latest', max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] })`.
4. Assert the result is the canned response from the committed `__recordings__/sdk-intercept-anthropic.json`. If MSW didn't intercept, the call would fail with auth or DNS (fake key + isolated env).
5. Repeat for OpenAI with `new OpenAI({ apiKey: 'sk-test-fake' })` + `client.chat.completions.create(...)`.

Both recordings are seeded by running the test once with `RECORD=1` against the real APIs and committing the resulting JSONs.

**This test is the only place that constructs real SDK clients in K1.5** — adapter code lands in K2/K3.

## 7. What we deliberately exclude (vs Mastra)

For reviewer reference, the explicit cuts:

| Mastra feature | Why dropped |
|---|---|
| Vite plugin (`vite-plugin.ts`) | SCOPE.md "no auto-injection"; spike `06:48` |
| `enableAutoRecording`, `useLLMRecording`, `withLLMRecording`, `useLiveMode` | SCOPE.md "no per-test/per-describe helpers, no auto-naming" |
| Fuzzy `stringSimilarity` matching | spike `06:49` — exact-or-fail |
| `LLM_TEST_MODE=live` | setup.md §5 line 2198 — hard ban in CI |
| 5-mode resolution (`auto`/`update`/`replay`/`live`/`record`) + `RECORD_LLM=true` legacy | SCOPE.md — 3 modes only |
| Legacy plain-array file format migration | pre-1.0, no legacy on disk |
| Binary sidecar artifacts (`writeBinaryArtifact`, audio mime detection) | spike `06:51` — P2 |
| Google + OpenRouter hosts | spike `06:52` — not on P1 surface |
| `meta.testFile` / `meta.testName` via `expect.getState()` | SCOPE.md "no auto-naming" — caller passes explicit `name` |
| `replayWithTiming` / `maxChunkDelay` options | single behavior (0ms) — CI fast |
| `llm-contract.ts` validation tooling | spike `06:73` — P2 |
| `string-similarity` and `diff` deps | only used by fuzzy match + its diff reporter, both dropped |

## 8. Patterns to follow

- **MSW server is per-`setupLLMRecording` call.** No module-scoped singleton (Mastra's `activeRecorder` global). Each test file owns its server; vitest's worker-per-file isolation does the rest.
- **Synchronous `start()`/`stop()`** — no `Promise` return. `server.listen()` and `server.close()` are sync in `msw/node`; disk writes in `stop()` are sync `fs.writeFileSync` (fine for `afterAll`).
- **`onUnhandledRequest: 'bypass'`** — never `'error'`. Other tests in the same file may make legitimate HTTP calls (e.g. observability exporters).
- **All disk I/O routes through `store.ts`.** Single seam, easy to unit-test, single place to enforce the recordingsDir-relative path guard.
- **No `tenant_id` / `run_id` defaults in `transformRequest`.** Callers know which fields are volatile for their test; the testkit doesn't guess.
- **Pretty-print JSON files** — 2-space indent, trailing newline. PR diffs must be reviewable; SCOPE.md and spike both call this out.
- **Use the global `fetch` everywhere** — adapter code in K2/K3 must not import SDK-internal transports. The integration test in K1.5 is the gate.

## 9. Patterns to avoid

- **No vitest imports inside the testkit.** Keeps the surface portable; callers wire lifecycle. Mastra imports `beforeAll`/`afterAll` from `vitest` — we explicitly don't.
- **No mutable module-scope state** — no `activeRecorder` singleton. `setupLLMRecording` returns a closure-scoped handle.
- **No auto-record-on-miss in `replay` mode.** Misses must throw with enough detail (name + hash + URL + body preview) that the dev knows to set `RECORD=1`.
- **No partial writes.** Disk write happens once in `stop()`, after all in-memory mutations.
- **No throwing inside MSW handlers without translation.** A throw inside an MSW handler turns into an unhelpful "Request handler failed" upstream. Wrap and re-throw via `HttpResponse.error()` with structured logging via `logger.error()`.
- **No process metadata in source comments** — per user feedback memory. No K1.5 / AG-F1 / spike-line references inside `.ts` files; commit messages carry that.

## 10. Test strategy

**Unit (`src/testkit/recording/*.test.ts`):**
- `hash.test.ts`: canonical sort over nested objects + arrays + Dates, ISO date normalization, `transformRequest` round-trip determinism.
- `store.test.ts`: fresh file create, append-on-record-miss, idempotent `saveRecordingFile`, recordingsDir path containment.
- `mode.test.ts`: env var precedence (`RECORD=force` > `RECORD=1` > unset), case sensitivity.
- `streaming.test.ts`: capture from a mock `ReadableStream`, replay reconstructs identical bytes, `maxChunkDelay=0` means no sleeps.
- `setup.test.ts`: `start()` → `stop()` lifecycle, `onUnhandledRequest: 'bypass'`, miss-in-replay-mode throws with structured details, miss-in-record-mode forwards + appends, host filter (a request to `example.com` is bypassed).

**Integration (`tests/integration/sdk-intercept.test.ts`):**
- Real `@anthropic-ai/sdk@0.95.1` client → MSW intercepts → canned response returned.
- Real `openai@6.37.0` client → same.

**Recordings checked into git:** `tests/integration/__recordings__/sdk-intercept-{anthropic,openai}.json` (small, ~1 KB each). `turbo.json` already pins `__recordings__/**` per setup.md §12.

## 11. Open questions

- **`stop()` write atomicity.** `fs.writeFileSync` is not atomic across crashes. Worth a `fs.rename(tmp → final)` pattern? Probably yes — cheap insurance against half-written recording files on Ctrl-C during `RECORD=1`. **Recommendation:** write to `<file>.tmp`, then `fs.renameSync`.
- **`provider` / `model` autopopulation in `meta`.** Mastra populates from `metaContext` (passed in). We don't expose `metaContext`; either (a) infer from the first recorded request's hostname + body.model, or (b) leave `meta.provider` / `meta.model` undefined. **Recommendation:** infer — zero caller effort, useful at PR-review time.
- **`AbortSignal` plumbing through MSW handlers.** When a kernel call is aborted mid-replay, the streaming `ReadableStream` should also abort. MSW relays the original request's signal; need to confirm `createStreamingResponse` reads `request.signal` and cancels the rebuilt reader. **Recommendation:** test it (one abort-in-flight unit test in `streaming.test.ts`).
- **msw version.** Pinned `2.14.6` (latest at design time, `pnpm view msw version`). Single-version policy — no parallel support of older msw majors.
- **One MSW server per `setupLLMRecording` call vs reuse.** If two tests in the same file each call `setupLLMRecording`, do they share an MSW server or get separate ones? Currently each call creates its own; if they overlap in lifetime, MSW will error on duplicate handlers. **Recommendation:** document the convention "one `setupLLMRecording` per test file" in JSDoc; emit an error if `start()` is called twice without `stop()`.

## 12. Migration / rollout

- This PR is additive. No existing code depends on `setupLLMRecording`. After K1.5 lands, the K2 PR (Anthropic adapter) is the first real consumer.
- `pnpm test:unit` continues to pass with no recordings (the testkit's own unit tests don't hit real APIs).
- `pnpm test:integration` runs the SDK-intercept test against committed recordings; CI runs both.
- No published-package consumer is broken — `@seta/agent-core` is `"private": true`.

## 13. Done = ready when

- [ ] `setupLLMRecording`, `serializeRequestContent`, `hashRequest` exported from `@seta/agent-core/testkit`.
- [ ] All unit tests pass under `pnpm --filter @seta/agent-core test:unit`.
- [ ] Integration test passes under `pnpm --filter @seta/agent-core test:integration` against committed recordings.
- [ ] `msw@2.12.11` pinned in `dependencies`; CI guard `check-no-manual-pkg-edit.ts` passes (added via `pnpm --filter @seta/agent-core add msw@2.12.11`).
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean.
- [ ] `pnpm build` emits `dist/testkit/index.{js,d.ts}` containing the new exports plus the existing `FakeAdapter`.
- [ ] `__recordings__/sdk-intercept-{anthropic,openai}.json` committed and pretty-printed.
- [ ] No `vi.mock` / `vitest.mock` against `openai` or `@anthropic-ai/sdk` anywhere in the diff.
- [ ] No source comments referencing K1.5 / AG-F1 / spike line numbers / plan IDs.
- [ ] Changeset added (`pnpm changeset`) — even though `@seta/agent-core` is private, the convention applies if/when it's published.
