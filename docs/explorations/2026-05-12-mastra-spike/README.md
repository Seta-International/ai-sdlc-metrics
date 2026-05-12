# Mastra Foundation Spike — Index

**Date:** 2026-05-12  •  **Branch:** `spike/mastra-foundation`  •  **Spec:** [`docs/superpowers/specs/2026-05-12-mastra-spike-design.md`](../../superpowers/specs/2026-05-12-mastra-spike-design.md)

Cross-check setup.md's P1 choices against Mastra's working 2026 monorepo. **Pattern extraction only — Mastra is not adopted at runtime.** setup.md §10's kernel-first stance stands. Each report below is `What Mastra does → What setup.md plans → Delta → Punch list`, with file_path:line_number refs.

---

## Reports

| # | File | TL;DR |
|---|---|---|
| 01 | [`01-monorepo-build-test.md`](./01-monorepo-build-test.md) | Mastra uses `pnpm catalog:` + per-package `turbo.json` (`extends: ["//"]`) + tsup ESM/CJS dual emit. Supply-chain controls in `pnpm-workspace.yaml`, not `.npmrc`. Biome 2.4 can't replicate ESLint's type-aware `no-floating-promises` — decision needed before P1 close-out. |
| 02 | [`02-agent-core.md`](./02-agent-core.md) | Mastra exposes an 8-method `Processor` pipeline and a `MastraErrorJSON` with `domain` / `category` / `code` triad. `@seta/agent-core` should reserve a 3-method processor seam (`onBeforeModelCall` / `onAfterModelCall` / `onApiError`), export a `ModelAdapter` interface, and ship `KernelError` / `AgentError` / `LlmError` / `ToolError` subclasses of `DomainError`. |
| 03 | [`03-run-loop.md`](./03-run-loop.md) | Mastra has explicit `maxSteps` / `stopWhen` / per-tool budgets / `isRetryable` error classification / abort-aware chunk consumption. setup.md §5 promises these by name but never defines them — fold concrete defaults (`maxSteps: 16`, `maxRetries: 2`) into the spec. |
| 04 | [`04-tools-mcp.md`](./04-tools-mcp.md) | Mastra tools are `{ id, description, inputSchema, outputSchema, execute, annotations? }`; output-validation errors are **returned as typed values**, not thrown. MCP exposure is P2-defer (no P1 consumer). setup.md §3 should spell out the `write_continuations` row shape (ULID, HMAC-SHA-256, etag_snapshot jsonb, TTL). |
| 05 | [`05-workflows.md`](./05-workflows.md) | **P2-defer.** Chat agents need tool-loop + preview→commit, not a DAG primitive. Leave a minimal Run-id + `RunStatus` seam in the kernel so a later `workflow_snapshots` table joins by `run_id` without refactor. |
| 06 | [`06-llm-recording-replay.md`](./06-llm-recording-replay.md) | Mastra's `_llm-recorder` uses `msw` + `md5(url + canonicalized body).slice(0,16)` fixture mapping + streaming chunk recording (`chunks[] + chunkTimings[]`). `@seta/agent-core/testkit` should export `setupLLMRecording({ name, recordingsDir?, transformRequest? })` — small surface, msw-backed. |
| 07 | [`07-request-context.md`](./07-request-context.md) | **Notable: Mastra does NOT use ALS for request context** — only for OTel spans. Confirms setup.md §3's ALS choice for `@seta/tenant` is the right call. Specify the API surface: `tenantContext.run({tenantId, userId, requestId}, fn)` is the only setter; store is frozen; `tryGetTenantId()` for background jobs; `runAsTenant()` for queue handlers. |
| 08 | [`08-schema-compat.md`](./08-schema-compat.md) | **setup.md §2 open question RESOLVED.** `@hono/zod-openapi` calls `extendZodWithOpenApi(z)` once at module load and mutates the shared `zod` module. Peer-dep is `zod ^4.0.0` — works with our Zod 4.4.3 pin as long as pnpm resolves a single instance (which it does). Keep the existing §15 import rule. |
| 09 | [`09-memory.md`](./09-memory.md) | Leave a `MemoryProvider` interface (`recall` / `saveTurn` / `getWorkingMemory` / `updateWorkingMemory`) in `@seta/agent-core`. Ship `NullMemoryProvider` as P1 default — kernel always calls the seam, P2 implementation is a one-line swap. No memory tables in P1 schema. |
| 10 | [`10-llm-model-router.md`](./10-llm-model-router.md) | Setup.md §5 is missing a **Model Router** subsection. Add one specifying `selectModel(cfg) → ModelStream<TChunk>` at `platform/agent/core/src/models/router.ts`; use provider-qualified model IDs (`"openai/gpt-5"`, `"anthropic/claude-4-7-sonnet"`); add `prepare-tools.ts` for cross-provider tool-shape normalization. Move `js-tiktoken` pin from §6 (agent-chunking) to §5 (agent-core). |

---

## Consolidated punch list

### setup.md amendments — `§1–§4` (toolchain, runtime, data, auth)

- **§1 (line 18):** Biome 2.4 has no type-aware `no-floating-promises`. Decision before P1 close-out: layer minimal eslint over Biome for `platform/agent/*` vs rely on runtime traps. (SA-1)
- **§2 (line 33):** Mark the Zod 4 / `@hono/zod-openapi` open question RESOLVED — peer-dep is `zod ^4.0.0`, mutation runs once at module load. (SA-8)
- **§2:** Pin `zod@4.4.3` as the *sole* runtime instance — no `zod-v3`, no `npm:zod@^3.x` aliases. (SA-8)
- **§3 (line 117):** Spell out the `write_continuations` row shape: `continuation_id ULID, tenant_id, tool_id, input_hash, etag_snapshot jsonb, hmac, expires_at, consumed_at`; HMAC-SHA-256 over canonicalized payload + server secret from `@seta/auth` KMS. (SA-4)
- **§3:** Add API-surface paragraph for `@seta/tenant`: `tenantContext.run(...)` is the only setter; store is frozen; `tryGetTenantId()` for background entrypoints; `runAsTenant()` audit-logged. (SA-7)
- **§3:** Note that long-running SSE streams must re-enter tenant context per chunk producer (mirrors the `SET LOCAL` warning at §3:132). (SA-7)
- **§3 (line 117):** Name the future memory tables `agent.conversations`, `agent.turns`, `agent.working_memory`. (SA-9)

### setup.md amendments — `§5` (LLM & agent kernel — the densest area)

- Add explicit **ModelAdapter contract** paragraph naming `ModelStream<TChunk>` and its chunk discriminated union (`text` / `tool_args` / `tool_call` / `finish` / `error`). (SA-2)
- Add a **Message normalization** subsection — declare an internal `KernelMessage` canonical form; OpenAI⇄Anthropic shape conversions live in `models/<provider>.ts`. (SA-2)
- Add a **Model router** subsection between `Kernel patterns` and `Anthropic prompt caching`. Spec `selectModel(cfg) → ModelStream<TChunk>` at `platform/agent/core/src/models/router.ts`. (SA-10)
- Use **provider-qualified model IDs** (`"openai/gpt-5"`, `"anthropic/claude-4-7-sonnet"`); the prefix drives selection. (SA-10)
- Add **tool-shape normalization** paragraph: typeless-property union + `$schema` draft-07 pin (cross-provider). (SA-10)
- Add **max iterations / stopWhen** subsection. Default `maxSteps: 16`; `stopWhen?: (steps) => boolean | Promise<boolean>`. (SA-3)
- Add **retry policy** subsection. Default `maxRetries: 2`; only on transient (429, 5xx, fetch timeout); cross-model fallback opt-in via `cfg.fallback?: string[]`. (SA-10, SA-3)
- Add **per-tool budget** sub-bullet: `{ maxCalls, maxTokens?, timeoutMs? }`. (SA-3)
- Extend abort paragraph: re-check `signal.aborted` on every consumed chunk (providers keep emitting after abort). (SA-3)
- Spec **token-counting integration**: `js-tiktoken` called pre-request (estimate audit row) and post-response (reconcile against `usage`). No pre-request budget enforcement in P1. (SA-10)
- Spec **memory seam**: kernel calls `MemoryProvider.recall()` / `.saveTurn()` around the model call; P1 binds `NullMemoryProvider`. (SA-9)
- Spec **LLM recording**: msw-based, `md5(url + canonicalize(body)).slice(0,16)` fixture map, `chunks[] + chunkTimings[]` for streaming, env-var gate `RECORD=1` (record-if-missing) / `RECORD=force` / default strict-replay. (SA-6)
- Explicit non-pick: **no response-content cache in P1**; rely on Anthropic ephemeral prompt cache + OpenAI structured-output cache. (SA-10)
- `streamKernelSSE`: require **safeEnqueue** semantics on the writer — `stream.writeSSE` after client-disconnect must not throw the loop. (SA-3)

### setup.md amendments — `§9–§15` (publishing, layout, footguns)

- **§11 (line 939):** Add one-line note under `modules/products/agent` — "No workflow DSL in P1; multi-step plans are LLM-planned tool calls inside the kernel loop. Two-phase writes use `write_continuations`." (SA-5)
- **§11:** Each tool exports `{ id, description, inputSchema, outputSchema, execute, annotations? }`; `outputSchema` **required for write tools** (commit pairs). (SA-4)
- **§11:** Under `tools/planner/write/`: `.preview` returns `{ continuation_id, summary, etag_snapshot }`; `.commit` accepts `{ continuation_id }` only — prevents argument tampering between turns. (SA-4)
- **§12 `pnpm-workspace.yaml`:** Add a `catalog:` block pinning `typescript`, `vitest`, `@vitest/coverage-v8`, `zod`; rewrite §13 to use `"catalog:"` references. (SA-1)
- **§12 `.npmrc`:** Add `blockExoticSubdeps=true`, `min-release-age=1440`, `trustPolicy=no-downgrade` (or move to `pnpm-workspace.yaml minimumReleaseAge`). Cross-link to §9. (SA-1)
- **§12 root `package.json`:** Add `"preinstall": "npx only-allow pnpm"`. (SA-1)
- **§12 `turbo.json`:** Add a "Per-package `turbo.json`" subsection showing `extends: ["//"]` + split-task pattern. (SA-1)
- **§12 `vitest.config.ts`:** Stay static (no dynamic discovery per CLAUDE.md); expand leaf-package shape to three projects (`unit:<pkg>` / `e2e:<pkg>` / `typecheck:<pkg>`). (SA-1)
- **§12:** Add a "tsup defaults" subsection — mandate `format: ['esm','cjs']` (public packages only), `splitting: true`, `treeshake: { preset: 'smallest' }`, `clean: true`, `sourcemap: true`, `dts: false` (d.ts emitted via `tsc --emitDeclarationOnly`). (SA-1)
- **§12 turbo inputs:** Note that `__recordings__/**` **must** be checked into git (no `.gitignore` entry) — otherwise turbo silently caches misses. (SA-6)
- **§13:** Move `js-tiktoken@1.0.21` pin from `@seta/agent-chunking` to `@seta/agent-core` — the router needs it in P1, RAG is P2. (SA-10)
- **§15:** Append mechanism note to the `z` import footgun — `extendZodWithOpenApi(z)` mutates the shared `zod` module once at load. (SA-8)
- **§15:** Extend `DomainError` constructor to accept `{ code, domain, category, details? }`; match Mastra's `MastraErrorJSON` field names. (SA-2)
- **§15:** Define `AgentError` / `LlmError` / `ToolError` subclasses of `DomainError` alongside the four current HTTP ones. (SA-2)

### `@seta/agent-core` hooks to leave in P1 (so P2 doesn't refactor)

- `Processor` interface with no-op defaults — `processInput` / `processOutputStep` / `processAPIError`. (SA-2)
- `ModelAdapter` interface + `OpenAIAdapter` / `AnthropicAdapter` concrete classes — never let routes import `openai` or `@anthropic-ai/sdk` directly. (SA-2)
- `selectModel(cfg)` at `models/router.ts`; `prepare-tools.ts` (pure JSON-Schema normalization); `retry.ts` with `classifyError` / `withRetry`. (SA-10)
- `MemoryProvider` interface + `NullMemoryProvider`; kernel calls `recall()` pre-model and `saveTurn()` post-model. (SA-9)
- Injectable `{ now, generateId, currentDate }` on kernel `run` context — for byte-stable LLM replay. (SA-3)
- `stopWhen?: StopCondition | StopCondition[]` + `onIterationComplete?` on loop options. (SA-3)
- `toolCallConcurrency` + auto-sequential on `requireApproval` tools. (SA-3)
- Tool execution context: `requestContext`, `abortSignal`, `toModelOutput?` transform. (SA-4)
- Tool validation errors as **returned values typed as `{ error: ... }`**, not thrown. (SA-4)
- Tool result envelope supports `{ suspend?: { reason, resumeLabel } }` discriminant (shape-only, not wired). (SA-5)
- `StandardSchemaV1` accepted (not just `ZodType`) on tool input/output; tool schema → JSON Schema via `z.toJSONSchema()` (Zod 4 native). (SA-8)
- `setupLLMRecording({ name, recordingsDir?, transformRequest? })` testkit export; `serializeRequestContent` / `hashRequest` utility. Kernel HTTP must use global `fetch` (no SDK-internal transports). (SA-6)
- `Run` identifier (ULID) + `RunStatus` type — even with no workflow primitive. (SA-5)
- `KernelError extends DomainError` with `domain` / `category` / `code`. (SA-2)

### P2-deferred (deliberate)

- Workflow engine (DAG, `.then` / `.branch` / `.parallel`, suspend/resume). (SA-5)
- MCP server exposure of seta tools. (SA-4)
- In-process HITL `approveToolCall(runId)` — preview/commit + HMAC continuations cover the same need statelessly. (SA-4)
- Full 8-method processor pipeline. (SA-2)
- Chunk-replay cache + `resumeStream()`; output-stream processor stack. (SA-3)
- Workflow-as-loop architecture (snapshot persistence). (SA-3)
- Provider-specific schema compat layers (`AnthropicSchemaCompatLayer` etc.). (SA-2, SA-8)
- Cross-version Zod / Arktype / Valibot adapters. (SA-8)
- Thread CRUD, working-memory persistence, semantic recall implementation. (SA-9)
- Composite / multi-backend storage. (SA-9)
- Response-content cache; provider gateway / BYO-endpoint. (SA-10)
- Vercel AI SDK adoption — revisit if we add a third provider. (SA-10)
- Cross-process tenant-context forwarding; impersonation flows. (SA-7)
- Binary artifact sidecars (TTS/STT); fixture contract-validation. (SA-6)
- Dynamic vitest project discovery; pnpm `overrides` / `patchedDependencies` infra. (SA-1)
- A typed `RequestContext` map (use explicit `RunCtx` arg in P1). (SA-2)
- `@internal/types-builder` style d.ts bundler with provider registry. (SA-1)

---

## What goes into the foundation-spike PR vs follow-up PRs

**Folded into Phase 3 skeleton (this PR):**
- Setup.md §12 root configs verbatim (no `catalog:` block yet — see follow-up).
- Per-package stubs per setup.md §13 deps inline.
- §3 RLS roles via `infra/postgres/init.sql`.

**Follow-up PRs (queued, not in this PR):**
- Setup.md amendments listed above. Group by section: one PR per major section affected (`§2`, `§3`, `§5`, `§11`, `§12`, `§15`).
- `pnpm catalog:` adoption with §13 rewrite (paired change, single PR).
- The Biome+ESLint coexistence decision — separate ADR.
- All `@seta/agent-core` hook implementations land when the package gets real code (post-skeleton).
