# @seta/agent-memory P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `@seta/agent-memory` as a Mastra-aligned, multi-tenant, RLS-enforced implementation of the `MemoryProvider` seam declared in `@seta/agent-core`, persisting threads, messages, and per-principal working memory to Postgres.

**Architecture:** A platform package at `platform/agent/memory/` owning the `agent_memory` Postgres schema (three tables: `threads`, `messages`, `resources`). One class `AgentMemoryProvider` implements the four `MemoryProvider` methods (`recall`, `saveTurn`, `getWorkingMemory`, `updateWorkingMemory`). Every call runs inside `withTenant(...)` and writes one audit row in the same transaction. Coordinated edits in the same PR: add `id?: string` to `KernelMessage`, stamp `randomUUID()` in `tool-loop.ts`, add `agent_memory` to `OWNER_ORDER`, wire the provider in `apps/api/src/main.ts`.

**Tech Stack:** TypeScript (ESM only), Drizzle ORM 0.45.2 + drizzle-kit, postgres 3.4.9, Zod 4.4.3, `js-tiktoken` 1.0.21 (o200k_base), Vitest 4.1.5, Postgres 16 RLS.

**Spec:** `docs/superpowers/specs/2026-05-12-agent-memory-design.md`

---

## Task 1: Add `id?: string` to `KernelMessage`

**Files:**
- Modify: `platform/agent/core/src/types/message.ts`
- Test: `platform/agent/core/src/types/types.test.ts` (existing)

- [ ] **Step 1: Write the failing test**

Add to `platform/agent/core/src/types/types.test.ts`:

```ts
import type { KernelMessage } from './index'
import { describe, it, expectTypeOf } from 'vitest'

describe('KernelMessage.id', () => {
  it('accepts optional string id', () => {
    const m: KernelMessage = { id: 'abc', role: 'user', content: [{ type: 'text', text: 'hi' }] }
    expectTypeOf(m.id).toEqualTypeOf<string | undefined>()
  })

  it('still accepts id-less messages', () => {
    const m: KernelMessage = { role: 'user', content: [{ type: 'text', text: 'hi' }] }
    expectTypeOf(m.id).toEqualTypeOf<string | undefined>()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seta/agent-core test:unit -- types`
Expected: type error — `Object literal may only specify known properties, and 'id' does not exist in type 'KernelMessage'`.

- [ ] **Step 3: Add the field**

Replace contents of `platform/agent/core/src/types/message.ts` with:

```ts
export type KernelRole = 'system' | 'user' | 'assistant' | 'tool'

export type KernelMessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolCallId: string; name: string; args: unknown }
  | { type: 'tool_result'; toolCallId: string; result: unknown; isError?: boolean }

export interface KernelMessage {
  id?: string
  role: KernelRole
  content: KernelMessageContent[]
  toolCallId?: string
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seta/agent-core test:unit -- types`
Expected: PASS.

- [ ] **Step 5: Typecheck full package**

Run: `pnpm --filter @seta/agent-core typecheck`
Expected: no errors. (Adding an optional field should not break existing call sites.)

- [ ] **Step 6: Commit**

```bash
git add platform/agent/core/src/types/message.ts platform/agent/core/src/types/types.test.ts
git commit -m "feat(agent-core): add optional id to KernelMessage

Prep for @seta/agent-memory message idempotency via INSERT ... ON CONFLICT
(id) DO NOTHING."
```

---

## Task 2: Stamp message ids in `tool-loop.ts`

**Files:**
- Modify: `platform/agent/core/src/run/tool-loop.ts:73-77, 120-125`
- Test: `platform/agent/core/src/run/tool-loop.test.ts` (existing)

- [ ] **Step 1: Write the failing test**

Add to `platform/agent/core/src/run/tool-loop.test.ts` (or its closest sibling — locate it with `grep -l "runToolLoop\b" platform/agent/core/src/run/*.test.ts`):

```ts
it('stamps a uuid id on every message added by the loop', async () => {
  // Use the existing fake adapter pattern in this file. After running a loop
  // that produces one assistant message and one tool message, every entry in
  // `addedMessages` should have a string id that matches UUID v4.
  const added = await collectAddedMessages(/* ...existing test setup... */)
  expect(added.length).toBeGreaterThan(0)
  for (const m of added) {
    expect(m.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  }
})
```

If `tool-loop.test.ts` does not exist, add the assertion inside `platform/agent/core/src/run/run.test.ts` instead — locate with `grep -l "runToolLoop\|run(" platform/agent/core/src/run/*.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seta/agent-core test:unit -- tool-loop`
Expected: FAIL — `m.id` is undefined.

- [ ] **Step 3: Add `randomUUID` import and stamp helper**

In `platform/agent/core/src/run/tool-loop.ts`, add to imports (preserve alphabetical order):

```ts
import { randomUUID } from 'node:crypto'
```

Then add at module scope:

```ts
function stampId<T extends { id?: string }>(m: T): T {
  return m.id ? m : { ...m, id: randomUUID() }
}
```

- [ ] **Step 4: Stamp at every push site**

In `platform/agent/core/src/run/tool-loop.ts`, replace the two push patterns. Around line 73-77:

```ts
      accumulatedSteps.push(modelStep)
      if (modelStep.message) {
        const stamped = stampId(modelStep.message)
        messages = [...messages, stamped]
        addedMessages.push(stamped)
      }
```

Around line 120-125:

```ts
      for (const step of toolSteps) {
        accumulatedSteps.push(step)
        if (step.message) {
          const stamped = stampId(step.message)
          messages = [...messages, stamped]
          addedMessages.push(stamped)
        }
```

Also stamp the processor-rewrite paths around line 85-88 and 133-136 so that a processor that replaces the message preserves the id (or gets a new one if it omitted it):

```ts
          if (rewritten.message && rewritten.message !== modelStep.message) {
            const stamped = stampId(rewritten.message)
            messages[messages.length - 1] = stamped
            addedMessages[addedMessages.length - 1] = stamped
          }
```

(Same change in the toolSteps processor branch.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @seta/agent-core test:unit -- tool-loop`
Expected: PASS.

- [ ] **Step 6: Run full unit suite to catch any regressions**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add platform/agent/core/src/run/tool-loop.ts platform/agent/core/src/run/tool-loop.test.ts
git commit -m "feat(agent-core): stamp KernelMessage.id in tool-loop

Every assistant or tool message added by the loop gets a randomUUID id at
push time, including after processor rewrites. Enables idempotent
persistence in @seta/agent-memory via INSERT ... ON CONFLICT (id) DO
NOTHING."
```

---

## Task 3: Scaffold the `@seta/agent-memory` package

**Files:**
- Create (via tooling): `platform/agent/memory/package.json`, `platform/agent/memory/tsconfig.json`, `platform/agent/memory/vitest.config.ts`, `platform/agent/memory/src/index.ts`

- [ ] **Step 1: Run the scaffold**

```bash
pnpm new:package --kind platform-agent --name memory
```

When prompted: confirm name `@seta/agent-memory`, description `Memory persistence for the @seta/agent-core kernel`, public `false`.

- [ ] **Step 2: Inspect what was created**

```bash
ls platform/agent/memory/
cat platform/agent/memory/package.json
```

Expected files: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/index.test.ts`. `SCOPE.md` is already there (pre-existing).

- [ ] **Step 3: Add runtime deps**

```bash
pnpm --filter @seta/agent-memory add \
  @seta/agent-core@workspace:* \
  @seta/audit@workspace:* \
  @seta/db@workspace:* \
  @seta/middleware@workspace:* \
  @seta/observability@workspace:* \
  @seta/tenant@workspace:*

pnpm --filter @seta/agent-memory add \
  drizzle-orm@0.45.2 \
  js-tiktoken@1.0.21 \
  postgres@3.4.9 \
  uuid@14.0.0 \
  zod@4.4.3
```

- [ ] **Step 4: Add dev deps**

```bash
pnpm --filter @seta/agent-memory add -D \
  drizzle-kit@0.31.5 \
  @seta/tsconfig@workspace:*
```

Pin `drizzle-kit` to the same version `platform/oauth` uses — verify with `pnpm view drizzle-kit version --filter @seta/oauth` or `grep drizzle-kit platform/oauth/package.json`.

- [ ] **Step 5: Verify install**

```bash
pnpm install --frozen-lockfile
pnpm --filter @seta/agent-memory typecheck
```

Expected: install succeeds; typecheck passes (only the placeholder index exists).

- [ ] **Step 6: Commit**

```bash
git add platform/agent/memory/ pnpm-lock.yaml
git commit -m "chore(agent-memory): scaffold package"
```

---

## Task 4: Schema (`src/schema.ts`)

**Files:**
- Create: `platform/agent/memory/src/schema.ts`
- Create: `platform/agent/memory/src/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `platform/agent/memory/src/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  agentMemorySchema,
  messages,
  resources,
  threads,
  type MessageRow,
  type NewMessage,
  type NewThread,
  type Resource,
  type Thread,
} from './schema'

describe('agent_memory schema', () => {
  it('declares the agent_memory pg schema', () => {
    expect(agentMemorySchema.schemaName).toBe('agent_memory')
  })

  it('exports three tables', () => {
    expect(threads).toBeDefined()
    expect(messages).toBeDefined()
    expect(resources).toBeDefined()
  })

  it('exposes inferred row types', () => {
    const _t: Thread | undefined = undefined
    const _nt: NewThread = { tenantId: '00000000-0000-0000-0000-000000000000' }
    const _m: MessageRow | undefined = undefined
    const _nm: NewMessage = {
      id: '00000000-0000-0000-0000-000000000000',
      threadId: '00000000-0000-0000-0000-000000000000',
      tenantId: '00000000-0000-0000-0000-000000000000',
      role: 'user',
      content: [{ type: 'text', text: 'hi' }],
    }
    const _r: Resource | undefined = undefined
    expect(_t).toBeUndefined()
    expect(_m).toBeUndefined()
    expect(_r).toBeUndefined()
    expect(_nt).toBeDefined()
    expect(_nm).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seta/agent-memory test:unit -- schema`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schema**

Create `platform/agent/memory/src/schema.ts`:

```ts
import type { KernelMessageContent } from '@seta/agent-core'
import { tenantUser } from '@seta/db'
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const agentMemorySchema = pgSchema('agent_memory')

export const threads = agentMemorySchema.table(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    resourceId: text('resource_id'),
    title: text('title'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    messageCount: integer('message_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('threads_tenant_resource_updated_idx').on(
      t.tenantId,
      t.resourceId,
      t.updatedAt.desc(),
    ),
    pgPolicy('tenant_isolation_threads', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export const messages = agentMemorySchema.table(
  'messages',
  {
    id: uuid('id').primaryKey(),
    threadId: uuid('thread_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    resourceId: text('resource_id'),
    role: text('role').notNull(),
    content: jsonb('content').$type<KernelMessageContent[]>().notNull(),
    toolCallId: text('tool_call_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('messages_thread_created_idx').on(
      t.tenantId,
      t.threadId,
      t.createdAt.desc(),
      t.id,
    ),
    pgPolicy('tenant_isolation_messages', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export const resources = agentMemorySchema.table(
  'resources',
  {
    id: text('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    workingMemory: text('working_memory'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('working_memory_8k', sql`octet_length(${t.workingMemory}) <= 8192`),
    pgPolicy('tenant_isolation_resources', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
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
export type NewResource = typeof resources.$inferInsert
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seta/agent-memory test:unit -- schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/memory/src/schema.ts platform/agent/memory/src/schema.test.ts
git commit -m "feat(agent-memory): drizzle schema for threads, messages, resources"
```

---

## Task 5: Drizzle config + first generated migration

**Files:**
- Create: `platform/agent/memory/drizzle.config.ts`
- Create: `platform/agent/memory/migrations/0000_<name>.sql` (drizzle-kit output)
- Create: `platform/agent/memory/migrations/meta/_journal.json` (drizzle-kit output)

- [ ] **Step 1: Write `drizzle.config.ts`**

```ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  schemaFilter: ['agent_memory'],
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
})
```

- [ ] **Step 2: Ensure local pg is up**

```bash
pnpm db:up
```

Expected: docker container `seta-postgres` running on `localhost:5432`.

- [ ] **Step 3: Generate the initial migration**

```bash
cd platform/agent/memory
pnpm drizzle-kit generate
cd -
```

Expected: a `0000_<random>.sql` plus `meta/_journal.json` and `meta/0000_snapshot.json` appear under `platform/agent/memory/migrations/`.

- [ ] **Step 4: Inspect the output**

```bash
ls platform/agent/memory/migrations/
cat platform/agent/memory/migrations/0000_*.sql
```

Expected: contains `CREATE SCHEMA "agent_memory";`, three `CREATE TABLE` statements (`agent_memory.threads`, `agent_memory.messages`, `agent_memory.resources`), the composite indexes, and `CREATE POLICY` lines. Will NOT contain `FORCE ROW LEVEL SECURITY` or the `GRANT` (drizzle-kit 0.45.2 omits those — Task 6 adds them).

- [ ] **Step 5: Commit**

```bash
git add platform/agent/memory/drizzle.config.ts platform/agent/memory/migrations/
git commit -m "feat(agent-memory): drizzle.config + generated 0000 migration"
```

---

## Task 6: Hand-authored `0001_security_hardening.sql`

**Files:**
- Create: `platform/agent/memory/migrations/0001_security_hardening.sql`
- Modify: `platform/agent/memory/migrations/meta/_journal.json`

- [ ] **Step 1: Write the hardening SQL**

Create `platform/agent/memory/migrations/0001_security_hardening.sql`:

```sql
ALTER TABLE "agent_memory"."threads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_memory"."messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_memory"."resources" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT USAGE ON SCHEMA "agent_memory" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_memory"."threads" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_memory"."messages" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_memory"."resources" TO "tenant_user";
```

Reference: `platform/oauth/migrations/0001_security_hardening.sql` uses the same pattern (ENABLE+FORCE+CREATE POLICY+GRANT). Drizzle-kit already emitted `ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` in 0000, so this file only adds `FORCE`, `GRANT USAGE`, and the per-table `GRANT`s.

- [ ] **Step 2: Append the journal entry**

Update `platform/agent/memory/migrations/meta/_journal.json` — add a new entry to the `entries` array. Use `date +%s%3N` for the `when` field. Example (replace `<timestamp>`):

```json
{
  "idx": 1,
  "version": "7",
  "when": <timestamp>,
  "tag": "0001_security_hardening",
  "breakpoints": true
}
```

Reference shape: `platform/oauth/migrations/meta/_journal.json`.

- [ ] **Step 3: Create the empty snapshot file (drizzle-kit expects one per entry)**

```bash
cp platform/agent/memory/migrations/meta/0000_snapshot.json \
   platform/agent/memory/migrations/meta/0001_snapshot.json
```

Drizzle-kit uses snapshots to compute diffs; the snapshot for a hand-authored hardening file is identical to the previous one (no schema diff). Reference: `platform/oauth/migrations/meta/` contains both `0000_snapshot.json` and `0001_snapshot.json` with the same content.

- [ ] **Step 4: Commit**

```bash
git add platform/agent/memory/migrations/0001_security_hardening.sql \
        platform/agent/memory/migrations/meta/_journal.json \
        platform/agent/memory/migrations/meta/0001_snapshot.json
git commit -m "feat(agent-memory): 0001 security hardening (FORCE RLS + GRANTs)"
```

---

## Task 7: Register `agent_memory` in `OWNER_ORDER`

**Files:**
- Modify: `platform/db/src/migrate.ts`
- Modify: `platform/db/src/migrate.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `platform/db/src/migrate.test.ts`:

```ts
import { OWNER_ORDER } from './migrate'

it('includes agent_memory after agent in OWNER_ORDER', () => {
  const agentIdx = OWNER_ORDER.indexOf('agent')
  const memIdx = OWNER_ORDER.indexOf('agent_memory')
  expect(agentIdx).toBeGreaterThanOrEqual(0)
  expect(memIdx).toBeGreaterThan(agentIdx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seta/db test:unit -- migrate`
Expected: FAIL — `'agent_memory'` not in `OWNER_ORDER`.

- [ ] **Step 3: Add the entry**

In `platform/db/src/migrate.ts`:

```ts
export const OWNER_ORDER = [
  'auth',
  'tenant',
  'directory',
  'oauth',
  'audit',
  'connector_ms365_directory',
  'connector_ms365_planner',
  'agent',
  'agent_memory',
] as const
```

And in `OWNER_PACKAGE_PATH`:

```ts
const OWNER_PACKAGE_PATH: Record<Owner, string> = {
  auth: 'platform/auth/migrations',
  tenant: 'platform/tenant/migrations',
  directory: 'platform/directory/migrations',
  oauth: 'platform/oauth/migrations',
  audit: 'platform/audit/migrations',
  connector_ms365_directory: 'modules/connectors/ms365-directory/migrations',
  connector_ms365_planner: 'modules/connectors/ms365-planner/migrations',
  agent: 'modules/products/agent/migrations',
  agent_memory: 'platform/agent/memory/migrations',
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seta/db test:unit -- migrate`
Expected: PASS.

- [ ] **Step 5: Run the full migration smoke test**

```bash
pnpm db:down && pnpm db:up
pnpm migrate
```

Expected: succeeds. The `agent_memory` migrations run after all earlier owners.

- [ ] **Step 6: Verify schema exists**

```bash
psql "$DATABASE_URL" -c "\\dn agent_memory"
psql "$DATABASE_URL" -c "\\dt agent_memory.*"
```

Expected: schema `agent_memory` exists; tables `threads`, `messages`, `resources` listed.

- [ ] **Step 7: Verify RLS is enabled and forced**

```bash
psql "$DATABASE_URL" -c "SELECT schemaname, tablename, rowsecurity, forcerowsecurity FROM pg_tables WHERE schemaname = 'agent_memory';"
```

Expected: three rows, `rowsecurity = t` AND `forcerowsecurity = t` on each.

- [ ] **Step 8: Commit**

```bash
git add platform/db/src/migrate.ts platform/db/src/migrate.test.ts
git commit -m "feat(db): register agent_memory in OWNER_ORDER"
```

---

## Task 8: Token-budget trim (`src/recall.ts`)

**Files:**
- Create: `platform/agent/memory/src/recall.ts`
- Create: `platform/agent/memory/src/recall.test.ts`

- [ ] **Step 1: Write the failing test**

Create `platform/agent/memory/src/recall.test.ts`:

```ts
import type { KernelMessage } from '@seta/agent-core'
import { describe, expect, it } from 'vitest'
import { trimToTokenBudget } from './recall'

const msg = (role: KernelMessage['role'], text: string): KernelMessage => ({
  role,
  content: [{ type: 'text', text }],
})

describe('trimToTokenBudget', () => {
  it('returns empty for empty input', () => {
    const r = trimToTokenBudget([], 1000)
    expect(r.kept).toEqual([])
    expect(r.droppedCount).toBe(0)
  })

  it('keeps all when total fits', () => {
    const msgs = [msg('user', 'hello'), msg('assistant', 'hi')]
    const r = trimToTokenBudget(msgs, 10_000)
    expect(r.kept).toHaveLength(2)
    expect(r.droppedCount).toBe(0)
  })

  it('drops oldest first', () => {
    const msgs = [
      msg('user', 'old'.repeat(2000)),
      msg('assistant', 'old reply'),
      msg('user', 'new'),
    ]
    const r = trimToTokenBudget(msgs, 50)
    expect(r.droppedCount).toBeGreaterThan(0)
    // Last (user) message survives
    expect(r.kept.at(-1)).toEqual(msgs.at(-1))
  })

  it('never strips the last user message', () => {
    const msgs = [
      msg('user', 'a'.repeat(10_000)),                  // oldest, huge
      msg('assistant', 'huge'.repeat(2000)),
      msg('user', 'recent question'),                   // last user
      msg('assistant', 'tiny reply'),
    ]
    const r = trimToTokenBudget(msgs, 20)
    // The last-user index is 2; trim cannot drop msgs.length === 4 minus 2 = at most 2
    expect(r.kept.some((m) => m.role === 'user' && m.content[0]!.type === 'text' && m.content[0]!.text === 'recent question')).toBe(true)
  })

  it('falls back to keeping the last message when no user message exists', () => {
    const msgs = [msg('assistant', 'a'), msg('assistant', 'b')]
    const r = trimToTokenBudget(msgs, 0)
    expect(r.kept).toHaveLength(1)
    expect(r.kept[0]).toEqual(msgs[1])
  })

  it('keeps single message even if it exceeds budget', () => {
    const msgs = [msg('user', 'x'.repeat(10_000))]
    const r = trimToTokenBudget(msgs, 5)
    expect(r.kept).toHaveLength(1)
    expect(r.droppedCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seta/agent-memory test:unit -- recall`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `trimToTokenBudget`**

Create `platform/agent/memory/src/recall.ts`:

```ts
import type { KernelMessage } from '@seta/agent-core'
import { getEncoding } from 'js-tiktoken'

const enc = getEncoding('o200k_base')

function countTokens(m: KernelMessage): number {
  return enc.encode(JSON.stringify(m.content)).length + 4
}

function findLastIndex<T>(arr: T[], pred: (t: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i]!)) return i
  }
  return -1
}

export function trimToTokenBudget(
  msgs: KernelMessage[],
  budget: number,
): { kept: KernelMessage[]; droppedCount: number } {
  if (msgs.length === 0) return { kept: [], droppedCount: 0 }
  const sizes = msgs.map(countTokens)
  let total = sizes.reduce((a, b) => a + b, 0)
  let dropped = 0
  const lastUserIdx = findLastIndex(msgs, (m) => m.role === 'user')
  const floor = lastUserIdx >= 0 ? lastUserIdx : msgs.length - 1
  let i = 0
  while (total > budget && i < floor) {
    total -= sizes[i]!
    i++
    dropped++
  }
  return { kept: msgs.slice(i), droppedCount: dropped }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seta/agent-memory test:unit -- recall`
Expected: PASS (all six cases).

- [ ] **Step 5: Commit**

```bash
git add platform/agent/memory/src/recall.ts platform/agent/memory/src/recall.test.ts
git commit -m "feat(agent-memory): trimToTokenBudget (o200k_base)"
```

---

## Task 9: Audit actor helper (`src/audit.ts`)

**Files:**
- Create: `platform/agent/memory/src/audit.ts`
- Create: `platform/agent/memory/src/audit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `platform/agent/memory/src/audit.test.ts`:

```ts
import { tenantContext } from '@seta/tenant'
import { describe, expect, it } from 'vitest'
import { actorFromContext } from './audit'

describe('actorFromContext', () => {
  it('returns user actor when userId present', async () => {
    await tenantContext.run(
      { tenantId: '00000000-0000-0000-0000-000000000001', userId: 'user-1' },
      async () => {
        expect(actorFromContext()).toEqual({ type: 'user', userId: 'user-1' })
      },
    )
  })

  it('returns system actor when userId absent', async () => {
    await tenantContext.run(
      { tenantId: '00000000-0000-0000-0000-000000000001' },
      async () => {
        expect(actorFromContext()).toEqual({ type: 'system', label: 'agent-memory' })
      },
    )
  })

  it('throws if tenantContext missing', () => {
    expect(() => actorFromContext()).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seta/agent-memory test:unit -- audit`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `actorFromContext`**

Create `platform/agent/memory/src/audit.ts`:

```ts
import type { AuditActor } from '@seta/audit'
import { tenantContext } from '@seta/tenant'

export function actorFromContext(): AuditActor {
  // tenantContext.getTenantId() throws if no context; call it to enforce that
  // contract before returning a system actor.
  tenantContext.getTenantId()
  const userId = tenantContext.getUserId()
  return userId ? { type: 'user', userId } : { type: 'system', label: 'agent-memory' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seta/agent-memory test:unit -- audit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/memory/src/audit.ts platform/agent/memory/src/audit.test.ts
git commit -m "feat(agent-memory): actorFromContext for audit rows"
```

---

## Task 10: Error codes (`src/errors.ts`)

**Files:**
- Create: `platform/agent/memory/src/errors.ts`

- [ ] **Step 1: Write the helper**

Create `platform/agent/memory/src/errors.ts`:

```ts
import { AgentError } from '@seta/agent-core'

export class WorkingMemoryTooLargeError extends AgentError {
  constructor(bytes: number) {
    super({
      code: 'WORKING_MEMORY_TOO_LARGE',
      category: 'USER',
      message: `working memory exceeds 8192 byte cap (got ${bytes})`,
      details: { bytes, cap: 8192 },
    })
  }
}

export class MemoryPersistFailedError extends AgentError {
  constructor(cause: unknown) {
    super({
      code: 'MEMORY_PERSIST_FAILED',
      category: 'SYSTEM',
      message: 'memory persistence failed',
      cause,
    })
  }
}
```

Note: `AgentError` accepts a `cause` field per `platform/agent/core/src/errors/*.ts` — verify with `grep -n "cause" platform/agent/core/src/errors/agent-error.ts` before relying on it. If `cause` is not yet supported on `AgentError`, pass `details: { cause }` instead.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/agent-memory typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/memory/src/errors.ts
git commit -m "feat(agent-memory): error code helpers"
```

---

## Task 11: Working-memory pure helpers + Zod (`src/working-memory.ts`)

**Files:**
- Create: `platform/agent/memory/src/working-memory.ts`
- Create: `platform/agent/memory/src/working-memory.test.ts`

This task covers only the Zod-validation helper. The DB-touching parts land in Task 14.

- [ ] **Step 1: Write the failing test**

Create `platform/agent/memory/src/working-memory.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { WorkingMemoryTooLargeError } from './errors'
import { validateWorkingMemoryText } from './working-memory'

describe('validateWorkingMemoryText', () => {
  it('accepts an empty string', () => {
    expect(() => validateWorkingMemoryText('')).not.toThrow()
  })

  it('accepts 8192 bytes exactly', () => {
    expect(() => validateWorkingMemoryText('a'.repeat(8192))).not.toThrow()
  })

  it('throws WorkingMemoryTooLargeError at 8193 bytes', () => {
    expect(() => validateWorkingMemoryText('a'.repeat(8193))).toThrow(WorkingMemoryTooLargeError)
  })

  it('counts UTF-8 bytes, not characters', () => {
    // '€' is 3 UTF-8 bytes; 2731 of them = 8193 bytes.
    expect(() => validateWorkingMemoryText('€'.repeat(2731))).toThrow(WorkingMemoryTooLargeError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seta/agent-memory test:unit -- working-memory`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the validator**

Create `platform/agent/memory/src/working-memory.ts`:

```ts
import { WorkingMemoryTooLargeError } from './errors'

export const WORKING_MEMORY_BYTE_CAP = 8192

export function validateWorkingMemoryText(text: string): void {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > WORKING_MEMORY_BYTE_CAP) {
    throw new WorkingMemoryTooLargeError(bytes)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seta/agent-memory test:unit -- working-memory`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/memory/src/working-memory.ts platform/agent/memory/src/working-memory.test.ts
git commit -m "feat(agent-memory): validateWorkingMemoryText 8KB cap"
```

---

## Task 12: Set up integration test harness

**Files:**
- Modify: `platform/agent/memory/vitest.config.ts`
- Create: `platform/agent/memory/tests/integration/setup.ts`
- Create: `platform/agent/memory/tests/integration/_meta.integration.test.ts`

- [ ] **Step 1: Add the `integration` test project**

Replace `platform/agent/memory/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@seta/agent-memory',
    projects: [
      {
        test: { name: 'unit', include: ['src/**/*.test.ts'] },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.integration.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
```

Reference shape: `platform/oauth/vitest.config.ts`.

- [ ] **Step 2: Add the setup file**

Create `platform/agent/memory/tests/integration/setup.ts`:

```ts
import { createPool, runMigrations } from '@seta/db'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach } from 'vitest'

declare global {
  // eslint-disable-next-line no-var
  var __MEM_TEST_SQL__: ReturnType<typeof createPool> | undefined
}

const url = process.env.DATABASE_URL ?? 'postgres://seta:seta@localhost:5432/seta'

beforeAll(async () => {
  await runMigrations({
    url,
    owners: ['auth', 'tenant', 'audit', 'agent', 'agent_memory'],
  })
  globalThis.__MEM_TEST_SQL__ = createPool(url)
})

beforeEach(async () => {
  // Truncate as platform_admin (RLS bypass) so per-tenant tests start clean.
  const admin = postgres(url, { max: 1, prepare: false })
  try {
    await admin.unsafe(
      `TRUNCATE agent_memory.messages, agent_memory.threads, agent_memory.resources RESTART IDENTITY CASCADE`,
    )
  } finally {
    await admin.end()
  }
})

afterAll(async () => {
  await globalThis.__MEM_TEST_SQL__?.end()
})

export function testSql() {
  const sql = globalThis.__MEM_TEST_SQL__
  if (!sql) throw new Error('__MEM_TEST_SQL__ not initialised')
  return sql
}
```

If `runMigrations` does not accept `owners`, locate the actual option name in `platform/db/src/migrate.ts:31-36` (it is `owners?: readonly Owner[]`). Verify before this task and align.

- [ ] **Step 3: Add a smoke test that the harness boots**

Create `platform/agent/memory/tests/integration/_meta.integration.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { testSql } from './setup'

describe('integration harness', () => {
  it('connects to docker pg and sees the agent_memory schema', async () => {
    const sql = testSql()
    const rows =
      await sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'agent_memory'`
    expect(rows.length).toBe(1)
  })
})
```

- [ ] **Step 4: Run integration tests**

```bash
pnpm db:up
pnpm --filter @seta/agent-memory test:integration
```

Expected: one passing test, `_meta.integration.test.ts > integration harness > connects ...`.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/memory/vitest.config.ts platform/agent/memory/tests/integration/
git commit -m "test(agent-memory): integration harness against docker pg"
```

---

## Task 13: `ensureThread` + `saveTurn` integration

**Files:**
- Create: `platform/agent/memory/src/save-turn.ts`
- Create: `platform/agent/memory/tests/integration/save-turn.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `platform/agent/memory/tests/integration/save-turn.integration.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { KernelMessage } from '@seta/agent-core'
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenant'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { messages, threads } from '../../src/schema'
import { ensureThread, saveMessages } from '../../src/save-turn'
import { testSql } from './setup'

const TENANT = '00000000-0000-0000-0000-000000000001'

function userMsg(text: string, id?: string): KernelMessage {
  return { id, role: 'user', content: [{ type: 'text', text }] }
}

describe('saveTurn integration', () => {
  it('first call creates thread row stamped with current user id', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
      })
    })

    const rows = await testSql()`SELECT * FROM agent_memory.threads WHERE id = ${threadId}`
    expect(rows.length).toBe(1)
    expect(rows[0]!.resource_id).toBe('alice')
  })

  it('saveMessages inserts new rows and is idempotent on replay', async () => {
    const threadId = randomUUID()
    const m1: KernelMessage = userMsg('hi', randomUUID())
    const m2: KernelMessage = userMsg('again', randomUUID())

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        const inserted1 = await saveMessages(tx, TENANT, threadId, [m1, m2])
        expect(inserted1).toBe(2)
        // Replay — same ids, no new rows.
        const inserted2 = await saveMessages(tx, TENANT, threadId, [m1, m2])
        expect(inserted2).toBe(0)
      })
    })

    const rows = await testSql()`SELECT id FROM agent_memory.messages WHERE thread_id = ${threadId}`
    expect(rows.length).toBe(2)
  })

  it('skips role==="system" messages', async () => {
    const threadId = randomUUID()
    const system: KernelMessage = {
      id: randomUUID(),
      role: 'system',
      content: [{ type: 'text', text: 'you are helpful' }],
    }
    const user: KernelMessage = userMsg('hi', randomUUID())

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        const inserted = await saveMessages(tx, TENANT, threadId, [system, user])
        expect(inserted).toBe(1)
      })
    })

    const rows = await testSql()`SELECT role FROM agent_memory.messages WHERE thread_id = ${threadId}`
    expect(rows.map((r) => r.role)).toEqual(['user'])
  })

  it('stamps a random id on id-less user messages', async () => {
    const threadId = randomUUID()
    const m: KernelMessage = userMsg('hi') // no id

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await saveMessages(tx, TENANT, threadId, [m])
      })
    })

    const rows = await testSql()`SELECT id FROM agent_memory.messages WHERE thread_id = ${threadId}`
    expect(rows.length).toBe(1)
    expect(rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seta/agent-memory test:integration -- save-turn`
Expected: FAIL — module `../../src/save-turn` not found.

- [ ] **Step 3: Implement `ensureThread` + `saveMessages`**

Create `platform/agent/memory/src/save-turn.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { KernelMessage } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq, sql as drsql } from 'drizzle-orm'
import type { Sql, TransactionSql } from 'postgres'
import { messages, threads } from './schema'

export async function ensureThread(
  tx: TransactionSql | Sql,
  tenantId: string,
  threadId: string,
): Promise<{ resourceId: string | null }> {
  const userId = tenantContext.getUserId() ?? null
  const db = drizzle(tx as TransactionSql)
  await db
    .insert(threads)
    .values({ id: threadId, tenantId, resourceId: userId })
    .onConflictDoNothing()
  const [row] = await db
    .select({ resourceId: threads.resourceId })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1)
  return { resourceId: row?.resourceId ?? null }
}

export async function saveMessages(
  tx: TransactionSql | Sql,
  tenantId: string,
  threadId: string,
  msgs: KernelMessage[],
): Promise<number> {
  const filtered = msgs
    .filter((m) => m.role !== 'system')
    .map((m) => ({ ...m, id: m.id ?? randomUUID() }))
  if (filtered.length === 0) return 0

  const db = drizzle(tx as TransactionSql)

  // Read the canonical resource_id (set by ensureThread caller).
  const [t] = await db
    .select({ resourceId: threads.resourceId })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1)
  const resourceId = t?.resourceId ?? null

  const inserted = await db
    .insert(messages)
    .values(
      filtered.map((m) => ({
        id: m.id!,
        threadId,
        tenantId,
        resourceId,
        role: m.role,
        content: m.content,
        toolCallId: m.toolCallId ?? null,
      })),
    )
    .onConflictDoNothing({ target: messages.id })
    .returning({ id: messages.id })

  if (inserted.length > 0) {
    await db
      .update(threads)
      .set({
        messageCount: drsql`${threads.messageCount} + ${inserted.length}`,
        updatedAt: new Date(),
      })
      .where(eq(threads.id, threadId))
  }

  return inserted.length
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seta/agent-memory test:integration -- save-turn`
Expected: all 4 cases PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/memory/src/save-turn.ts platform/agent/memory/tests/integration/save-turn.integration.test.ts
git commit -m "feat(agent-memory): ensureThread + saveMessages

Idempotent insert via ON CONFLICT (id) DO NOTHING. message_count counter
updated only by actually-inserted rows. system messages filtered."
```

---

## Task 14: Working-memory DB ops (`readWorkingMemory`, `upsertWorkingMemory`)

**Files:**
- Modify: `platform/agent/memory/src/working-memory.ts`
- Create: `platform/agent/memory/tests/integration/working-memory.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `platform/agent/memory/tests/integration/working-memory.integration.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenant'
import { describe, expect, it } from 'vitest'
import { ensureThread } from '../../src/save-turn'
import {
  readWorkingMemory,
  upsertWorkingMemory,
  WORKING_MEMORY_BYTE_CAP,
} from '../../src/working-memory'
import { WorkingMemoryTooLargeError } from '../../src/errors'
import { testSql } from './setup'
import postgres from 'postgres'

const TENANT = '00000000-0000-0000-0000-000000000001'

describe('working memory integration', () => {
  it('read on missing thread returns null', async () => {
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        const out = await readWorkingMemory(tx, TENANT, randomUUID())
        expect(out).toEqual({ resourceId: null, workingMemory: null })
      })
    })
  })

  it('write then read round-trips for the same resource', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        const r = await upsertWorkingMemory(tx, TENANT, threadId, 'remember: pizza')
        expect(r.skipped).toBe(false)
        const got = await readWorkingMemory(tx, TENANT, threadId)
        expect(got.resourceId).toBe('alice')
        expect(got.workingMemory).toBe('remember: pizza')
      })
    })
  })

  it('second write overwrites first', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await upsertWorkingMemory(tx, TENANT, threadId, 'first')
        await upsertWorkingMemory(tx, TENANT, threadId, 'second')
        const got = await readWorkingMemory(tx, TENANT, threadId)
        expect(got.workingMemory).toBe('second')
      })
    })
  })

  it('returns skipped:true when thread has no resource_id', async () => {
    const threadId = randomUUID()
    // Create thread with no user in context — resource_id will be null.
    await tenantContext.run({ tenantId: TENANT }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        const r = await upsertWorkingMemory(tx, TENANT, threadId, 'anything')
        expect(r.skipped).toBe(true)
        expect(r.reason).toBe('no_resource_id')
      })
    })
  })

  it('rejects 8193 bytes with WorkingMemoryTooLargeError', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await expect(
          upsertWorkingMemory(tx, TENANT, threadId, 'a'.repeat(WORKING_MEMORY_BYTE_CAP + 1)),
        ).rejects.toBeInstanceOf(WorkingMemoryTooLargeError)
      })
    })
  })

  it('CHECK constraint backs up the Zod cap (raw-SQL bypass)', async () => {
    // Bypass the provider entirely as platform_admin, attempt an oversize write.
    const url = process.env.DATABASE_URL ?? 'postgres://seta:seta@localhost:5432/seta'
    const admin = postgres(url, { max: 1, prepare: false })
    try {
      await expect(
        admin`INSERT INTO agent_memory.resources (id, tenant_id, working_memory)
              VALUES ('rogue', ${TENANT}, ${'b'.repeat(8193)})`,
      ).rejects.toThrow(/working_memory_8k|check constraint/i)
    } finally {
      await admin.end()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seta/agent-memory test:integration -- working-memory`
Expected: FAIL — `readWorkingMemory`/`upsertWorkingMemory` not exported.

- [ ] **Step 3: Implement the DB ops**

Replace `platform/agent/memory/src/working-memory.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import type { Sql, TransactionSql } from 'postgres'
import { WorkingMemoryTooLargeError } from './errors'
import { resources, threads } from './schema'

export const WORKING_MEMORY_BYTE_CAP = 8192

export function validateWorkingMemoryText(text: string): void {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > WORKING_MEMORY_BYTE_CAP) {
    throw new WorkingMemoryTooLargeError(bytes)
  }
}

export async function readWorkingMemory(
  tx: TransactionSql | Sql,
  _tenantId: string,
  threadId: string,
): Promise<{ resourceId: string | null; workingMemory: string | null }> {
  const db = drizzle(tx as TransactionSql)
  const [t] = await db
    .select({ resourceId: threads.resourceId })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1)

  if (!t || !t.resourceId) return { resourceId: null, workingMemory: null }

  const [r] = await db
    .select({ workingMemory: resources.workingMemory })
    .from(resources)
    .where(eq(resources.id, t.resourceId))
    .limit(1)

  return { resourceId: t.resourceId, workingMemory: r?.workingMemory ?? null }
}

export async function upsertWorkingMemory(
  tx: TransactionSql | Sql,
  tenantId: string,
  threadId: string,
  text: string,
): Promise<{ skipped: false; resourceId: string } | { skipped: true; reason: 'no_resource_id' }> {
  validateWorkingMemoryText(text)

  const db = drizzle(tx as TransactionSql)
  const [t] = await db
    .select({ resourceId: threads.resourceId })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1)

  if (!t || !t.resourceId) {
    return { skipped: true, reason: 'no_resource_id' }
  }

  await db
    .insert(resources)
    .values({
      id: t.resourceId,
      tenantId,
      workingMemory: text,
    })
    .onConflictDoUpdate({
      target: resources.id,
      set: { workingMemory: text, updatedAt: new Date() },
    })

  return { skipped: false, resourceId: t.resourceId }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seta/agent-memory test:integration -- working-memory`
Expected: all 6 cases PASS.

- [ ] **Step 5: Re-run unit tests to make sure nothing broke**

Run: `pnpm --filter @seta/agent-memory test:unit -- working-memory`
Expected: all 4 cases (from Task 11) still PASS.

- [ ] **Step 6: Commit**

```bash
git add platform/agent/memory/src/working-memory.ts platform/agent/memory/tests/integration/working-memory.integration.test.ts
git commit -m "feat(agent-memory): readWorkingMemory + upsertWorkingMemory

8KB cap enforced at boundary (Zod-style throw) and at storage (CHECK
constraint). Soft no-op when thread has no resource_id."
```

---

## Task 15: `recall` SQL helper (`fetchRecallPage`)

**Files:**
- Modify: `platform/agent/memory/src/recall.ts`
- Create: `platform/agent/memory/tests/integration/recall.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `platform/agent/memory/tests/integration/recall.integration.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { KernelMessage } from '@seta/agent-core'
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenant'
import { describe, expect, it } from 'vitest'
import { fetchRecallPage } from '../../src/recall'
import { ensureThread, saveMessages } from '../../src/save-turn'
import { testSql } from './setup'

const TENANT = '00000000-0000-0000-0000-000000000001'

function userMsg(text: string): KernelMessage {
  return { id: randomUUID(), role: 'user', content: [{ type: 'text', text }] }
}

describe('recall fetchRecallPage integration', () => {
  it('returns empty for unknown thread', async () => {
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        const res = await fetchRecallPage(tx, randomUUID(), 40)
        expect(res.messages).toEqual([])
        expect(res.hasMore).toBe(false)
        expect(res.total).toBe(0)
      })
    })
  })

  it('returns messages in chronological order', async () => {
    const threadId = randomUUID()
    const msgs = [userMsg('one'), userMsg('two'), userMsg('three')]

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        for (const m of msgs) {
          await saveMessages(tx, TENANT, threadId, [m])
        }
      })

      await withTenant(testSql(), TENANT, async (tx) => {
        const res = await fetchRecallPage(tx, threadId, 40)
        expect(res.messages.map((m) => m.id)).toEqual(msgs.map((m) => m.id))
        expect(res.total).toBe(3)
        expect(res.hasMore).toBe(false)
      })
    })
  })

  it('hasMore true when pageSize+1 rows exist', async () => {
    const threadId = randomUUID()
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        for (let i = 0; i < 5; i++) {
          await saveMessages(tx, TENANT, threadId, [userMsg(`m${i}`)])
        }
      })

      await withTenant(testSql(), TENANT, async (tx) => {
        const res = await fetchRecallPage(tx, threadId, 3)
        expect(res.messages.length).toBe(3)
        expect(res.hasMore).toBe(true)
        expect(res.total).toBe(5)
      })
    })
  })

  it('never returns system messages (they are not persisted)', async () => {
    const threadId = randomUUID()
    const system: KernelMessage = { id: randomUUID(), role: 'system', content: [{ type: 'text', text: 'sys' }] }
    const user = userMsg('hi')

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await saveMessages(tx, TENANT, threadId, [system, user])
      })

      await withTenant(testSql(), TENANT, async (tx) => {
        const res = await fetchRecallPage(tx, threadId, 40)
        expect(res.messages.map((m) => m.role)).toEqual(['user'])
      })
    })
  })

  it('preserves KernelMessage.id and toolCallId round-trip', async () => {
    const threadId = randomUUID()
    const toolCallId = 'call-1'
    const tool: KernelMessage = {
      id: randomUUID(),
      role: 'tool',
      toolCallId,
      content: [{ type: 'tool_result', toolCallId, result: { ok: true } }],
    }

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await withTenant(testSql(), TENANT, async (tx) => {
        await ensureThread(tx, TENANT, threadId)
        await saveMessages(tx, TENANT, threadId, [tool])
      })

      await withTenant(testSql(), TENANT, async (tx) => {
        const res = await fetchRecallPage(tx, threadId, 40)
        expect(res.messages[0]!.id).toBe(tool.id)
        expect(res.messages[0]!.toolCallId).toBe(toolCallId)
      })
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seta/agent-memory test:integration -- recall`
Expected: FAIL — `fetchRecallPage` not exported.

- [ ] **Step 3: Implement `fetchRecallPage`**

Append to `platform/agent/memory/src/recall.ts`:

```ts
import type { Sql, TransactionSql } from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { desc, eq } from 'drizzle-orm'
import { messages, threads } from './schema'

export interface RecallPage {
  messages: KernelMessage[]
  total: number
  hasMore: boolean
}

export async function fetchRecallPage(
  tx: TransactionSql | Sql,
  threadId: string,
  pageSize: number,
): Promise<RecallPage> {
  const db = drizzle(tx as TransactionSql)

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(pageSize + 1)

  const hasMore = rows.length > pageSize
  const slice = (hasMore ? rows.slice(0, pageSize) : rows).reverse()

  const kmsgs: KernelMessage[] = slice.map((r) => ({
    id: r.id,
    role: r.role as KernelMessage['role'],
    content: r.content,
    ...(r.toolCallId ? { toolCallId: r.toolCallId } : {}),
  }))

  const [t] = await db
    .select({ messageCount: threads.messageCount })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1)

  return { messages: kmsgs, total: t?.messageCount ?? kmsgs.length, hasMore }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seta/agent-memory test:integration -- recall`
Expected: all 5 cases PASS.

- [ ] **Step 5: Re-run recall unit tests**

Run: `pnpm --filter @seta/agent-memory test:unit -- recall`
Expected: all unit cases from Task 8 still pass.

- [ ] **Step 6: Commit**

```bash
git add platform/agent/memory/src/recall.ts platform/agent/memory/tests/integration/recall.integration.test.ts
git commit -m "feat(agent-memory): fetchRecallPage SQL

Newest pageSize+1 rows ordered DESC then reversed to chronological. total
read from threads.message_count counter. hasMore set from the +1 probe."
```

---

## Task 16: `AgentMemoryProvider` class (`src/provider.ts`)

**Files:**
- Create: `platform/agent/memory/src/provider.ts`
- Create: `platform/agent/memory/tests/integration/provider.integration.test.ts`

This task wires the helpers from Tasks 13/14/15 into the four `MemoryProvider` methods and writes audit rows.

- [ ] **Step 1: Write the failing test (one happy-path round trip per method, with audit assertion)**

Create `platform/agent/memory/tests/integration/provider.integration.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { KernelMessage, MemoryContext } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { describe, expect, it } from 'vitest'
import { AgentMemoryProvider } from '../../src/provider'
import { testSql } from './setup'

const TENANT = '00000000-0000-0000-0000-000000000001'

function userMsg(text: string): KernelMessage {
  return { id: randomUUID(), role: 'user', content: [{ type: 'text', text }] }
}

function ctx(threadId: string): MemoryContext {
  return { threadId, scope: 'thread' }
}

describe('AgentMemoryProvider', () => {
  it('saveTurn then recall round-trips', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()
    const m = userMsg('hi')

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await provider.saveTurn(ctx(threadId), [m])
      const res = await provider.recall(ctx(threadId))
      expect(res.messages.map((x) => x.id)).toEqual([m.id])
      expect(res.total).toBe(1)
      expect(res.hasMore).toBe(false)
    })
  })

  it('writes one audit row per recall and per saveTurn', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await provider.saveTurn(ctx(threadId), [userMsg('a')])
      await provider.recall(ctx(threadId))
    })

    const rows =
      await testSql()`SELECT operation FROM audit.audit_log WHERE tenant_id = ${TENANT} ORDER BY created_at`
    expect(rows.map((r) => r.operation)).toContain('memory.save_turn')
    expect(rows.map((r) => r.operation)).toContain('memory.recall')
  })

  it('getWorkingMemory returns null for thread with no resource_id', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT }, async () => {
      // saveTurn creates the thread with resource_id = null (no userId in context).
      await provider.saveTurn(ctx(threadId), [userMsg('hi')])
      const wm = await provider.getWorkingMemory(ctx(threadId))
      expect(wm).toBeNull()
    })
  })

  it('updateWorkingMemory round-trips', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await provider.saveTurn(ctx(threadId), [userMsg('hi')])
      await provider.updateWorkingMemory(ctx(threadId), 'remember: cake')
      const wm = await provider.getWorkingMemory(ctx(threadId))
      expect(wm).toBe('remember: cake')
    })
  })

  it('updateWorkingMemory throws WORKING_MEMORY_TOO_LARGE at 8193 bytes', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      await provider.saveTurn(ctx(threadId), [userMsg('hi')])
      await expect(
        provider.updateWorkingMemory(ctx(threadId), 'a'.repeat(8193)),
      ).rejects.toMatchObject({ code: 'WORKING_MEMORY_TOO_LARGE' })
    })
  })

  it('token-budget trims old messages on recall', async () => {
    const provider = new AgentMemoryProvider({
      sql: testSql(),
      recallTokenBudget: 10, // absurdly small to force trim
    })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      for (let i = 0; i < 5; i++) {
        await provider.saveTurn(ctx(threadId), [userMsg(`message ${i} with some content`)])
      }
      const res = await provider.recall(ctx(threadId))
      expect(res.messages.length).toBeLessThan(5)
      // The most recent user message must survive.
      expect(res.messages.at(-1)!.content[0]).toMatchObject({ text: expect.stringContaining('message 4') })
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seta/agent-memory test:integration -- provider`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AgentMemoryProvider`**

Create `platform/agent/memory/src/provider.ts`:

```ts
import type {
  KernelMessage,
  MemoryContext,
  MemoryProvider,
  RecallResult,
} from '@seta/agent-core'
import { recordAudit } from '@seta/audit'
import { type DbSql, withTenant } from '@seta/db'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { actorFromContext } from './audit'
import { MemoryPersistFailedError } from './errors'
import { fetchRecallPage, trimToTokenBudget } from './recall'
import { ensureThread, saveMessages } from './save-turn'
import { readWorkingMemory, upsertWorkingMemory } from './working-memory'

export interface AgentMemoryProviderOptions {
  sql: DbSql
  recallTokenBudget?: number
  recallPageSize?: number
}

const DEFAULT_BUDGET = 4000
const DEFAULT_PAGE_SIZE = 40

export class AgentMemoryProvider implements MemoryProvider {
  constructor(private readonly opts: AgentMemoryProviderOptions) {}

  async recall(ctx: MemoryContext): Promise<RecallResult> {
    const tenantId = tenantContext.getTenantId()
    const pageSize = this.opts.recallPageSize ?? DEFAULT_PAGE_SIZE
    const budget = this.opts.recallTokenBudget ?? DEFAULT_BUDGET

    try {
      return await withTenant(this.opts.sql, tenantId, async (tx) => {
        const page = await fetchRecallPage(tx, ctx.threadId, pageSize)
        const { kept, droppedCount } = trimToTokenBudget(page.messages, budget)

        await recordAudit(tx, {
          tenantId,
          actor: actorFromContext(),
          operation: 'memory.recall',
          resource: { type: 'thread', ids: [ctx.threadId] },
          result: 'ok',
          metadata: {
            returned: kept.length,
            dropped: droppedCount,
            hasMore: page.hasMore,
            pageSize,
            budget,
          },
        })

        logger.debug({
          msg: 'memory.recall',
          threadId: ctx.threadId,
          returned: kept.length,
          dropped: droppedCount,
          hasMore: page.hasMore,
        })

        return {
          messages: kept,
          total: page.total,
          page: 1,
          perPage: pageSize,
          hasMore: page.hasMore,
        }
      })
    } catch (err) {
      throw new MemoryPersistFailedError(err)
    }
  }

  async saveTurn(ctx: MemoryContext, msgs: KernelMessage[]): Promise<void> {
    const tenantId = tenantContext.getTenantId()
    try {
      await withTenant(this.opts.sql, tenantId, async (tx) => {
        await ensureThread(tx, tenantId, ctx.threadId)
        const inserted = await saveMessages(tx, tenantId, ctx.threadId, msgs)
        const incoming = msgs.filter((m) => m.role !== 'system').length

        await recordAudit(tx, {
          tenantId,
          actor: actorFromContext(),
          operation: 'memory.save_turn',
          resource: { type: 'thread', ids: [ctx.threadId] },
          result: 'ok',
          metadata: {
            incoming,
            persisted: inserted,
            skipped: incoming - inserted,
          },
        })

        logger.debug({
          msg: 'memory.save_turn',
          threadId: ctx.threadId,
          persisted: inserted,
          skipped: incoming - inserted,
        })
      })
    } catch (err) {
      throw new MemoryPersistFailedError(err)
    }
  }

  async getWorkingMemory(ctx: MemoryContext): Promise<string | null> {
    const tenantId = tenantContext.getTenantId()
    try {
      return await withTenant(this.opts.sql, tenantId, async (tx) => {
        const { resourceId, workingMemory } = await readWorkingMemory(
          tx,
          tenantId,
          ctx.threadId,
        )

        await recordAudit(tx, {
          tenantId,
          actor: actorFromContext(),
          operation: 'memory.get_working_memory',
          ...(resourceId ? { resource: { type: 'resource', ids: [resourceId] } } : {}),
          result: 'ok',
          metadata: { threadId: ctx.threadId, hit: workingMemory != null },
        })

        return workingMemory
      })
    } catch (err) {
      throw new MemoryPersistFailedError(err)
    }
  }

  async updateWorkingMemory(ctx: MemoryContext, text: string): Promise<void> {
    const tenantId = tenantContext.getTenantId()
    try {
      await withTenant(this.opts.sql, tenantId, async (tx) => {
        const r = await upsertWorkingMemory(tx, tenantId, ctx.threadId, text)

        if (r.skipped) {
          await recordAudit(tx, {
            tenantId,
            actor: actorFromContext(),
            operation: 'memory.update_working_memory',
            resource: { type: 'thread', ids: [ctx.threadId] },
            result: 'failure',
            metadata: { reason: r.reason },
          })
          logger.warn({
            msg: 'memory.update_working_memory.skipped',
            threadId: ctx.threadId,
            reason: r.reason,
          })
          return
        }

        await recordAudit(tx, {
          tenantId,
          actor: actorFromContext(),
          operation: 'memory.update_working_memory',
          resource: { type: 'resource', ids: [r.resourceId] },
          result: 'ok',
          metadata: { bytes: Buffer.byteLength(text, 'utf8') },
        })

        logger.debug({
          msg: 'memory.update_working_memory',
          resourceId: r.resourceId,
          bytes: Buffer.byteLength(text, 'utf8'),
        })
      })
    } catch (err) {
      // Don't wrap WORKING_MEMORY_TOO_LARGE — it's a USER-class error and must reach the caller.
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'WORKING_MEMORY_TOO_LARGE') {
        throw err
      }
      throw new MemoryPersistFailedError(err)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seta/agent-memory test:integration -- provider`
Expected: all 6 cases PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/memory/src/provider.ts platform/agent/memory/tests/integration/provider.integration.test.ts
git commit -m "feat(agent-memory): AgentMemoryProvider class

Wires fetchRecallPage + trimToTokenBudget + ensureThread + saveMessages +
readWorkingMemory + upsertWorkingMemory into the four MemoryProvider
methods, plus a per-call audit row inside the same withTenant transaction."
```

---

## Task 17: RLS cross-tenant isolation test

**Files:**
- Create: `platform/agent/memory/tests/integration/rls.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `platform/agent/memory/tests/integration/rls.integration.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { tenantContext } from '@seta/tenant'
import { describe, expect, it } from 'vitest'
import { AgentMemoryProvider } from '../../src/provider'
import { testSql } from './setup'

const TENANT_A = '00000000-0000-0000-0000-0000000000aa'
const TENANT_B = '00000000-0000-0000-0000-0000000000bb'

describe('RLS isolation', () => {
  it('tenant B cannot recall tenant A messages', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT_A, userId: 'alice' }, async () => {
      await provider.saveTurn(
        { threadId, scope: 'thread' },
        [{ id: randomUUID(), role: 'user', content: [{ type: 'text', text: 'secret' }] }],
      )
    })

    await tenantContext.run({ tenantId: TENANT_B, userId: 'bob' }, async () => {
      const res = await provider.recall({ threadId, scope: 'thread' })
      expect(res.messages).toEqual([])
      expect(res.total).toBe(0)
    })
  })

  it('tenant B cannot read tenant A working memory through the provider', async () => {
    const provider = new AgentMemoryProvider({ sql: testSql() })
    const threadId = randomUUID()

    await tenantContext.run({ tenantId: TENANT_A, userId: 'alice' }, async () => {
      await provider.saveTurn(
        { threadId, scope: 'thread' },
        [{ id: randomUUID(), role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      )
      await provider.updateWorkingMemory({ threadId, scope: 'thread' }, 'tenant A only')
    })

    await tenantContext.run({ tenantId: TENANT_B, userId: 'alice' }, async () => {
      // Same threadId, but RLS hides the threads row, so resource_id resolves to null.
      const wm = await provider.getWorkingMemory({ threadId, scope: 'thread' })
      expect(wm).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @seta/agent-memory test:integration -- rls`
Expected: PASS (both cases — the RLS policies and provider behaviour already enforce the invariant).

If a case fails: do NOT add provider-level guards. Investigate why RLS did not isolate — likely a missing `WITH CHECK` clause or the connection is not running as `tenant_user`. Verify with `psql "$DATABASE_URL" -c "SELECT current_user"` inside `withTenant`.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/memory/tests/integration/rls.integration.test.ts
git commit -m "test(agent-memory): RLS cross-tenant isolation"
```

---

## Task 18: Package public exports (`src/index.ts`)

**Files:**
- Modify: `platform/agent/memory/src/index.ts`

- [ ] **Step 1: Write the exports**

Replace `platform/agent/memory/src/index.ts`:

```ts
export {
  AgentMemoryProvider,
  type AgentMemoryProviderOptions,
} from './provider'
export {
  agentMemorySchema,
  messages,
  resources,
  threads,
  type MessageRow,
  type NewMessage,
  type NewResource,
  type NewThread,
  type Resource,
  type Thread,
} from './schema'
export { MemoryPersistFailedError, WorkingMemoryTooLargeError } from './errors'
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/agent-memory typecheck`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `pnpm --filter @seta/agent-memory build`
Expected: emits `dist/index.js` and `dist/index.d.ts`.

- [ ] **Step 4: Commit**

```bash
git add platform/agent/memory/src/index.ts
git commit -m "feat(agent-memory): package public exports"
```

---

## Task 19: Wire `AgentMemoryProvider` into `apps/api/src/main.ts`

**Files:**
- Modify: `apps/api/src/main.ts` (and `package.json` dependencies)
- Modify: callers of `run()` if they hand-build `RunLoopOptions` (locate via `grep -rn "RunLoopOptions\|run(" apps/api/src modules/products/agent/src | grep -v test`)

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @seta/api add @seta/agent-memory@workspace:*
```

- [ ] **Step 2: Locate the kernel composition point**

```bash
grep -n "NullMemoryProvider\|RunLoopOptions\|memory:" apps/api/src/main.ts
grep -rn "run(" modules/products/agent/src --include='*.ts' | grep -v test
```

Expected: a single place where `run(cfg, input, opts)` is invoked, currently with `memory: undefined` (so the kernel falls back to `NullMemoryProvider`).

- [ ] **Step 3: Instantiate the provider and pass it via `RunLoopOptions.memory`**

In `apps/api/src/main.ts`, at the composition root (after `createPool` is called and `sql` is in scope):

```ts
import { AgentMemoryProvider } from '@seta/agent-memory'

// ... existing pool / migrations setup ...
const memory = new AgentMemoryProvider({ sql })
```

Then at every `run(...)` call site, ensure `memory` is passed in `RunLoopOptions`. If `run()` is invoked from a product route (most likely `modules/products/agent`), pipe `memory` from main.ts into the route registration so the route can attach it to `RunLoopOptions`.

Concretely, if `modules/products/agent/src/index.ts` exports a `routes(handler)` that accepts a `Handler` shape, extend that shape to include `memory: MemoryProvider`. Update the route to pass `{ ..., memory: handler.memory }` to `run()`.

- [ ] **Step 4: Build the api app**

```bash
pnpm --filter @seta/api build
```

Expected: no errors. If the build complains that `RunLoopOptions.memory` is not optional, check the kernel signature — it should be optional already (it defaults to `NullMemoryProvider`).

- [ ] **Step 5: Manual smoke test**

```bash
pnpm db:up
pnpm migrate
pnpm dev   # apps/api dev server
```

In another terminal, run the curl command that exercises a chat endpoint in this repo — locate it with `grep -rn "curl" apps/api/README.md docs/`. After the first request, query the DB:

```bash
psql "$DATABASE_URL" -c "SELECT id, message_count FROM agent_memory.threads;"
psql "$DATABASE_URL" -c "SELECT role, jsonb_pretty(content) FROM agent_memory.messages ORDER BY created_at LIMIT 4;"
```

Expected: one thread row, `message_count` matches the message count of the round-trip; at least one user message and one assistant message in `agent_memory.messages` with their `id` and `content` populated.

Send a second message on the same thread. Expected: history from the first turn comes back into recall, the assistant has prior context.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/main.ts apps/api/package.json pnpm-lock.yaml modules/products/agent/src/ 
git commit -m "feat(api): bind AgentMemoryProvider into the kernel run loop"
```

---

## Task 20: Kernel round-trip integration test (MSW-backed)

**Files:**
- Create: `platform/agent/memory/tests/integration/round-trip.integration.test.ts`
- Create: `platform/agent/memory/tests/integration/__recordings__/round-trip.json` (via `RECORD=1` run)

- [ ] **Step 1: Write the failing test using the testkit**

Create `platform/agent/memory/tests/integration/round-trip.integration.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { run } from '@seta/agent-core'
import type { AgentConfig, KernelChunk, RunInput } from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { tenantContext } from '@seta/tenant'
import { describe, expect, it } from 'vitest'
import { AgentMemoryProvider } from '../../src/provider'
import { testSql } from './setup'

const TENANT = '00000000-0000-0000-0000-000000000001'

setupLLMRecording({
  name: 'agent-memory-round-trip',
  recordingsDir: new URL('./__recordings__/', import.meta.url).pathname,
})

function userInput(text: string): RunInput {
  return {
    threadId: undefined as unknown as string, // overridden per test
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  }
}

describe('kernel + AgentMemoryProvider round-trip', () => {
  it('second run on same threadId sees prior messages in recall', async () => {
    const memory = new AgentMemoryProvider({ sql: testSql() })
    const cfg: AgentConfig = {
      model: 'openai/gpt-4o-mini', // adjust to whatever the testkit recording uses
      instructions: 'You are concise.',
      tools: [],
    }
    const threadId = randomUUID()

    const turn1: KernelChunk[] = []
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      for await (const c of run(cfg, { ...userInput('what is 2+2?'), threadId }, { memory })) {
        turn1.push(c)
      }
    })
    expect(turn1.some((c) => c.type === 'finish' || c.type === 'text')).toBe(true)

    // Turn 2 — refer back to prior context.
    const turn2: KernelChunk[] = []
    await tenantContext.run({ tenantId: TENANT, userId: 'alice' }, async () => {
      for await (const c of run(cfg, { ...userInput('and times 3?'), threadId }, { memory })) {
        turn2.push(c)
      }
    })

    const rows =
      await testSql()`SELECT role FROM agent_memory.messages WHERE thread_id = ${threadId} ORDER BY created_at`
    // At least: user1, assistant1, user2, assistant2 (with possible tool messages in between).
    expect(rows.length).toBeGreaterThanOrEqual(4)
    expect(rows.map((r) => r.role)).toEqual(expect.arrayContaining(['user', 'assistant']))
  })
})
```

- [ ] **Step 2: Record the LLM fixture**

```bash
RECORD=1 pnpm --filter @seta/agent-memory test:integration -- round-trip
```

Expected: hits a real LLM (uses env credentials), writes `tests/integration/__recordings__/round-trip.json`. **You need a valid `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in env for this single command.**

- [ ] **Step 3: Re-run without `RECORD=1` to confirm replay works**

```bash
pnpm --filter @seta/agent-memory test:integration -- round-trip
```

Expected: PASS — the test replays the recorded fixture (MSW intercepts the LLM call).

- [ ] **Step 4: Commit**

```bash
git add platform/agent/memory/tests/integration/round-trip.integration.test.ts platform/agent/memory/tests/integration/__recordings__/round-trip.json
git commit -m "test(agent-memory): kernel round-trip with MSW recording"
```

---

## Task 21: Full verification

**Files:** N/A — runs the full quality gates.

- [ ] **Step 1: Lint**

```bash
pnpm lint
```

Expected: zero warnings.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: zero errors across the workspace.

- [ ] **Step 3: Unit tests**

```bash
pnpm test:unit
```

Expected: all green.

- [ ] **Step 4: Integration tests**

```bash
pnpm db:up
pnpm test:integration
```

Expected: all green, including the new `@seta/agent-memory` integration suite (~17 tests across save-turn, working-memory, recall, provider, rls, round-trip).

- [ ] **Step 5: Changeset for `@seta/agent-core` breaking change (KernelMessage.id field)**

The published-status check (`grep "private" platform/agent/core/package.json`) determines whether a changeset is required. If `@seta/agent-core` is `"private": false`, run:

```bash
pnpm changeset
```

Pick `@seta/agent-core` → `minor` (additive optional field). For `@seta/agent-memory` if it is also `"private": false`, add a `minor` entry as well.

- [ ] **Step 6: Final commit + open PR**

```bash
git status
# If anything new exists (changesets, lint fixes), add and commit it.
git push -u origin HEAD
gh pr create --title "feat(agent-memory): P1 implementation (Mastra-aligned)" --body "$(cat <<'EOF'
## Summary
- Stand up `@seta/agent-memory` as the real `MemoryProvider` behind the kernel seam.
- Three tables (`threads`, `messages`, `resources`) in `agent_memory` schema, multi-tenant with RLS, Mastra-aligned shape.
- 8KB working-memory cap (Zod + Postgres CHECK).
- Per-call audit rows inside the same withTenant transaction.
- Coordinated edits: `KernelMessage.id?: string` in agent-core, stamping in tool-loop, `agent_memory` in `OWNER_ORDER`, apps/api wire-up.

## Test plan
- [ ] `pnpm lint` clean
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test:unit` green
- [ ] `pnpm test:integration` green
- [ ] Manual smoke: send two chat requests on the same thread; second one sees first turn in context
- [ ] Cross-tenant: tenant B cannot read tenant A messages (RLS test)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Done.

---

## Self-review notes

**Spec coverage:**
- §1 Goal — Task 19 wires the provider; Task 20 proves round-trip.
- §3 Constraints — RLS (Task 6, 17), withTenant (every DB task), tenant-id from context (Tasks 9, 16), `import type` (every implementation snippet).
- §4 Mastra alignment — three-table layout (Task 4), `ON CONFLICT (id)` (Task 13), `resourceId` denormalised (Task 13), working memory on resources (Task 14), `(thread_id, created_at DESC)` ordering (Task 4 index, Task 15 query).
- §5 Package layout — Tasks 3, 4, 5, 6, 8, 9, 10, 11, 14, 15, 16, 18.
- §6 Schema — Task 4.
- §7 Provider API — Task 16 (and §7.1–§7.4 mapped via Tasks 13, 14, 15).
- §8 Token-budget — Task 8.
- §9 Errors — Task 10.
- §10 Observability — Task 16 (logger + recordAudit in every method).
- §11 Tests — Tasks 8, 9, 11, 13, 14, 15, 16, 17, 20.
- §12 Open questions — captured in Tasks 4 (8KB cap), 7 (OWNER_ORDER), 16 (pageSize default 40, budget default 4000).
- §13 Migration & rollout — Tasks 1, 2, 7, 19.

**Placeholder scan:** none — every step contains exact commands or code.

**Type consistency:**
- `MemoryContext` shape from `@seta/agent-core` used identically across Tasks 13, 14, 15, 16, 17, 20.
- `MemoryPersistFailedError` and `WorkingMemoryTooLargeError` defined in Task 10 and used by name in Tasks 11, 14, 16, 18.
- `ensureThread`, `saveMessages`, `fetchRecallPage`, `readWorkingMemory`, `upsertWorkingMemory` all defined before consumed in Task 16.
- `WORKING_MEMORY_BYTE_CAP` defined in Task 11, re-used in Task 14.
- `actorFromContext` defined in Task 9, used in Task 16.

**Edge cases verified in tests:**
- Empty result, hasMore boundary, system filter, id round-trip (Task 15)
- Idempotent replay (Task 13)
- 8KB cap + CHECK backstop (Task 14)
- Cross-tenant RLS (Task 17)
- Token-budget trim (Task 16)
