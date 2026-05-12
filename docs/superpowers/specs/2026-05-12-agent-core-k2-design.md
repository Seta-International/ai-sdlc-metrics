# @seta/agent-core K2 — concrete LLM adapters + first apps/api wire-up

**Status:** Draft (pending review)
**Date:** 2026-05-12
**Owner:** Platform team
**Package:** `@seta/agent-core` (`platform/agent/core`)
**Predecessors:** K1 (kernel surface), K1.5 (MSW testkit)
**Successors:** K4 (tool-call iteration outer loop), MEM (real memory provider)

## 1. Goal

Ship concrete LLM provider adapters that satisfy the `ModelAdapter` contract K1
established, and register them at boot from `apps/api`. After K2 lands, an
agent product can call `run(cfg, input, { adapters: agentRegistry })` against
real Anthropic, OpenAI, or Azure OpenAI models — with deterministic recordings
in CI — using only K1's kernel surface.

K2 closes three open questions from K1:
- `#764` cacheTtl parity with OpenAI → documented no-op.
- `#767` fixture scoping per-test vs per-scenario → per-test.
- `#768` SSE re-entry of tenant ALS → asserted by integration test.

## 2. Non-goals

- The tool-call iteration outer loop (`accumulatedSteps[]`, `stopWhen`,
  fallback-model failover, concurrent tool execution, processor pipeline) —
  that is K4.
- Real `@seta/agent-memory` provider wiring — that is the MEM stream.
- An agent product (`modules/products/agent`), routes, or any HTTP surface.
- Cost-record sink (`@seta/audit` row vs OTel-attrs-only) — still open until
  the audit/observability stream decides; K2 emits OTel attrs only.
- Mid-stream resume / chunk-replay cache (P2).
- Cross-model fallback (`cfg.fallback?: string[]`) — present in K1 types,
  consumed by K4.

## 3. Constraints (CLAUDE.md + SCOPE.md)

- ESM-only; `"type": "module"`. `import type` for type-only imports.
- No CJS shim, no legacy alias, no backwards-compat shim — pre-1.0.
- No DI container, no plugin loader, no module-singleton adapter registry.
  Registry is constructed in `apps/api/src/agent.ts`; that file is the sole
  composition root.
- No `process.env.X` outside `apps/api/src/env.ts`.
- No HTTP routes added in this PR.
- No mocking of internal `@seta/*` modules. External LLM HTTP via `msw` only,
  through the K1.5 testkit.
- Tenant id is never a function parameter. Read via
  `tenantContext.getTenantId()` from `@seta/tenant`.
- Streaming via SDK `.stream()` helpers — never raw `create({ stream: true })`.
- Direct SDK use; no Vercel AI SDK (`@ai-sdk/*`).
- All model calls pass `{ signal }`. `ModelStream.abort()` propagates to the
  SDK's stream `.abort()`.
- External SDK pins already in `package.json`: `zod@4.4.3`, `openai@6.37.0`,
  `@anthropic-ai/sdk@0.95.1`. `js-tiktoken@1.0.21` already moved here in K1.

## 4. File layout

```
platform/agent/core/
├── src/
│   ├── models/
│   │   ├── anthropic.ts          NEW — createAnthropicAdapter(cfg)
│   │   ├── openai.ts             NEW — createOpenAIAdapter(cfg)
│   │   ├── azure-openai.ts       NEW — createAzureOpenAIAdapter(cfg)
│   │   ├── cache-control.ts      NEW — pure helper, anthropic-only
│   │   ├── span.ts               NEW — withLlmSpan(provider, model, fn)
│   │   ├── tokens.ts             NEW — countTokens + estimateMessagesInputTokens
│   │   └── translate/
│   │       ├── anthropic.ts      NEW — kernel↔anthropic messages + chunks
│   │       └── openai.ts         NEW — kernel↔openai messages + chunks
│   └── index.ts                  CHANGED — re-export the three factories
└── tests/
    └── integration/
        ├── anthropic.test.ts     NEW — testkit-driven
        ├── openai.test.ts        NEW
        ├── azure-openai.test.ts  NEW
        └── tenant-als.test.ts    NEW — closes K1 open question #768
└── __recordings__/               NEW — 14 fixtures, checked in

apps/api/
├── src/
│   ├── env.ts                    CHANGED — add ANTHROPIC/OPENAI/AZURE env
│   ├── agent.ts                  NEW — builds AdapterRegistry, exports it
│   └── main.ts                   CHANGED — `import './agent'` side-effect
```

No K1 source files change other than `src/index.ts` (re-exports only).

## 5. Architecture

### Dependency direction

```
apps/api ──► @seta/agent-core ──► openai, @anthropic-ai/sdk, js-tiktoken,
                                  msw (testkit subpath), @seta/observability,
                                  @seta/tenant
                                  (zod already pinned in K1)
```

`@seta/tenant` and `@seta/observability` move from "type-only" → runtime
imports for tenant ALS reads and OTel span emission. Both are existing
workspace deps; no new packages installed.

### Runtime flow for one LLM call

```
run() ──► registry.select(cfg.model)
       ──► adapter.stream(req, ctx)
              ├─ const span = startLlmSpan(provider, bareModel, ctx.runId)
              ├─ span.record({ estimatedInputTokens })
              ├─ try {
              │    translate kernel → SDK shape (+ cache_control for anthropic)
              │    const sdkStream = await sdk.{messages|chat.completions}.stream(
              │      translated, { signal: ctx.signal })
              │  } catch (err) {
              │    span.end('error', err); throw mapXxxError(err, model)
              │  }
              ├─ return wrap(sdkStream, span):
              │    - async-iterator yields kernel chunks (translated per-event);
              │      mid-stream throw → span.end('error', err), re-throw mapped
              │    - .abort() → sdk stream.abort(); if ctx.signal.aborted → span.end('aborted')
              │    - .finalMessage() → translate to KernelMessage;
              │                        span.record({ inputTokens, ... });
              │                        span.end('ok')
```

The span lives as long as the returned stream. The adapter calls
`startLlmSpan` synchronously, returns the wrapped `ModelStream` to its
caller, and the wrapper closes the span via exactly one of `end('ok' \|
'error' \| 'aborted')` based on what terminates the stream.

### Boundaries preserved

- No tool-loop iteration — K1's `run()` is single-shot; K4 owns iteration.
- Tenant id read from `tenantContext.getTenantId()` for span attributes only.
- Global `fetch` (Node 22+) is the SDK transport — testkit MSW intercepts cleanly.

## 6. Component contracts

### 6.1 `createAnthropicAdapter`

```ts
// src/models/anthropic.ts
export interface AnthropicAdapterConfig {
  apiKey: string
  baseURL?: string
  defaultHeaders?: Record<string, string>
  maxRetries?: number               // default 2 (SDK built-in)
  timeoutMs?: number                // default 60_000
}
export function createAnthropicAdapter(cfg: AnthropicAdapterConfig): ModelAdapter
```

Constructs one `new Anthropic({ apiKey, baseURL, defaultHeaders, maxRetries,
timeout })` and closes over it. `provider: 'anthropic'`. The SDK's built-in
`p-retry` handles 408/409/429/5xx transient retries before returning the
Stream object (Mastra-aligned pattern; K1 spec line 707).

### 6.2 `createOpenAIAdapter`

```ts
// src/models/openai.ts
export interface OpenAIAdapterConfig {
  apiKey: string
  baseURL?: string                  // LiteLLM / custom OpenAI-compatible proxy
  defaultHeaders?: Record<string, string>
  organization?: string
  project?: string
  maxRetries?: number               // default 2
  timeoutMs?: number                // default 60_000
}
export function createOpenAIAdapter(cfg: OpenAIAdapterConfig): ModelAdapter
```

`provider: 'openai'`. LiteLLM and any other OpenAI-compatible proxy is a
`baseURL` override only.

### 6.3 `createAzureOpenAIAdapter`

```ts
// src/models/azure-openai.ts
export interface AzureOpenAIAdapterConfig {
  apiKey: string
  endpoint: string                  // https://<resource>.openai.azure.com
  apiVersion: string                // e.g. "2024-10-21"
  defaultHeaders?: Record<string, string>
  maxRetries?: number               // default 2
  timeoutMs?: number                // default 60_000
}
export function createAzureOpenAIAdapter(cfg: AzureOpenAIAdapterConfig): ModelAdapter
```

`provider: 'azure-openai'`. Constructs `new AzureOpenAI({ apiKey, endpoint,
apiVersion })` — the SDK's purpose-built subclass handles `api-key` header
and `api-version` query param. The `model` field in `AdapterRequest` is
treated as the deployment name (caller wires
`azure-openai/my-gpt-4o-deployment` model IDs).

### 6.4 `cache-control.ts` (Anthropic-only helper)

```ts
export function applyAnthropicCacheControl<T extends {
  system?: string | Array<{ type: 'text'; text: string; cache_control?: ... }>
  tools?: Array<{ name: string; description?: string; input_schema: unknown; cache_control?: ... }>
}>(req: T, cacheTtl: '5m' | '1h' | null): T
```

Pure. When `cacheTtl !== null`: wraps `system` into typed-array form with
`cache_control: { type: 'ephemeral', ttl }`, and adds `cache_control` to the
**last** tool entry only (caches everything up to and including that marker —
Anthropic's documented pattern). When `null`: returns the input unchanged.

Imported only from `src/models/anthropic.ts`. `openai.ts` and
`azure-openai.ts` never reference it.

### 6.5 `span.ts`

```ts
export interface LlmSpanAttrs {
  estimatedInputTokens: number
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'error'
  errorCode?: string
  aborted?: boolean
}
export interface LlmSpanHandle {
  record(attrs: Partial<LlmSpanAttrs>): void
  end(status: 'ok' | 'error' | 'aborted', err?: unknown): void
}
export function startLlmSpan(
  provider: string,
  model: string,
  runId: string,
): LlmSpanHandle
```

Uses `@opentelemetry/api`'s tracer (already initialized via `apps/api`'s
`instrumentation.ts`). Span name: `llm.<provider>.stream`. Baseline attrs:
`llm.provider`, `llm.model`, `run.id`, `tenant.id` (via
`tenantContext.getTenantId()`; attribute omitted when ALS frame is absent).

The handle returns synchronously so the adapter can pass `record` into the
wrapped `ModelStream`. `end('ok' \| 'error' \| 'aborted', err?)` sets span
status and closes the span. Calling `end` twice is a no-op. The adapter is
responsible for calling `end` exactly once via one of:
- stream's `finalMessage()` resolves → `end('ok')`
- stream's `abort()` is invoked while `ctx.signal.aborted` is true → `end('aborted')`
- the SDK throws (pre-stream or mid-stream) → `end('error', cause)`

Choosing `startLlmSpan` (manual end) over `withLlmSpan(fn)` (auto-end on
return) is deliberate: the adapter must return the `ModelStream` to its
caller synchronously after `await sdk.stream(...)`, but the span must
outlive that return until the stream is consumed. A `withLlmSpan(fn)` form
would force `fn` to await the entire stream before returning, which would
block `run()` from receiving any chunk until completion.

### 6.6 `tokens.ts`

```ts
export function countTokens(text: string, model: string): number
export function estimateMessagesInputTokens(
  messages: KernelMessage[],
  systemPrompt: string | undefined,
  model: string,
): number
```

Backed by `js-tiktoken`. Pre-request estimate sums system + each message's
text content (`tool_use.args` and `tool_result.result` stringified via
`JSON.stringify`). Provider `usage` post-response is authoritative; the
pre-estimate is span attribute only — never used for budget enforcement
(no P1 budget enforcement, per `10-llm-model-router.md:54`).

### 6.7 `translate/anthropic.ts` (pure)

```ts
export function kernelToAnthropic(req: AdapterRequest): {
  system?: string | Array<...>
  messages: Anthropic.MessageParam[]
  tools?: Anthropic.Tool[]
  max_tokens: number
  model: string
}
export function anthropicEventToKernelChunks(
  event: Anthropic.MessageStreamEvent,
  state: AnthropicStreamState,
): KernelChunk[]
export function anthropicFinalToKernelMessage(msg: Anthropic.Message): KernelMessage
```

The `AnthropicStreamState` tracks per-`content_block_start` tool metadata
(toolCallId, name, accumulated args buffer) so `content_block_stop` for a
`tool_use` block can emit the parsed `tool_call` chunk.

### 6.8 `translate/openai.ts` (pure)

```ts
export function kernelToOpenAI(req: AdapterRequest): OpenAI.ChatCompletionCreateParamsStreaming
export function openaiEventToKernelChunks(
  chunk: OpenAI.ChatCompletionChunk,
  state: OpenAIStreamState,
): KernelChunk[]
export function openaiFinalToKernelMessage(msg: OpenAI.ChatCompletion): KernelMessage
```

`OpenAIStreamState` tracks tool_call accumulation across delta chunks (id +
name appear once, `arguments` streams across chunks). On `finish_reason ===
'tool_calls'` the accumulated `arguments` are JSON-parsed and a `tool_call`
chunk is emitted per accumulated entry. Stream params include
`stream_options: { include_usage: true }` so the final chunk carries `usage`.

### 6.9 `apps/api/src/agent.ts`

```ts
import {
  createAdapterRegistry,
  createAnthropicAdapter,
  createOpenAIAdapter,
  createAzureOpenAIAdapter,
} from '@seta/agent-core'
import { logger } from '@seta/observability'
import { env } from './env'

export const agentRegistry = createAdapterRegistry()

agentRegistry.register('anthropic', createAnthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY }))
logger.info({ provider: 'anthropic' }, 'adapter registered')

agentRegistry.register('openai', createOpenAIAdapter({ apiKey: env.OPENAI_API_KEY }))
logger.info({ provider: 'openai' }, 'adapter registered')

if (env.AZURE_OPENAI_ENDPOINT !== undefined && env.AZURE_OPENAI_API_KEY !== undefined) {
  agentRegistry.register('azure-openai', createAzureOpenAIAdapter({
    apiKey: env.AZURE_OPENAI_API_KEY,
    endpoint: env.AZURE_OPENAI_ENDPOINT,
    apiVersion: env.AZURE_OPENAI_API_VERSION,
  }))
  logger.info({ provider: 'azure-openai' }, 'adapter registered')
}
```

`main.ts` adds `import './agent'` after the other registrations. The
`agentRegistry` export is unused by any route in K2 but is the entry point
consumed by the agent product in a later stream.

### 6.10 `apps/api/src/env.ts` additions

```ts
ANTHROPIC_API_KEY: z.string().min(1),
OPENAI_API_KEY: z.string().min(1),
AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
AZURE_OPENAI_API_KEY: z.string().min(1).optional(),
AZURE_OPENAI_API_VERSION: z.string().default('2024-10-21'),
```

Anthropic + OpenAI required at boot. Azure activated only when both
`AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY` are set; otherwise the
azure-openai provider is simply not registered (calling
`registry.select('azure-openai/...')` throws `ADAPTER_NOT_REGISTERED`).

## 7. Data flow

### 7.1 Kernel `AdapterRequest` → Anthropic wire shape

| Kernel field | Anthropic shape | Notes |
|---|---|---|
| `model` | `model` | bare model id; provider prefix stripped by registry |
| `systemPrompt` | `system: [{ type: 'text', text, cache_control? }]` | wrapped to array form when `cacheTtl !== null` |
| `messages` | `messages: Anthropic.MessageParam[]` | `system` role filtered out and mapped to top-level `system`; `tool` role → `user` message with `{ type: 'tool_result', tool_use_id, content }` blocks; `assistant` `tool_use` content blocks preserved |
| `tools` | `tools: [{ name, description, input_schema, cache_control? on last }]` | from `JsonSchemaTool[]` produced by K1's `prepareTools` |
| `maxTokens` | `max_tokens` | required by Anthropic; default `4096` when caller omits |
| `cacheTtl` | `cache_control: { type: 'ephemeral', ttl }` on system + last tool | `null` ⇒ no annotations |

### 7.2 Anthropic stream events → `KernelChunk`

```
content_block_start (text)             → (no chunk; state bookkeeping)
content_block_delta (text_delta)       → { type: 'text', delta }
content_block_start (tool_use)         → (no chunk; record toolCallId + name)
content_block_delta (input_json_delta) → { type: 'tool_args', toolCallId, argsDelta }
content_block_stop (tool_use)          → { type: 'tool_call', toolCallId, name, args: JSON.parse(accumulated) }
message_delta (stop_reason)            → (defer to message_stop)
message_stop                           → { type: 'finish', reason, usage }
```

`stop_reason` mapping: `end_turn|stop_sequence` → `stop`; `tool_use` →
`tool_calls`; `max_tokens` → `length`; anything else → `error`.

### 7.3 Kernel `AdapterRequest` → OpenAI Chat Completions wire shape

| Kernel field | OpenAI shape | Notes |
|---|---|---|
| `model` | `model` | bare id; deployment name for Azure |
| `systemPrompt` | `messages[0]: { role: 'system', content }` | prepended |
| `messages` | `messages` | `assistant` with `tool_use` content → `{ role: 'assistant', tool_calls: [...] }`; `tool` role → `{ role: 'tool', tool_call_id, content }` |
| `tools` | `tools: [{ type: 'function', function: { name, description, parameters } }]` | wrap `JsonSchemaTool` |
| `maxTokens` | `max_completion_tokens` | `openai@6.x` field name; not `max_tokens` |
| `cacheTtl` | (ignored — no-op, documented) | OpenAI's automatic structured-output caching covers parity |

Stream params: `{ stream: true, stream_options: { include_usage: true } }`.

### 7.4 OpenAI stream chunks → `KernelChunk`

```
choices[0].delta.content (string)        → { type: 'text', delta }
choices[0].delta.tool_calls[i]           → accumulate; emit { type: 'tool_args', toolCallId, argsDelta }
choices[0].finish_reason: 'tool_calls'   → per accumulated entry: { type: 'tool_call', toolCallId, name, args: JSON.parse(...) }
choices[0].finish_reason: <any>          → { type: 'finish', reason, usage? }
```

`finish_reason` mapping: `stop` → `stop`; `tool_calls` → `tool_calls`;
`length` → `length`; `content_filter` | `function_call` | other → `error`.

`usage` arrives on the final chunk (when `stream_options.include_usage:
true`); the translator buffers it onto the `finish` chunk. OpenAI's `usage`
shape:
- `prompt_tokens` → `inputTokens`
- `completion_tokens` → `outputTokens`
- `prompt_tokens_details.cached_tokens` → `cacheReadInputTokens`

### 7.5 Azure-specific delta from OpenAI

| Concern | Azure handling |
|---|---|
| Model field | Deployment name; adapter passes through unchanged |
| Auth | `api-key` header (handled by `AzureOpenAI` SDK subclass) |
| `api-version` | URL query param (handled by SDK) |
| Wire format | Identical to OpenAI Chat Completions — same translator used |
| `cacheTtl` | Same no-op as OpenAI |
| `usage` | Same shape; `cached_tokens` supported on newer deployments |

The Azure adapter reuses `translate/openai.ts` 100%. Only the SDK client
construction differs.

### 7.6 Abort propagation

```
client disconnect → Hono SSE onAbort → AbortController.abort()
                  → ctx.signal.aborted = true
                  → K1 run()'s `for await` loop sees aborted → yields { type: 'abort' }, returns
                  → finally { stream.abort() } → adapter's ModelStream.abort()
                                              → sdk.stream.abort()
                                              → SDK fetch cancelled
```

K1's `run()` already implements the run-loop side. K2's adapter only needs
to (1) pass `{ signal: ctx.signal }` into every SDK call and (2) wire
`ModelStream.abort()` to the SDK's stream object's `.abort()`.

### 7.7 OTel span lifecycle per call

The span starts synchronously when the adapter enters `stream(req, ctx)` and
ends when the wrapped `ModelStream` is **fully consumed, aborted, or
errors**. Exactly one of `span.end('ok' | 'error' | 'aborted')` fires per
call. See §5 runtime-flow diagram for the precise call sites.

## 8. Error handling

### 8.1 Error sources and kernel mapping

| Source | Kernel surface |
|---|---|
| Network/5xx/429 after SDK retries exhausted | `LlmError({ code: 'LLM_TRANSIENT_EXHAUSTED' \| 'LLM_RATE_LIMITED' \| 'LLM_SERVER_ERROR', category: 'THIRD_PARTY', details: { provider, model, status, requestId } })` |
| 401/403 | `LlmError({ code: 'LLM_AUTH_FAILED', category: 'SYSTEM', ... })` |
| 400 (malformed) | `LlmError({ code: 'LLM_BAD_REQUEST', category: 'SYSTEM', details: { provider, message, paramPath? } })` |
| 422 / content policy / refusal | `LlmError({ code: 'LLM_CONTENT_POLICY', category: 'USER', ... })` |
| Mid-stream socket error | `LlmError({ code: 'LLM_STREAM_INTERRUPTED', category: 'THIRD_PARTY', ... })`. No mid-stream retry. |
| Tool args JSON parse fail | `LlmError({ code: 'LLM_INVALID_TOOL_ARGS', category: 'THIRD_PARTY', details: { toolCallId, name, rawArgs } })` |
| Abort | adapter stops yielding; K1 `run()` emits `{ type: 'abort' }`. Never mapped to an error chunk. |
| Unknown / non-`Error` throw | `LlmError({ code: 'LLM_UNKNOWN', category: 'SYSTEM', cause })` |

### 8.2 Single mapping helper per provider

```ts
// src/models/anthropic.ts (private)
function mapAnthropicError(err: unknown, model: string): LlmError
// src/models/openai.ts (private)
function mapOpenAIError(err: unknown, model: string): LlmError
```

Each switches on the SDK error class (`Anthropic.APIError`,
`OpenAI.APIError`) — both expose `.status`, `.error?.type`,
`.headers['x-request-id']`. These mappers are the **only** places
`instanceof <SDK>.APIError` appears. Azure adapter reuses `mapOpenAIError`.

### 8.3 Span on error

Adapter calls `span.record({ errorCode })` then `span.end('error', cause)`
in the catch block. The span helper sets OTel status `ERROR` with message
and records an exception event. K1 `run()`'s emitted `{ type: 'error',
error }` chunk is the caller's signal; the OTel span is the observability
signal.

### 8.4 Stable error codes added in K2

```
LLM_TRANSIENT_EXHAUSTED   — SDK retries done, still 5xx/429
LLM_RATE_LIMITED          — 429 with explicit no-retry header
LLM_SERVER_ERROR          — 5xx beyond retry budget
LLM_AUTH_FAILED           — 401/403
LLM_BAD_REQUEST           — 400
LLM_CONTENT_POLICY        — 422 / content_filter finish_reason
LLM_STREAM_INTERRUPTED    — mid-stream failure
LLM_INVALID_TOOL_ARGS     — JSON parse fail on tool args
LLM_UNKNOWN               — fallback
```

These are stable strings committed to RFC 7807 mapping. Adding more codes
later is fine; renaming is breaking.

### 8.5 Deliberate non-features

- No fallback model retry — K4 owns `cfg.fallback`.
- No content-policy retry with rephrasing — `Processor.processAPIError` is K4+.
- No mid-stream resume — partial output stays; caller sees error chunk.
- No automatic recording-on-error in tests — recordings are deliberate (`RECORD=1`).

## 9. Test strategy

### 9.1 Unit tests (co-located, no MSW)

| File | Coverage |
|---|---|
| `src/models/cache-control.test.ts` | `null` pass-through; `'5m'` array-form + last-tool marker; `'1h'` ttl propagated; single-tool list marker on that tool |
| `src/models/tokens.test.ts` | `countTokens('')` = 0; `estimateMessagesInputTokens` sums system + content text; `tool_use.args` and `tool_result.result` stringified |
| `src/models/span.test.ts` | Span name = `llm.<provider>.stream`; baseline attrs set; `record()` merges; `end('ok')` sets status OK, `end('error', err)` sets ERROR + records exception, `end('aborted')` sets OK + `aborted: true` attr; calling `end` twice is a no-op |
| `src/models/translate/anthropic.test.ts` | Kernel→Anthropic for text-only, with tools, with tool_result history, with system. Events→KernelChunk for text delta, tool_use start+delta+stop, message_stop with usage. Final message→KernelMessage |
| `src/models/translate/openai.test.ts` | Same matrix for OpenAI Chat Completions shape; `max_completion_tokens` not `max_tokens`; `stream_options.include_usage`; tool_calls accumulation across chunks |

All pure — no SDK clients constructed.

### 9.2 Integration tests (`tests/integration/`, MSW recordings)

| Scenario | anthropic | openai | azure-openai |
|---|---|---|---|
| Text-only stream success | ✓ | ✓ | ✓ |
| Tool-call stream success | ✓ | ✓ | ✓ |
| `cache_control` request shape | ✓ | — | — |
| 429 → SDK auto-retry → success | ✓ | ✓ | ✓ |
| Abort mid-stream | ✓ | ✓ | ✓ |

Per-adapter assertions:
- Chunk sequence matches expectation
- Final usage attrs land on the OTel span
- `cache_control`: recorded request body includes annotations on system +
  last tool when `cacheTtl: '5m'`; `cacheReadInputTokens` flows out on the
  finish chunk's usage
- 429 retry: recording has two entries (429 then 200); test asserts the
  client retried and final chunks land
- Abort: caller calls `ctx.signal.abort()` after first text chunk; asserts
  no further chunks, span status OK with `aborted: true` attr, no error chunk

13 recording files for these tests.

### 9.3 Tenant-ALS integration test (`tests/integration/tenant-als.test.ts`)

Closes K1 open question #768. One test:

1. `tenantContext.run('tenant-a', async () => { ... })` wraps a call to
   `run()` with a recorded fixture.
2. Inside the adapter, `withLlmSpan` reads `tenantContext.getTenantId()`
   and records as span attr.
3. Test asserts the span exporter saw `tenant.id === 'tenant-a'` even
   though `await sdk.messages.stream(...)` crossed microtask boundaries.

If this test fails, `apps/api`'s future SSE handler must wrap each chunk
producer in `tenantContext.run()` — that becomes a separate follow-up.

One recording file: `tenant-als.json`.

### 9.4 Recording fixtures: organization (per-test)

```
platform/agent/core/__recordings__/
├── anthropic-text-stream.json
├── anthropic-tool-call-stream.json
├── anthropic-cache-control.json
├── anthropic-429-retry.json
├── anthropic-abort.json
├── openai-text-stream.json
├── openai-tool-call-stream.json
├── openai-429-retry.json
├── openai-abort.json
├── azure-openai-text-stream.json
├── azure-openai-tool-call-stream.json
├── azure-openai-429-retry.json
├── azure-openai-abort.json
└── tenant-als.json
```

14 files. Closes K1 open question #767 in favor of per-test fixture scoping.

### 9.5 Recording mode and CI

- Default: strict replay. CI runs `pnpm test:integration` against checked-in
  fixtures; missing hash → fail.
- `RECORD=1 pnpm vitest run -t <name>`: record-if-missing. Requires real
  API keys in env.
- `RECORD=force pnpm vitest run -t <name>`: re-record after intentional
  translator changes.
- PR review diffs `__recordings__/*.json`. Recording changes require an
  inline note in the PR description.
- `turbo.json` already pins `__recordings__/**` as input.

### 9.6 Determinism

Each integration test injects:

```ts
const ctx = createRunCtx({
  signal,
  generateId: () => '00000000-0000-4000-8000-000000000000',
  now: () => new Date('2026-05-12T00:00:00Z').getTime(),
  currentDate: () => new Date('2026-05-12T00:00:00Z'),
})
```

So request bodies are byte-stable across re-records.

### 9.7 Gates

- `pnpm --filter @seta/agent-core typecheck` clean
- `pnpm --filter @seta/agent-core lint` clean
- `pnpm --filter @seta/agent-core test:unit` — 100% line coverage on
  `src/models/{anthropic,openai,azure-openai,cache-control,span,tokens,
  translate/anthropic,translate/openai}.ts`
- `pnpm --filter @seta/agent-core test:integration` passes with checked-in
  fixtures
- `pnpm --filter @seta/api typecheck` clean (`apps/api/src/agent.ts`
  resolves)
- `pnpm --filter @seta/api build` succeeds

## 10. Acceptance criteria

1. All gates in §9.7 pass.
2. `import { createAnthropicAdapter, createOpenAIAdapter,
   createAzureOpenAIAdapter } from '@seta/agent-core'` resolves from
   `apps/api`.
3. Booting `apps/api` with valid `ANTHROPIC_API_KEY` + `OPENAI_API_KEY`
   logs `adapter registered: anthropic` and `adapter registered: openai`
   exactly once each. When Azure env is also set, `adapter registered:
   azure-openai` logs once.
4. With invalid `ANTHROPIC_API_KEY`, integration tests in recording mode
   surface `LLM_AUTH_FAILED`.
5. SCOPE.md "Current state" updated: K2 and K3 marked done; cacheTtl on
   OpenAI documented as no-op.
6. K1 open questions #764 (cacheTtl parity), #767 (fixture scoping), #768
   (SSE ALS) closed in SCOPE.md "Open questions".
7. No edits to `@seta/middleware`, `@seta/observability`, `@seta/tenant`,
   or K1 source files outside `src/index.ts`.
8. No new ADR — ADR-0010 from K1 covers the boundary decisions.

## 11. Risks and trade-offs

- **SDK retry behavior is opaque.** Both SDKs internally `p-retry` on
  transient classes; we set `maxRetries: 2` at construction and don't
  reimplement. Risk: an SDK upgrade changes retry semantics silently.
  Mitigation: the 429-retry recording asserts behavior; a future SDK
  bump that breaks retries will fail that test.
- **OpenAI's `usage.prompt_tokens_details.cached_tokens` is recent.**
  Older deployments / older SDK versions may not emit it. Mitigation: the
  translator treats it as optional; absence → undefined `cacheReadInputTokens`.
- **Azure deployment-name ambiguity.** Agent configs that use
  `azure-openai/<deployment>` must keep the deployment name stable; renaming
  the Azure deployment breaks all configs referencing it. Documented in the
  Azure adapter's JSDoc.
- **Tenant ALS across `await`.** Node 22 `AsyncLocalStorage` survives
  microtask boundaries; the integration test (§9.3) is the proof. If we
  ever introduce a worker thread inside an adapter, ALS will not propagate
  — adapters are pure-fetch only and have no reason to spawn workers.
- **Test runtime.** 14 integration tests × ~1s replay each is acceptable;
  recordings are local file reads.
- **Coverage thresholds.** The 100% line-coverage requirement on the new
  files means uncoverable branches (defensive throws, exhaustive switches)
  may need explicit `/* c8 ignore */` markers; documented per file as
  they're added.

## 12. Follow-ups (post-K2)

- **K4** (AG-S + AG-F1): tool-call iteration outer loop, `accumulatedSteps[]`,
  `stopWhen`, fallback-model failover (`cfg.fallback`), concurrent tool
  execution, processor pipeline.
- **MEM stream** (AG-S, W1-W2): real `@seta/agent-memory` provider binds at
  composition root.
- **Per-tool budgets** — confirm `{ maxCalls, maxTokens?, timeoutMs? }`
  shape at K4 land.
- **Cost-record sink decision** — audit/observability stream chooses
  between `@seta/audit` row vs OTel-attrs-only.
- **K3 retirement** — K3 stream is absorbed into K2; the K3 placeholder in
  any roadmap doc should be removed in this PR.

## 13. Open questions reserved for K4 / later

- `StopCondition[]` semantics: array form is logical-OR. Confirm at K4 that
  no caller wants AND.
- Per-tool budget shape: `{ maxCalls, maxTokens?, timeoutMs? }` or simpler.
  K4 decides.

---

**End of design.**
