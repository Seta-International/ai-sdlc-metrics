# Mastra spike — Agent core (adapters, normalization, processors, DI, errors)

## What Mastra does

**`Agent` class** is the single user-facing primitive (`/Users/canh/Projects/Seta/mastra/packages/core/src/agent/agent.ts:237`), a 6,811-line class extending `MastraBase` (`/Users/canh/Projects/Seta/mastra/packages/core/src/base.ts:5`). Public surface: `generate()`/`stream()` (line 5834, 5994), `streamUntilIdle()` (line 6172), `resumeStream()` (line 6289), `getInstructions()`/`getModel()`/`getMemory()`/`listTools()` (1498, 2066, 1236, 1785), plus a deprecated `generateLegacy`/`streamLegacy` pair (line 6645+). Constructor accepts `AgentConfig` with `model`, `instructions`, `tools`, `memory`, `inputProcessors`, `outputProcessors`, `errorProcessors`, and `maxRetries` (line 268-271, 322).

**Per-provider adapters** are thin wrappers around the Vercel AI SDK's `LanguageModelV2`/`V3` interfaces — Mastra does not talk to `openai`/`@anthropic-ai/sdk` directly. `AISDKV5LanguageModel` (`/Users/canh/Projects/Seta/mastra/packages/core/src/llm/model/aisdk/v5/model.ts:64`) and `AISDKV6LanguageModel` wrap the SDK's `doGenerate`/`doStream` and re-emit through a uniform `MastraLanguageModel` union (`/Users/canh/Projects/Seta/mastra/packages/core/src/llm/model/shared.types.ts:69`). Provider-quirk fixups happen at the adapter seam — e.g. `applyStrictForV2()` strips per-tool `strict` and hoists `strictJsonSchema` into OpenAI provider options (`.../aisdk/v5/model.ts:13-58`). Router-shaped code at `/Users/canh/Projects/Seta/mastra/packages/core/src/llm/model/router.ts:1` and `resolve-model.ts:1` — **defer commentary to SA-10**.

**Message normalization** is a 25k-LOC subsystem under `/Users/canh/Projects/Seta/mastra/packages/core/src/agent/message-list/`. `MessageList` (exported at `index.ts:2`) plus `AIV4Adapter`/`AIV5Adapter`/`AIV6Adapter` (line 46) absorb the AI-SDK-version drift; cross-provider shape fixups live in `utils/provider-compat.ts` — `ensureGeminiCompatibleMessages`, `ensureAnthropicCompatibleMessages`, `sanitizeOrphanedToolPairs` (index.ts:50-58). Internal canonical form is `MastraDBMessage` (`message-list/state/types.ts`).

**Processor/hook seams.** Processors are typed contracts, not lifecycle callbacks. `Processor` interface (`/Users/canh/Projects/Seta/mastra/packages/core/src/processors/index.ts:465`) declares optional `processInput`, `processInputStep`, `processLLMRequest`, `processLLMResponse`, `processOutputStream`, `processOutputStep`, `processOutputResult`, `processAPIError`. Three union flavors — `InputProcessor`/`OutputProcessor`/`ErrorProcessor` (line 660, 670, 679). `ProcessorContext` (line 50) carries `abort()`, `writer.custom()`, `retryCount`, `abortSignal`, `requestContext`. Separately, a legacy `mitt`-based event bus (`/Users/canh/Projects/Seta/mastra/packages/core/src/hooks/index.ts:6`) emits `ON_EVALUATION`/`ON_GENERATION`/`ON_SCORER_RUN` via `setImmediate`.

**DI.** `/Users/canh/Projects/Seta/mastra/packages/core/src/di/index.ts:1` re-exports `RequestContext` (`/Users/canh/Projects/Seta/mastra/packages/core/src/request-context/index.ts:56`) — a typed `Map<string, unknown>` threaded through every public method. The actual service registry is the `Mastra` class (`/Users/canh/Projects/Seta/mastra/packages/core/src/mastra/index.ts:496`) holding `#agents`, `#vectors`, `#tools`, `#processors`, `#memory`, `#channels`, etc., with `Agent#__registerMastra` for back-pointer wiring. Reserved keys `MASTRA_RESOURCE_ID_KEY`/`MASTRA_THREAD_ID_KEY` (request-context/index.ts:17, 31) let auth middleware pin user identity for memory/RLS-style decisions.

**Errors.** `MastraError extends MastraBaseError` (`/Users/canh/Projects/Seta/mastra/packages/core/src/error/index.ts:142`) — fields are `id` (uppercase code), `domain` (enum: `AGENT`, `LLM`, `TOOL`, …line 7), `category` (`USER`/`SYSTEM`/`THIRD_PARTY`, line 29), `details`, `cause`, plus `toJSON()` returning `MastraErrorJSON` (line 69). Used at construction (`/Users/canh/Projects/Seta/mastra/packages/core/src/agent/agent.ts:336`).

## What setup.md plans

§5 — kernel patterns: "Use the SDK's `.stream()` helpers, not raw `create({ stream: true })`. Both SDKs return a Runner / Stream object…" (`docs/setup.md:338`). Files implied: `platform/agent/core/src/models/openai.ts` and `…/anthropic.ts` (`docs/setup.md:341`, `:354`) — **direct** `openai` and `@anthropic-ai/sdk` calls, no AI SDK abstraction. "Do NOT use `runTools()` / `beta.messages.toolRunner()`. … the kernel is exactly that loop (K4 in our roadmap). Owning the loop lets us enforce per-tool budgets, RLS-aware tool execution, structured cost accounting, and deterministic replay from `__recordings__`" (`docs/setup.md:366`). "Abort wiring is non-negotiable. Every model call accepts `{ signal }`" (`docs/setup.md:368`). Anthropic-specific cache-control on system/tools (`docs/setup.md:375-393`). `streamKernelSSE(c, run)` helper named at `docs/setup.md:426`.

§15 — `DomainError extends HTTPException` (`docs/setup.md:1416`), `problem: { type, title, status, detail }` (RFC 7807) plus the global `onError` handler that emits `application/problem+json` for `DomainError` / `ZodError` / `HTTPException`/unknown (`docs/setup.md:1440-1480`). Subclasses: `NotFound`, `Forbidden`, `Conflict`, `Unprocessable` (`:1434-1437`). Convention table: "Errors | `DomainError` subclasses from `@seta/middleware/errors`; mapped to RFC7807" (`docs/setup.md:2062`).

CLAUDE.md: "No DI containers, plugin loaders, or runtime discovery" — `apps/api/src/main.ts` is the only registry, mounts module routes. `tenantContext.getTenantId()` from `@seta/tenant` replaces any RequestContext-style threading.

## Delta

**Fold in.**
- The **adapter shape** (single `ModelStream<TChunk>` interface in §5 ≈ Mastra's `MastraLanguageModel` union). Each provider file owns its quirk-fixup; no quirks leak to the kernel. Confirms §5's split into `models/openai.ts` and `models/anthropic.ts` — direct SDK use is fine and gives us prompt-cache control Mastra hides.
- A typed **`Processor` contract** for K-loop hooks. Even if P1 ships only `streamKernelSSE`, leave seams for `processInput`/`processOutputStep`/`processAPIError` so guardrails, retries, and audit-write are not retro-fits. The trio `abort/retryCount/abortSignal` in `ProcessorContext` (`processors/index.ts:50`) is the right shape — already aligns with §5's abort discipline.
- A **`MessageList` canonical form** in `@seta/agent-core`. setup.md §5 implies raw `messages` arrays; without a normalized intermediate we will re-invent provider-compat fixups (orphaned tool pairs, Anthropic system-array vs OpenAI system-string, reasoning-content roundtripping) per route. Even a 200-LOC version pays for itself by K3.
- A **`MastraError`-style structured shape** *underneath* DomainError: `{ code, domain, category, details, cause }` available as fields, then mapped to RFC 7807 at the HTTP boundary. setup.md §15 only models the wire shape; we lose error grouping in logs/Sentry without a domain enum.

**Avoid.**
- The 6,811-line god `Agent` class with N+ overloads. K1 should be functions over a config record, not a class hierarchy.
- The `Mastra` central-registry / `__registerMastra` back-pointer pattern (`mastra/index.ts:496`) — directly conflicts with CLAUDE.md "No DI containers". Composition in `apps/api/src/main.ts` is the registry; agent code reads `tenantContext.getTenantId()` not `requestContext.get(MASTRA_RESOURCE_ID_KEY)`.
- The legacy `mitt` hook bus (`hooks/index.ts:6`). It's fire-and-forget via `setImmediate` — defeats OTel span correlation and structured error propagation. If we need eval/audit fan-out, use a typed processor or an OTel span attribute.
- The AI-SDK-as-substrate decision. setup.md is right to go direct — we want `cache_control` on Anthropic tool definitions and OpenAI prompt-cache hints without waiting for AI-SDK passthrough.

**Open questions.**
- Does the `Processor` contract belong in `@seta/agent-core` or a sibling `@seta/agent-processors`? Mastra co-locates; we likely want co-located too for P1.
- Where does the JSON error shape live — `@seta/middleware/errors` (as setup.md §15 says) or `@seta/agent-core`? Recommend: shape in middleware, agent throws `DomainError` subclasses with `cause = MastraError-like detail`.
- `RequestContext`-style typed map: hard-no per CLAUDE.md, but we *do* need a place to stash per-call `runId`, `cost`, `retryCount`. Recommend: explicit `RunCtx` parameter on K-loop, not AsyncLocalStorage and not a registry map.

## Punch list

- setup.md §5: add a "ModelAdapter contract" paragraph naming the `ModelStream<TChunk>` interface explicitly, with the chunk discriminated union (`text` / `tool_args` / `tool_call` / `finish` / `error`) — currently only shown by example at `docs/setup.md:348-363`.
- setup.md §5: add subsection "Message normalization" — declare an internal `KernelMessage` canonical form and the OpenAI⇄Anthropic shape conversions live in `models/<provider>.ts` adapters, not in route code. Reference Mastra's `provider-compat.ts:1` patterns.
- setup.md §5: name the processor seams P1 will leave open: `onBeforeModelCall(ctx, req)`, `onAfterModelCall(ctx, res)`, `onApiError(ctx, err)`. Even if P1 implements none, having the types reserved means K4 (tool loop) doesn't break callers.
- setup.md §15: extend `DomainError` constructor to accept `{ code: string, domain: 'AGENT'|'LLM'|'TOOL'|..., category: 'USER'|'SYSTEM'|'THIRD_PARTY', details?: Record<string, Json> }` and surface them in the problem+json body. Match Mastra's `MastraErrorJSON` field names so log search is consistent.
- setup.md §15: define `AgentError`/`LlmError`/`ToolError` subclasses of `DomainError` alongside the four current HTTP ones — the kernel needs domain-tagged 5xx-ish errors, not just 4xx route errors.
- @seta/agent-core: export a `Processor` TS interface from day one with no-op default implementations, even if K1 only wires `streamKernelSSE`. Concrete hook names: `processInput`, `processOutputStep`, `processAPIError` (subset of Mastra's eight — others are P2).
- @seta/agent-core: export `ModelAdapter` interface + `OpenAIAdapter`/`AnthropicAdapter` concrete classes; never let routes import `openai` or `@anthropic-ai/sdk` directly.
- @seta/agent-core: export a `KernelError extends DomainError` with `domain`/`category`/`code` fields, thrown by adapters and the K-loop; surfaces in `onError` via the existing RFC 7807 mapper.
- P2-defer: full Mastra-style 8-method processor pipeline (`processInputStep`, `processLLMRequest`/`processLLMResponse`, `processOutputStream`) — overkill until K4 tool loop and K6 eval land.
- P2-defer: a typed `RequestContext` map. Use explicit `RunCtx` arg in P1; revisit only if 3+ unrelated callers need ad-hoc keys.
- P2-defer: schema-compat layers (`AnthropicSchemaCompatLayer` etc. at `model.ts:107`) — only needed if we ship tool-schema rewrites for older Anthropic/Gemini models, which P1 does not target.
