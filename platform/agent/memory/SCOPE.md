# SCOPE — platform/agent/memory  (P2 — no package yet)

> **Status:** **P2-deferred. No `package.json` here yet.** This SCOPE.md exists as a discoverability stub so a future agent searching for "memory" finds the contract at a predictable path. The actual implementation home is **not** automatically `@seta/agent-memory` — see "Implementation home decision" below.

## Purpose

Persist and retrieve agent state across turns: conversation history (the messages exchanged in a thread), working memory (a small free-form scratchpad the agent maintains), and (P2 RAG-backed) semantic recall (vector search over past content). Memory is what makes a multi-turn agent feel coherent instead of amnesic.

## Responsibilities

- **Owns:**
  - **Implementation** of the `MemoryProvider` interface declared in `@seta/agent-core` — the four hooks `recall` / `saveTurn` / `getWorkingMemory` / `updateWorkingMemory`.
  - The **schema** for `agent.conversations`, `agent.turns`, and `agent.working_memory` (or whichever tables the implementation chooses) — see setup.md §3 line 117 note: *"future: conversations, runs, working memory"*.
  - Token-budget enforcement on `recall()` results (trim oldest messages before they overflow the model context window).
  - Resource-scoped memory (memory keyed by `tenant_id` + a future `principal_id` like a user or team), per spike `09-memory.md:43`.
- **Does NOT own:**
  - The `MemoryProvider` **interface** itself — that lives in `@seta/agent-core` (`platform/agent/core/SCOPE.md` § Memory seam). The kernel never branches on `if (memory)`; it always calls the seam.
  - The `NullMemoryProvider` no-op default — also in `@seta/agent-core`, shipped as P1 default.
  - Embeddings, chunking, vector indexes — those are `@seta/agent-embeddings`, `@seta/agent-chunking`, `@seta/agent-vector` (P2 RAG packages per setup.md §11).
  - Thread CRUD HTTP routes — those live in `modules/products/agent` (per `modules/products/agent/SCOPE.md` Owns list).

## Current state (P1)

- **Nothing implemented.** Only the kernel-side seam is in place:
  - `@seta/agent-core` exposes `interface MemoryProvider` + `NullMemoryProvider` (per `platform/agent/core/SCOPE.md` § Memory seam, lines ~182–187).
  - The kernel loop calls `provider.recall()` before each model call and `provider.saveTurn()` after, with `NullMemoryProvider` bound in P1 (zero rows / no-op writes).
- This directory contains only this SCOPE.md — no `package.json`, no `src/`, no migrations.

## Implementation home decision

**The spike's recommendation (`09-memory.md:54, 57`):** the actual `MemoryProvider` implementation lives **inside `@seta/agent` (the product), NOT a separate platform package**. Reasoning:

1. Memory tables join with `write_continuations` and other product-owned `agent` schema tables — co-locating reduces cross-package coupling.
2. The product already owns the `agent` Drizzle schema; adding more tables there is the lowest-friction path.
3. A dedicated `@seta/agent-memory` package would force a circular question — does the product import the memory package or vice versa?

**Override condition:** If a *second* product (beyond `@seta/agent`) needs to share the same `MemoryProvider` implementation, extract it to `@seta/agent-memory` at that point. Until then, it's product-owned.

The directory `platform/agent/memory/` exists as a placeholder for the override-condition future. Do not create `package.json` here speculatively.

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
  threadId: string                          // ULID; the conversation primary key
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

## Imports (when implementation lands)

- **Allowed internal:** `@seta/agent-core` (the interface + types), `@seta/db` (pool + `withTenant`), `@seta/tenant` (context reads), `@seta/audit` (record recall/save events), `@seta/observability` (logger).
- **Allowed P2-only:** `@seta/agent-vector`, `@seta/agent-embeddings`, `@seta/agent-chunking` for semantic recall.
- **Forbidden:** `@seta/middleware` (this is a library, not a route module), any `modules/channels/*`, any other `modules/products/*`, `apps/*`.
- **External (pinned per setup.md §13):** `zod@4.4.3`, `drizzle-orm@0.45.2`. No `openai`/`@anthropic-ai/sdk` (embeddings/router live in their own packages).

## Patterns to follow

- **`NullMemoryProvider` is the P1 contract** — the loop always calls the seam. When real memory lands, it's a one-line wiring change in `apps/api/src/main.ts` to swap providers. (Spike `09-memory.md:42`, `platform/agent/core/SCOPE.md` § Memory seam.)
- **Resource-scoped working memory** — keyed by `tenant_id` + `principal_id` so memory survives across threads but stays per-user. (Spike `09-memory.md:43`.)
- **Token-budget the recall result** — trim oldest messages until the result fits within the agent config's `recallTokenBudget` (default suggested: 4k tokens). Use `js-tiktoken` already pinned in `@seta/agent-core` per spike `10-llm-model-router.md`.
- **All persistence through `withTenant`** — RLS is the backstop; never query the raw `sql` client. (Setup.md §3 footgun discussion.)
- **Idempotent `saveTurn`** — keyed by `(thread_id, turn_index)`; replays are safe. (CLAUDE.md "idempotent external boundaries" extended to internal writes.)

## Patterns to avoid

- **Do NOT add thread CRUD HTTP routes here** — those live in `modules/products/agent`. This package is a library, not a route module.
- **Do NOT spawn a separate `@seta/agent-memory` package speculatively** — defer until a second product needs the same implementation. (Spike `09-memory.md:54`.)
- **Do NOT cache memory across requests in-process** — every recall is fresh; in-process caching leaks tenant data on pool reuse. (Setup.md §3 footgun discussion.)
- **Do NOT couple memory to the model adapter** — memory is provider-agnostic; the `KernelMessage` canonical form is the contract. (Spike `02-agent-core.md` Message normalization.)
- **Do NOT introduce a composite multi-backend store** in P2 — single Postgres adapter is enough. Revisit only when a non-Postgres store is actually needed. (Spike `09-memory.md` P2-defer.)

## Test strategy (when implementation lands)

- **Integration tests required** — memory persistence cannot be meaningfully tested with mocks. Use the dockerized pg in `/tests/integration/` per setup.md §17 / §18.
- **Per-tenant fixture data** — each test sets up a tenant via `tenantContext.run({tenantId, ...}, async () => { ... })` and asserts RLS isolation by attempting cross-tenant reads.
- **Token-budget trimming** — unit-testable with hand-rolled `KernelMessage` arrays and a stub `js-tiktoken` counter.
- **No LLM fixtures needed** — memory is below the model layer. The `@seta/agent-core/testkit` recordings (per `06-llm-recording-replay.md`) are not used here.

## Open questions

1. **Implementation home — `@seta/agent` product vs `@seta/agent-memory`.** The spike recommends product-owned. Revisit at the second-product threshold. (Spike `09-memory.md:54`.)
2. **Schema namespace — `agent` or `agent_memory`?** Setup.md §3 line 117 says `agent`; SA-9 doesn't override. Recommend `agent.conversations`, `agent.turns`, `agent.working_memory` under the existing `agent` schema.
3. **Working memory format — plain text vs structured JSON?** Mastra uses plain text + LLM-driven updates. Recommend the same for P2 v1; revisit if a structured shape proves needed.
4. **Recall pagination — page size default?** Mastra defaults to 40. We don't have a strong opinion yet.
5. **Working memory size cap?** Suggest 8KB per `(tenant_id, principal_id)` row, enforced at write time via Zod refinement.

## Cross-references

- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/09-memory.md`](../../../docs/explorations/2026-05-12-mastra-spike/09-memory.md) — full design rationale.
- **Kernel seam:** [`platform/agent/core/SCOPE.md`](../core/SCOPE.md) § Memory seam.
- **Real implementation home (proposed):** [`modules/products/agent/SCOPE.md`](../../../modules/products/agent/SCOPE.md) — where the tables and provider will live.
- **Setup spec:** [`docs/setup.md`](../../../docs/setup.md) §3 (agent schema), §6 (P2 RAG primitives — semantic recall path).
