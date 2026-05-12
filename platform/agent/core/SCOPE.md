# SCOPE — platform/agent/core  (@seta/agent-core)

## Purpose
The framework-free agent kernel. Owns the public agent runtime contract for seta-os: a
single `ModelStream<TChunk>` abstraction over the OpenAI and Anthropic SDKs, the tool-call
run loop with abort + retry + per-tool budgets + streaming, the `Tool` / tool-execution
context shape, the `MemoryProvider` seam (P1 binds the null provider), the `Processor` hook
seam (3 of Mastra's 8 hooks reserved), kernel-tagged `DomainError` subclasses
(`KernelError`/`AgentError`/`LlmError`/`ToolError`), the `streamKernelSSE(c, run)` SSE
helper, and the `testkit` MSW-backed LLM record/replay surface. Everything an agent product
(`modules/products/agent`) and a channel adapter (`modules/channels/*`) needs to *run* and
*test* a model+tools loop — and nothing more (no DI container, no workflow engine, no MCP
server, no thread CRUD).

## Responsibilities
- **Owns:**
  - The `ModelStream<TChunk>` interface and a discriminated chunk union
    (`text`/`tool_args`/`tool_call`/`finish`/`error`/`abort`) — punch list SA-2 (`02-agent-core.md:46`).
  - Per-provider adapters under `src/models/openai.ts` and `src/models/anthropic.ts` that
    call the official SDKs' `.stream()` helpers directly (setup.md §5 lines 340–364) —
    never `runTools()` / `beta.messages.toolRunner()` (setup.md §5 line 366).
  - `src/models/router.ts` — `selectModel(cfg)` switching on provider-qualified IDs
    (`openai/<model>`, `anthropic/<model>`) — punch list SA-10 (`10-llm-model-router.md:50-51`).
  - `src/models/prepare-tools.ts` — pure Zod → JSON-Schema normalization with the two real
    cross-provider fixups (typeless-property union, `$schema` pinned to draft-07) —
    `10-llm-model-router.md:33,58`.
  - `src/models/retry.ts` — `classifyError(err) → 'transient'|'terminal'` +
    `withRetry(fn, { maxRetries, signal })` (`10-llm-model-router.md:59`). Cross-model
    fallback is loop-level, opt-in via `cfg.fallback?: string[]` (`10-llm-model-router.md:53`).
  - The K-loop: outer tool-call iteration over `accumulatedSteps[]`, inner
    `model-call → tool-execute → memory.saveTurn` step, abort-aware per-chunk consumption,
    keep-alive pings, `safeEnqueue`/`safeClose` semantics for the SSE writer
    (`03-run-loop.md:40-46`, setup.md §5 lines 397–426).
  - The `Tool` contract `{ id, description, inputSchema, outputSchema, execute, annotations? }`
    where `outputSchema` is mandatory for write tools (`04-tools-mcp.md:32, 49`).
  - The `ToolExecutionContext` discriminated by surface (`teams`/`direct`/future `mcp`),
    always carrying `abortSignal` and a read-only request handle; tenant id is NOT a field
    — it is read from `@seta/tenant` (`04-tools-mcp.md:52`, CLAUDE.md "Tenant id is never a
    function parameter").
  - `MemoryProvider` interface + `NullMemoryProvider` (kept for unit tests and the testkit)
    — the loop calls `recall()` pre-model and `saveTurn()` post-model unconditionally
    (`09-memory.md:49-51`). **P1 override:** the real provider lives in
    `@seta/agent-memory` (P1) and is bound by `apps/api/src/main.ts`; the kernel always
    speaks to the seam.
  - The `Processor` seam (3 hooks reserved: `processInput`, `processOutputStep`,
    `processAPIError`) — `02-agent-core.md:51`.
  - `streamKernelSSE(c, run)` — the single SSE helper that wires `stream.onAbort`,
    `setInterval` keep-alive, third-arg error handler, split abort-vs-error branches, and
    `safeEnqueue` (setup.md §5 lines 397–426; `03-run-loop.md:40-46`).
  - `KernelError`/`AgentError`/`LlmError`/`ToolError` extending `DomainError` (from
    `@seta/middleware/errors`) with `{ code, domain, category, details? }` fields matching
    Mastra's `MastraErrorJSON` shape — `02-agent-core.md:53`, README "§15".
  - `Run` identifier (UUID) + `RunStatus` (`'created'|'running'|'completed'|'failed'`)
    threaded through the loop — `05-workflows.md:36`. **P1 override:** the workflow
    engine itself lives in `@seta/agent-workflows` (P1) and `Run` is the join key between
    kernel runs and `agent_workflows.workflow_snapshots.run_id`. The tool result envelope's
    `{ suspend?: { reason, resumeLabel } }` discriminant is wired by `@seta/agent-workflows`
    (it was shape-only under the pre-override spike).
  - `src/testkit/` — `setupLLMRecording({ name, recordingsDir?, transformRequest? })`,
    `serializeRequestContent(url, body)`, `hashRequest(url, body)`. MSW-backed, intercepts
    Anthropic + OpenAI base URLs (`06-llm-recording-replay.md:67-69`).
  - Token counting via `js-tiktoken` — pre-request for `estimatedInputTokens` on the audit
    row, post-response for reconciliation against provider `usage` (`10-llm-model-router.md:54`).
    Per SA-10, the `js-tiktoken@1.0.21` pin moves here from `@seta/agent-chunking` (which is
    P2-deferred).
- **Does NOT own:**
  - HTTP route registration / OpenAPI docs — that is `@seta/middleware` + each product's
    `routes()` (CLAUDE.md "Every `modules/*` package exports `routes()`").
  - Memory persistence — that is `@seta/agent-memory` (P1, per `09-memory.md` § "P1
    override"). The `agent_memory.conversations` / `.turns` / `.working_memory` tables and
    the `MemoryProvider` implementation live there; the kernel only owns the seam.
  - Thread CRUD HTTP routes — those live in `modules/products/agent` (the product owns the
    route layer; it calls into `@seta/agent-memory` for persistence).
  - The workflow DSL (`.then()` / `.parallel()` / future `.branch()` etc.) and the
    `agent_workflows.workflow_snapshots` / `.workflow_steps` tables — that is
    `@seta/agent-workflows` (P1, per `05-workflows.md` § "P1 override"). The kernel only
    owns the `Run` + `RunStatus` join keys and the `{ suspend? }` discriminant on tool
    results.
  - The `agent.write_continuations` HMAC preview→commit table — that is the agent product's
    schema, not the kernel's (`04-tools-mcp.md:50`).
  - Connector / Graph calls — see `@seta/ms-graph` and `modules/connectors/ms365-*`.
  - Tenant context — read via `tenantContext.getTenantId()` from `@seta/tenant`
    (`07-request-context.md:36`, CLAUDE.md "Footguns").
  - MCP server exposure — P2-deferred (`04-tools-mcp.md:56`).
  - RAG vector storage and chunking — `@seta/agent-vector`, `@seta/agent-chunking`,
    `@seta/agent-embeddings`, `@seta/agent-rag` (all P2-deferred, setup.md §13:1812).
  - Pluggable workflow `ExecutionEngine` adapters (Inngest / Temporal) — those would land in
    `@seta/agent-workflows` if/when they're needed; P2.

## Current state (Epic 1)
**Stub-only.** Epic 1 was scoped to MS365 authentication and authorization; the agent
kernel itself was not implemented. The current package contains:
- `src/index.ts` — `export {}` placeholder.
- `src/index.test.ts` — placeholder test (`expect(true).toBe(true)`).
- `package.json` — already pinned to `zod@4.4.3`, `openai@6.37.0`, `@anthropic-ai/sdk@0.95.1`
  per setup.md §13 line 1734.

There is no model adapter, no `Tool` type, no run loop, no `streamKernelSSE`, no testkit.
Everything in the "Public interface" section below is the contract future kernel work
(K1–K6 per setup.md §5) must respect. The Phase-1 reports and setup.md §5 are the
authoritative spec; this SCOPE.md is the package's gatekeeper until the K-series PRs land.

## Public interface

### Model layer

- `interface ModelStream<TChunk>` — async-iterable stream + `abort()` + final-message
  resolver. Returned by every provider adapter; route authors never see the SDK split
  (setup.md §5 line 338).
- `type KernelChunk` — discriminated union:
  - `{ type: 'text'; delta: string }`
  - `{ type: 'tool_args'; toolCallId: string; argsDelta: string }`
  - `{ type: 'tool_call'; toolCallId: string; name: string; args: unknown }`
  - `{ type: 'finish'; reason: 'stop'|'tool_calls'|'length'|'error'; usage?: TokenUsage }`
  - `{ type: 'error'; error: KernelError }`
  - `{ type: 'abort' }`
  Citation: punch list SA-2 (`02-agent-core.md:46`), README "§5" line 40.
- `interface ModelAdapter` — adapter contract; required methods: `stream(req, ctx) =>
  Promise<ModelStream<KernelChunk>>`. Concretes: `OpenAIAdapter`, `AnthropicAdapter`
  (`02-agent-core.md:52`).
- `selectModel(cfg: AgentConfig): ModelAdapter` — router; switches on provider-qualified ID
  prefix (`openai/`, `anthropic/`) (`10-llm-model-router.md:50-51`).
- `prepareTools(tools: Tool[]): JsonSchemaTool[]` — pure function; applies typeless-property
  union and `$schema` draft-07 pin (`10-llm-model-router.md:58`).
- `classifyError(err: unknown): 'transient' | 'terminal'` — retries on `transient` only
  (`10-llm-model-router.md:53,59`).
- `withRetry<T>(fn: () => Promise<T>, opts: { maxRetries: number; signal: AbortSignal }):
  Promise<T>` — `p-retry`-style wrapper; default `maxRetries: 2`
  (`03-run-loop.md:62`, `10-llm-model-router.md:53`).
- `interface KernelMessage` — internal canonical message form; OpenAI⇄Anthropic shape
  conversions happen inside each `ModelAdapter`, never in route code (`02-agent-core.md:30,
  47`).
- `countTokens(text: string, model: string): number` — `js-tiktoken`-backed estimator;
  pre-request audit + post-response reconciliation only (no budget enforcement P1)
  (`10-llm-model-router.md:54`).

### Tool contract

- `interface Tool<TInput, TOutput>` — `{ id: string; description: string; inputSchema:
  StandardSchemaV1<TInput>; outputSchema: StandardSchemaV1<TOutput>; execute: (input:
  TInput, ctx: ToolExecutionContext) => Promise<ToolResult<TOutput>>; annotations?:
  ToolAnnotations; toModelOutput?: (out: TOutput) => unknown }` (`04-tools-mcp.md:32, 55`;
  `08-schema-compat.md:41`).
- `interface ToolExecutionContext` — discriminated by surface (`teams`/`direct`/future
  `mcp`); always carries `abortSignal: AbortSignal`, `runId: string`,
  `requestContext: Readonly<RunCtx>`; never carries `tenantId` (read via
  `tenantContext.getTenantId()`) (`04-tools-mcp.md:33, 52`).
- `type ToolResult<T>` — `{ ok: true; value: T } | { ok: false; error: ToolValidationError }
  | { suspend: { reason: string; resumeLabel: string } }` — validation errors **returned,
  not thrown**, so the LLM can self-correct (`04-tools-mcp.md:34, 54`;
  `05-workflows.md:37` for the `suspend` discriminant which is shape-only in P1).
- `interface ToolAnnotations` — `{ readOnlyHint?: boolean; destructiveHint?: boolean;
  idempotentHint?: boolean; openWorldHint?: boolean }` (`04-tools-mcp.md:35`).
- `StandardSchemaV1<T>` — accepted as the schema type so future Arktype/Valibot tools work
  (Zod 4 already implements `~standard`) (`08-schema-compat.md:41`).
- `toolSchemaToJsonSchema(schema: StandardSchemaV1): JsonSchema` — goes through
  `z.toJSONSchema()` (Zod 4 native), not `zod-to-json-schema` (`08-schema-compat.md:42`).

### Run loop

- `interface RunCtx` — explicit per-call record; **not** a typed `RequestContext` map
  (`02-agent-core.md:42`). Fields: `runId: string` (UUID), `signal: AbortSignal`,
  injectable `{ now, generateId, currentDate }` for byte-stable replay
  (`03-run-loop.md:67`), `retryCount: number`.
- `type RunStatus = 'created' | 'running' | 'completed' | 'failed'` —
  (`05-workflows.md:36`, mirrors `mastra/run/types.ts:1`).
- `interface Run` — `{ id: string; status: RunStatus; tenantId: string; createdAt: Date;
  finishedAt?: Date }` — the seam for a P2 `workflow_snapshots` table to join by `run_id`
  (`05-workflows.md:36`).
- `interface RunLoopOptions` — `{ maxSteps?: number; stopWhen?: StopCondition |
  StopCondition[]; toolCallConcurrency?: number; onIterationComplete?: (steps:
  StepResult[]) => void | Promise<void>; perToolBudget?: { maxCalls?: number; maxTokens?:
  number; timeoutMs?: number }; memory?: MemoryProvider; processors?: Processor[];
  fallback?: string[] }` (`03-run-loop.md:69`, `10-llm-model-router.md:53`,
  README `§5` lines 45–48).
- `type StopCondition = (steps: StepResult[]) => boolean | Promise<boolean>` — array form
  is logical-OR (`03-run-loop.md:69`).
- `run(config: AgentConfig, input: RunInput, opts?: RunLoopOptions): AsyncIterable<KernelChunk>`
  — the kernel entry point; defaults: `maxSteps: 16`, `maxRetries: 2`,
  `toolCallConcurrency: 10` (auto-collapse to 1 if any tool declares `requireApproval`)
  (`03-run-loop.md:45-46`).

### SSE helper

- `streamKernelSSE(c: Context, run: AsyncIterable<KernelChunk>): Response` — single helper
  that wires `stream.onAbort` (before the loop), `setInterval(..., 15_000)` keep-alive
  cleared in `finally`, third-arg error handler, split abort-vs-error branches
  (`debug` for client-disconnect, `error` only for real failures), and `safeEnqueue` /
  `safeClose` semantics on every write (setup.md §5 lines 397–426; `03-run-loop.md:40-42,
  70`).
- `safeEnqueue(stream, payload): Promise<void>` / `safeClose(stream): void` — swallow
  `controller closed` races (`03-run-loop.md:40`, mirrors `mastra/stream/base/input.ts:14-47`).

### Memory seam

- `interface MemoryProvider` — exactly four hooks (no thread CRUD):
  - `recall(ctx: MemoryContext): Promise<RecallResult>`
  - `saveTurn(ctx: MemoryContext, messages: KernelMessage[]): Promise<void>`
  - `getWorkingMemory(ctx: MemoryContext): Promise<string | null>`
  - `updateWorkingMemory(ctx: MemoryContext, text: string): Promise<void>`
  Citation: `09-memory.md:49`.
- `interface MemoryContext` — `{ threadId: string; conversationId?: string; scope:
  'thread' | 'resource'; vectorSearchString?: string }` — **no `resourceId`**, **no
  `tenantId`** (tenant id is read from ALS) (`09-memory.md:52-53`).
- `interface RecallResult` — `{ messages: KernelMessage[]; total: number; page: number;
  perPage: number; hasMore: boolean }` — pagination from day one (`09-memory.md:35`).
- `class NullMemoryProvider implements MemoryProvider` — no-op fallback retained for
  `@seta/agent-core` unit tests and the testkit; `recall` returns empty, `saveTurn` is a
  no-op, `getWorkingMemory` returns `null` (`09-memory.md:50`). **P1 override:** the
  composition root in `apps/api/src/main.ts` binds the real `@seta/agent-memory` provider;
  `NullMemoryProvider` is not the runtime binding.

### Processor seam (3 of Mastra's 8 reserved)

- `interface Processor` — optional hooks:
  - `processInput?(ctx: ProcessorContext, input: RunInput): Promise<RunInput>`
  - `processOutputStep?(ctx: ProcessorContext, step: StepResult): Promise<StepResult>`
  - `processAPIError?(ctx: ProcessorContext, err: unknown): Promise<'retry' | 'rethrow'>`
  Citation: `02-agent-core.md:51`. Other five hooks
  (`processInputStep`/`processLLMRequest`/`processLLMResponse`/`processOutputStream`/
  `processOutputResult`) are P2-deferred (`02-agent-core.md:54`).
- `interface ProcessorContext` — `{ runId: string; abort(): never; abortSignal: AbortSignal;
  retryCount: number; writer: { custom(chunk: unknown): void } }` — the trio
  `abort`/`retryCount`/`abortSignal` mirrors Mastra's shape (`02-agent-core.md:29`,
  `processors/index.ts:50`).

### Errors

- `class KernelError extends DomainError` — base class; carries `{ code: string; domain:
  'AGENT'|'LLM'|'TOOL'|'KERNEL'; category: 'USER'|'SYSTEM'|'THIRD_PARTY'; details?:
  Record<string, unknown>; cause?: unknown }`. Mapped to RFC 7807 via the existing
  `@seta/middleware` `onError` (`02-agent-core.md:53`, setup.md §15 lines 1416–1480).
- `class AgentError extends KernelError` — `domain: 'AGENT'` (`02-agent-core.md:50`).
- `class LlmError extends KernelError` — `domain: 'LLM'` (`02-agent-core.md:50`).
- `class ToolError extends KernelError` — `domain: 'TOOL'` (`02-agent-core.md:50`).
- `class ToolValidationError extends ToolError` — surfaced as a return value
  (`{ ok: false; error }`), not thrown (`04-tools-mcp.md:54`).

### Configuration

- `interface AgentConfig` — `{ model: string; /* provider-qualified, e.g. "anthropic/
  claude-4-7-sonnet" */ systemPrompt?: string; maxTokens?: number; cacheTtl?: '5m' | '1h'
  | null; tools?: Tool[]; fallback?: string[] }` — `cacheTtl` defaults to `'5m'` when
  `systemPrompt.length > ~512 tokens` (setup.md §5 line 393); `cacheTtl` is Anthropic
  ephemeral prompt-cache control, **not** a chunk-replay cache — names must not collide
  (`03-run-loop.md:50, 65`).

### Testkit (under `src/testkit/`)

- `setupLLMRecording(opts: { name: string; recordingsDir?: string; transformRequest?:
  (req: { url: string; body: unknown }) => { url: string; body: unknown } }): { start():
  void; stop(): void }` — MSW `setupServer` over Anthropic + OpenAI base URLs; keyed by
  `md5(url + canonicalize(body)).slice(0,16)`; streaming responses stored as
  `{ chunks: string[]; chunkTimings: number[]; isStreaming: true }` (`06-llm-recording-replay.md:67`).
  Tiny surface — no per-test/per-describe helpers, no auto-naming.
- `serializeRequestContent(url: string, body: unknown): string` — canonical key-sort + ISO
  date canonicalization; **same normalization** that `hashRequest` uses
  (`06-llm-recording-replay.md:68`).
- `hashRequest(url: string, body: unknown): string` — `md5(serializeRequestContent(...)).
  slice(0,16)` (`06-llm-recording-replay.md:7,68`).
- Mode gate: `RECORD=1` (record-if-missing), `RECORD=force` (re-record all), default =
  strict replay (fail on miss) (`06-llm-recording-replay.md:62`). **No `LLM_TEST_MODE=live`
  in CI** (setup.md §5 line 2198).
- Recording file shape (versioned, checked into git): `{ meta: { name, testFile, testName,
  provider, model, createdAt, updatedAt }, recordings: [{ hash, request: { url, method,
  body }, response: { status, headers, body | (chunks, chunkTimings, isStreaming) } }] }`
  at `__recordings__/<name>.json` (`06-llm-recording-replay.md:63`).

## Imports

- **Allowed internal:**
  - `@seta/middleware` — *type-only* import for `DomainError` (base class for
    `KernelError`/`AgentError`/`LlmError`/`ToolError`). The RFC 7807 mapper lives in
    middleware; the kernel only throws the subclasses (`02-agent-core.md:41`, setup.md §15
    line 2062).
  - `@seta/tenant` — `tenantContext.getTenantId()` for tenant-scoped audit + memory keys
    (CLAUDE.md "Tenant id is never a function parameter"; `07-request-context.md`).
  - `@seta/observability` — `logger` for kernel-internal logs (CLAUDE.md "No `console.log`
    outside CLI scripts").
- **Forbidden:**
  - `@seta/db` — the kernel never touches Postgres directly; persistence is the agent
    product's job via `MemoryProvider` (CLAUDE.md `platform/*` boundary;
    `09-memory.md:57`).
  - Any `modules/*` package — `platform/*` depends on nothing in `modules/` (CLAUDE.md
    "Boundaries").
  - `@seta/audit` (direct) — the kernel emits structured `KernelError` + OTel spans; the
    audit row is written in the agent product, not from inside the loop (keeps the kernel
    DB-free; setup.md §11).
  - `@seta/connector-registry` / `@seta/oauth` / `@seta/ms-graph` — these are connector
    concerns; tools that need them import them inside their `execute` body via the
    product package, not the kernel (CLAUDE.md "Boundaries").
- **External (pinned per setup.md §13):**
  - `zod@4.4.3` (setup.md §13 line 1734) — sole runtime Zod instance; SCHEMA accepts
    `StandardSchemaV1` so Arktype/Valibot are also accepted at the type level
    (`08-schema-compat.md:41`).
  - `openai@6.37.0` (setup.md §13 line 1734) — used directly via `.stream()` in
    `models/openai.ts`; no `runTools()` (setup.md §5 line 366).
  - `@anthropic-ai/sdk@0.95.1` (setup.md §13 line 1734) — used directly via
    `messages.stream({ signal })`; provider-level `cache_control` annotations applied here,
    not at the route layer (setup.md §5 lines 370–393).
  - `js-tiktoken@1.0.21` — **moves here from `@seta/agent-chunking`** per
    `10-llm-model-router.md:56` (router needs it in P1; RAG is P2-deferred). Install via
    `pnpm --filter @seta/agent-core add js-tiktoken@1.0.21` (CLAUDE.md CLI-only).
  - `msw` (version per testkit landing PR) — only inside `src/testkit/`, declared as a
    regular dep so consumers can import it (Mastra puts `_llm-recorder` in a separate
    package; we keep it co-located per `06-llm-recording-replay.md:67`).
  - `uuid` (or a Node `randomUUID`-based UUID generator) — `Run.id` generation; injectable
    via `RunCtx.generateId` for testkit determinism (`03-run-loop.md:67`).
- **NOT installed:**
  - Vercel AI SDK (`@ai-sdk/*`) — explicitly avoided; direct SDK use gives us
    `cache_control` on Anthropic and OpenAI prompt-cache hints without waiting for AI-SDK
    passthrough (`02-agent-core.md:37`, `10-llm-model-router.md:38`).
  - `zod-to-json-schema` — Zod 4's native `z.toJSONSchema()` replaces it
    (`08-schema-compat.md:42`).
  - `tokenx` — heuristic estimator; we use `js-tiktoken` for real counts
    (`10-llm-model-router.md:39`).

## Patterns to follow

- **Stream via SDK `.stream()` helpers, not raw `create({ stream: true })`** — setup.md §5
  line 338. Both SDKs return Runner/Stream objects with `.on(...)`, `.finalMessage()`,
  `.abort()`. Wrap each into `ModelStream<KernelChunk>` (`02-agent-core.md:28`).
- **Own the tool loop** — setup.md §5 line 366. Do not use `runTools()` /
  `beta.messages.toolRunner()`. The kernel-owned loop enforces per-tool budgets, RLS-aware
  tool execution, structured cost accounting, deterministic replay
  (`03-run-loop.md:25, 69`).
- **Abort is non-negotiable** — setup.md §5 line 368. Every model call passes `{ signal }`;
  `streamKernelSSE`'s `onAbort` triggers `controller.abort()` on the SDK's `AbortController`.
  Additionally, **re-check `signal.aborted` on every consumed chunk** because some
  providers keep emitting after abort (`03-run-loop.md:41, 64`).
- **Split abort-vs-error branches in the SSE writer** —
  `isAbortError(e) && signal.aborted` ⇒ debug log + `onAbort` + `abort` chunk; everything
  else ⇒ `error` chunk. Prevents alert noise from client disconnects
  (`03-run-loop.md:42, 70`).
- **`safeEnqueue` / `safeClose` everywhere** — `stream.writeSSE` after client-disconnect
  must not throw the loop (`03-run-loop.md:40, 66`).
- **Anthropic prompt caching by default** — `cache_control: { type: 'ephemeral', ttl: '5m' }`
  on system + tools when `systemPrompt > ~512 tokens` (setup.md §5 lines 370–393). Provider
  caching is `cacheTtl`; chunk-replay cache (P2) is a separate concept — do not collide
  names (`03-run-loop.md:50, 65`).
- **Provider-qualified model IDs** — `"openai/gpt-5"`, `"anthropic/claude-4-7-sonnet"`;
  the prefix drives `selectModel` (`10-llm-model-router.md:51`).
- **Validation errors are returned, not thrown** — `ToolResult<T>` carries `{ ok: false;
  error }` so the LLM can self-correct (`04-tools-mcp.md:34, 54`).
- **Tenant id from `tenantContext.getTenantId()`** — never a function parameter, never on
  `ToolExecutionContext` or `MemoryContext` (CLAUDE.md "Footguns";
  `07-request-context.md:36`; `09-memory.md:52`).
- **Use global `fetch` in adapter code** — so MSW (via the testkit) can intercept. No
  SDK-internal transports. Add an integration test asserting the testkit intercepts an
  Anthropic call (`06-llm-recording-replay.md:69`).
- **Injectable `{ now, generateId, currentDate }` on `RunCtx`** — for byte-stable
  recordings (`03-run-loop.md:67`).
- **Memory seam always wired** — kernel never branches on `if (memory)`; `recall()` runs
  pre-model, `saveTurn()` runs post-model. **P1 binds the real `@seta/agent-memory`
  provider** in the composition root; `NullMemoryProvider` is only used by `@seta/agent-core`
  unit tests and the testkit (`09-memory.md:51`, `09-memory.md` § "P1 override").
- **Token counting at two specific points** — pre-request to record
  `estimatedInputTokens` on the future audit row, post-response to reconcile against
  provider `usage`. **No pre-request budget enforcement in P1** (`10-llm-model-router.md:54`).
- **MCP annotations propagated through `Tool.annotations`** — read tools get
  `readOnlyHint: true`; `.preview` tools get `readOnlyHint: true` + `idempotentHint: true`;
  `.commit` tools get `destructiveHint: true` (`04-tools-mcp.md:35`).

## Patterns to avoid

- **No DI container / no service registry / no plugin loader / no runtime discovery** —
  CLAUDE.md "Boundaries"; `02-agent-core.md:35`. `apps/api/src/main.ts` is the only
  registry. Reject the Mastra `Mastra` class + `__registerMastra` back-pointer pattern
  outright.
- **No workflow engine inside `@seta/agent-core`** — the engine lives in
  `@seta/agent-workflows` (P1, override). The kernel owns only the `Run` + `RunStatus`
  join key and the `{ suspend? }` discriminant on tool results; the DSL
  (`.then()` / `.parallel()`) lives in the workflow package. No `.then`/`.branch`/`.parallel`
  helpers in `@seta/agent-core` itself.
- **No MCP server exposure in P1** — `04-tools-mcp.md:56`. P1 surface is Teams + REST.
  Revisit with Studio.
- **No in-process HITL `approveToolCall(runId)`** — `04-tools-mcp.md:57`. Preview/commit +
  HMAC continuations cover the same need statelessly; in-memory `runId` tracking conflicts
  with the stateless-request-path rule (CLAUDE.md "Scale & multi-tenancy").
- **No full 8-method processor pipeline** — `02-agent-core.md:54`. Reserve 3, defer the
  rest until K4 + K6 land.
- **No chunk-replay cache / `resumeStream()` in P1** — `03-run-loop.md:72`. Useful for
  browser reconnects only; P1 only promises in-memory SSE.
- **No AI SDK adoption** — `10-llm-model-router.md:38`. Pulls a third type system over the
  two we already pin. Revisit only if we add a third provider.
- **No `tokenx`** — `10-llm-model-router.md:39`. Heuristic estimator; we need real BPE
  counts via `js-tiktoken`.
- **No fuzzy-match in the recorder** — `06-llm-recording-replay.md:49`. Exact-hash-or-fail;
  if the hash misses, the fix is `transformRequest`, not a 60%-threshold fallback.
- **No auto-recording Vite plugin** — `06-llm-recording-replay.md:48`. Magic;
  breaks "grep to find what's mocked"; the testkit is the single seam (setup.md §5 line
  2169).
- **No mutable `RequestContext` map** — `02-agent-core.md:42`. Use an explicit `RunCtx`
  parameter instead. If 3+ unrelated callers need ad-hoc keys, revisit in P2.
- **No `tenantId` / `resourceId` on tool or memory contexts** — read from
  `@seta/tenant` ALS instead (CLAUDE.md "Footguns"; `09-memory.md:52`;
  `07-request-context.md:25`).
- **No legacy `mitt`-style event bus** — `02-agent-core.md:36`. Fire-and-forget via
  `setImmediate` defeats OTel span correlation. Use a typed `Processor` or an OTel span
  attribute.
- **No JSON-schema rewriting per provider in P1** — `08-schema-compat.md:43`. Both OpenAI
  and Anthropic consume JSON Schema cleanly; provider compat layers are P2.
- **No back-compat shims / deprecation aliases** — CLAUDE.md "No legacy, no backward
  compat". Pre-1.0; every caller changes in the same PR.

## Test strategy

- **Unit tests** are co-located (`src/**/*.test.ts`) per CLAUDE.md "Conventions". They
  cover: chunk-union dispatch, `prepareTools` JSON-Schema fixups, `classifyError`
  classification, `withRetry` signal-aware behavior, `streamKernelSSE` happy + abort
  paths, `NullMemoryProvider` no-op contract, `ToolResult` discriminant handling,
  `selectModel` prefix dispatch, RFC 7807 mapping of `KernelError` subclasses.
- **LLM-touching tests** use the testkit's `setupLLMRecording({ name })` exclusively —
  never live model APIs in CI (setup.md §5 line 2198, CLAUDE.md "Footguns" "LLM in
  tests"). Recording file lives at `__recordings__/<name>.json` and is checked into git
  (`06-llm-recording-replay.md:65`); turbo input list (`turbo.json`) already pins
  `__recordings__/**` so cache hits are deterministic (setup.md §12 lines 1214–1223).
- **Kernel HTTP must use global `fetch`** — never SDK-internal transports — so MSW
  intercepts. Add a dedicated integration test asserting the testkit catches an Anthropic
  call (`06-llm-recording-replay.md:69`).
- **Recording mode gate**: `RECORD=1 pnpm vitest run -t <name>` to record;
  `RECORD=force` to re-record all; default is strict replay (fails on miss). PR review
  diffs the fixture (`06-llm-recording-replay.md:62`, README "Commands" `Re-record LLM
  fixture`).
- **No mocking of internal `@seta/*` modules** — CLAUDE.md "Conventions" "Mocks". External
  HTTP (Graph, Bot Framework, OAuth) goes through MSW recordings too; the LLM testkit
  shares the `__recordings__/` mechanism (`06-llm-recording-replay.md:40`).
- **Determinism**: tests inject `{ now: () => fixedDate, generateId: () => fixedUlid,
  currentDate: fixedDate }` into `RunCtx` so recordings are byte-stable
  (`03-run-loop.md:67`).
- **No integration tests against live Postgres** here — the kernel is DB-free. Memory tests
  use `NullMemoryProvider`; the real provider is tested in `@seta/agent-memory` (P1).

## Open questions

- **`StopCondition` array semantics.** Documented as logical-OR; confirm at K4 land that
  no caller wants AND. (`03-run-loop.md:69`)
- **`cacheTtl` parity with OpenAI.** §5 line 393 says OpenAI structured-output caching is
  automatic; do we also expose `cacheTtl` as a no-op flag for parity, or document the
  Anthropic-only semantics? (`10-llm-model-router.md:44`)
- **Cost-record sink.** Does `@seta/audit` define the surface for per-LLM-call cost rows,
  or does the kernel emit OTel span attributes only? (`10-llm-model-router.md:45`)
- **Per-tool budget shape.** `{ maxCalls, maxTokens?, timeoutMs? }` proposed; setup.md §5
  promised "per-tool budgets" but never specified. Confirm before K4.
  (`03-run-loop.md:57, 63`)
- **Fixture scoping — per-test vs per-scenario.** Pick the first time a kernel test exists
  and document the convention in setup.md §5 (`06-llm-recording-replay.md:74`).
- **`transformRequest` in `vitest.config.ts` plugin form.** P1 callers pass it inline;
  revisit if the same redaction set repeats across packages
  (`06-llm-recording-replay.md:72`).
- **SSE re-entry of tenant context per chunk producer.** `streamKernelSSE` must verify
  that ALS survives into the `pull()` callback or wrap each producer in
  `tenantContext.run()` — needs an integration test (`07-request-context.md:31, 40`).
- **`@hono/zod-openapi` and Zod-4-native validators.** `z.iso.datetime()`, top-level
  `z.email()` round-trip through `@asteasolutions/zod-to-openapi` v8 — needs a one-off
  spike before route authors lean on them (`08-schema-compat.md:34`). Not blocking the
  kernel directly but informs tool `outputSchema` choices.
- **MSW interception of OpenAI/Anthropic SDKs.** Both SDKs use a fetch-compatible
  transport; confirmed in spike (`06-llm-recording-replay.md:55`), but the dedicated
  integration test above is the gate.
- **Where does `StandardSchemaV1` live?** Inline type in `@seta/agent-core` or a sibling
  `@seta/agent-schema` package? Recommend inline until a second consumer needs it
  (`08-schema-compat.md:41`).
- **`runAsTenant` for background-job tool execution.** When a tool runs from a queue
  handler (Epic 3), it enters via `tenantContext.runAsTenant(...)`; the kernel should
  document the contract that tool `execute` always observes a populated ALS frame
  (`07-request-context.md:38`).
