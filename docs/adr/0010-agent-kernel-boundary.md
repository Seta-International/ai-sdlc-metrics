# ADR 0010 — Agent kernel boundary (`@seta/agent-core`)

- Status: Accepted
- Date: 2026-05-12
- Deciders: Platform team
- Spec: `docs/superpowers/specs/2026-05-12-agent-core-k1-design.md`

## Context

`@seta/agent-core` is the framework-free agent kernel for the Seta agent platform. Other packages (`@seta/agent-memory`, `@seta/agent-workflows`, `@seta/agent-sdk`, every `modules/products/agent/*` agent, every `modules/channels/*` handler) depend on it. Its public surface needs to hold across the K-track increments without disruptive rewrites, so the boundaries are worth pinning explicitly.

## Decision

Four boundary decisions are accepted as of the K1 (kernel surface) increment:

### 1. Direct SDK use over the AI SDK

The kernel imports `openai` and `@anthropic-ai/sdk` directly (concrete adapters in the next increments) rather than going through Vercel AI SDK's `LanguageModelV2`/`V3` abstraction. Trade-off: two type systems instead of one; in exchange we get `cache_control` on Anthropic tool definitions and OpenAI prompt-cache hints without waiting for AI-SDK passthrough. Cite the 2026-05-12 Mastra spike (`docs/explorations/2026-05-12-mastra-spike/02-agent-core.md:37`, `10-llm-model-router.md:38`).

### 2. Two-part provider IDs + per-instance adapter config

Model IDs are `<provider>/<model>` (`anthropic/claude-4-7-sonnet`, `openai/gpt-5`). The `OpenAIAdapter` constructor accepts `{ baseURL?, apiKey?, ... }`; the composition root in `apps/api/main.ts` decides whether `openai/*` routes to OpenAI proper, Azure, LiteLLM, Ollama, or any other OpenAI-compatible endpoint. Bare model IDs after the first slash may themselves contain slashes (`openai/litellm/llama-3.1-70b`). **Explicitly rejected:** Mastra's gateway abstraction (gateways/, `MastraModelGateway`); cite `docs/explorations/2026-05-12-mastra-spike/10-llm-model-router.md:40`.

### 3. Adapter registry as factory + injection, not module singleton

`createAdapterRegistry()` returns a closure-backed instance with `register/get/select` methods. The instance is passed to `run()` via `RunLoopOptions.adapters`. This mirrors `createConnectorRegistry` (`platform/connector-registry`) and satisfies CLAUDE.md "no DI container, no plugin loader, no runtime discovery". `apps/api/main.ts` remains the only place that calls `register()`.

### 4. No event bus, no typed RequestContext map

No `mitt`/EventEmitter fire-and-forget event bus in the kernel (Mastra's `hooks/index.ts` pattern is explicitly rejected — it defeats OTel span correlation; cite `docs/explorations/2026-05-12-mastra-spike/02-agent-core.md:36`). No mutable typed `RequestContext` map (cite `02-agent-core.md:42`). Every call passes an explicit `RunCtx` parameter. Tenant id is read from `tenantContext.getTenantId()` (`@seta/tenant` ALS), never on `ToolExecutionContext` / `MemoryContext` (CLAUDE.md "Footguns").

## Consequences

- **Two adapter implementations** (Anthropic, OpenAI) maintained in parallel; cross-provider feature drift surfaces as untyped fields in `AdapterRequest`. Acceptable for two providers; revisit if a third (Gemini, Bedrock) lands.
- **Composition cost in `main.ts`** — every new provider variant (e.g., Azure OpenAI vs OpenAI proper) is an explicit `register()` call. Trade-off vs Mastra's auto-resolved gateway: predictability and greppability for verbosity.
- **No cross-cutting events** — features that would naturally be EventEmitter-style (per-tool budgets, audit fan-out, eval hooks) must go through the `Processor` seam (`@seta/agent-core` reserves three of Mastra's eight hooks).

## Alternatives considered

- **Adopt AI SDK as substrate** — rejected: pulls a third type system over the two we already pin; v2/v3 spec dual-coding is overhead for two providers (`docs/explorations/2026-05-12-mastra-spike/10-llm-model-router.md:38`).
- **Module-level adapter registry** — rejected: violates CLAUDE.md boundary rules and makes tests order-sensitive.
- **Mastra-style `Mastra` god class + `__registerMastra` back-pointer** — rejected: directly conflicts with "no DI container" rule (`docs/explorations/2026-05-12-mastra-spike/02-agent-core.md:35`).

## Follow-ups

- The next increment wires the first concrete adapter (Anthropic) in `apps/api/main.ts`.
- A subsequent increment wires the OpenAI adapter with the `baseURL` knob for OpenAI-compatible endpoints (Azure, LiteLLM, Ollama).
- A later increment enables the tool-call iteration loop (`accumulatedSteps`, `stopWhen`, fallback models, concurrent tool execution) and fires the Processor hooks.
- A parallel increment adds the MSW recording testkit (`setupLLMRecording`) under `@seta/agent-core/testkit`.
