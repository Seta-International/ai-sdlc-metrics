# 09 — Memory hooks (P1 implementation)

## P1 override

**Date:** 2026-05-12. **Scope change:** the original spike recommendation in this report was to keep memory implementation P2-deferred and fold it into `@seta/agent` (the product) when it eventually lands. **User-directed override:** memory persistence is required in P1, and the implementation home is a new platform package **`@seta/agent-memory`** under `platform/agent/memory/`, owning the `agent_memory` Postgres schema (`conversations`, `turns`, `working_memory`). The kernel-side `MemoryProvider` interface + `NullMemoryProvider` still ship in `@seta/agent-core` as the seam; `apps/api/src/main.ts` binds the **real** `@seta/agent-memory` provider in P1, not the null one. Rationale: setup.md §11 enumerates multiple products (PMO, Timesheet, Finance) behind `@seta/agent`, and memory is platform-runtime state — not a product concern. See `platform/agent/memory/SCOPE.md` for the full P1 contract. The "Avoid" notes about composite multi-backend storage, observational memory, and the embeddings/vector RAG path still stand as P2-deferred.

## What Mastra does

Mastra splits memory cleanly into **kernel-facing interface** (abstract `MastraMemory`) and **storage adapter** (`MemoryStorage` domain), so the agent loop is unaware of the backing store.

- **Kernel interface** — `MastraMemory` abstract class at `/Users/canh/Projects/Seta/mastra/packages/core/src/memory/memory.ts:114` declares exactly four hooks the agent loop calls:
  - `recall(...)` — read history (with optional `vectorSearchString` for semantic) — `memory.ts:472`.
  - `saveMessages({ messages, memoryConfig })` — write turn — `memory.ts:458`.
  - `getWorkingMemory({ threadId, resourceId })` / `updateWorkingMemory(...)` — persist working memory — `memory.ts:614`, `memory.ts:636`.
  - Plus thread CRUD: `getThreadById`, `saveThread`, `listThreads`, `deleteThread`, `createThread` — `memory.ts:404`, `:438`, `:445`, `:494`, `:531`.
- **Agent call sites** are narrow. The agent only touches memory at three points:
  - `Agent.getMemoryMessages()` → `memory.recall(...)` — `/Users/canh/Projects/Seta/mastra/packages/core/src/agent/agent.ts:3206-3239`.
  - Post-step persistence → `memory.saveMessages(...)` — `agent.ts:3766`, `:3949`.
  - Signal persistence in thread runtime → `agent.ts` signal flow into `thread-stream-runtime.ts:144`.
- **Storage adapter shape.** `MemoryStorage` abstract domain at `/Users/canh/Projects/Seta/mastra/packages/core/src/storage/domains/memory/base.ts:38` defines `getThreadById`, `saveThread`, `updateThread`, `deleteThread`, `listMessages`, `listMessagesById`, `saveMessages`, `updateMessages`, `listThreads`, `getResourceById`/`saveResource`/`updateResource` (resource = working-memory owner: `base.ts:134-160`). Resource-level working memory lives on its own table (`StorageResourceType`, `storage/types.ts:243`). Each adapter (`stores/pg`, `stores/libsql`, `stores/mongodb`, etc.) implements this one domain — `MastraCompositeStore.getStore('memory')` is the lookup (`storage/base.ts:225`, `:316`).
- **Working memory is a string blob**, scoped `'thread' | 'resource'` (default `resource`) — `/Users/canh/Projects/Seta/mastra/packages/core/src/memory/types.ts:175-198`. `getWorkingMemory` reads from resource row if scope=resource, thread metadata otherwise (`memory/index.ts:1258-1298`).
- **Observational memory** (delta summarisation, reflections) is a *separate* per-adapter capability (`supportsObservationalMemory`, `base.ts:44`) with ~12 methods. P1 does not need it; ignore.

## What setup.md plans

§3 (`/Users/canh/Projects/Seta/seta-os/docs/setup.md:117`):

> `agent` | `@seta/agent` (product) | `write_continuations` — HMAC-signed preview→commit tokens; **future: conversations, runs, working memory**

§6 (`/Users/canh/Projects/Seta/seta-os/docs/setup.md:428-438`): RAG primitives split into `agent-chunking`, `agent-embeddings`, `agent-vector`, `agent-rag`; pgvector HNSW + cosine; no live vector store in P1. Memory recall is not mentioned — semantic recall belongs to P2 once `@seta/agent-vector` exists.

## Delta

**Fold in**

- One abstract class with **four hook methods** (`recall`, `saveMessages`, `getWorkingMemory`, `updateWorkingMemory`) — `memory.ts:404-660` is the right shape. Resist absorbing thread CRUD into the kernel; thread is a domain concern.
- Working-memory **scope flag** (`'thread' | 'resource'`) — keeps the same kernel API working when P2 wants per-user persistent state vs per-conversation.
- **Resource-as-row** for working memory (`StorageResourceType`, `base.ts:134-160`) — slots cleanly into the future `agent.resources` table without schema rewrite.
- **`recall()` returns paginated structured result** (`{ messages, total, page, perPage, hasMore }`, `memory.ts:479-486`) — pagination contract must be in the seam from day one.

**Avoid**

- Mastra's `MastraCompositeStore` plugin/domain registry (`storage/base.ts:225`) — violates seta-os "no DI containers / no runtime discovery" (CLAUDE.md). Bind storage statically.
- Observational memory machinery (`base.ts:175-340`) — P3 at earliest.
- Putting `resourceId` in handler args. seta-os uses `tenantContext.getTenantId()`; resource id is a P2 concept; do **not** add a `resourceId` parameter to the kernel seam yet. Pass an opaque `MemoryContext` object instead.

**Open**

- Should `recall()` accept a `vectorSearchString` already in P1 (no-op until `@seta/agent-vector` lands), or P2-add it? Recommend: yes — adding it later is a breaking signature change.

## Punch list

- `@seta/agent-core`: export `interface MemoryProvider { recall(ctx): Promise<RecallResult>; saveTurn(ctx, msgs): Promise<void>; getWorkingMemory(ctx): Promise<string|null>; updateWorkingMemory(ctx, text): Promise<void> }` — modeled on `memory.ts:404-660`, **minus thread CRUD**.
- `@seta/agent-core`: ship a `NullMemoryProvider` (all methods return empty/no-op) as a test-only fallback; kernel never branches on `if (memory)`. **P1 override: the composition root binds `@seta/agent-memory`'s real provider, not the null one.**
- `@seta/agent-core`: agent loop calls `provider.recall()` before model call and `provider.saveTurn()` after, mirroring `agent.ts:3229` and `agent.ts:3766` — wire the two call sites in P1 even with the null provider so P2 is a one-line swap.
- `@seta/agent-core`: `RecallResult` shape = `{ messages, total, page, perPage, hasMore }` (`memory.ts:479-486`); `MemoryContext` = `{ threadId, conversationId?, scope: 'thread'|'resource' }` — **no `resourceId`**, **no `tenantId`** (read from AsyncLocalStorage per CLAUDE.md).
- `@seta/agent-core`: include `vectorSearchString?: string` on `recall()` args from day one (P2 wiring); kernel passes `undefined` in P1.
- setup.md §3: clarify line 117 — name the P1 tables `agent_memory.conversations`, `agent_memory.turns`, `agent_memory.working_memory` (resource-scoped row keyed by `tenant_id` + future `principal_id`) in the new **`agent_memory` schema owned by `@seta/agent-memory`** (P1 override; previously planned under the `agent` namespace). `@seta/agent-core` exposes the seam and ships `NullMemoryProvider` for tests; the composition root binds the real `@seta/agent-memory` provider in P1.
- setup.md §5: add a sub-bullet "Memory seam: kernel calls `MemoryProvider.recall()` / `.saveTurn()` around the model call; P1 binds `@seta/agent-memory`'s real provider."
- setup.md §6: cross-link — semantic-recall path in P2 calls `@seta/agent-vector.searchChunks()` from inside `@seta/agent-memory`, not from the kernel.
- P1 (override): `@seta/agent-memory` package — implements `MemoryProvider`; owns `agent_memory` schema; thread CRUD HTTP routes still live in `@seta/agent` (the product) but call into this provider.
- P1 (override): working memory persistence (resource-scoped row in `agent_memory.working_memory`).
- P1 (override): non-semantic recall (history pagination, token-budget trimming) — lives in `@seta/agent-memory`.
- P2-defer: thread CRUD **HTTP routes** still live in `@seta/agent` (product), not the platform package — the product owns the route layer; this is unchanged.
- P2-defer: semantic-recall implementation (`vectorSearchString` wiring) — the field stays on `MemoryContext` in P1 but `@seta/agent-memory` ignores it until `@seta/agent-vector` lands.
- P2-defer: observational memory (`storage/domains/memory/base.ts:175-340`) — re-evaluate post-P3, only if a concrete summarisation use-case appears.
- P2-defer: composite/multi-backend storage (`storage/base.ts:225`) — single Postgres adapter is enough; revisit when a non-Postgres store is actually needed.
- P2-defer: embeddings / chunking / vector indexes (`@seta/agent-embeddings`, `@seta/agent-chunking`, `@seta/agent-vector`) — RAG track per setup.md §6 §11.
