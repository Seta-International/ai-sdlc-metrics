# 09 — Memory hooks (P1 seam for P2 implementation)

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
- `@seta/agent-core`: ship a `NullMemoryProvider` (all methods return empty/no-op) as the P1 default; kernel never branches on `if (memory)`.
- `@seta/agent-core`: agent loop calls `provider.recall()` before model call and `provider.saveTurn()` after, mirroring `agent.ts:3229` and `agent.ts:3766` — wire the two call sites in P1 even with the null provider so P2 is a one-line swap.
- `@seta/agent-core`: `RecallResult` shape = `{ messages, total, page, perPage, hasMore }` (`memory.ts:479-486`); `MemoryContext` = `{ threadId, conversationId?, scope: 'thread'|'resource' }` — **no `resourceId`**, **no `tenantId`** (read from AsyncLocalStorage per CLAUDE.md).
- `@seta/agent-core`: include `vectorSearchString?: string` on `recall()` args from day one (P2 wiring); kernel passes `undefined` in P1.
- setup.md §3: clarify line 117 — name the future tables `agent.conversations`, `agent.turns`, `agent.working_memory` (resource-scoped row keyed by `tenant_id` + future `principal_id`); note that `@seta/agent-core` exposes the seam but ships only `NullMemoryProvider` in P1.
- setup.md §5: add a sub-bullet "Memory seam: kernel calls `MemoryProvider.recall()` / `.saveTurn()` around the model call; P1 binds `NullMemoryProvider`."
- setup.md §6: cross-link — semantic-recall path in P2 calls `@seta/agent-vector.searchChunks()` from inside the `@seta/agent` memory implementation, not from the kernel.
- P2-defer: thread CRUD, working memory persistence, semantic recall implementation — all live in `@seta/agent` (product), not `@seta/agent-core` (kernel).
- P2-defer: observational memory (`storage/domains/memory/base.ts:175-340`) — re-evaluate post-P3, only if a concrete summarisation use-case appears.
- P2-defer: composite/multi-backend storage (`storage/base.ts:225`) — single Postgres adapter is enough; revisit when a non-Postgres store is actually needed.
