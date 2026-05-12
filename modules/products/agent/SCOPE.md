# SCOPE — modules/products/agent  (@seta/agent)

> **P1 scope override (2026-05-12 — agents expansion):** the product previously scoped a single **Planner Agent** (per setup.md §11 `modules/products/agent` layout — one `agent.ts`, one tool tree under `tools/planner/`). User-directed scope change: **three specialist agents** are required in P1 — **Planner Agent** (project management; Planner tool calls), **Analytics Agent** (workload analysis; chart-card responses), and **Seta FAQ Agent** (RAG-backed company-knowledge Q&A with citations). The FAQ Agent's dependency on the RAG track is what drives the parallel P1 override of `@seta/agent-chunking`, `@seta/agent-embeddings`, `@seta/agent-vector`, `@seta/agent-rag` (see `platform/agent/{chunking,embeddings,vector,rag}/SCOPE.md`). setup.md §11's single-agent layout stays as-written; this SCOPE.md is the override citation point.

## Purpose

The Seta Agent product — the only `modules/products/*` package in P1. Owns **three specialist agent definitions** (Planner / Analytics / Seta FAQ — see override notice above), the tool sets each agent calls, the `agent.write_continuations` schema for HMAC-signed preview→commit tokens, the Adaptive Cards the agents render, the `TeamsHandler` implementation that turns inbound Teams messages into agent runs (with trigger-phrase-based routing across the three agents), and the product-level routes mounted at `/agent` in `apps/api`. (setup.md §11 agent section, §7 last paragraph, §5; spike `04-tools-mcp.md`, `02-agent-core.md`, `06-llm-recording-replay.md`.)

## Responsibilities

- **Owns:**
  - **Three agent definitions** in `src/agents/` (each a `{ name, instructions, model, tools }` record consumed by `@seta/agent-core`) — P1 override 2026-05-12:
    - `src/agents/planner.ts` — **Planner Agent**: project-management specialist. Tool set = Planner read/write pairs from `tools/planner/`. System prompt focuses on task triage, plan navigation, preview→commit confirmations.
    - `src/agents/analytics.ts` — **Analytics Agent**: workload-analysis specialist ("who's overloaded", per-assignee distribution, bucket-level fill). Tool set = `tools/analytics/` (read-only aggregations cross-joining Planner + Directory). Renders chart-card responses via `cards/chart-ybar.ts`.
    - `src/agents/faq.ts` — **Seta FAQ Agent**: RAG-backed company-knowledge specialist. Tool set = `tools/faq/` (`search_knowledge_base`, `cite_sources`). System prompt requires every answer to cite at least one retrieved source.
  - Tool directories under `src/tools/`:
    - `tools/planner/` (existing per setup.md §11):
      - `tools/planner/read/` — `list_my_tasks`, `list_plan_tasks`, `get_task`, `list_plans`, `list_buckets`, `workload_analysis`.
      - `tools/planner/write/` — preview→commit pairs: `create_tasks.preview`/`.commit`, `update_tasks.preview`/`.commit`, etc.
    - `tools/analytics/` (new — P1 override):
      - **Read-only aggregations** over `@seta/connector-ms365-planner` + `@seta/connector-ms365-directory` joined by `entra_object_id`. Examples: `workload_by_assignee`, `bucket_fill_distribution`, `due-date heatmap`, `unassigned_tasks_count`. No write paths.
      - All tools annotate `readOnlyHint: true` per spike `04-tools-mcp.md`.
    - `tools/faq/` (new — P1 override):
      - `search_knowledge_base` — wraps `@seta/agent-rag.retrieve(query, opts)`; returns `RagHit[]` with `citation` payload. `readOnlyHint: true`.
      - `cite_sources` — pure formatter; turns `RagHit[]` into an Adaptive Card section with source links. No side effects.
  - The `agent.write_continuations` Drizzle schema — HMAC-signed preview→commit tokens (`continuation_id ULID, tenant_id, tool_id, input_hash, etag_snapshot jsonb, hmac, expires_at, consumed_at`) per spike `04-tools-mcp.md` punch list; setup.md §11 `schema.ts`. Only the Planner Agent writes; Analytics + FAQ are read-only and produce no continuations.
  - Adaptive Cards specific to this product (setup.md §11 `cards/`):
    - `cards/task-list.ts` (Planner) — existing per setup.md §11.
    - `cards/text.ts` (shared) — existing per setup.md §11.
    - `cards/chart-ybar.ts` (Analytics — P1 override) — Y-axis bar chart using the Adaptive Cards 1.5 `Chart.VerticalBar` element, templated via `adaptivecards-templating@2.3.1`. Used by the Analytics Agent for workload-distribution answers per the Project Plan §3 visualization requirement.
    - `cards/faq-answer.ts` (FAQ — P1 override) — answer body + a citations section rendered from `RagHit[]`.
  - The `TeamsHandler` implementation — parses text, **routes to one of the three agents by trigger phrase** (see "Public interface" for the routing decision), runs the selected agent through `@seta/agent-core`, builds the appropriate card, returns it (setup.md §11 `teams-handler.ts`).
  - The product's `routes(): Hono` factory mounted at `/agent` in `apps/api/src/main.ts` (setup.md §11 composition example).

- **Does NOT own:**
  - Bot Framework wire protocol, JWT verification, JWKS, outbound reply transport — those are `@seta/teams` (CLAUDE.md; setup.md §11 channel boundary).
  - Planner Graph client, ETag store, cache schema — those are `@seta/connector-ms365-planner` (setup.md §7, §11).
  - Directory mirror or JIT mapping — `@seta/connector-ms365-directory` (setup.md §11).
  - The kernel itself — `@seta/agent-core` provides the streaming K-loop, `ModelAdapter`, `Processor` seams, `streamKernelSSE(c, run)` helper, and the testkit (spike `02-agent-core.md`; CLAUDE.md footguns).
  - Other products — products never import other products (CLAUDE.md; setup.md §11 "never on another product").
  - Workflow DSL / DAG / suspend-resume engine — that lives in `@seta/agent-workflows` (P1, override; spike `05-workflows.md` § "P1 override"). This product **composes** workflows (registers named workflows, exposes run/resume HTTP routes) but does not implement the engine.
  - Memory persistence — that lives in `@seta/agent-memory` (P1, override; spike `09-memory.md` § "P1 override"). This product owns thread CRUD **HTTP routes** but delegates persistence to `@seta/agent-memory` via the `MemoryProvider` interface declared in `@seta/agent-core`.
  - MCP server exposure of these tools — P2-deferred (spike `04-tools-mcp.md` punch list).

## Current state (Epic 1)

Epic 1 focused on auth (`@seta/oauth`, `@seta/auth`, `@seta/middleware`, MSAL Node, KMS-envelope token vault, admin-consent flow). The agent product itself is a scaffold.

- `modules/products/agent/src/index.ts` — `export {}`. No `agent`, no `teamsHandler`, no `routes`.
- `modules/products/agent/src/index.test.ts` — placeholder.
- `package.json` declares the right intent: `@seta/agent-core`, `@seta/auth`, `@seta/connector-ms365-planner`, `@seta/teams`, `@seta/tenant`, `adaptivecards-templating@2.3.1`, `zod@4.4.3`.
- **Missing vs setup.md §13 deps for `@seta/agent`:** `@seta/connector-ms365-directory`, `@seta/connector-registry`, `@seta/oauth`, `@seta/audit`, `@seta/db`, `drizzle-orm@0.45.2`, `p-queue@9.2.0`, `uuid@14.0.0`. **Plus (P1 override 2026-05-12):** `@seta/agent-memory`, `@seta/agent-workflows`, `@seta/agent-rag` — all new platform packages.
- **Missing vs setup.md §11 layout + P1 override 2026-05-12 three-agent expansion + conversation-scope policy:** `src/agents/{planner,analytics,faq}.ts` (replacing the single `agent.ts`), `tools/planner/{read,write}/`, `tools/analytics/`, `tools/faq/`, `schema.ts`, `cards/{task-list,text,chart-ybar,faq-answer,scope-decline}.ts`, `teams-handler.ts` (scope-gate → trigger-phrase routing), the `routes` export.

Everything below is the contract that future work must respect; nothing is implemented yet.

## Public interface

All exports from `modules/products/agent/src/index.ts`. Signatures only.

- `routes(registry: ConnectorRegistry): Hono` — **mandatory `routes(handler?: Handler) => Hono` export** per CLAUDE.md. Mounted at `/agent` (setup.md §11 composition example). May expose product-level endpoints (run, history when persisted, admin); does NOT include `/teams` routes (those come from `@seta/teams`).
- `teamsHandler: TeamsHandler` — **single combined `TeamsHandler`** that routes inbound activities to one of the three agents by **trigger phrase** (P1 override decision — see Open questions for the trigger-phrase vs separate-handler trade-off). Phrases (subject to refinement):
  - default / no prefix / "@planner …" → `plannerAgent`
  - "@analytics …" / "workload …" / "who's overloaded …" → `analyticsAgent`
  - "@faq …" / "@seta …" / "how do I …" / "what is our …" → `faqAgent`
  Routing logic lives in `src/teams-handler.ts`; once routed, the selected agent runs through `@seta/agent-core` and renders the agent-appropriate card.
- `plannerAgent`, `analyticsAgent`, `faqAgent` — three agent definition records `{ name, instructions, model, tools }` consumed by `@seta/agent-core` (setup.md §11 `agent.ts`; spike `02-agent-core.md` "K1 should be functions over a config record, not a class hierarchy"). Exported individually so unit tests and (future) direct REST callers can target a specific agent without going through the combined handler.
- `agentRoutes(registry: ConnectorRegistry): Hono` — alias retained for the setup.md §11 composition example wording; canonical is `routes`.
- Tool exports per spike `04-tools-mcp.md`: each tool is `{ id, description, inputSchema, outputSchema, execute, annotations? }`. `outputSchema` is **required for write tools** to keep LLM-hallucination caught at the Zod boundary.
- Drizzle exports: `agentSchema` (pg schema `agent`), `writeContinuations` table, inferred row types. **Only the Planner Agent's write tools touch `write_continuations`**; Analytics and FAQ are read-only.
- `WriteContinuation` — Zod-inferred type for the preview→commit envelope.

No `Handler` interface lives here — `@seta/teams` defines `TeamsHandler`; this product implements it.

## Imports

- **Allowed internal (per setup.md §11 dep direction `modules/products/* → modules/channels/* (handler-impl only), modules/connectors/*, platform/agent/*, platform/{middleware,observability,db,auth,tenant,audit}`):**
  - `@seta/agent-core` — kernel, `streamKernelSSE`, `ModelAdapter`, `Processor` seams, testkit (spike `02-agent-core.md`; setup.md §5).
  - `@seta/agent-memory` — `MemoryProvider` implementation; the product's thread CRUD HTTP routes call into this for conversation history and working memory (P1 override; spike `09-memory.md` § "P1 override").
  - `@seta/agent-workflows` — workflow DSL (`createWorkflow().then(...).parallel(...)`) and `resume(runId, ...)`; the product registers named workflows for multi-step plans that exceed one HTTP turn (P1 override; spike `05-workflows.md` § "P1 override").
  - `@seta/agent-rag` — `retrieve(query, opts)` and `ingest(sourceId, content)` for the FAQ Agent's `search_knowledge_base` tool (P1 override 2026-05-12; see `platform/agent/rag/SCOPE.md`). The product consumes the full RAG stack **indirectly** through `@seta/agent-rag` only — never imports `@seta/agent-chunking`, `@seta/agent-embeddings`, or `@seta/agent-vector` directly (single composition seam per setup.md §6 "Split into single-purpose packages so any one is reusable").
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
  - External workflow engines (`@mastra/workflows`, Temporal SDK, Inngest SDK) — P1 uses the in-house `@seta/agent-workflows` package; external durable-workflow engines stay P2-deferred (spike `05-workflows.md` § "P1 override" punch list).
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
- **Compose workflows via `@seta/agent-workflows`'s `.then()` / `.parallel()` for multi-step plans that exceed one HTTP turn.** The workflow is the *outer* multi-turn shape; the kernel handles each inner LLM turn. Use preview/commit for the *inner* per-step HITL still (write_continuations); use workflow `ctx.suspend({ reason, resumeLabel, payload })` for outer multi-turn approval gates that span hours-to-days. (P1 override; spike `05-workflows.md` § "P1 override".)
- **Tool result envelope's `{ suspend?: { reason, resumeLabel } }` discriminant is wired** by `@seta/agent-workflows` — when a tool returns `suspend` inside a workflow-step body, the engine persists the snapshot. Outside a workflow context the discriminant is ignored (spike `05-workflows.md` punch list).
- **`Run` identifier (ULID) threaded through the kernel** and `RunStatus` type (`'created'|'running'|'completed'|'failed'`) — `workflow_snapshots.run_id` joins to this kernel `Run` so workflow-level and kernel-level audit rows share an id space (spike `05-workflows.md` punch list).
- **Memory persistence goes through `@seta/agent-memory`** — the product's thread CRUD HTTP routes (list / get / delete threads) call into the `MemoryProvider` implementation; the product does NOT own `conversations` / `turns` / `working_memory` tables (P1 override; spike `09-memory.md` § "P1 override").
- **Visualization-first responses for the Analytics Agent** — workload-distribution answers return Adaptive Cards using the **chart-Y-bar template** (`cards/chart-ybar.ts`), not text blobs. The agent's system prompt instructs the LLM to call `cards/chart-ybar.ts` rather than narrate aggregations in prose. (Per setup.md §11 `cards/` directory pattern + Project Plan §3 visualization requirement; P1 override 2026-05-12.)
- **FAQ Agent answers always cite sources** — the FAQ Agent's system prompt requires every response to include `cite_sources` output rendered via `cards/faq-answer.ts`. Answers without retrieved hits return a "no source found" template, never an LLM-only response. The `RagHit.citation` payload from `@seta/agent-rag` is the source of truth for span / sourceId. (P1 override 2026-05-12; setup.md §6 RAG primitives.)
- **Three-agent trigger-phrase routing in the combined `teamsHandler`** — the handler matches the inbound text prefix and dispatches to the appropriate agent record (`plannerAgent` | `analyticsAgent` | `faqAgent`). Routing is in `src/teams-handler.ts` only; the agent records themselves are surface-agnostic and reusable from future direct-REST callers. (P1 override 2026-05-12.)
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
- **In-process HITL `approveToolCall(runId)`** — Mastra-style, conflicts with stateless multi-instance request path; preview/commit + HMAC continuations (per-step) and `@seta/agent-workflows` `ctx.suspend()` (workflow-level) cover the same need statelessly (spike `04-tools-mcp.md` "P2-defer"; CLAUDE.md "Stateless request path").
- **Hand-rolling a workflow DSL inside this product** — multi-step flows compose `@seta/agent-workflows` (P1, override). `.branch()` / `.dowhile()` / `.foreach()` / `.sleep()` operators are P2 in the workflow package; do not work around their absence with ad-hoc product-side state machines — surface the need and expand the workflow surface instead (spike `05-workflows.md` § "P1 override").
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
- **FAQ Agent integration tests require recorded LLM fixtures AND fixture corpora** — the testkit recordings cover the OpenAI embedding calls (via `@seta/agent-embeddings`) and the Anthropic / OpenAI completion calls (via `@seta/agent-core`'s `ModelAdapter`). Fixture corpora — small representative FAQ documents — live under `modules/products/agent/__recordings__/rag/` and are ingested via `@seta/agent-rag.ingest` at test setup against the dockerized pg. (P1 override 2026-05-12; spike `06-llm-recording-replay.md`; `platform/agent/rag/SCOPE.md` test strategy.)
- **Analytics Agent integration tests** — exercise the cross-join between `connector_ms365_planner` and `connector_ms365_directory` against msw-recorded Graph fixtures + dockerized pg; assert the rendered chart-Y-bar card contains the expected category counts.
- **No live model APIs, no live Graph, no `vi.mock` of internal `@seta/*` modules** (CLAUDE.md footguns).

## Open questions

- `package.json` is missing `@seta/connector-ms365-directory`, `@seta/connector-registry`, `@seta/oauth`, `@seta/audit`, `@seta/db`, `drizzle-orm`, `p-queue`, `uuid` versus setup.md §13. Confirm intent and add via `pnpm --filter @seta/agent add ...` before implementing tools.
- HMAC key rotation: does `@seta/auth` KMS provider expose a versioned key id that goes into `write_continuations.hmac` so older continuations remain verifiable post-rotation? Suggest `hmac_kid` column on the table.
- `Tool` type ownership — does `@seta/agent-core` export a `Tool` type (spike open question `04-tools-mcp.md`) or do tools live as opaque callables typed inside `@seta/agent`? Default assumption: `@seta/agent-core` exports the type.
- `toModelOutput` transform seam — adaptive-card payloads need a plain-text shape for the model without duplicating tools (spike `04-tools-mcp.md` punch list). Confirm `@seta/agent-core` exposes this hook.
- Conversation persistence — **resolved (P1 override 2026-05-12):** `write_continuations` remains the only table in the `agent` schema (product-owned). Conversation history, working memory, and recall (`conversations`, `turns`, `working_memory`) move to the **`agent_memory` schema owned by `@seta/agent-memory`** (P1; not this product). Thread CRUD HTTP routes still live in this product but delegate persistence to `@seta/agent-memory` via the `MemoryProvider` interface. Workflow snapshots live in the **`agent_workflows` schema owned by `@seta/agent-workflows`** (P1). See `platform/agent/memory/SCOPE.md` and `platform/agent/workflows/SCOPE.md`. Setup.md §3 line 117 should be amended in a follow-up to reflect this schema split.
- Streaming reply to Teams — Bot Framework does not stream; the agent runs to completion then posts a single reply. Confirm `streamKernelSSE` is used only for direct REST callers in P1, not Teams.
- `workload_analysis` tool: read-only across Planner + Directory, but it cross-joins by `entra_object_id` — no FK, the join is at query time in the product. Confirm the join key matches `connector_ms365_directory.directory_users.entra_object_id`. (Note: with the 2026-05-12 P1 override, `workload_analysis` migrates from `tools/planner/read/` to `tools/analytics/` and becomes one of several Analytics-Agent tools.)
- **Trigger-phrase routing vs separate handlers (P1 override 2026-05-12).** The decision documented above is a **single combined `teamsHandler`** with prefix-based routing. Alternative: register three handlers in `@seta/teams` and route at the channel layer. Combined-handler wins because (a) `@seta/teams.TeamsHandler` is a single-implementation interface per channel surface; (b) per-agent handler registration would require a channel-layer routing primitive that doesn't exist. Re-evaluate if a fourth agent or voice channel arrives. Final trigger-phrase set and fallback behaviour (default → planner? or → ask-to-disambiguate?) is open.
- **Conversation-scope policy edge cases (P1 conversation-scope mandate 2026-05-12).** Three sub-questions are open: (a) what does a `meeting`-scoped Teams chat (channel meeting transcript bot) count as — `channel` or its own scope? Recommend `channel` (shared participants) until a sponsor decision says otherwise. (b) If a user `@mentions` the bot inside a group chat with a Planner-style trigger, do we render `cards/scope-decline.ts` *and then* run FAQ on the same text, or just decline and stop? Recommend "decline-then-FAQ" so users get a useful response; flag if telemetry shows it confuses more than it helps. (c) `personal` scope where the "user" is a service account: same allowlist as a human, or constrained? Recommend "same allowlist" — service accounts that DM the bot are part of the agent's authorized surface; revisit if Audit shows pathological usage.
- **Seta knowledge-base corpus source (P1 override 2026-05-12).** The FAQ Agent depends on a corpus of company-knowledge documents to retrieve from. Source-of-truth is unresolved: SharePoint export? a new `modules/connectors/seta-faq/` connector? a static Markdown bundle checked in under `modules/products/agent/corpus/`? Outputs of the RAG data survey (referenced as a parallel P1 track in `docs/superpowers/specs/2026-05-12-mastra-spike-design.md` and the Project Plan §3) determines the loader shape and the FTS-leg table referenced by `@seta/agent-rag.retrieve`'s `ftsTable` option.
- **Per-agent vs per-thread MemoryProvider namespacing (P1 override 2026-05-12).** Three agents sharing one `@seta/agent-memory` `MemoryProvider`: do they share working-memory state per `(tenantId, principalId)` regardless of agent (one cross-agent scratchpad), or is working memory keyed by `(tenantId, principalId, agentName)` (per-agent scratchpad)? Conversation history (threads) is unambiguously per-thread regardless. Recommend per-agent working memory — the agents have distinct concerns and cross-agent prompt-bleed risks user-confusing answers. Flag for `platform/agent/memory/SCOPE.md` open-question follow-up.
- **Three-agent model selection.** All three default to the same `model` slot (per spike `10-llm-model-router.md` model-router; setup.md §5). Analytics may benefit from a tools-oriented model variant; FAQ may benefit from a citation-tuned variant. Defer to telemetry post-launch.
