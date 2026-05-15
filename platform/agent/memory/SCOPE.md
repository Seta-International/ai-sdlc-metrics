# SCOPE — platform/agent/memory  (@seta/agent-memory — P1)

> **Status:** **P1 — own package `@seta/agent-memory` lands under `platform/agent/memory/`.** The package.json + `src/` + `migrations/` are NOT created in this PR; this SCOPE.md is the P1 contract and the directory placeholder. The package is created in a follow-up PR when real code lands — see CLAUDE.md "CLI-only — packages and dependencies" (no speculative `package.json` hand-edit).
>
> **P1 scope override (2026-05-12):** the spike report `09-memory.md` originally recommended P2-deferring memory implementation and keeping the home inside `@seta/agent` (the product). User-directed scope change: memory persistence is required in P1, and it lives in its own platform package `@seta/agent-memory` so it can be shared across products (planner today, PMO/Timesheet/Finance tomorrow per setup.md §11) without going through a product boundary.

## Purpose

Persist and retrieve agent state across turns: conversation history (the messages exchanged in a thread), working memory (a small free-form scratchpad the agent maintains), and (P2 RAG-backed) semantic recall (vector search over past content). Memory is what makes a multi-turn agent feel coherent instead of amnesic.

## Responsibilities

- **Owns:**
  - **Implementation** of the `MemoryProvider` interface declared in `@seta/agent-core` — the four hooks `recall` / `saveTurn` / `getWorkingMemory` / `updateWorkingMemory`.
  - The **`agent_memory` Postgres schema** — `agent_memory.conversations`, `agent_memory.turns`, `agent_memory.working_memory`. Owns its own Drizzle schema file, `drizzle.config.ts` (with `schemaFilter: ['agent_memory']`), and `migrations/` directory per CLAUDE.md "Schema-per-module (DDD)".
  - Token-budget enforcement on `recall()` results (trim oldest messages before they overflow the model context window).
  - Resource-scoped memory (memory keyed by `tenant_id` + a future `principal_id` like a user or team), per spike `09-memory.md:43`.
- **Does NOT own:**
  - The `MemoryProvider` **interface** itself — that lives in `@seta/agent-core` (`platform/agent/core/SCOPE.md` § Memory seam). The kernel never branches on `if (memory)`; it always calls the seam.
  - The `NullMemoryProvider` no-op default — also in `@seta/agent-core`, kept as a testing fallback. In P1 the composition root binds the real `@seta/agent-memory` provider, not the null one.
  - Embeddings, chunking, vector indexes — those are `@seta/agent-embeddings`, `@seta/agent-chunking`, `@seta/agent-vector` (P2 RAG packages per setup.md §6, §11).
  - Thread CRUD HTTP routes — those live in `modules/products/agent` (per `modules/products/agent/SCOPE.md` Owns list). This package is a library; thread CRUD is a product concern.
  - Observational memory (delta summarisation, reflections) — P2 (spike `09-memory.md:40`).
  - Composite / multi-backend storage — P2; single Postgres adapter is enough until a second store actually appears.

## Current state (P1)

- **Directory placeholder only.** This SCOPE.md exists; no `package.json`, no `src/`, no migrations land in this PR. The package is created in the next PR via `pnpm new:package` (CLAUDE.md CLI-only).
- The kernel-side seam is already specified:
  - `@seta/agent-core` exposes `interface MemoryProvider` + `NullMemoryProvider` (per `platform/agent/core/SCOPE.md` § Memory seam).
  - The kernel loop calls `provider.recall()` before each model call and `provider.saveTurn()` after.
- **P1 composition (apps/api/src/main.ts):** binds the real `@seta/agent-memory` provider into the kernel; `NullMemoryProvider` is kept only for unit tests and the testkit.

## Implementation home decision

**Decision: own package `@seta/agent-memory` under `platform/agent/memory/` — P1.**

The spike's original recommendation (`09-memory.md:54, 57`) was to fold the implementation into `@seta/agent` (the product) and defer extraction until a second product needed shared memory. The user-directed P1 override rejects that staged approach for two reasons:

1. **Multiple products are imminent.** Setup.md §11 enumerates PMO, Timesheet, Finance behind `@seta/agent`. Building the memory provider inside the product would force an immediate cross-product extraction the moment the second product lands.
2. **`agent_memory` is platform-level state.** Conversation history and working memory are not product-specific — they are agent-runtime state. Mirroring the `platform/agent/core` boundary, the persistence implementation belongs in `platform/agent/memory`.

Cross-schema referencing rule still applies (CLAUDE.md "Schema-per-module"): `agent_memory` tables carry `tenant_id` and (future) `principal_id` but no FK into `@seta/agent`'s `agent.write_continuations` or any product schema.

## Public interface (when implementation lands)

The implementation supplies a class (or factory) matching the `@seta/agent-core` interface:

```ts
// Declared in @seta/agent-core/src/memory.ts — do NOT re-declare here.
interface MemoryProvider {
  recall(ctx: MemoryContext): Promise<RecallResult>
  saveTurn(ctx: MemoryContext, messages: KernelMessage[]): Promise<void>
  getWorkingMemory(ctx: MemoryContext): Promise<string | null>
  updateWorkingMemory(ctx: MemoryContext, text: string): Promise<void>
}

interface MemoryContext {
  threadId: string                          // UUID; the conversation primary key
  conversationId?: string                   // optional grouping above thread (rarely used)
  scope: 'thread' | 'resource'              // resource = principal-wide memory
  vectorSearchString?: string               // for P2 semantic recall (kernel passes undefined in P1)
}

interface RecallResult {
  messages: KernelMessage[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
}
```

`tenantId` is NOT a field on `MemoryContext` — read from `tenantContext.getTenantId()` per CLAUDE.md / `07-request-context.md`.

The package also exports its Drizzle schema (`agentMemorySchema`, `conversations`, `turns`, `workingMemory`) and inferred row types so adjacent integration tests can build fixtures.

## Imports (when implementation lands — P1)

- **Allowed internal:** `@seta/agent-core` (the `MemoryProvider` interface + `KernelMessage` types), `@seta/db` (pool + `withTenant` + role exports + migration runner integration), `@seta/tenant` (context reads), `@seta/audit` (record recall/save events), `@seta/observability` (logger).
- **Allowed P2-only:** `@seta/agent-vector`, `@seta/agent-embeddings`, `@seta/agent-chunking` for semantic recall.
- **Forbidden:** any `modules/channels/*`, any `modules/products/*`, `apps/*`. `@seta/middleware` route helpers (Hono / OpenAPI) are forbidden — this is a library, not a route module. The `@seta/middleware/errors` subpath (`DomainError` base) is allowed and is the canonical project contract per CLAUDE.md. No model SDKs (`openai`, `@anthropic-ai/sdk`) — memory is provider-agnostic.
- **External (pinned per setup.md §13):** `zod@4.4.3`, `drizzle-orm@0.45.2`, `postgres@3.4.9` (transitively via `@seta/db`).

## Patterns to follow

- **Memory seam is wired in P1** — the kernel always calls `provider.recall()` and `provider.saveTurn()`. The composition root binds the real `@seta/agent-memory` provider; `NullMemoryProvider` is only used by `@seta/agent-core` unit tests and the testkit. (Spike `09-memory.md:42, 51`.)
- **Resource-scoped working memory** — keyed by `tenant_id` + `principal_id` so memory survives across threads but stays per-user. (Spike `09-memory.md:43`.)
- **Token-budget the recall result** — trim oldest messages until the result fits within the agent config's `recallTokenBudget` (default suggested: 4k tokens). Use `js-tiktoken` already pinned in `@seta/agent-core` per spike `10-llm-model-router.md`.
- **All persistence through `withTenant`** — RLS is the backstop; never query the raw `sql` client. (Setup.md §3 footgun discussion.)
- **Idempotent `saveTurn`** — keyed by `(thread_id, turn_index)`; replays are safe. (CLAUDE.md "idempotent external boundaries" extended to internal writes.)
- **Schema-per-module migrations** — `drizzle-kit generate` produces `migrations/*.sql` in this package; the top-level runner in `@seta/db` applies them in `OWNER_ORDER`. Never hand-edit migration SQL.

## Patterns to avoid

- **Do NOT add thread CRUD HTTP routes here** — those live in `modules/products/agent`. This package is a library, not a route module.
- **Do NOT cross-schema FK** into `@seta/agent`'s `agent.write_continuations` or any other module schema — reference by id (CLAUDE.md "Schema-per-module"; setup.md §3:123).
- **Do NOT cache memory across requests in-process** — every recall is fresh; in-process caching leaks tenant data on pool reuse. (Setup.md §3 footgun discussion.)
- **Do NOT couple memory to the model adapter** — memory is provider-agnostic; the `KernelMessage` canonical form is the contract. (Spike `02-agent-core.md` Message normalization.)
- **Do NOT introduce a composite multi-backend store in P1** — single Postgres adapter is enough. Revisit only when a non-Postgres store is actually needed. (Spike `09-memory.md` P2-defer for composite storage.)
- **Do NOT implement observational memory in P1** — delta summarisation and reflections (`storage/domains/memory/base.ts:175-340` in Mastra) are P2.

## Test strategy (when implementation lands)

- **Integration tests required** — memory persistence cannot be meaningfully tested with mocks. Use the dockerized pg in `/tests/integration/` per setup.md §17 / §18.
- **Per-tenant fixture data** — each test sets up a tenant via `tenantContext.run({tenantId, ...}, async () => { ... })` and asserts RLS isolation by attempting cross-tenant reads.
- **Token-budget trimming** — unit-testable with hand-rolled `KernelMessage` arrays and a stub `js-tiktoken` counter.
- **No LLM fixtures needed** — memory is below the model layer. The `@seta/agent-core/testkit` recordings (per `06-llm-recording-replay.md`) are not used here.

## Open questions

1. **Schema namespace — confirmed `agent_memory`.** This P1 override moves the future memory tables out of the `agent` namespace (which stays product-owned for `write_continuations`) into a dedicated `agent_memory` schema owned by this package. Setup.md §3 line 117's "future: conversations, runs, working memory" reference should be amended in a follow-up setup.md PR to point at `agent_memory` instead of `agent`.
2. **Working memory format — plain text vs structured JSON?** Mastra uses plain text + LLM-driven updates. Recommend the same for P1 v1; revisit if a structured shape proves needed.
3. **Recall pagination — page size default?** Mastra defaults to 40. We don't have a strong opinion yet.
4. **Working memory size cap?** Suggest 8KB per `(tenant_id, principal_id)` row, enforced at write time via Zod refinement.
5. **`@seta/db` `OWNER_ORDER` placement.** The runner list in `platform/db/SCOPE.md` must include `agent_memory` (added after `agent`, before `connector_*` if no cross-schema dependency, else after the connectors per dependency direction). See `platform/db/SCOPE.md` for the canonical order.

## Cross-references

- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/09-memory.md`](../../../docs/explorations/2026-05-12-mastra-spike/09-memory.md) — full design rationale + P1 override note.
- **Kernel seam:** [`platform/agent/core/SCOPE.md`](../core/SCOPE.md) § Memory seam.
- **Product consumer:** [`modules/products/agent/SCOPE.md`](../../../modules/products/agent/SCOPE.md) — thread CRUD HTTP routes consume this provider.
- **Migration runner:** [`platform/db/SCOPE.md`](../../db/SCOPE.md) — `OWNER_ORDER` must include `agent_memory`.
- **Setup spec:** [`docs/setup.md`](../../../docs/setup.md) §3 (schema list — to be amended), §6 (P2 RAG primitives — semantic recall path).
