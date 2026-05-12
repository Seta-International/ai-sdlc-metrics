# Mastra spike — LLM recording / replay for deterministic tests

## What Mastra does

Mastra ships an internal package `@internal/llm-recorder` (`mastra/packages/_llm-recorder/`) that intercepts outbound HTTP via MSW (not via wrapping the SDK client) so recording works uniformly across OpenAI / Anthropic / Google / OpenRouter (`mastra/packages/_llm-recorder/src/llm-recorder.ts:63-65`, providers listed README:307-314).

- **Request → fixture key.** Each request is keyed by an MD5 of `URL + canonicalized body`. Bodies are normalized (`stableSortKeys`, `canonicalizeISODateString`) before hashing; the digest is truncated to 16 hex chars (`llm-recorder.ts:437-453`). A user `transformRequest({url, body}) => {url, body}` callback runs on both record and replay to strip volatile fields (timestamps, UUIDs, session ids) before hashing (`llm-recorder.ts:243-252`, README:238-275). On replay, an exact hash hit is fast-pathed; otherwise a `dice-coefficient` fuzzy match (threshold 0.6) over the serialized request, with URL-preferred tiebreak (`llm-recorder.ts:591-701`).
- **Storage.** One JSON per recording name at `{cwd}/__recordings__/{name}.json` (`llm-recorder.ts:70`, `:708-709`). Versioned file shape `{ meta: { name, testFile, testName, provider, model, createdAt, updatedAt }, recordings: LLMRecording[] }`; legacy plain-array files auto-migrate on read (`llm-recorder.ts:173-228`). Binary payloads (audio) spill to sidecar files `{hash}-{request|response}-{digest}.{mp3|wav|ogg|webm|bin}` referenced by `binaryArtifact` (`llm-recorder.ts:476-513`).
- **Streaming.** `text/event-stream` (or `text/plain`) responses are detected (`llm-recorder.ts:458-461`), drained with a `ReadableStream` reader, and stored as `response.chunks: string[]` plus `response.chunkTimings: number[]` (ms deltas) (`llm-recorder.ts:518-548`). Replay rebuilds a `ReadableStream` that re-emits chunks; timing is off by default for fast tests, capped at `maxChunkDelay` (default 10 ms) when on (`llm-recorder.ts:554-588`, `:238-241`).
- **Mode gate.** `getLLMTestMode()` resolves via priority: `--update-recordings`/`UPDATE_RECORDINGS=true` (update) → `LLM_TEST_MODE=live|record|replay|auto|update` → legacy `RECORD_LLM=true` → default `auto` (replay-if-exists, record-if-missing) (`llm-recorder.ts:90-124`).
- **Entry points.** Four layered APIs — Vite plugin (auto-injects per file, default name from path), `enableAutoRecording()` per file, `useLLMRecording(name)` per describe, `withLLMRecording(name, fn)` per test (README:28-118, `auto-recording.ts:1-56`). `useLiveMode()` opts a nested describe out of an enclosing recorder.
- **Unrelated mock layer.** `packages/core/src/test-utils/llm-mock.ts:12-50` is a separate `MockLanguageModelV1/V2` for pure unit tests that don't want HTTP at all.

## What setup.md plans

§5 footnote (rule, referenced from `docs/setup.md:2169`, `:2212`): "External SDKs (`openai`, `@anthropic-ai/sdk`, `@node-rs/argon2`) are stubbed only via the kernel's `testkit` (`platform/agent/core/src/testkit/`), never with `vi.mock`." And: "LLM SDKs | Always via `testkit` recordings".

Commands table (`docs/setup.md:2099` adjacent + the prompt brief): `RECORD=1 pnpm vitest run -t <name>` re-records a fixture.

§12 turbo inputs (`docs/setup.md:1214-1223`):
```
"test:unit": { "inputs": ["$TURBO_DEFAULT$", "vitest.config.ts", "__recordings__/**", "__fixtures__/**"], ... }
"test:integration": { "inputs": ["$TURBO_DEFAULT$", "vitest.config.ts", "__recordings__/**"], ... }
```

§5 LLM recordings sketch (`docs/setup.md:2185-2198`):
```ts
// platform/agent/core/src/testkit/recorded.ts
export function recordedClient(fixture: string) {
  const file = path.join("__recordings__", `${fixture}.json`)
  if (process.env.RECORD === "1") return recordingClient(file)
  return replayClient(file) // throws on cache miss
}
```
"Rules: `RECORD=1 pnpm test -t <name>` to (re)record; commit the fixture; PR review includes the fixture diff. **Never** call live model APIs in CI." Mock-policy table at `docs/setup.md:2208-2213` further requires recordings for both LLM and external HTTP (Graph, Bot Framework, OAuth).

## Delta

**Fold in:**
- Intercept at the HTTP layer via **MSW**, not by wrapping the SDK client. Seta already mandates msw for Graph/BotFramework/OAuth (`docs/setup.md:2174`, `:2213`); unifying LLM under msw lets one `__recordings__/` mechanism cover every external boundary and works across `@anthropic-ai/sdk`, `openai`, future Vercel AI SDK without per-SDK shims.
- **Content-based hashing** `md5(URL + canonicalized JSON body).slice(0,16)`, not prompt-text-only. Lets parallel tests share fixtures; makes recordings order-independent.
- **`transformRequest` normalizer** applied on both record and replay paths. We will need this for `tenant_id`, `run_id` (ulid), `timestamp` fields that the kernel injects per request.
- **Versioned file format** `{ meta, recordings[] }` with `provider`, `model`, `testFile`, `testName`, `createdAt/updatedAt`. Makes a `__recordings__/*.json` PR diff legible during code review (which §5 already demands).
- **Streaming = `{ chunks: string[], chunkTimings: number[], isStreaming: true }`** with replay-time `maxChunkDelay` cap. Matches what `streamKernelSSE(c, run)` already emits — the kernel SSE format is conceptually identical to OpenAI/Anthropic SSE so the same shape can replay both inbound and outbound streams.
- **Mode resolution** with explicit `auto | replay | record | update | live` rather than only `RECORD=1`. `replay` (strict, fail on miss) is what we need in CI; setup.md's snippet only distinguishes record vs replay-or-throw, which is fine but lacks `auto` (snapshot-style: create on first run).

**Deliberately avoid:**
- **Auto-recording Vite plugin** that injects `useLLMRecording` into every test file. Magical, breaks "grep to find what's mocked," and conflicts with our rule that the kernel `testkit` is the single seam (`docs/setup.md:2169`).
- **Fuzzy similarity matching** (`stringSimilarity.compareTwoStrings`, threshold 0.6, `llm-recorder.ts:591-701`). Non-determinism on a CI seam is exactly what this whole mechanism exists to prevent. Use exact-hash-or-fail; if the hash misses, the fix is `transformRequest`, not a 60%-match fallback.
- **`useLiveMode()` opt-outs and `LLM_TEST_MODE=live` in CI**. `docs/setup.md:2198` already states "Never call live model APIs in CI" — keep that as a hard rule, no opt-out lever to misuse.
- **Binary sidecar artifacts** for v1. We aren't doing TTS/STT at P1; defer the `binaryArtifact` machinery.
- **Provider sprawl** (Google, OpenRouter). P1 is Anthropic-first; add OpenAI when needed; don't pre-wire what we don't ship.

**Open questions:**
- Does the seta-os kernel call the SDK over real `fetch` (msw-interceptable) or via the Anthropic SDK's internal transport? Need to verify before locking in the msw approach — the SDK uses `node-fetch`-compatible global `fetch` and msw works, but worth a single integration test.
- Do we want **per-test** or **per-file** fixture scoping? Mastra defaults per-file (`enableAutoRecording`). Setup.md §5's `recordedClient(fixture)` signature is per-fixture-name; that's per-test or per-scenario. Per-test gives reviewer-friendly small JSONs but explodes file count for an agent run loop that issues 5-10 LLM calls per scenario.
- Where does `RecordingMeta.testName` come from in Vitest? Mastra reads `expect.getState().currentTestName` inside the MSW handler — confirm that's stable in our vitest pin.

## Punch list

- setup.md §5 (around `docs/setup.md:2189-2196`): replace the `recordedClient`/`recordingClient`/`replayClient` sketch with msw-based design: handlers registered for `api.anthropic.com`, `api.openai.com`; replay matches on `md5(url + canonicalize(body)).slice(0,16)`; spell out `transformRequest` hook for `tenant_id`/`run_id` stripping.
- setup.md §5 (`docs/setup.md:2198`): expand the env-var gate from single `RECORD=1` to `RECORD=1` (record-if-missing) + `RECORD=force` (re-record all) + default = strict replay (fail on miss). One env var with two values plus a default is enough; do not import Mastra's five-mode enum.
- setup.md §5 (`docs/setup.md:2185`): document recording file shape `{ meta: { name, testFile, testName, provider, model, createdAt, updatedAt }, recordings: [{ hash, request: { url, method, body }, response: { status, headers, body | (chunks, chunkTimings, isStreaming) } }] }` so reviewers know what to diff.
- setup.md §5 (mock-policy table around `docs/setup.md:2208-2213`): add row "Streaming LLM responses | Recorded as `chunks[] + chunkTimings[]`, replayed via `ReadableStream` with `maxChunkDelay=0` in CI |".
- setup.md §12 (`docs/setup.md:1214-1223`): inputs are already correct; add a note that `__recordings__/**` MUST be checked into git (no `.gitignore` entry) — otherwise the turbo input list silently caches misses.
- setup.md §5: add a "what we deliberately exclude" subsection — no fuzzy matching, no auto-injection Vite plugin, no `LLM_TEST_MODE=live` in CI, no binary sidecar artifacts in P1.
- @seta/agent-core: leave a hook at `platform/agent/core/src/testkit/index.ts` exporting `setupLLMRecording({ name, recordingsDir?, transformRequest? })` returning `{ start, stop }` that boots an msw `setupServer` over Anthropic + OpenAI base URLs; kernel tests call it from `beforeAll` / `afterAll`. Keep the surface tiny — no per-test/per-describe helpers, no auto-naming — kernel callers always pass an explicit `name`.
- @seta/agent-core: leave a single `serializeRequestContent(url, body)` + `hashRequest(url, body)` utility export so module tests can share the exact normalization the testkit uses (canonical key sort, ISO-date canonicalization).
- @seta/agent-core: kernel HTTP call paths MUST use the global `fetch` (no SDK-internal transports that bypass msw); add a kernel-level integration test that asserts the testkit intercepts an Anthropic call.
- P2-defer: binary artifact sidecars (TTS/STT) — not on P1 surface.
- P2-defer: Google / OpenRouter / Bedrock provider handlers — add when a connector needs them.
- P2-defer: `transformRequest` config wired through `vitest.config.ts` plugin form. P1 callers can pass it inline to `setupLLMRecording`.
- P2-defer: contract-validation tooling (`validateLLMContract`, `extractSchema`, `llm-contract.ts`) — useful for nightly drift detection, but P1 ships only record/replay.
- P2-defer: fixture-per-test vs fixture-per-scenario decision — pick when we have the first real kernel test; document the chosen convention in §5 then.
