# SCOPE — modules/products/agent  (@seta/agent)

## Purpose

The Seta Agent product — the only `modules/products/*` package in P1. Owns the agent definition (system prompt, model, tool set), the Planner tools (`read/` and `write/.preview` + `write/.commit` pairs), the `agent.write_continuations` schema for HMAC-signed preview→commit tokens, the Adaptive Cards the agent renders, the `TeamsHandler` implementation that turns inbound Teams messages into agent runs, and the product-level routes mounted at `/agent` in `apps/api`. (setup.md §11 agent section, §7 last paragraph, §5; spike `04-tools-mcp.md`, `02-agent-core.md`, `06-llm-recording-replay.md`.)

## Responsibilities

- **Owns:**
  - The agent definition — name, system prompt, model selection, tool wiring (setup.md §11 `agent.ts`).
  - Planner tools, organized as setup.md §11 specifies:
    - `tools/planner/read/` — `list_my_tasks`, `list_plan_tasks`, `get_task`, `list_plans`, `list_buckets`, `workload_analysis`.
    - `tools/planner/write/` — preview→commit pairs: `create_tasks.preview`/`.commit`, `update_tasks.preview`/`.commit`, etc.
  - The `agent.write_continuations` Drizzle schema — HMAC-signed preview→commit tokens (`continuation_id ULID, tenant_id, tool_id, input_hash, etag_snapshot jsonb, hmac, expires_at, consumed_at`) per spike `04-tools-mcp.md` punch list; setup.md §11 `schema.ts`.
  - Adaptive Cards specific to this agent: `cards/task-list.ts`, `cards/text.ts` (setup.md §11). Templating via `adaptivecards-templating@2.3.1`.
  - The `TeamsHandler` implementation — parses text, runs the agent through `@seta/agent-core`, builds the appropriate card, returns it (setup.md §11 `teams-handler.ts`).
  - The product's `routes(): Hono` factory mounted at `/agent` in `apps/api/src/main.ts` (setup.md §11 composition example).

- **Does NOT own:**
  - Bot Framework wire protocol, JWT verification, JWKS, outbound reply transport — those are `@seta/teams` (CLAUDE.md; setup.md §11 channel boundary).
  - Planner Graph client, ETag store, cache schema — those are `@seta/connector-ms365-planner` (setup.md §7, §11).
  - Directory mirror or JIT mapping — `@seta/connector-ms365-directory` (setup.md §11).
  - The kernel itself — `@seta/agent-core` provides the streaming K-loop, `ModelAdapter`, `Processor` seams, `streamKernelSSE(c, run)` helper, and the testkit (spike `02-agent-core.md`; CLAUDE.md footguns).
  - Other products — products never import other products (CLAUDE.md; setup.md §11 "never on another product").
  - Workflow DSL / DAG / suspend-resume engine — explicitly not in P1; multi-step plans are LLM-planned tool calls inside the kernel loop. Two-phase writes use `write_continuations`, not a workflow (spike `05-workflows.md`).
  - MCP server exposure of these tools — P2-deferred (spike `04-tools-mcp.md` punch list).

## Current state (Epic 1)

Epic 1 focused on auth (`@seta/oauth`, `@seta/auth`, `@seta/middleware`, MSAL Node, KMS-envelope token vault, admin-consent flow). The agent product itself is a scaffold.

- `modules/products/agent/src/index.ts` — `export {}`. No `agent`, no `teamsHandler`, no `routes`.
- `modules/products/agent/src/index.test.ts` — placeholder.
- `package.json` declares the right intent: `@seta/agent-core`, `@seta/auth`, `@seta/connector-ms365-planner`, `@seta/teams`, `@seta/tenant`, `adaptivecards-templating@2.3.1`, `zod@4.4.3`.
- **Missing vs setup.md §13 deps for `@seta/agent`:** `@seta/connector-ms365-directory`, `@seta/connector-registry`, `@seta/oauth`, `@seta/audit`, `@seta/db`, `drizzle-orm@0.45.2`, `p-queue@9.2.0`, `uuid@14.0.0`.
- **Missing vs setup.md §11 layout:** `agent.ts`, `tools/planner/{read,write}/`, `schema.ts`, `cards/`, `teams-handler.ts`, the `routes` export.

Everything below is the contract that future work must respect; nothing is implemented yet.

## Public interface

All exports from `modules/products/agent/src/index.ts`. Signatures only.

- `routes(registry: ConnectorRegistry): Hono` — **mandatory `routes(handler?: Handler) => Hono` export** per CLAUDE.md. Mounted at `/agent` (setup.md §11 composition example). May expose product-level endpoints (run, history when persisted, admin); does NOT include `/teams` routes (those come from `@seta/teams`).
- `teamsHandler: TeamsHandler` — concrete `TeamsHandler` implementation passed into `teamsRouter(teamsHandler)` (setup.md §11 composition example; `@seta/teams` defines the interface).
- `agent` — agent definition record `{ name, instructions, model, tools }` consumed by `@seta/agent-core` (setup.md §11 `agent.ts`; spike `02-agent-core.md` "K1 should be functions over a config record, not a class hierarchy").
- `agentRoutes(registry: ConnectorRegistry): Hono` — alias retained for the setup.md §11 composition example wording; canonical is `routes`.
- Tool exports per spike `04-tools-mcp.md`: each tool is `{ id, description, inputSchema, outputSchema, execute, annotations? }`. `outputSchema` is **required for write tools** to keep LLM-hallucination caught at the Zod boundary.
- Drizzle exports: `agentSchema` (pg schema `agent`), `writeContinuations` table, inferred row types.
- `WriteContinuation` — Zod-inferred type for the preview→commit envelope.

No `Handler` interface lives here — `@seta/teams` defines `TeamsHandler`; this product implements it.

## Imports

- **Allowed internal (per setup.md §11 dep direction `modules/products/* → modules/channels/* (handler-impl only), modules/connectors/*, platform/agent/*, platform/{middleware,observability,db,auth,tenant,audit}`):**
  - `@seta/agent-core` — kernel, `streamKernelSSE`, `ModelAdapter`, `Processor` seams, testkit (spike `02-agent-core.md`; setup.md §5).
  - `@seta/teams` — **only** to implement its `TeamsHandler` interface (setup.md §11 "may depend on `modules/channels/*` only to implement that channel's handler interface").
  - `@seta/connector-ms365-planner` — Planner client + manifest (already declared).
  - `@seta/connector-ms365-directory` — directory lookups inside `workload_analysis` and other tools (setup.md §13 — **missing in current `package.json`**).
  - `@seta/connector-registry` — `requireConsent(tenantId, '<connector-id>')` gate before any tool call hits Graph (CLAUDE.md "Connector consent"; setup.md §13).
  - `@seta/oauth` — token-bearing call chain via the registry; HMAC key fetched from `@seta/auth` KMS (setup.md §13; spike `04-tools-mcp.md`).
  - `@seta/auth` — KMS provider for HMAC signing of `write_continuations` (spike `04-tools-mcp.md` "HMAC-SHA-256 over canonicalized payload + server secret from `@seta/auth` KMS").
  - `@seta/audit` — record tool calls, preview, commit (CLAUDE.md "Idempotent external boundaries"; setup.md §13).
  - `@seta/db` — pool + `withTenant` + migration runner for the `agent` schema (setup.md §13; CLAUDE.md "Schema-per-module").
  - `@seta/tenant` — `tenantContext.getTenantId()` (CLAUDE.md).
  - `@seta/middleware` — `DomainError` subclasses, RFC 7807 mapper, Hono helpers (CLAUDE.md conventions; setup.md §15).
  - `@seta/observability` — logger, OTel spans.

- **Forbidden:**
  - **Any other `modules/products/*` package** — products never import other products (CLAUDE.md; setup.md §11 "never on another product"). Share via `platform/*` or call through a connector.
  - **Any `modules/channels/*` package other than `@seta/teams`** — and `@seta/teams` only for the `TeamsHandler` interface impl (setup.md §11).
  - Direct `openai` / `@anthropic-ai/sdk` calls — go through `@seta/agent-core`'s `ModelAdapter`. The kernel owns prompt-cache, abort wiring, and recording/replay (setup.md §5; spike `02-agent-core.md` "never let routes import `openai` or `@anthropic-ai/sdk` directly").
  - `botbuilder`, `botbuilder-core`, `@microsoft/teams-ai` — transport is in `@seta/teams`, not here.
  - `@microsoft/microsoft-graph-client` — Graph calls go through `@seta/connector-ms365-*` → `@seta/ms-graph`.
  - Mastra (`@mastra/core`, `@mastra/mcp`, `@internal/llm-recorder`) — spike-only references; not deps.
  - Workflow engines (`@mastra/workflows`, Temporal SDK, Inngest SDK) — P2-deferred (spike `05-workflows.md`).
  - `process.env.X` reads anywhere except via the typed `env` from `@seta/api` boot (CLAUDE.md "`process.env` → typed `env`").

- **External (pinned per setup.md §13):**
  - `zod@4.4.3`
  - `adaptivecards-templating@2.3.1` — optional templating for cards (setup.md §7 table).
  - `p-queue@9.2.0` — bounded fan-out where a tool issues parallel Planner calls (CLAUDE.md "LRU + `p-queue` + pgvector").
  - `uuid@14.0.0` — for ULIDs/UUIDs in `write_continuations.continuation_id` (setup.md §13).
  - `drizzle-orm@0.45.2` — `agent.write_continuations` schema (setup.md §13).
  - Dev: `vitest@4.1.5`, `tsup@8.5.1`, `typescript@6.0.3`, `@types/node@24`.

## Patterns to follow

- **Tools shape** — `{ id, description, inputSchema: ZodSchema, outputSchema: ZodSchema, execute(input, ctx), annotations? }`. `outputSchema` **required** for write tools; validation failures are **returned**, not thrown, so the kernel feeds them back to the LLM for self-correction (spike `04-tools-mcp.md` "Validation errors as *return values*, not throws").
- **`ToolExecutionContext` discriminated by surface** (`teams` | `direct` | future `mcp`) carrying `requestContext` and `abortSignal` on every call (spike `04-tools-mcp.md`; setup.md §5 "Abort wiring is non-negotiable").
- **MCP `annotations` mapping** even though MCP exposure is P2 — read tools `readOnlyHint: true`; `.preview` tools `readOnlyHint: true` + `idempotentHint: true`; `.commit` tools `destructiveHint: true` (spike `04-tools-mcp.md`).
- **Preview → HMAC-signed continuation → commit** for every write — stateless across requests; HMAC-SHA-256 over canonicalized payload + server secret from `@seta/auth` KMS. `.preview` returns `{ continuation_id, summary, etag_snapshot }`; `.commit` accepts `{ continuation_id }` only — never re-supplying the payload, preventing argument-tampering between turns (spike `04-tools-mcp.md` punch list; setup.md §7 last paragraph; §11 §3).
- **ETag snapshot at preview time** — call `plannerClient.getTask`, store `@odata.etag` in `write_continuations.etag_snapshot`; commit passes it back as `If-Match` (setup.md §7; spike `04-tools-mcp.md`).
- **Connector consent gate before every Graph-touching tool** — `connectorRegistry.requireConsent(tenantId, 'ms365-planner')` (CLAUDE.md "Connector consent"; setup.md §11).
- **Stream via `streamKernelSSE(c, run)` from `@seta/agent-core`** — never hand-write SSE; the helper wires `onAbort`, keep-alive, and the error handler (CLAUDE.md footguns).
- **Schema-per-module Drizzle layout** — `src/schema.ts` declares the `agent` pgSchema, `drizzle.config.ts` with `schemaFilter: ['agent']`, `migrations/` directory; never hand-edit migrations (CLAUDE.md "Schema-driven"; setup.md §11 `schema.ts`).
- **Multi-tenant from day one** — `write_continuations.tenant_id uuid not null`, RLS policy, app role `tenant_user` (CLAUDE.md).
- **Idempotent commit** — `write_continuations.consumed_at` is the idempotency token; replaying a commit is a no-op (CLAUDE.md "Idempotent external boundaries").
- **Tool result envelope carries an optional `{ suspend?: { reason, resumeLabel } }` discriminant — shape only, not wired** — future-compatible with HITL without importing Mastra's branded `InnerOutput` (spike `05-workflows.md` punch list).
- **`Run` identifier (ULID) threaded through the kernel** and a placeholder `RunStatus` type (`'created'|'running'|'completed'|'failed'`) so a later `workflow_snapshots` table joins by `run_id` without refactor (spike `05-workflows.md` punch list).
- **`Processor` seams reserved** in `@seta/agent-core` (`processInput`, `processOutputStep`, `processAPIError`); the product wires only what it needs in P1 (spike `02-agent-core.md`).
- **LLM in tests only via `@seta/agent-core/testkit` recordings** — msw-based, content-hashed, `__recordings__/` checked in (CLAUDE.md footguns; spike `06-llm-recording-replay.md`).
- **Errors throw `DomainError` subclasses** from `@seta/middleware/errors`; kernel/tool errors extend `KernelError extends DomainError` with `{ code, domain: 'AGENT'|'LLM'|'TOOL', category }` (spike `02-agent-core.md` punch list; setup.md §15).
- **`routes(registry)` factory** as the only export shape the API composes (CLAUDE.md; setup.md §11 composition example).

## Patterns to avoid

- **Importing another `modules/products/*` package** — boundary violation, CI guard rejects (CLAUDE.md; setup.md §11 "never on another product").
- **Importing `@seta/teams` for anything other than the `TeamsHandler` interface and the activity types it exports** — pulling in transport internals (JWKS, bot-token cache) defeats the boundary (setup.md §11 "may depend on `modules/channels/*` only to implement that channel's handler interface").
- **Direct `openai` or `@anthropic-ai/sdk` imports** — go through `@seta/agent-core`'s `ModelAdapter` (spike `02-agent-core.md`; setup.md §5).
- **`runTools()` / `beta.messages.toolRunner()`** — the kernel owns the tool-call loop (K4) to enforce per-tool budgets, RLS-aware tool exec, cost accounting, deterministic replay (setup.md §5; CLAUDE.md footguns).
- **Re-supplying the write payload at `.commit`** — commit takes `{ continuation_id }` only; payload comes from the signed envelope (spike `04-tools-mcp.md`).
- **In-process HITL `approveToolCall(runId)`** — Mastra-style, conflicts with stateless multi-instance request path; preview/commit + HMAC continuations cover the same need statelessly (spike `04-tools-mcp.md` "P2-defer"; CLAUDE.md "Stateless request path").
- **Workflow DSL** (`.then`/`.branch`/`.parallel`/`.dowhile`/`.foreach`) or a DAG executor — P2-deferred; multi-step plans are LLM-planned tool calls inside the kernel loop (spike `05-workflows.md`).
- **Auto-converting agents/workflows to MCP tools** — explicit registration in `apps/api/src/main.ts` only (CLAUDE.md "one registry"; spike `04-tools-mcp.md`).
- **Tenant id as a function parameter** — read from `tenantContext.getTenantId()` (CLAUDE.md).
- **`vi.mock` of internal `@seta/*` modules or live model APIs in tests** — testkit recordings only (CLAUDE.md footguns; spike `06-llm-recording-replay.md`).
- **Hand-writing migrations or running `drizzle-kit push` against shared DBs** — `drizzle-kit generate` from `schema.ts`; push is local-dev only (CLAUDE.md).
- **Cross-schema foreign keys** to `connector_ms365_planner.*` or `connector_ms365_directory.*` — reference by id-as-text (CLAUDE.md).
- **`console.log`** — use `@seta/observability`/`@seta/middleware` logger (CLAUDE.md).

## Test strategy

- **TDD per CLAUDE.md** — required for `modules/products/agent/tools/*`. Each tool gets unit tests for `inputSchema` validation, `outputSchema` validation, happy + error paths.
- **Unit (`src/**/*.test.ts`):**
  - Tool input/output schema contracts; validation-error-as-return-value behaviour (spike `04-tools-mcp.md`).
  - `.preview` returns `{ continuation_id, summary, etag_snapshot }`; HMAC verifies; `consumed_at` blocks replay; expired continuations rejected.
  - Card builders against canonical Planner shapes.
  - `teamsHandler` against synthetic `TeamsHandler` invocations.
- **Integration (`tests/integration/**`, requires `DATABASE_URL`):**
  - `agent.write_continuations` round-trip under RLS.
  - End-to-end preview→commit against msw-recorded Graph fixtures from `@seta/connector-ms365-planner`.
- **E2E (`tests/e2e/**`)** — full Teams activity → `@seta/teams` → `teamsHandler` → kernel → tool → Graph (msw) → card reply.
- **LLM via testkit recordings only** — `setupLLMRecording({ name })` from `@seta/agent-core/testkit`; msw over `api.anthropic.com` / `api.openai.com`; recordings checked in under `__recordings__/`; `RECORD=1 pnpm vitest run -t <name>` to re-record (CLAUDE.md commands table; spike `06-llm-recording-replay.md` punch list; setup.md §5 `:2185-:2198`).
- **No live model APIs, no live Graph, no `vi.mock` of internal `@seta/*` modules** (CLAUDE.md footguns).

## Open questions

- `package.json` is missing `@seta/connector-ms365-directory`, `@seta/connector-registry`, `@seta/oauth`, `@seta/audit`, `@seta/db`, `drizzle-orm`, `p-queue`, `uuid` versus setup.md §13. Confirm intent and add via `pnpm --filter @seta/agent add ...` before implementing tools.
- HMAC key rotation: does `@seta/auth` KMS provider expose a versioned key id that goes into `write_continuations.hmac` so older continuations remain verifiable post-rotation? Suggest `hmac_kid` column on the table.
- `Tool` type ownership — does `@seta/agent-core` export a `Tool` type (spike open question `04-tools-mcp.md`) or do tools live as opaque callables typed inside `@seta/agent`? Default assumption: `@seta/agent-core` exports the type.
- `toModelOutput` transform seam — adaptive-card payloads need a plain-text shape for the model without duplicating tools (spike `04-tools-mcp.md` punch list). Confirm `@seta/agent-core` exposes this hook.
- Conversation persistence — `write_continuations` is the only `agent` schema row in P1; `conversations`, `runs`, `working_memory` are future (setup.md §3 line 117). When conversation persistence lands, does it live under the `agent` schema or a separate `agent_runs` schema?
- Streaming reply to Teams — Bot Framework does not stream; the agent runs to completion then posts a single reply. Confirm `streamKernelSSE` is used only for direct REST callers in P1, not Teams.
- `workload_analysis` tool: read-only across Planner + Directory, but it cross-joins by `entra_object_id` — no FK, the join is at query time in the product. Confirm the join key matches `connector_ms365_directory.directory_users.entra_object_id`.
