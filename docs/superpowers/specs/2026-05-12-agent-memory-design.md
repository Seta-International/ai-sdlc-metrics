# @seta/agent-memory — P1 implementation

**Status:** Draft (pending review)
**Date:** 2026-05-12
**Owner:** Platform team
**Package:** `@seta/agent-memory` (`platform/agent/memory`)
**Predecessors:** Agent-core K1–K4 (kernel surface + `MemoryProvider` seam), SCOPE.md
**Reference:** Mastra `packages/memory` + `stores/pg` (production-proven shape)

## 1. Goal

Light up the real memory provider behind the `MemoryProvider` seam declared in
`@seta/agent-core`. After this work lands, `apps/api/src/main.ts` binds
`AgentMemoryProvider` into every `run()` call so that conversation history
and per-principal working memory persist across turns. The kernel does not
change: it already calls `provider.recall()` before the loop and
`provider.saveTurn()` after.

The package owns the `agent_memory` Postgres schema (three tables —
`threads`, `messages`, `resources`), the recall token-budget trim, the
8KB-capped working-memory upsert, and per-call audit rows. It exposes a
single class `AgentMemoryProvider`, the Drizzle schema, and inferred row
types.

## 2. Non-goals

- Thread CRUD HTTP routes — owned by `modules/products/agent`.
- Observational memory (delta summaries, reflections) — P2.
- Semantic recall over vectors (`@seta/agent-vector`, `@seta/agent-embeddings`,
  `@seta/agent-chunking`) — P2 RAG stream. `MemoryContext.vectorSearchString`
  is accepted but ignored in P1.
- Composite / multi-backend storage — single Postgres adapter is enough until
  a second store appears.
- A "clear working memory" or "delete thread" surface — P2.
- A working-memory tool template — that is `modules/products/agent` if/when it
  wants the agent to self-edit its WM.

## 3. Constraints (CLAUDE.md + SCOPE.md)

- ESM-only; `"type": "module"`. `import type` for type-only imports.
- No CJS shim, no legacy alias, no backwards-compat shim — pre-1.0. The
  `KernelMessage.id` field added in the same PR replaces the implicit
  "messages have no identity" assumption everywhere; no fallback path.
- `platform/*` depends on nothing in `modules/*` or `apps/*`.
- Tenant id is never a function parameter — read via `tenantContext.getTenantId()`.
- All persistence runs through `withTenant`. No raw `sql` queries.
- Schema-per-module: own `drizzle.config.ts` with `schemaFilter: ['agent_memory']`,
  own `migrations/`. No cross-schema FKs.
- No internal `@seta/*` mocking in tests.
- Audit every recall / saveTurn / get_working_memory / update_working_memory
  call inside the same transaction as the data write.

## 4. Mastra alignment (what we keep, what we change)

Production-proven choices kept from Mastra (`packages/core/src/storage/constants.ts:497-537`,
`stores/pg/src/storage/domains/memory/index.ts`):

- Three-table layout: `threads`, `messages`, `resources` (we add `agent_memory`
  schema prefix). Names match Mastra's domain.
- **Ordering by `(thread_id, createdAt DESC)`** with the message id as tiebreaker
  — *not* a monotonic seq. Mastra fixed a documented ROW_NUMBER perf bug here
  (`stores/pg/src/storage/domains/memory/row-number-performance.test.ts`:
  ~30 s on 7.4k messages); we adopt their resolved index shape.
- **Message id is the idempotency key.** `INSERT ... ON CONFLICT (id) DO NOTHING`.
- `resourceId` denormalised onto every message row, so future "all messages
  for this principal" queries don't need a join through `threads`.
- Working memory lives as a `text` column on `resources`, not in its own table.
- `resourceId` set at thread-create time and stored on the thread row; working
  memory follows the *thread's* owning principal across sessions (admin replay
  case).

Seta-OS additions Mastra does not have:

- Multi-tenant: every table has `tenant_id` + RLS policies; we use
  `pgPolicy(... using: tenant_id = current_setting('app.tenant_id')::uuid)`
  per the `platform/oauth` reference.
- `content` stored as `jsonb` (Mastra uses stringified `text`) — avoids
  double-encoding `KernelMessageContent[]`.
- 8KB cap on working memory enforced with a Zod check at the boundary AND a
  Postgres `CHECK (octet_length(working_memory) <= 8192)`.
- Per-call audit rows via `@seta/audit` (Mastra has no compliance audit).

## 5. Package layout

```
platform/agent/memory/
├── SCOPE.md                          # existing — P1 contract
├── package.json                      # via `pnpm new:package`
├── drizzle.config.ts                 # schemaFilter: ['agent_memory']
├── migrations/                       # `drizzle-kit generate` output
├── src/
│   ├── index.ts                      # exports AgentMemoryProvider + schema + row types
│   ├── schema.ts                     # Drizzle tables + RLS policies
│   ├── provider.ts                   # AgentMemoryProvider implements MemoryProvider
│   ├── recall.ts                     # SQL + trimToTokenBudget (pure)
│   ├── save-turn.ts                  # SQL + ensureThread (pure helpers)
│   ├── working-memory.ts             # get/update + 8KB cap
│   ├── token-counter.ts              # js-tiktoken o200k_base wrapper (re-exports from agent-core)
│   ├── audit.ts                      # actorFromContext + recordAudit wrapper
│   └── errors.ts                     # AgentError code constants (no new subclass)
└── tests/
    └── integration/
        ├── recall.integration.test.ts
        ├── save-turn.integration.test.ts
        ├── working-memory.integration.test.ts
        ├── rls.integration.test.ts
        └── round-trip.integration.test.ts
```

Coordinated edits in the same PR (no legacy / no compat shim rule):

1. `@seta/agent-core/src/types/message.ts` — add `id?: string` to
   `KernelMessage`. Existing call sites that build assistant/tool messages in
   `src/run/tool-loop.ts` start stamping `id: randomUUID()`. User messages
   coming from channel adapters do not stamp; the memory provider stamps
   them in `saveTurn` before insert.
2. `@seta/db/src/migrate.ts` — append `'agent_memory'` to `OWNER_ORDER` after
   `'agent'` (no cross-schema FK; ordering is purely "run after agent").
   Add `OWNER_PACKAGE_PATH['agent_memory'] = 'platform/agent/memory/migrations'`.
3. `apps/api/src/main.ts` — instantiate `new AgentMemoryProvider({ sql })`
   and pass it via `RunLoopOptions.memory` to every `run()` call. `NullMemoryProvider`
   is no longer used in apps; it stays only as the agent-core unit-test fallback.

## 6. Schema (`src/schema.ts`)

```ts
import { tenantUser } from '@seta/db'
import { sql } from 'drizzle-orm'
import {
  check, index, integer, jsonb, pgPolicy, pgSchema,
  text, timestamp, uuid,
} from 'drizzle-orm/pg-core'
import type { KernelMessageContent } from '@seta/agent-core'

export const agentMemorySchema = pgSchema('agent_memory')

export const threads = agentMemorySchema.table(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    resourceId: text('resource_id'),                // principal/user id; null = system thread
    title: text('title'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    messageCount: integer('message_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('threads_tenant_resource_updated_idx')
      .on(t.tenantId, t.resourceId, t.updatedAt.desc()),
    pgPolicy('tenant_isolation_threads', {
      as: 'permissive', to: tenantUser, for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export const messages = agentMemorySchema.table(
  'messages',
  {
    id: uuid('id').primaryKey(),                    // = KernelMessage.id
    threadId: uuid('thread_id').notNull(),          // logical FK only; no constraint (cross-row, no cross-schema FK rule)
    tenantId: uuid('tenant_id').notNull(),
    resourceId: text('resource_id'),                // denormalised from thread.resource_id
    role: text('role').notNull(),                   // 'user'|'assistant'|'tool' (system never persisted)
    content: jsonb('content').$type<KernelMessageContent[]>().notNull(),
    toolCallId: text('tool_call_id'),               // passthrough of KernelMessage.toolCallId
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('messages_thread_created_idx')
      .on(t.tenantId, t.threadId, t.createdAt.desc(), t.id),
    pgPolicy('tenant_isolation_messages', {
      as: 'permissive', to: tenantUser, for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export const resources = agentMemorySchema.table(
  'resources',
  {
    id: text('id').primaryKey(),                    // principal id; text so we can switch to "tenant:team:<uuid>" later
    tenantId: uuid('tenant_id').notNull(),
    workingMemory: text('working_memory'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('working_memory_8k', sql`octet_length(${t.workingMemory}) <= 8192`),
    pgPolicy('tenant_isolation_resources', {
      as: 'permissive', to: tenantUser, for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export type Thread = typeof threads.$inferSelect
export type NewThread = typeof threads.$inferInsert
export type MessageRow = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type Resource = typeof resources.$inferSelect
```

`0001_security_hardening.sql` is added by hand (drizzle-kit 0.45.2 cannot
emit `FORCE ROW LEVEL SECURITY` or the `tenant_user` GRANT). Pattern matches
`platform/oauth/migrations/0001_security_hardening.sql`.

## 7. Provider API

```ts
// src/provider.ts
export interface AgentMemoryProviderOptions {
  sql: DbSql
  recallTokenBudget?: number   // default 4000 — applied AFTER the page is fetched
  recallPageSize?: number      // default 40   — SQL LIMIT
}

export class AgentMemoryProvider implements MemoryProvider {
  constructor(private readonly opts: AgentMemoryProviderOptions) {}

  recall(ctx: MemoryContext): Promise<RecallResult>
  saveTurn(ctx: MemoryContext, msgs: KernelMessage[]): Promise<void>
  getWorkingMemory(ctx: MemoryContext): Promise<string | null>
  updateWorkingMemory(ctx: MemoryContext, text: string): Promise<void>
}
```

All four methods open exactly one `withTenant(sql, tenantId, async (tx) => …)`
transaction. Inside the tx: read or write data, then `recordAudit(tx, …)`.
Audit-write failure rolls back the data write. `tenantId` comes from
`tenantContext.getTenantId()`; never a parameter.

### 7.1 `recall(ctx)`

1. `withTenant`, read `pageSize + 1` rows from `messages` for the thread,
   ordered by `(createdAt DESC, id DESC)`. The `+1` row is used only to set
   `hasMore`.
2. Reverse to chronological. Map row → `KernelMessage` (preserving `id` and
   `toolCallId`).
3. `trimToTokenBudget(messages, budget)` — drops oldest first until the
   total fits; never strips the last user message.
4. `recordAudit({ operation: 'memory.recall', resource: { type: 'thread', ids: [threadId] },
   metadata: { returned, dropped, hasMore, pageSize, budget } })`.
5. Return `{ messages, total, page: 1, perPage: pageSize, hasMore }`. `total`
   reads `threads.message_count` in the same tx (cheap; the counter is
   maintained by `saveTurn`).

### 7.2 `saveTurn(ctx, msgs)`

1. Filter out `role === 'system'` (system prompt is injected from
   `AgentConfig.instructions`).
2. Stamp `id = randomUUID()` on any message without one. Assistant/tool
   messages already carry ids from `agent-core/tool-loop`; this fallback
   handles user messages arriving from channel adapters.
3. `withTenant`. Call `ensureThread(tx, tenantId, threadId)` which upserts
   the `threads` row carrying `resource_id = tenantContext.getUserId() ?? null`
   and returns the canonical `resourceId` (the one stored on the row — which
   may differ from the current request's user, e.g. admin replay).
4. `INSERT INTO messages ... ON CONFLICT (id) DO NOTHING RETURNING id`. Stamp
   every row with the resolved `resourceId`.
5. If `returning.length > 0`: `UPDATE threads SET message_count = message_count + inserted, updated_at = now()`.
6. `recordAudit({ operation: 'memory.save_turn', resource: { type: 'thread', ids: [threadId] },
   metadata: { incoming, persisted, skipped } })`.

Idempotent replays — re-running `saveTurn` with the same messages re-uses
the same `id`s, conflicts skip every row, counter does not bump, audit row
records `skipped === incoming`.

### 7.3 `getWorkingMemory(ctx)`

1. `withTenant`. Resolve `threads.resource_id` for the thread. If the thread
   is missing or has no `resource_id`, return `null` (soft no-op, audit `ok`
   with `hit: false`).
2. Otherwise `SELECT working_memory FROM resources WHERE id = $resourceId`.
3. `recordAudit({ operation: 'memory.get_working_memory',
   resource: { type: 'resource', ids: [resourceId] }, metadata: { hit } })`.

### 7.4 `updateWorkingMemory(ctx, text)`

1. Zod-validate `text.length <= 8192` (UTF-8 bytes via `Buffer.byteLength`).
   On failure throw `AgentError({ code: 'WORKING_MEMORY_TOO_LARGE', category: 'USER' })`.
2. `withTenant`. Resolve `threads.resource_id`. If no thread or no
   `resource_id`, `recordAudit({ result: 'failure', metadata: { reason: 'no_resource_id' } })`
   and return (soft no-op — matches Mastra leniency; ops can grep audit).
3. `INSERT INTO resources (id, tenant_id, working_memory, updated_at) VALUES (...)
   ON CONFLICT (id) DO UPDATE SET working_memory = EXCLUDED.working_memory, updated_at = now()`.
4. `recordAudit({ operation: 'memory.update_working_memory',
   resource: { type: 'resource', ids: [resourceId] }, metadata: { bytes } })`.

## 8. Token-budget trim (`src/recall.ts`)

```ts
import { getEncoding } from 'js-tiktoken'

const enc = getEncoding('o200k_base')  // shared module-level singleton

function countTokens(m: KernelMessage): number {
  // Stringify content for tokenisation. We over-count slightly vs provider
  // bills (provider serialises differently per model) — that is the right
  // direction: trim eagerly rather than overflow the model context.
  return enc.encode(JSON.stringify(m.content)).length + 4   // +4: role+overhead
}

export function trimToTokenBudget(
  msgs: KernelMessage[], budget: number,
): { kept: KernelMessage[]; droppedCount: number } {
  if (msgs.length === 0) return { kept: [], droppedCount: 0 }
  const sizes = msgs.map(countTokens)
  let total = sizes.reduce((a, b) => a + b, 0)
  let dropped = 0
  const lastUserIdx = findLastIndex(msgs, (m) => m.role === 'user')
  // Floor at msgs.length - 1 so we always keep at least the most recent message,
  // even if no user message exists (defensive — recall results always begin with
  // a user message in normal operation).
  const floor = lastUserIdx >= 0 ? lastUserIdx : msgs.length - 1
  let i = 0
  while (total > budget && i < floor) {
    total -= sizes[i]!; i++; dropped++
  }
  return { kept: msgs.slice(i), droppedCount: dropped }
}
```

The `o200k_base` encoder is the gpt-4o-family tokenizer. It over-counts
slightly for Claude, which is the safe direction (we'd rather trim too
aggressively than overflow the model context).

The `js-tiktoken@1.0.21` pin already lives in `@seta/agent-core`. `src/token-counter.ts`
re-exports `countTokens` from agent-core to keep one pin authoritative.

## 9. Error handling

| Code                          | Category | Thrown from                                      |
|-------------------------------|----------|--------------------------------------------------|
| `WORKING_MEMORY_TOO_LARGE`    | USER     | `updateWorkingMemory` Zod check; also wraps the Postgres CHECK violation if Zod is bypassed |
| `MEMORY_PERSIST_FAILED`       | SYSTEM   | Catch-all for unexpected pg errors; wraps via `kernelErrorOf(err)` |

No new `MemoryError` subclass. Uses `AgentError` from `@seta/agent-core`.
`streamKernelSSE` maps these to RFC 7807 via `@seta/middleware` automatically.

## 10. Observability

| Layer            | What lands                                                                                  | Where                                  |
|------------------|---------------------------------------------------------------------------------------------|----------------------------------------|
| `logger.debug`   | One log line per provider call: `memory.recall`, `memory.save_turn`, `memory.get_working_memory`, `memory.update_working_memory` with key counts/bytes | `@seta/observability` |
| `recordAudit`    | One row per provider call. Operation, resource type/id, result, metadata.                   | `@seta/audit`                          |
| OTel             | Inherited from the HTTP span via `apps/api`'s `instrumentation.ts`. No manual `tracer.startSpan` in this package. | piggybacks on platform |

`actorFromContext()` in `src/audit.ts`:
- `tenantContext.getUserId()` present → `{ type: 'user', userId }`.
- absent → `{ type: 'system', label: 'agent-memory' }`.

## 11. Test strategy (TDD per CLAUDE.md)

| Test                                          | What it covers                                                                                                     |
|-----------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| Unit — `trimToTokenBudget`                    | empty input; all-fits; drop oldest until under budget; never strip last user msg; single msg larger than budget    |
| Unit — `actorFromContext`                     | user actor when `userId` present; system actor when absent; throws if `tenantContext` missing                      |
| Integration — `recall`                        | empty thread → `[]`; single page; `hasMore` boundary at `pageSize + 1`; chronological ordering; token-budget trim with real `js-tiktoken`; system messages never returned; audit row written |
| Integration — `saveTurn`                      | first turn creates `threads` row with current user's id as `resource_id`; subsequent saves append; replay (same ids) is a no-op (`skipped === incoming`); `message_count` matches actual row count; system messages filtered; user messages get a stamped id; audit row written |
| Integration — working memory                  | get on missing thread → null; get on thread with no `resource_id` → null; update upserts; second update overwrites; 8KB + 1 byte throws `WORKING_MEMORY_TOO_LARGE`; raw-SQL bypass triggers CHECK constraint; update on thread with no `resource_id` → soft no-op + audit `failure` |
| Integration — RLS                             | tenant A writes a thread + messages + resource; tenant B sets `app.tenant_id` and gets `[]` (RLS filter, not error); cross-tenant `INSERT` fails the policy `WITH CHECK` |
| Integration — kernel round-trip               | `run(cfg, input, { memory: provider })` with a recorded LLM call persists; second `run()` on the same `threadId` sees prior messages in `recall()`; assistant message ids round-trip through `INSERT ... ON CONFLICT DO NOTHING` |

Integration tests use the docker pg from `pnpm db:up`. `beforeAll` runs
`runMigrations({ url, owners: ['auth', 'tenant', 'audit', 'agent', 'agent_memory'] })`.
`beforeEach` truncates the three `agent_memory.*` tables via `platform_admin`
(RLS bypass). No mocking of `@seta/db`, `@seta/tenant`, or `@seta/audit`.

Memory is below the model layer, so the recall / save-turn / working-memory /
RLS integration tests do not need LLM fixtures or MSW. The kernel round-trip
test is the one exception: it crosses the model boundary, so it uses
`@seta/agent-core/testkit`'s `setupLLMRecording` (MSW-backed record/replay
per `06-llm-recording-replay.md`). The recording fixture for the round-trip
test lives in `tests/integration/__recordings__/round-trip.json` and is
re-recorded via `RECORD=1 pnpm vitest run -t round-trip`.

## 12. Open questions resolved

| SCOPE.md question                                  | Resolution                                                                |
|----------------------------------------------------|---------------------------------------------------------------------------|
| Schema namespace                                   | `agent_memory` confirmed. Follow-up `setup.md` PR amends the §3 line 117 reference |
| Working memory format (plain text vs structured)   | Plain text, full-replace upsert. Matches Mastra v1                        |
| Recall pagination page size                        | 40 (Mastra parity)                                                        |
| Working memory size cap                            | 8KB; Zod at boundary + Postgres CHECK backstop                            |
| `OWNER_ORDER` placement                            | After `'agent'`. No FK; ordering chosen for "creates-after-agent-product" affinity, even though there is no cross-schema reference |

## 13. Migration plan & rollout

This is a greenfield package landing pre-1.0. No data migration. No backward
compat. The `KernelMessage.id` field added in the same PR is treated as
mandatory for messages the kernel generates; channel-side user messages stay
id-less and the provider stamps them.

`apps/api/src/main.ts` flips from `NullMemoryProvider` (today) to
`AgentMemoryProvider` in the same PR. Tests in `@seta/agent-core` that exercise
the kernel without DB stay on `NullMemoryProvider`; that import stays.

## 14. Cross-references

- **SCOPE:** `platform/agent/memory/SCOPE.md`
- **Kernel seam:** `platform/agent/core/SCOPE.md` § Memory seam,
  `platform/agent/core/src/types/memory.ts`, `platform/agent/core/src/run/run.ts:31-95`
- **Spike:** `docs/explorations/2026-05-12-mastra-spike/09-memory.md`
- **Mastra reference (read-only):** `packages/memory/`, `stores/pg/src/storage/domains/memory/`,
  `packages/core/src/storage/constants.ts:497-537`
- **Schema-per-module pattern:** `platform/oauth/src/schema.ts`, `platform/oauth/drizzle.config.ts`
- **Migration runner:** `platform/db/src/migrate.ts` (`OWNER_ORDER` edit required)
- **Audit writer:** `platform/audit/src/writer.ts`
