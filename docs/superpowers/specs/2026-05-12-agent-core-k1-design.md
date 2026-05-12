# `@seta/agent-core` K1 — Kernel surface design

**Status:** Draft
**Date:** 2026-05-12
**Authors:** AG-S (kernel) + brainstorm session
**Supersedes:** none (K1 is the first kernel PR)
**Related:**
- `platform/agent/core/SCOPE.md` (authoritative package contract)
- `docs/explorations/2026-05-12-mastra-spike/02-agent-core.md`
- `docs/explorations/2026-05-12-mastra-spike/03-run-loop.md`
- `docs/explorations/2026-05-12-mastra-spike/04-tools-mcp.md`
- `docs/explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md`
- `docs/explorations/2026-05-12-mastra-spike/10-llm-model-router.md`
- `docs/setup.md` §5 (kernel patterns)
- `docs/plans/Project Plan.md` §7 Day-1, Sheet 3 (K stream, 21 SP / 10–11 PD)

---

## 1. Goal

Ship the K1 increment of `@seta/agent-core`: the **kernel surface** — types, interfaces, error classes, adapter registry, pure helpers, `NullMemoryProvider`, single-iteration `run()`, and `streamKernelSSE` — with **zero LLM-SDK imports**. The package compiles, type-checks, has full unit coverage via a `FakeAdapter`, and exposes the full public surface that downstream packages will import.

Concrete provider adapters (Anthropic, OpenAI / OpenAI-compatible) ship in **K2**; the MSW recording testkit ships in **K1.5** (AG-F1).

## 2. Non-goals

- **Concrete LLM SDK adapters** — `AnthropicAdapter` / `OpenAIAdapter` deferred to K2.
- **MSW recording testkit** — `src/testkit/setupLLMRecording()` deferred to K1.5 (AG-F1, parallel track).
- **Tool-call iteration loop** — `run()` executes a single inner step; outer loop (`accumulatedSteps[]`, `stopWhen`, fallback models) deferred to K4.
- **Processor pipeline execution** — `Processor[]` is iterated as no-op; hooks fire in K4.
- **Memory wiring beyond the null provider** — real `@seta/agent-memory` binds in MEM stream.
- **Workflow DSL** — `.then()` / `.parallel()` live in `@seta/agent-workflows`. K1 only owns `Run` + `RunStatus` join keys.
- **MCP server exposure, HITL `approveToolCall`, chunk-replay cache** — all P2 per `04-tools-mcp.md:56-58`, `03-run-loop.md:72`.
- **Per-tool budget enforcement** — schema reserved on `RunLoopOptions`, not enforced.

## 3. Constraints (CLAUDE.md + SCOPE.md)

- **No DI container, no service registry, no plugin loader.** Composition root is `apps/api/src/main.ts`. The adapter registry is a factory-returned instance, passed to `run()` per call.
- **No legacy / no backward compat.** Pre-1.0; every caller changes in the same PR.
- **`platform/*` depends on nothing in `modules/*` or `apps/*`.**
- **Tenant id never a function parameter** — kernel reads `tenantContext.getTenantId()` from `@seta/tenant` when it needs one (K1 does not, but the contract is reserved).
- **ESM only**, `import type` for type-only imports, no TS path aliases, co-located `*.test.ts`.
- **No `console.log`** — `logger` from `@seta/observability`.
- **External SDK pins** already in `package.json`: `zod@4.4.3`, `openai@6.37.0`, `@anthropic-ai/sdk@0.95.1`. K1 imports `zod` only; `openai` / `@anthropic-ai/sdk` stay declared but unused until K2.
- **New dep this PR:** `ulid` (run-id generation, injectable for determinism). Install via `pnpm --filter @seta/agent-core add ulid`.

## 4. File layout

```
platform/agent/core/
├── src/
│   ├── index.ts                       # public barrel — re-exports everything below
│   ├── types/
│   │   ├── chunk.ts                   # KernelChunk discriminated union, TokenUsage
│   │   ├── stream.ts                  # ModelStream<TChunk>
│   │   ├── message.ts                 # KernelMessage canonical form
│   │   ├── tool.ts                    # Tool, ToolExecutionContext, ToolResult, ToolAnnotations, JsonSchemaTool
│   │   ├── schema.ts                  # StandardSchemaV1 type alias
│   │   ├── run.ts                     # RunCtx, Run, RunStatus, StepResult, RunInput
│   │   ├── memory.ts                  # MemoryProvider, MemoryContext, RecallResult
│   │   ├── processor.ts               # Processor, ProcessorContext
│   │   └── config.ts                  # AgentConfig, RunLoopOptions, StopCondition, AdapterRequest
│   ├── errors/
│   │   ├── index.ts                   # KernelError + Agent/Llm/Tool/ToolValidationError
│   │   └── classify.ts                # classifyError(err) → 'transient'|'terminal'
│   ├── models/
│   │   ├── adapter.ts                 # ModelAdapter interface
│   │   ├── registry.ts                # createAdapterRegistry()
│   │   ├── prepare-tools.ts           # Zod → JSON-Schema + fixTypelessProperties + $schema pin
│   │   └── retry.ts                   # withRetry(fn, {maxRetries, signal})
│   ├── memory/
│   │   └── null-provider.ts           # NullMemoryProvider class
│   ├── run/
│   │   ├── run.ts                     # run(cfg, input, opts) — single-iteration scaffold
│   │   ├── safe-stream.ts             # safeEnqueue / safeClose (Hono SSE wrappers)
│   │   └── make-run-ctx.ts            # createRunCtx({signal, generateId?, now?, currentDate?})
│   ├── sse/
│   │   └── stream-kernel-sse.ts       # streamKernelSSE(c, run)
│   └── testkit/
│       ├── fake-adapter.ts            # FakeAdapter — emits a configurable chunk sequence
│       └── index.ts                   # exports FakeAdapter only (NOT the MSW testkit)
└── (existing scaffold files unchanged: package.json, tsconfig.json, vitest.config.ts, SCOPE.md)
```

Plus:
- `docs/adr/0010-agent-kernel-boundary.md` — records the boundary decisions (no DI, single registry in main.ts, two-part provider IDs, direct SDK use planned for K2).

**Out of scope this PR:** any edit to `apps/api/src/main.ts`. K1 ships only the package. K2 wires the first concrete adapter and updates `main.ts`.

## 5. Public interface

### 5.1 Chunk + stream

```ts
// types/chunk.ts
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
}

export type KernelChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_args'; toolCallId: string; argsDelta: string }
  | { type: 'tool_call'; toolCallId: string; name: string; args: unknown }
  | { type: 'finish'; reason: 'stop' | 'tool_calls' | 'length' | 'error'; usage?: TokenUsage }
  | { type: 'error'; error: KernelError }
  | { type: 'abort' }
```

```ts
// types/stream.ts
export interface ModelStream<TChunk> extends AsyncIterable<TChunk> {
  abort(): void
  finalMessage(): Promise<KernelMessage>
}
```

Six variants, deliberate. Mastra's `stream/types.ts:711+` has ~50 chunk types; we reject that breadth as overfit to Mastra's workflow-as-loop architecture.

### 5.2 Message canonical form

```ts
// types/message.ts
export type KernelRole = 'system' | 'user' | 'assistant' | 'tool'

export interface KernelMessage {
  role: KernelRole
  content: KernelMessageContent[]
  toolCallId?: string  // role === 'tool'
}

export type KernelMessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolCallId: string; name: string; args: unknown }
  | { type: 'tool_result'; toolCallId: string; result: unknown; isError?: boolean }
```

OpenAI ⇄ Anthropic shape conversions live inside each `ModelAdapter` (K2). Route code never touches OpenAI/Anthropic message shapes.

### 5.3 Tool contract

```ts
// types/tool.ts
import type { StandardSchemaV1 } from './schema'

export interface Tool<TInput = unknown, TOutput = unknown> {
  id: string
  description: string
  inputSchema: StandardSchemaV1<TInput>
  outputSchema: StandardSchemaV1<TOutput>     // mandatory; write tools especially
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<ToolResult<TOutput>>
  annotations?: ToolAnnotations
  toModelOutput?: (out: TOutput) => unknown   // optional: re-render rich outputs as plain text for the LLM
}

export interface ToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
  requireApproval?: boolean   // K1 reserved; K4 enforces "collapse concurrency to 1"
}

export type ToolExecutionContext =
  | { surface: 'teams'; abortSignal: AbortSignal; runId: string; requestContext: Readonly<RunCtx> }
  | { surface: 'direct'; abortSignal: AbortSignal; runId: string; requestContext: Readonly<RunCtx> }

export type ToolResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ToolValidationError }
  | { suspend: { reason: string; resumeLabel: string } }   // shape reserved for @seta/agent-workflows
```

```ts
// types/tool.ts (continued)
export interface JsonSchemaTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>   // JSON Schema draft-07
}
```

### 5.4 Schema seam (Standard Schema)

```ts
// types/schema.ts — minimal Standard Schema v1 type-only definition.
// Zod 4 implements ~standard natively; future Arktype/Valibot tools also work.
export interface StandardSchemaV1<TInput = unknown, TOutput = TInput> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) =>
      | { value: TOutput }
      | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }> }
      | Promise<
          | { value: TOutput }
          | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }> }
        >
    readonly types?: { readonly input: TInput; readonly output: TOutput }
  }
}
```

### 5.5 Run context + run identifier

```ts
// types/run.ts
import type { KernelChunk } from './chunk'
import type { KernelMessage } from './message'

export type RunStatus = 'created' | 'running' | 'completed' | 'failed'

export interface Run {
  id: string                  // ULID
  status: RunStatus
  tenantId: string
  createdAt: Date
  finishedAt?: Date
}

export interface RunCtx {
  runId: string
  signal: AbortSignal
  retryCount: number
  now: () => number
  generateId: () => string
  currentDate: () => Date
}

export interface RunInput {
  messages: KernelMessage[]
  threadId?: string
  conversationId?: string
}

export interface StepResult {
  kind: 'model' | 'tool'
  chunks: KernelChunk[]
  message?: KernelMessage
}
```

The `{ now, generateId, currentDate }` injection mirrors `mastra/packages/core/src/loop/loop.ts:60-77`. Tests pass deterministic implementations so future MSW recordings are byte-stable.

### 5.6 Adapter contract + registry

```ts
// models/adapter.ts
import type { KernelChunk, ModelStream, KernelMessage, JsonSchemaTool, RunCtx } from '../types'

export interface AdapterRequest {
  model: string                              // bare model id (no provider prefix)
  messages: KernelMessage[]
  systemPrompt?: string
  tools?: JsonSchemaTool[]
  maxTokens?: number
  cacheTtl?: '5m' | '1h' | null              // Anthropic ephemeral prompt cache; OpenAI no-op
}

export interface ModelAdapter {
  readonly provider: string                  // 'anthropic' | 'openai' | ...
  stream(req: AdapterRequest, ctx: RunCtx): Promise<ModelStream<KernelChunk>>
}
```

```ts
// models/registry.ts
export interface AdapterRegistry {
  register(provider: string, adapter: ModelAdapter): void
  get(provider: string): ModelAdapter | undefined
  select(modelId: string): { adapter: ModelAdapter; bareModel: string }
}

export function createAdapterRegistry(): AdapterRegistry
```

`select('anthropic/claude-4-7-sonnet')` parses the provider prefix, returns `{ adapter, bareModel: 'claude-4-7-sonnet' }`, throws `AgentError({ code: 'ADAPTER_NOT_REGISTERED', ... })` on miss. Pattern mirrors `mastra/packages/core/src/llm/model/gateway-resolver.ts:8` (`parseModelRouterId`) but without the gateway indirection that spike report 10 explicitly rejected.

**Configuration knobs live on the concrete adapter constructor.** Example for K2:

```ts
// K2 preview — not in this PR
adapters.register('openai', new OpenAIAdapter({ apiKey, baseURL }))
// 'openai' also serves Azure/LiteLLM/Ollama/OpenRouter via the baseURL knob
```

### 5.7 Pure helpers

```ts
// models/prepare-tools.ts
export function prepareTools(tools: Tool[]): JsonSchemaTool[]
//
// 1. Convert each tool's Zod inputSchema → JSON Schema via Zod 4's native z.toJSONSchema().
// 2. Apply fixTypelessProperties() — ported verbatim from
//    mastra/packages/core/src/stream/aisdk/v5/compat/prepare-tools.ts:33-71.
//    Untyped properties get type: [string,number,integer,boolean,object,null].
// 3. Pin $schema to 'http://json-schema.org/draft-07/schema#' — providers reject 2020-12.
```

```ts
// errors/classify.ts
export type ErrorClass = 'transient' | 'terminal'
export function classifyError(err: unknown): ErrorClass
//
// Transient:
//   - HTTP 408, 429, 500, 502, 503, 504
//   - Node error codes: ECONNRESET, ETIMEDOUT, EAI_AGAIN, UND_ERR_CONNECT_TIMEOUT, UND_ERR_SOCKET
//   - Anthropic/OpenAI SDK shape: err.status >= 500 || err.status === 429
// Terminal: anything else (incl. 4xx auth, 4xx validation, TypeError, etc.)
// Abort errors (err.name === 'AbortError') are classified 'terminal' (no retry); the caller
// already special-cases abort upstream.
```

```ts
// models/retry.ts
export interface RetryOpts {
  maxRetries: number    // default 2
  signal: AbortSignal
  onAttempt?: (attempt: number, err: unknown) => void
}
export function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T>
//
// - Only retries when classifyError(err) === 'transient'.
// - Aborts immediately if signal.aborted (no further attempts, rethrows original).
// - Exponential backoff: 250ms * 2^attempt, capped at 4000ms; jitter ±20%.
// - On success, resolves with the value. On exhaustion, rethrows the last error.
```

### 5.8 Memory seam

```ts
// types/memory.ts
export interface MemoryContext {
  threadId: string
  conversationId?: string
  scope: 'thread' | 'resource'
  vectorSearchString?: string
}

export interface RecallResult {
  messages: KernelMessage[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
}

export interface MemoryProvider {
  recall(ctx: MemoryContext): Promise<RecallResult>
  saveTurn(ctx: MemoryContext, messages: KernelMessage[]): Promise<void>
  getWorkingMemory(ctx: MemoryContext): Promise<string | null>
  updateWorkingMemory(ctx: MemoryContext, text: string): Promise<void>
}
```

```ts
// memory/null-provider.ts
export class NullMemoryProvider implements MemoryProvider {
  async recall(): Promise<RecallResult> {
    return { messages: [], total: 0, page: 1, perPage: 0, hasMore: false }
  }
  async saveTurn(): Promise<void> {}
  async getWorkingMemory(): Promise<string | null> { return null }
  async updateWorkingMemory(): Promise<void> {}
}
```

No `tenantId` and no `resourceId` on `MemoryContext` — tenant is read from `@seta/tenant` ALS when the real provider needs it (K1's null provider does not).

### 5.9 Processor seam

```ts
// types/processor.ts
export interface ProcessorContext {
  runId: string
  abort(): never
  abortSignal: AbortSignal
  retryCount: number
  writer: { custom(chunk: unknown): void }
}

export interface Processor {
  processInput?(ctx: ProcessorContext, input: RunInput): Promise<RunInput>
  processOutputStep?(ctx: ProcessorContext, step: StepResult): Promise<StepResult>
  processAPIError?(ctx: ProcessorContext, err: unknown): Promise<'retry' | 'rethrow'>
}
```

K1 iterates the array as no-op (preserves the seam, hooks fire in K4).

### 5.10 Errors

```ts
// errors/index.ts
import { DomainError } from '@seta/middleware/errors'  // type-only at compile time

export type KernelErrorDomain = 'AGENT' | 'LLM' | 'TOOL' | 'KERNEL'
export type KernelErrorCategory = 'USER' | 'SYSTEM' | 'THIRD_PARTY'

export interface KernelErrorJSON {
  id: string
  code: string
  domain: KernelErrorDomain
  category: KernelErrorCategory
  details?: Record<string, unknown>
  message: string
}

export class KernelError extends DomainError {
  readonly code: string
  readonly domain: KernelErrorDomain
  readonly category: KernelErrorCategory
  readonly details?: Record<string, unknown>
  constructor(args: {
    code: string
    domain: KernelErrorDomain
    category: KernelErrorCategory
    message: string
    details?: Record<string, unknown>
    cause?: unknown
    status?: number  // default 500
  })
  toJSON(): KernelErrorJSON
}

export class AgentError extends KernelError {}  // domain preset to 'AGENT'
export class LlmError   extends KernelError {}  // domain preset to 'LLM'
export class ToolError  extends KernelError {}  // domain preset to 'TOOL'

export class ToolValidationError extends ToolError {
  // Returned via ToolResult.ok=false, NOT thrown. The LLM gets a self-correction signal.
}

export function kernelErrorOf(err: unknown): KernelError
//
// Coerces any thrown value into a KernelError for SSE error chunks.
// If err is already a KernelError, return as-is. Otherwise wrap with
// { code: 'UNKNOWN_KERNEL_ERROR', domain: 'KERNEL', category: 'SYSTEM' }.
```

Field shape matches Mastra's `MastraErrorJSON` (`mastra/packages/core/src/error/index.ts:69`) so logs/Sentry can group cross-stack. RFC 7807 mapping happens in `@seta/middleware/onError`; the kernel doesn't know about HTTP.

### 5.11 Configuration

```ts
// types/config.ts
export interface AgentConfig {
  model: string                              // provider-qualified: 'anthropic/claude-4-7-sonnet'
  systemPrompt?: string
  maxTokens?: number
  cacheTtl?: '5m' | '1h' | null              // defaults to '5m' if systemPrompt > ~2048 chars
  tools?: Tool[]
  fallback?: string[]                        // K1 reserved; K4 enforces
}

export type StopCondition = (steps: StepResult[]) => boolean | Promise<boolean>

export interface RunLoopOptions {
  adapters: AdapterRegistry                  // required; composition root supplies it
  memory?: MemoryProvider                    // defaults to NullMemoryProvider
  signal?: AbortSignal
  processors?: Processor[]                   // K1 no-op
  maxSteps?: number                          // default 16 (K1 single step regardless)
  stopWhen?: StopCondition | StopCondition[] // K1 reserved
  toolCallConcurrency?: number               // K1 reserved; default 10
  perToolBudget?: { maxCalls?: number; maxTokens?: number; timeoutMs?: number }  // reserved
  onIterationComplete?: (steps: StepResult[]) => void | Promise<void>            // K1 no-op
  generateId?: () => string                  // for RunCtx; default ulid()
  now?: () => number                         // default () => Date.now()
  currentDate?: () => Date                   // default () => new Date()
}
```

### 5.12 Run entry

```ts
// run/run.ts
export async function* run(
  cfg: AgentConfig,
  input: RunInput,
  opts: RunLoopOptions,
): AsyncIterable<KernelChunk>
```

**K1 behavior — single inner step, no tool-call iteration:**

```
1. ctx = createRunCtx({ signal: opts.signal ?? new AbortController().signal, ... })
2. memory = opts.memory ?? new NullMemoryProvider()
3. memCtx = { threadId: input.threadId ?? ctx.runId, scope: 'thread' }
4. recall = await memory.recall(memCtx)
5. messages = [...recall.messages, ...input.messages]
6. { adapter, bareModel } = opts.adapters.select(cfg.model)
7. tools = cfg.tools ? prepareTools(cfg.tools) : undefined
8. systemPrompt = cfg.systemPrompt
9. cacheTtl = cfg.cacheTtl ?? (systemPrompt && systemPrompt.length > 2048 ? '5m' : null)
10. stream = await adapter.stream({ model: bareModel, messages, systemPrompt, tools, maxTokens: cfg.maxTokens, cacheTtl }, ctx)
11. try {
       try {
         for await (const chunk of stream) {
           if (ctx.signal.aborted) { yield { type: 'abort' }; return }
           yield chunk
         }
       } finally {
         // Runs on normal completion, on consumer break (generator.return()),
         // and on thrown errors. Aborts the in-flight LLM request so consumer
         // disconnect tears down the upstream stream.
         stream.abort()
       }
       final = await stream.finalMessage()
       await memory.saveTurn(memCtx, [...input.messages, final])
     } catch (err) {
       if (isAbortError(err) && ctx.signal.aborted) { yield { type: 'abort' }; return }
       yield { type: 'error', error: kernelErrorOf(err) }
     }
```

Re-check `ctx.signal.aborted` per chunk because providers may keep emitting after abort (`mastra/packages/core/src/loop/workflows/agentic-execution/llm-execution-step.ts:328-334`). The inner `try/finally` ensures `stream.abort()` runs even when the *consumer* of `run()` breaks out (the JS runtime calls `iterator.return()` on the generator, which jumps to the `finally`). This is how `streamKernelSSE`'s disconnect propagates all the way to the LLM SDK. The outer tool-call iteration (`accumulatedSteps[]`, `stopWhen`, fallback models, concurrent tool execution) lands in **K4**.

### 5.13 SSE helper

```ts
// sse/stream-kernel-sse.ts
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'

export function streamKernelSSE(c: Context, run: AsyncIterable<KernelChunk>): Response
```

**Behavior:**

```ts
export function streamKernelSSE(c: Context, run: AsyncIterable<KernelChunk>): Response {
  return streamSSE(
    c,
    async (sse) => {
      // Grab the iterator explicitly so onAbort can call .return() on it.
      // Calling .return() on a generator unwinds it to its finally blocks —
      // that's how run()'s `stream.abort()` ends up firing on client disconnect.
      const iter = run[Symbol.asyncIterator]()
      let aborted = false
      sse.onAbort(() => {
        aborted = true
        void iter.return?.(undefined)
      })

      const keepalive = setInterval(() => {
        void safeEnqueue(sse, { event: 'ping', data: '' })
      }, 15_000)

      try {
        while (true) {
          const { value, done } = await iter.next()
          if (done) break
          await safeEnqueue(sse, { event: value.type, data: JSON.stringify(value) })
        }
      } finally {
        clearInterval(keepalive)
      }
    },
    async (err, sse) => {
      // Third-arg error handler. Split abort-vs-error per
      // mastra/packages/core/src/loop/workflows/agentic-execution/llm-execution-step.ts:1316-1331.
      if (isAbortError(err)) {
        logger.debug({ err }, 'kernel SSE aborted')
        await safeEnqueue(sse, { event: 'abort', data: '{}' })
      } else {
        logger.error({ err }, 'kernel SSE failed')
        await safeEnqueue(sse, { event: 'error', data: JSON.stringify(kernelErrorOf(err).toJSON()) })
      }
    },
  )
}
```

`safeEnqueue(sse, message)` wraps `sse.writeSSE(message)` in try/catch and returns `boolean` — analogue of Mastra's `safeEnqueue` (`mastra/packages/core/src/stream/base/input.ts:14-47`). Same try/catch shape; the underlying primitive is Hono's `SSEStreamingApi.writeSSE` rather than `ReadableStreamDefaultController.enqueue`. `safeClose(sse)` similarly wraps `sse.close()` (used implicitly by Hono on handler exit, but exposed for symmetry and possible explicit teardown in tests).

**Abort propagation chain:** client closes → `sse.onAbort` fires → `iter.return()` called → generator's `finally` runs → `stream.abort()` called on the `ModelStream` → underlying SDK abort signal fires → LLM connection closes → no more tokens billed. The caller of `run()` does not need to thread an `AbortSignal` themselves for the disconnect path; iterator-return semantics handle it. If the caller *does* pass `opts.signal`, that's an *additional* abort channel (e.g., a request-scoped timeout) layered on top.

### 5.14 FakeAdapter (testkit)

```ts
// testkit/fake-adapter.ts
export interface FakeAdapterScript {
  chunks: KernelChunk[]
  delayMs?: number                          // delay between chunks; default 0
  finalMessage?: KernelMessage
  throwOn?: { afterChunks: number; error: unknown }  // for error/abort branch tests
}

export class FakeAdapter implements ModelAdapter {
  readonly provider = 'fake'
  constructor(private script: FakeAdapterScript)
  stream(req: AdapterRequest, ctx: RunCtx): Promise<ModelStream<KernelChunk>>
  // The returned ModelStream:
  //  - yields scripted chunks, honoring ctx.signal between each
  //  - abort() flips an internal flag; next iteration throws AbortError
  //  - finalMessage() resolves to script.finalMessage ?? a default assistant message reconstructed from text chunks
}
```

Lives in `src/testkit/` and is exported from the public barrel **only via the `./testkit` subpath** (`@seta/agent-core/testkit`) so production consumers don't accidentally pull it. The package.json `exports` map will add `./testkit` pointing at `dist/testkit/index.js`.

**FakeAdapter is NOT the MSW recording testkit.** That ships in **K1.5** (AG-F1, parallel track) as `setupLLMRecording({ name, recordingsDir?, transformRequest? })`.

## 6. Architecture

### 6.1 Dependency graph (this PR only)

```
@seta/agent-core
├── (type-only) @seta/middleware/errors → DomainError
├── @seta/observability → logger
├── (external) zod@4.4.3
├── (external) ulid (new dep this PR)
└── (external) hono → Context, hono/streaming → streamSSE
```

No `openai`, no `@anthropic-ai/sdk`, no `msw`, no `@seta/db`, no `@seta/tenant` (the latter is reserved for K2+ when tools start reading tenant id).

### 6.2 Module isolation

- **`types/*`** — zero runtime exports. Pure `.d.ts` content after build.
- **`models/registry.ts`** — closure-based state; no module-level mutable state.
- **`models/prepare-tools.ts`** — pure function over JSON; depends only on `zod` for `z.toJSONSchema()`.
- **`errors/*`** — class hierarchy + a coercion helper; type-only `DomainError` import from middleware.
- **`run/run.ts`** — async generator function; depends on `models/registry`, `errors`, `types`. No I/O beyond what the injected adapter does.
- **`sse/stream-kernel-sse.ts`** — Hono-coupled but only via the `hono/streaming` import; the async iterable it consumes is opaque.

Each file is self-contained enough that you can read it without reading siblings. The barrel (`index.ts`) is the only file that knows about every other file.

### 6.3 Adapter registry — closure pattern (mirrors `createConnectorRegistry`)

```ts
// models/registry.ts (sketch)
export function createAdapterRegistry(): AdapterRegistry {
  const adapters = new Map<string, ModelAdapter>()
  return {
    register(provider, adapter) {
      if (adapters.has(provider)) {
        throw new AgentError({ code: 'ADAPTER_ALREADY_REGISTERED', category: 'SYSTEM', message: `provider ${provider}` })
      }
      adapters.set(provider, adapter)
    },
    get(provider) { return adapters.get(provider) },
    select(modelId) {
      const slash = modelId.indexOf('/')
      if (slash <= 0 || slash === modelId.length - 1) {
        throw new AgentError({
          code: 'INVALID_MODEL_ID',
          category: 'USER',
          message: `expected <provider>/<model>, got ${JSON.stringify(modelId)}`,
        })
      }
      const provider = modelId.slice(0, slash)
      const bareModel = modelId.slice(slash + 1)
      const adapter = adapters.get(provider)
      if (!adapter) {
        throw new AgentError({
          code: 'ADAPTER_NOT_REGISTERED',
          category: 'SYSTEM',
          message: `no adapter registered for provider ${JSON.stringify(provider)}`,
          details: { knownProviders: [...adapters.keys()] },
        })
      }
      return { adapter, bareModel }
    },
  }
}
```

### 6.4 Public barrel (`src/index.ts`)

Re-exports everything in `types/*`, `errors/*`, `models/*` (excluding adapter implementations, of which there are none in K1), `memory/null-provider`, `run/run`, `run/safe-stream`, `sse/stream-kernel-sse`. The barrel does **not** export from `testkit/*` — that ships via the `./testkit` subpath.

`package.json` exports map:
```json
{
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./testkit": { "import": "./dist/testkit/index.js", "types": "./dist/testkit/index.d.ts" }
  }
}
```

## 7. Test strategy

Unit tests are co-located (`src/**/*.test.ts`). Coverage targets:

- **`types/chunk.test.ts`** — exhaustive discriminant check; `kind in KernelChunk` ensures TS catches drift.
- **`models/registry.test.ts`** — register/get/select happy path; `INVALID_MODEL_ID` cases (no slash, leading slash, trailing slash, empty provider); `ADAPTER_NOT_REGISTERED` with known-providers list in `details`.
- **`models/prepare-tools.test.ts`** — Zod schema with `z.any()` property → typeless union; Zod schema with nested object → recursive fixup; `$schema` pinned to draft-07; numeric/boolean/string properties pass through untouched.
- **`models/retry.test.ts`** — transient error retries up to `maxRetries`, success on retry, terminal error rethrows immediately, abort short-circuits with no further attempts.
- **`errors/classify.test.ts`** — 429/500/502/503/504 → transient; 401/403/404/422 → terminal; ECONNRESET → transient; AbortError → terminal; unknown shape → terminal.
- **`errors/index.test.ts`** — `KernelError.toJSON()` shape; subclass `domain` presets; `kernelErrorOf(plainError)` wraps; `kernelErrorOf(kernelError)` passes through.
- **`memory/null-provider.test.ts`** — all four hooks return the documented values.
- **`run/run.test.ts`** with `FakeAdapter`:
  - happy path: scripted chunks → yielded in order → `saveTurn` called with `[input + final]`.
  - abort mid-stream: signal.abort() during for-await → `abort` chunk emitted → loop returns.
  - adapter throws transient: `error` chunk emitted (no retry yet — retry lives in adapter for K2; `withRetry` is a separate helper).
  - missing provider: yields `error` chunk with `ADAPTER_NOT_REGISTERED`.
  - cacheTtl auto-default: `systemPrompt` of 2049 chars → `cacheTtl: '5m'` reaches the adapter `req`.
- **`run/safe-stream.test.ts`** — `safeEnqueue(sse, msg)` returns true on success, false when the Hono SSE stream is closed/aborted; `safeClose(sse)` idempotent.
- **`sse/stream-kernel-sse.test.ts`** — using `app.fetch` with a Hono test app + scripted run:
  - happy path: SSE frames in expected order; final `finish` chunk.
  - abort: client closes → `onAbort` fires → run aborts → `abort` SSE frame.
  - error: run yields `{ type: 'error', ... }` → SSE `event: error` with JSON body.
  - keep-alive: `vi.useFakeTimers()`, advance 30s, assert two `ping` frames.
- **`testkit/fake-adapter.test.ts`** — script with delays + abort mid-stream; `throwOn` injects errors; `finalMessage` reconstruction from text chunks.

**Out-of-scope tests this PR:** no integration test against live LLMs, no MSW recording test, no `@seta/agent-memory` binding test, no end-to-end via `apps/api`. Those come in K2 / K1.5 / MEM stream.

## 8. Risks and trade-offs

- **`FakeAdapter` in the package proper (under `src/testkit/`)** — risk: a careless consumer imports it from `@seta/agent-core/testkit` in production code. Mitigation: ESLint rule + Biome won't catch this; we rely on `__recordings__/` and PR review. K1.5 will add the MSW recording testkit; we may end up exporting both behind `./testkit` and that subpath is intentionally noisy in names ("setupLLMRecording", "FakeAdapter").
- **`run()` as `async function*`** — making it a generator means thrown errors inside the generator become yielded `error` chunks (we catch them ourselves). This is a deliberate API choice: callers iterate one stream, no try/catch needed at the call site. Trade-off: callers can't distinguish "stream ended normally" from "stream errored" without inspecting the last chunk type. Documented in JSDoc.
- **`AdapterRegistry` as constructor injection on every `run()` call** — slightly verbose for callers; the alternative (a module-level singleton) violates CLAUDE.md "no DI container" and makes tests order-sensitive. Verbosity is the right cost.
- **Closure-based registry vs class-based** — both work. Closure mirrors `createConnectorRegistry`. Picking closure for consistency.
- **`StandardSchemaV1` definition inline** — open question per SCOPE.md line 461. We're going inline rather than a new `@seta/agent-schema` package. Revisit when a second consumer (e.g., `@seta/agent-workflows`) needs it.
- **`hono` as a runtime dep** — `streamKernelSSE` imports `Context` (type-only OK) and `streamSSE` from `hono/streaming` (runtime). Adds `hono` to `dependencies`. Acceptable: the kernel is HTTP-aware by design for the SSE path. Apps already pin `hono`.

## 9. Acceptance criteria

- `pnpm --filter @seta/agent-core typecheck` passes.
- `pnpm --filter @seta/agent-core lint` passes.
- `pnpm --filter @seta/agent-core test:unit` passes with 100% line coverage on `src/run/`, `src/sse/`, `src/models/`, `src/errors/`, `src/memory/`.
- `pnpm --filter @seta/agent-core build` produces `dist/index.js` + `dist/testkit/index.js` + matching `.d.ts`.
- `import { KernelChunk, ModelStream, ModelAdapter, run, streamKernelSSE, createAdapterRegistry, NullMemoryProvider, KernelError } from '@seta/agent-core'` resolves (smoke import test in `apps/api` is NOT in scope — that's K2).
- `docs/adr/0010-agent-kernel-boundary.md` exists and is referenced from the PR description.
- No changes to `apps/api/src/main.ts`, no changes to any other workspace package.

## 10. ADR-0010 outline

`docs/adr/0010-agent-kernel-boundary.md` records four decisions, citing this spec:

1. **Direct SDK use over the AI SDK** (decision). Two SDKs, two adapters, two type systems. Cite `02-agent-core.md:37`, `10-llm-model-router.md:38`.
2. **Two-part provider IDs** (`<provider>/<model>`) with adapter-level baseURL/apiKey for OpenAI-compatible endpoints. Cite this brainstorm session.
3. **Adapter registry as factory + injection**, not module singleton or DI container. Cite CLAUDE.md "Boundaries" + the connector-registry precedent.
4. **No legacy `mitt` event bus, no `RequestContext` typed map** — explicit `RunCtx` parameter instead. Cite `02-agent-core.md:36, 42`.

Status: Accepted. Date: 2026-05-12. Deciders: Platform team.

## 11. Follow-ups (post-K1)

- **K1.5** (AG-F1, parallel): `setupLLMRecording({ name, recordingsDir?, transformRequest? })` MSW testkit.
- **K2** (AG-S): `AnthropicAdapter` concrete (incl. `cache_control` ephemeral prompt caching). First wire-up in `apps/api/src/main.ts`.
- **K3** (AG-S): `OpenAIAdapter` concrete + verified OpenAI-compatible endpoints (Azure baseURL, LiteLLM baseURL).
- **K4** (AG-S + AG-F1): Tool-call iteration outer loop — `accumulatedSteps[]`, `stopWhen`, fallback models, concurrent tool execution, processor pipeline fires.
- **MEM stream** (AG-S, W1-W2): real `@seta/agent-memory` provider binds at composition root, replaces `NullMemoryProvider` in `apps/api/main.ts`.
- **Per-tool budgets** — confirm `{ maxCalls, maxTokens?, timeoutMs? }` shape at K4 land; setup.md §5 promises this but never specified.

## 12. Open questions reserved for K1.5 / K2 / K4

These do NOT block K1; they're tracked here so we don't lose them:

- `StopCondition[]` semantics: array form is logical-OR (SCOPE.md line 437). Confirm at K4 that no caller wants AND.
- `cacheTtl` parity with OpenAI: surface as a no-op flag for OpenAI agents, or Anthropic-only documented semantics? (K2 decides.)
- Cost record sink: `@seta/audit` row vs OTel span attributes only. (Audit stream / MEM stream decides.)
- Per-tool budget shape: `{ maxCalls, maxTokens?, timeoutMs? }` or simpler. (K4 decides.)
- Fixture scoping per-test vs per-scenario. (K1.5 decides, documents in setup.md §5.)
- SSE re-entry of `tenantContext` per chunk producer — needs an integration test once a real adapter is reading the tenant. (K2.)

---

**End of design.**
