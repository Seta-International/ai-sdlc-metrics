# LLM Model Router — Mastra spike

## What Mastra does

**Unified model type via AI-SDK indirection.** Mastra does *not* abstract OpenAI vs Anthropic shape itself — it delegates to Vercel's AI SDK (`@ai-sdk/provider-v5` / `-v6`), and its own router is one more `LanguageModelV2` implementation. `ModelRouterLanguageModel` (`/Users/canh/Projects/Seta/mastra/packages/core/src/llm/model/router.ts:108`) implements `MastraLanguageModelV2` with `doGenerate`/`doStream` (`router.ts:347`, `:389`) and dispatches to per-version wrappers `AISDKV5LanguageModel` / `AISDKV6LanguageModel` (`router.ts:381-386`). Provider selection is a magic-string ID `"<provider>/<model>"` parsed by `parseModelRouterId` (`/Users/canh/Projects/Seta/mastra/packages/core/src/llm/model/gateway-resolver.ts:8`) and resolved through a *gateway* abstraction (`defaultGateways` at `router.ts:97`: Netlify, Mastra, ModelsDev). The user-facing entry point is `resolveModelConfig` (`/Users/canh/Projects/Seta/mastra/packages/core/src/llm/model/resolve-model.ts:73`) — strings → router; pre-built `LanguageModelV2` → passthrough wrapper.

**Tool-call shape normalization is delegated to AI SDK, not the router.** `prepareToolsAndToolChoice` (`/Users/canh/Projects/Seta/mastra/packages/core/src/stream/aisdk/v5/compat/prepare-tools.ts:72`) converts Mastra's `Tool` map into `LanguageModelV2FunctionTool[]` (a vendor-neutral shape: `{ type: 'function', name, description, inputSchema }`, `prepare-tools.ts:195`). Each AI-SDK provider package then translates that into OpenAI `tools` or Anthropic `tools` on the wire. Notable normalization work: Zod v4 `z.any()` → permissive type-union (`prepare-tools.ts:33-71`) and `$schema` pinned to draft-07 (`:178-185`) — providers reject draft-2020-12.

**Token counting is *not* via `js-tiktoken`.** Mastra uses `tokenx` (`/Users/canh/Projects/Seta/mastra/packages/core/src/processors/processors/token-limiter.ts:2`) — a heuristic estimator with no BPE table — and explicitly deprecates the `encoding` option (`token-limiter.ts:14-18`). It is invoked **as an input processor** for pre-request context-window trimming (`token-limiter.ts:88`) **and** as an output processor for live truncation (`:256`). No pre-request budget *check* against a tenant quota; no post-response cost record from a token counter (usage stats come from the provider's `usage` field via `modelSpanTracker.endGeneration` at `/Users/canh/Projects/Seta/mastra/packages/core/src/llm/model/model.loop.ts:278-295`).

**Retry/fallback is two-layered.** Per-model retries are pushed *into the AI SDK* via `maxRetries` on the call settings (`/Users/canh/Projects/Seta/mastra/packages/core/src/loop/workflows/agentic-execution/llm-execution-step.ts:1116`); the SDK uses `p-retry` internally. Cross-model failover is owned by the loop: `executeStreamWithFallbackModels` (`llm-execution-step.ts:538`) iterates `ModelManagerModelConfig[]` (`/Users/canh/Projects/Seta/mastra/packages/core/src/stream/types.ts:962`), advances on throw, and gives the last model `shouldThrowError: !isLastModel` so errors surface only after exhaustion (`:1162`). Indices are persisted in workflow state (`fallbackModelIndex` at `:649`, `:1849`) so durable runs resume on the same fallback. **No transient-error classification** — *any* throw triggers failover (`TripWire` is the one re-thrown short-circuit, `:564`).

**Response caching is provider-only.** No LLM-response cache in `llm/model/` beyond a *model-instance* cache keyed by `(gateway, modelId, providerId, url, headers, transport)` (`router.ts:474-486`) — that's SDK-client reuse, not response memoization. Anthropic prompt caching flows through unchanged via `providerOptions`.

## What setup.md plans

§5 (`/Users/canh/Projects/Seta/seta-os/docs/setup.md:327`) names the building blocks but *no router layer*:

> "OpenAI | openai | **6.37.0** | Official SDK / Anthropic | @anthropic-ai/sdk | **0.95.1** / Tokenizer | js-tiktoken | **1.0.21**" (`setup.md:331-333`)

> "The kernel wraps these into a single `ModelStream<TChunk>` interface so route authors don't see the SDK split." (`setup.md:338`)

The two SDK paths are shown as *parallel* helpers (`platform/agent/core/src/models/openai.ts` at `setup.md:341`, `…/anthropic.ts` at `:353`), each consuming `cfg.model` as an opaque string. §5 covers ephemeral prompt caching (`setup.md:370-393`), abort wiring as "non-negotiable" (`:368`), and `streamKernelSSE` (`:426`). It does **not** specify: how `cfg.model` selects a provider, where the OpenAI vs Anthropic branch lives, retry policy, fallback policy, token-budget enforcement, or a response cache.

§11 places this in `platform/agent/core/` = `@seta/agent-core` (`setup.md:956`) and shows `cfg.model` only as a field of an agent definition (`modules/products/agent/src/agent.ts` at `setup.md:941`).

§13 pins router-relevant deps: `openai@6.37.0 @anthropic-ai/sdk@0.95.1 zod@4.4.3` in `@seta/agent-core` (`setup.md:1734`); `js-tiktoken@1.0.21` is pinned **only** in P2's `@seta/agent-chunking` (`setup.md:1815`), not the kernel.

## Delta

**Fold in.**
- **One `ModelStream<TChunk>` per-provider adapter, one thin router on top** that switches on `cfg.model` prefix (`openai/*`, `anthropic/*`). Mastra's `ModelRouterLanguageModel` (`router.ts:108`) is the right *shape* but its gateway/AI-SDK indirection is overkill for two providers.
- **Tool-call normalization as a separate pure function**, the way Mastra factored `prepareToolsAndToolChoice` (`prepare-tools.ts:72`). Take the two fixups verbatim: typeless-property repair (`:33`) and `$schema` pin to draft-07 (`:178`) — both are real wire-format bugs we'll otherwise rediscover.
- **Multi-model failover as a loop concern, not a router concern** (Mastra's split at `llm-execution-step.ts:538` vs `router.ts`). Keeps the router stateless and lets the kernel own the fallback policy.
- **Per-model `maxRetries` + headers in the model config record**, not as call args (`stream/types.ts:962`).

**Avoid.**
- **AI SDK as a dependency.** Adds a third type system on top of the two we already pin and pulls v2/v3 spec dual-coding (`router.ts:33`, `:380-386`). Two SDKs, two adapters — done.
- **`tokenx` estimator** for budget enforcement. setup.md§5 pins `js-tiktoken` (`setup.md:333`) for real token counts; Mastra's heuristic only suffices for soft truncation.
- **Gateway abstraction** (`router.ts:97`, `gateways/`). YAGNI for P1; key-per-tenant lives in `@seta/oauth` token vault, not a gateway plugin point.
- **Mastra's "any throw → next model" failover** (`llm-execution-step.ts:561-571`). Without classifying transient (429/5xx/timeout) vs terminal (auth, malformed tool call) we'll burn the fallback budget on bugs.

**Open questions.**
- Does §5's `cacheTtl` (`setup.md:393`) imply Anthropic-only, or do we also surface OpenAI's automatic structured-output caching as a no-op flag for parity?
- Cost-record sink: pre-request budget check vs post-response audit row — does `@seta/audit` already define this surface? (Mastra doesn't; usage flows into spans only — `model.loop.ts:278`.)
- Response cache: out of scope for P1, or a 1h LRU keyed on `(tenant, model, hash(messages+tools))` for idempotent replays?

## Punch list

- setup.md §5: add a new subsection **"Model router"** between `Kernel patterns` and `Anthropic prompt caching`. Spec the signature `selectModel(cfg: AgentConfig): ModelStream<TChunk>` switching on `cfg.model` prefix; require it to live at `platform/agent/core/src/models/router.ts`.
- setup.md §5: rename `cfg.model` to **provider-qualified ID** (`"openai/gpt-5"`, `"anthropic/claude-4-7-sonnet"`) and require the prefix to drive selection. Cite `parseModelRouterId` pattern at `gateway-resolver.ts:8`.
- setup.md §5: add `tools` normalization paragraph naming the two real fixups (typeless-property union, `$schema` draft-07 pin) with refs to `prepare-tools.ts:33` and `:178`.
- setup.md §5: state the **retry policy explicitly**: per-call `maxRetries: 2` (transient: 429, 5xx, fetch timeout); cross-model fallback is **opt-in** via `cfg.fallback?: string[]` and *only* fires on transient classes; auth/4xx/tool-validation errors throw without failover.
- setup.md §5: state the **token-counting integration**: `js-tiktoken` called (a) pre-request to record `estimatedInputTokens` on the audit row, (b) post-response to reconcile against provider `usage`. No pre-request budget *enforcement* in P1.
- setup.md §5: explicit non-pick — no response-content cache in P1; rely on Anthropic ephemeral prompt cache (`setup.md:370`) + OpenAI's built-in structured-output cache.
- setup.md §13: move `js-tiktoken@1.0.21` pin from `@seta/agent-chunking` (`setup.md:1815`) to `@seta/agent-core` (`:1734`) — the router needs it in P1, RAG is P2.
- @seta/agent-core: leave a `models/router.ts` hook exporting `selectModel(cfg)` and `ModelStream<TChunk>`; keep per-provider adapters at `models/openai.ts` / `models/anthropic.ts` (already in `setup.md:341,353`) — router is the only file that imports both.
- @seta/agent-core: leave a `models/prepare-tools.ts` hook (pure function, no SDK imports) taking `Tool[]` → JSON-Schema-normalized `{ name, description, inputSchema }[]`. Each adapter wraps to its SDK shape.
- @seta/agent-core: leave a `models/retry.ts` hook with `classifyError(err)` → `"transient" | "terminal"` and a `withRetry(fn, { maxRetries, signal })` wrapper. Cross-model fallback lives one level up in the kernel loop, not in the router.
- P2-defer: response-content cache (no Mastra precedent, no §5 requirement).
- P2-defer: provider gateway / BYO-endpoint plugin point (Mastra's `MastraModelGateway` at `gateways/base.ts`) — single-tenant key-per-provider env var is sufficient for P1.
- P2-defer: AI SDK adoption — revisit if we add a third provider (Gemini, Bedrock).
