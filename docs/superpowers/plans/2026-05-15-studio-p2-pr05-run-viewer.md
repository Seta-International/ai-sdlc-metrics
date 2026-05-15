# PR-5: Run Viewer Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the agent-run viewer end-to-end: createRunAdminRoutes (list + detail + SSE stream), SDK methods, Studio /runs list with 5s refetch, and /runs/:runId timeline with TokenUsageBar.

**Architecture:** @seta/agent-server exposes createRunAdminRoutes (cursor-paginated list, single-run detail, /runs/:runId/stream replays historical KernelChunks for completed/failed runs and uses streamKernelSSE for in-flight ones). apps/api gets a 1-line composition diff. Studio consumes via useAgentRun(runId) hook with AbortController cleanup.

**Tech Stack:** Hono, @hono/zod-openapi, Zod 4.4.3, @seta/agent-core (streamKernelSSE), @seta/agent-sdk (parseSseStream + KernelChunk), TanStack Query (refetchInterval), TanStack Router, @seta/ui (DataTable, Timeline, TimelineEvent, TokenUsageBar, Code, StatusBadge).

---

## Pre-flight context

Before starting, re-read for fresh state:

- `/Users/canh/Projects/Seta/seta-os/CLAUDE.md` (working rules, boundaries, schema-driven, footguns).
- `/Users/canh/Projects/Seta/seta-os/docs/superpowers/specs/2026-05-15-studio-p2-master-plan.md` §7 (route-ownership pattern) and §9 (this PR).
- `/Users/canh/Projects/Seta/seta-os/platform/agent/server/src/routes.ts` (existing `createAgentRouter` pattern — `streamKernelSSE(c, run(...))` + `tenantContext.getTenantId()`).
- `/Users/canh/Projects/Seta/seta-os/platform/agent/core/src/types/chunk.ts` (`KernelChunk` union) + `/Users/canh/Projects/Seta/seta-os/platform/agent/core/src/types/run.ts` (`RunStatus`, `Run`).
- `/Users/canh/Projects/Seta/seta-os/platform/agent/core/src/sse/stream-kernel-sse.ts` (`streamKernelSSE` signature, keepalive, onAbort).
- `/Users/canh/Projects/Seta/seta-os/platform/agent/memory/src/schema.ts` (`agent_memory` Drizzle schema + RLS pattern — `agent_memory.threads`, `agent_memory.messages`, `agent_memory.resources`).
- `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/client/AgentClient.ts` (existing `streamRun` returns `Promise<Response>`, `getMe` request shape).
- `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/sse/__fixtures__/run-success.sse` + `run-error.sse` (SSE fixture format).
- `/Users/canh/Projects/Seta/seta-os/platform/ui/src/hooks/useAgentRun.ts` (existing hook — consumed unchanged).
- `/Users/canh/Projects/Seta/seta-os/platform/ui/src/components/data/Timeline.tsx` + `TimelineEvent.tsx` + `TokenUsageBar.tsx` + `Code.tsx` (already wire `KernelChunk` → variants + expandable Code block).

**Key invariants:**

- No persisted `runs` table exists yet. `@seta/agent-memory` owns `agent_memory.{threads, messages, resources}`. This PR ADDS `agent_memory.runs` + `agent_memory.run_chunks` via `drizzle-kit generate` (schema-per-module DDD). No hand-edited SQL.
- Tenant scope read with `tenantContext.getTenantId()` — never accept `tenantId` as a function arg in route handlers. RLS (`app.tenant_id` SET LOCAL) is the backstop.
- `@hono/zod-openapi` `z` only (not `zod`) inside route definitions.
- One commit per Conventional-Commit scope per logical unit. Changeset required for every published-package change.

---

## Phase 1 — `@seta/agent-memory`: persist runs + chunks (TDD)

The viewer needs a SOR for runs. Today the kernel iterates `KernelChunk` and saves the resulting messages, but never writes a run row. This phase adds the storage seam, scoped to `@seta/agent-memory` (the existing schema owner).

- [ ] **1.1** Read `/Users/canh/Projects/Seta/seta-os/platform/agent/memory/src/schema.ts` and `/Users/canh/Projects/Seta/seta-os/platform/agent/memory/drizzle.config.ts`. Confirm `agentMemorySchema = pgSchema('agent_memory')` and the `tenantUser` RLS pattern reused by `threads` / `messages` / `resources`.

- [ ] **1.2** Add a failing schema test at `/Users/canh/Projects/Seta/seta-os/platform/agent/memory/src/runs.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { runChunks, runs } from './runs'

  describe('agent_memory.runs schema', () => {
    it('runs table has tenant_id, status, agent_id, thread_id, started_at, finished_at, token_usage', () => {
      const cols = Object.keys(runs)
      for (const k of ['id', 'tenantId', 'status', 'agentId', 'threadId', 'startedAt', 'finishedAt', 'tokenUsage']) {
        expect(cols).toContain(k)
      }
    })

    it('run_chunks table has (run_id, seq) composite PK + chunk jsonb + ts', () => {
      const cols = Object.keys(runChunks)
      for (const k of ['runId', 'seq', 'tenantId', 'chunk', 'ts']) {
        expect(cols).toContain(k)
      }
    })
  })
  ```

- [ ] **1.3** Create `/Users/canh/Projects/Seta/seta-os/platform/agent/memory/src/runs.ts` defining Drizzle tables:

  ```ts
  import { tenantUser } from '@seta/db'
  import { sql } from 'drizzle-orm'
  import {
    bigint,
    index,
    integer,
    jsonb,
    pgPolicy,
    primaryKey,
    text,
    timestamp,
    uuid,
  } from 'drizzle-orm/pg-core'
  import { agentMemorySchema } from './schema'

  export const runs = agentMemorySchema.table(
    'runs',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      tenantId: uuid('tenant_id').notNull(),
      agentId: text('agent_id'),
      threadId: uuid('thread_id'),
      status: text('status').notNull().default('running'),
      startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
      finishedAt: timestamp('finished_at', { withTimezone: true }),
      durationMs: integer('duration_ms'),
      tokenUsage: jsonb('token_usage').$type<{
        inputTokens: number
        outputTokens: number
        cacheReadInputTokens?: number
        cacheCreationInputTokens?: number
      }>(),
      errorCode: text('error_code'),
    },
    (t) => [
      index('runs_tenant_started_idx').on(t.tenantId, t.startedAt.desc(), t.id),
      index('runs_tenant_status_idx').on(t.tenantId, t.status),
      pgPolicy('tenant_isolation_runs', {
        as: 'permissive',
        to: tenantUser,
        for: 'all',
        using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
        withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      }),
    ],
  )

  export const runChunks = agentMemorySchema.table(
    'run_chunks',
    {
      runId: uuid('run_id').notNull(),
      seq: bigint('seq', { mode: 'number' }).notNull(),
      tenantId: uuid('tenant_id').notNull(),
      chunk: jsonb('chunk').notNull().$type<unknown>(),
      ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.runId, t.seq] }),
      index('run_chunks_tenant_run_seq_idx').on(t.tenantId, t.runId, t.seq),
      pgPolicy('tenant_isolation_run_chunks', {
        as: 'permissive',
        to: tenantUser,
        for: 'all',
        using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
        withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      }),
    ],
  )

  export type RunRow = typeof runs.$inferSelect
  export type NewRunRow = typeof runs.$inferInsert
  export type RunChunkRow = typeof runChunks.$inferSelect
  export type NewRunChunkRow = typeof runChunks.$inferInsert
  ```

- [ ] **1.4** Add exports in `/Users/canh/Projects/Seta/seta-os/platform/agent/memory/src/index.ts`:

  ```ts
  export {
    type NewRunChunkRow,
    type NewRunRow,
    type RunChunkRow,
    runChunks,
    type RunRow,
    runs,
  } from './runs'
  ```

- [ ] **1.5** Run `pnpm vitest run platform/agent/memory/src/runs.test.ts` — confirm green.

- [ ] **1.6** Generate the migration via CLI (never hand-edit):

  ```sh
  pnpm --filter @seta/agent-memory exec drizzle-kit generate --name add_runs
  ```

  Verify the generated SQL in `/Users/canh/Projects/Seta/seta-os/platform/agent/memory/migrations/` includes `CREATE TABLE "agent_memory"."runs"`, `CREATE TABLE "agent_memory"."run_chunks"`, `CREATE POLICY "tenant_isolation_runs"`, `CREATE POLICY "tenant_isolation_run_chunks"`, and the two indices. Do not edit the file.

- [ ] **1.7** Add a failing CRUD/recorder test at `/Users/canh/Projects/Seta/seta-os/platform/agent/memory/tests/integration/run-recorder.test.ts` (real Postgres):

  ```ts
  import { withTestTenant } from '@seta/db/testing'
  import { describe, expect, it } from 'vitest'
  import { createRunRecorder } from '../../src/run-recorder'

  describe('createRunRecorder (integration)', () => {
    it('starts a run, records chunks in order, marks completed with usage', async () => {
      await withTestTenant(async ({ sql, tenantId }) => {
        const rec = createRunRecorder(sql)
        const runId = await rec.start({ tenantId, agentId: 'planner', threadId: null })
        await rec.append(runId, { type: 'text', delta: 'hi' })
        await rec.append(runId, {
          type: 'finish',
          reason: 'stop',
          usage: { inputTokens: 5, outputTokens: 1 },
        })
        await rec.finish(runId, { status: 'completed' })

        const detail = await rec.getRun(runId)
        expect(detail.status).toBe('completed')
        expect(detail.tokenUsage).toEqual({ inputTokens: 5, outputTokens: 1 })
        expect(detail.chunks.map((c) => c.type)).toEqual(['text', 'finish'])
      })
    })

    it('cursor list returns rows DESC by (started_at, id) with stable nextCursor', async () => {
      await withTestTenant(async ({ sql, tenantId }) => {
        const rec = createRunRecorder(sql)
        for (let i = 0; i < 3; i++) {
          const id = await rec.start({ tenantId, agentId: 'planner', threadId: null })
          await rec.finish(id, { status: 'completed' })
        }
        const page1 = await rec.list({ limit: 2 })
        expect(page1.items.length).toBe(2)
        expect(page1.nextCursor).toBeDefined()
        const page2 = await rec.list({ limit: 2, cursor: page1.nextCursor })
        expect(page2.items.length).toBe(1)
        expect(page2.nextCursor).toBeUndefined()
      })
    })
  })
  ```

- [ ] **1.8** Implement `/Users/canh/Projects/Seta/seta-os/platform/agent/memory/src/run-recorder.ts` exposing `createRunRecorder(sql)` with methods:

  - `start({ tenantId, agentId, threadId }) => Promise<string>` — inserts a row with status='running'.
  - `append(runId, chunk: KernelChunk) => Promise<void>` — inserts into `run_chunks` with monotonically increasing `seq` (use a transactional `SELECT COALESCE(MAX(seq), -1) + 1 FROM agent_memory.run_chunks WHERE run_id = ${runId}` or a sequence; for now a select-then-insert inside a tx is fine, RLS-scoped).
  - `finish(runId, { status: 'completed' | 'failed', errorCode?: string }) => Promise<void>` — sets `finished_at = now()`, `duration_ms`, status, persists last-seen `token_usage` from chunks.
  - `getRun(runId) => Promise<RunDetail>` — joins `runs` + ordered `run_chunks`.
  - `list({ status?, since?, limit?, cursor? }) => Promise<{ items: RunSummary[]; nextCursor?: string }>` — DESC `(started_at, id)`; cursor encodes `${startedAtIso}|${id}` base64.

  Use the Drizzle builder (`db.select().from(runs).where(...)`) per CLAUDE.md "Drizzle builder over raw SQL". The `sql` template is fine for the seq computation only if a builder expression won't compile.

  Export `RunSummary` + `RunDetail` types co-located here so `@seta/agent-server` re-derives them.

- [ ] **1.9** Export `createRunRecorder` + `RunSummary` + `RunDetail` from `/Users/canh/Projects/Seta/seta-os/platform/agent/memory/src/index.ts`.

- [ ] **1.10** Run `pnpm vitest run platform/agent/memory` and `pnpm --filter @seta/agent-memory test:integration` — green.

- [ ] **1.11** `pnpm changeset` — minor bump for `@seta/agent-memory`. Note: "adds `agent_memory.runs` + `agent_memory.run_chunks` + `createRunRecorder`".

- [ ] **1.12** Commit: `feat(agent-memory): add runs + run_chunks schema and createRunRecorder`.

---

## Phase 2 — `@seta/agent-core`: persist chunks through the run loop

The run loop must record into the new storage so the viewer has data. Add an optional recorder to `RunLoopOptions` so persistence stays opt-in (Teams handler can opt in; tests can opt out).

- [ ] **2.1** Add a failing unit test at `/Users/canh/Projects/Seta/seta-os/platform/agent/core/src/run/run-recorder.test.ts` covering: every yielded chunk forwarded to `recorder.append`, `recorder.finish('completed')` on stop, `recorder.finish('failed', code)` on error, `recorder.finish('failed', 'ABORT')` on abort. Use an in-memory mock recorder.

- [ ] **2.2** Extend `RunLoopOptions` in `/Users/canh/Projects/Seta/seta-os/platform/agent/core/src/types/index.ts` with optional `recorder?: { runId: string; append(c: KernelChunk): Promise<void>; finish(opts: { status: 'completed' | 'failed'; errorCode?: string }): Promise<void> }`. Update `run.ts` to call `opts.recorder?.append(value)` for each yielded chunk and `opts.recorder?.finish(...)` in the appropriate branches.

- [ ] **2.3** `pnpm vitest run platform/agent/core` — green.

- [ ] **2.4** Wire recorder creation at the `createAgentRouter` `POST /agents/:agentId/run` entry point in `/Users/canh/Projects/Seta/seta-os/platform/agent/server/src/routes.ts`: before invoking `run(...)`, call `recorder.start(...)` to mint a `runId`, then pass `recorder` into `run(...)` via the new option. The kernel `runId` (`createRunCtx`) is internal; the recorder's row id is the public viewer key.

- [ ] **2.5** `pnpm changeset` — minor bump for `@seta/agent-core` and `@seta/agent-server`.

- [ ] **2.6** Commit: `feat(agent-core): forward run chunks to optional persistence recorder`.

---

## Phase 3 — `@seta/agent-server`: schemas + handlers (TDD)

- [ ] **3.1** Read existing imports in `/Users/canh/Projects/Seta/seta-os/platform/agent/server/src/routes.ts`. We'll add a sibling `src/run-admin-routes.ts` to keep `routes.ts` focused on the run-execute surface.

- [ ] **3.2** Create `/Users/canh/Projects/Seta/seta-os/platform/agent/server/src/run-admin-schema.ts`:

  ```ts
  import { z } from '@hono/zod-openapi'

  export const TokenUsage = z
    .object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      cacheReadInputTokens: z.number().int().nonnegative().optional(),
      cacheCreationInputTokens: z.number().int().nonnegative().optional(),
    })
    .openapi('TokenUsage')

  export const RunStatus = z.enum(['created', 'running', 'completed', 'failed']).openapi('RunStatus')

  export const RunSummary = z
    .object({
      id: z.string().uuid(),
      status: RunStatus,
      agentId: z.string().nullable(),
      threadId: z.string().uuid().nullable(),
      startedAt: z.string().datetime(),
      finishedAt: z.string().datetime().nullable(),
      durationMs: z.number().int().nonnegative().nullable(),
      tokenUsage: TokenUsage.nullable(),
      errorCode: z.string().nullable(),
    })
    .openapi('RunSummary')

  export const RunDetail = RunSummary.extend({
    tenantId: z.string().uuid(),
    chunks: z.array(z.unknown()),
    toolsUsed: z.array(z.string()),
  }).openapi('RunDetail')

  export const ListRunsQuery = z
    .object({
      status: RunStatus.optional(),
      since: z.string().datetime().optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    })
    .openapi('ListRunsQuery')

  export const ListRunsResponse = z
    .object({
      items: z.array(RunSummary),
      nextCursor: z.string().optional(),
    })
    .openapi('ListRunsResponse')

  export type RunSummary = z.infer<typeof RunSummary>
  export type RunDetail = z.infer<typeof RunDetail>
  export type ListRunsQuery = z.infer<typeof ListRunsQuery>
  export type ListRunsResponse = z.infer<typeof ListRunsResponse>
  ```

- [ ] **3.3** Add a failing integration test at `/Users/canh/Projects/Seta/seta-os/platform/agent/server/tests/integration/list-runs.test.ts`:

  ```ts
  import { withTestTenant } from '@seta/db/testing'
  import { createRunRecorder } from '@seta/agent-memory'
  import { describe, expect, it } from 'vitest'
  import { listRuns } from '../../src/run-admin-handlers'

  describe('listRuns', () => {
    it('returns DESC by started_at with cursor pagination', async () => {
      await withTestTenant(async ({ sql, tenantId }) => {
        const rec = createRunRecorder(sql)
        for (let i = 0; i < 3; i++) {
          const id = await rec.start({ tenantId, agentId: 'planner', threadId: null })
          await rec.finish(id, { status: 'completed' })
        }
        const page1 = await listRuns(sql, { limit: 2 })
        expect(page1.items.length).toBe(2)
        expect(page1.items[0].status).toBe('completed')
        const page2 = await listRuns(sql, { limit: 2, cursor: page1.nextCursor })
        expect(page2.items.length).toBe(1)
      })
    })

    it('filters by status', async () => {
      await withTestTenant(async ({ sql, tenantId }) => {
        const rec = createRunRecorder(sql)
        const a = await rec.start({ tenantId, agentId: 'p', threadId: null })
        await rec.finish(a, { status: 'failed', errorCode: 'BOOM' })
        await rec.start({ tenantId, agentId: 'p', threadId: null })
        const failed = await listRuns(sql, { status: 'failed', limit: 10 })
        expect(failed.items.length).toBe(1)
        expect(failed.items[0].errorCode).toBe('BOOM')
      })
    })
  })
  ```

- [ ] **3.4** Implement `/Users/canh/Projects/Seta/seta-os/platform/agent/server/src/run-admin-handlers.ts` with thin wrappers delegating to `@seta/agent-memory`'s `createRunRecorder`:

  ```ts
  import { createRunRecorder } from '@seta/agent-memory'
  import type { ListRunsQuery, ListRunsResponse, RunDetail } from './run-admin-schema'

  export async function listRuns(sql: DbSql, q: ListRunsQuery): Promise<ListRunsResponse> { /* ... */ }
  export async function getRun(sql: DbSql, runId: string): Promise<RunDetail> { /* ... */ }
  export async function* streamRun(
    sql: DbSql,
    runId: string,
    signal: AbortSignal,
  ): AsyncIterable<KernelChunk> { /* see 3.6 */ }
  ```

  `listRuns` and `getRun` simply forward to the recorder helpers. `getRun` throws `DomainError(404)` from `@seta/middleware` if not found. Tenant isolation is enforced by RLS — never accept `tenantId` as a param.

- [ ] **3.5** Run the integration test — green.

- [ ] **3.6** Add a unit test at `/Users/canh/Projects/Seta/seta-os/platform/agent/server/src/run-admin-handlers.test.ts` for `streamRun`:

  - For a `completed` run, yields every stored chunk in `seq` order then returns.
  - For a `failed` run, yields stored chunks ending in an `error` chunk.
  - For a `running` run, yields stored chunks then tail-polls (`SELECT … FROM run_chunks WHERE seq > $last ORDER BY seq` every 250 ms) until status transitions to `completed`/`failed` OR `signal.aborted`.
  - Honors `signal`: when the controller aborts, the async iterator's `return()` resolves and no further DB polls happen.

  Use a mock `sql` template-tag returning canned rows + a status-progression script.

- [ ] **3.7** Implement `streamRun(sql, runId, signal)` per the test. Polling cadence 250 ms is fine for P2; `streamKernelSSE`'s own 15 s keepalive handles client liveness. Re-read the run status row each poll; exit when `status !== 'running'` AND no new chunks remain. Never throw on benign abort — let the consumer's `for-await` exit cleanly.

- [ ] **3.8** Add a failing route-level test at `/Users/canh/Projects/Seta/seta-os/platform/agent/server/tests/integration/run-admin-routes.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { createRunAdminRoutes } from '../../src/run-admin-routes'
  // build a Hono app, install fake session + tenantMiddleware, hit GET /runs, GET /runs/:id,
  // GET /runs/:id/stream (assert text/event-stream + at least one `event: text` frame for a seeded run).
  ```

- [ ] **3.9** Implement `/Users/canh/Projects/Seta/seta-os/platform/agent/server/src/run-admin-routes.ts`:

  ```ts
  import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
  import { streamKernelSSE } from '@seta/agent-core'
  import { DomainError } from '@seta/middleware'
  import { requireSession } from '@seta/sso'
  import { requireTenantMembership, tenantContext, tenantMiddleware } from '@seta/tenant'
  import { getRun, listRuns, streamRun } from './run-admin-handlers'
  import {
    ListRunsQuery,
    ListRunsResponse,
    RunDetail,
  } from './run-admin-schema'

  export interface RunAdminDeps {
    sql: DbSql
  }

  export function createRunAdminRoutes(deps: RunAdminDeps): OpenAPIHono {
    const app = new OpenAPIHono()
    const { sql } = deps

    app.use('*', requireSession)
    app.use('*', tenantMiddleware)
    app.use('*', requireTenantMembership)

    app.openapi(
      createRoute({
        method: 'get',
        path: '/runs',
        request: { query: ListRunsQuery },
        responses: { 200: { content: { 'application/json': { schema: ListRunsResponse } }, description: 'paginated runs' } },
      }),
      async (c) => c.json(await listRuns(sql, c.req.valid('query'))),
    )

    app.openapi(
      createRoute({
        method: 'get',
        path: '/runs/{runId}',
        request: { params: z.object({ runId: z.string().uuid() }) },
        responses: { 200: { content: { 'application/json': { schema: RunDetail } }, description: 'run detail' } },
      }),
      async (c) => {
        const { runId } = c.req.valid('param')
        const detail = await getRun(sql, runId)
        if (!detail) throw new DomainError(404, `Run not found: ${runId}`, { detail: runId })
        return c.json(detail)
      },
    )

    app.get('/runs/:runId/stream', async (c) => {
      const { runId } = c.req.param()
      const controller = new AbortController()
      c.req.raw.signal.addEventListener('abort', () => controller.abort(), { once: true })
      return streamKernelSSE(c, streamRun(sql, runId, controller.signal))
    })

    return app
  }
  ```

  Note: OpenAPI uses `{runId}` braces; the SSE route uses Hono native `:runId` per CLAUDE.md footgun. Both forms are intentional — they live in separate `app.openapi(...)` vs `app.get(...)` registrations.

- [ ] **3.10** Add `createRunAdminRoutes` + `RunSummary` + `RunDetail` + `ListRunsQuery` + `ListRunsResponse` to `/Users/canh/Projects/Seta/seta-os/platform/agent/server/src/index.ts` exports.

- [ ] **3.11** Run `pnpm --filter @seta/agent-server test` and `pnpm --filter @seta/agent-server test:integration` — green.

- [ ] **3.12** `pnpm changeset` — minor bump for `@seta/agent-server`.

- [ ] **3.13** Commit: `feat(agent-server): add createRunAdminRoutes with list, detail, and SSE stream`.

---

## Phase 4 — `apps/api`: compose the route

- [ ] **4.1** Apply the composition diff in `/Users/canh/Projects/Seta/seta-os/apps/api/src/main.ts`:

  ```diff
  -import {
  -  createAgentRouter,
  -  createToolRegistry,
  -  seedAgentProfiles,
  -  type ThreadStore,
  -} from '@seta/agent-server'
  +import {
  +  createAgentRouter,
  +  createRunAdminRoutes,
  +  createToolRegistry,
  +  seedAgentProfiles,
  +  type ThreadStore,
  +} from '@seta/agent-server'
  @@
   app.route('/agent', agentRouter)
  +app.route('/', createRunAdminRoutes({ sql: sql as never }))
  ```

  Mount at root because the routes are absolute (`/runs`, `/runs/:runId`, `/runs/:runId/stream`) per §7 of the master plan. No env additions required.

- [ ] **4.2** Add a smoke integration test at `/Users/canh/Projects/Seta/seta-os/apps/api/tests/integration/runs.smoke.test.ts`:

  - Boot the composed app, seed one completed run via `createRunRecorder`, hit `GET /runs` with a valid session cookie + tenant context, assert the row appears.
  - Hit `GET /runs/:runId/stream`, assert `Content-Type: text/event-stream`, assert at least one `event: finish` frame arrives.

- [ ] **4.3** `pnpm --filter @seta/api test:integration` — green.

- [ ] **4.4** Commit: `feat(api): mount createRunAdminRoutes`.

---

## Phase 5 — `@seta/agent-sdk`: typed methods + MSW recordings

- [ ] **5.1** Create `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/schemas/run.ts` mirroring server schema (re-use `TokenUsage` from the existing chunk schema; do NOT duplicate it):

  ```ts
  import { z } from 'zod'
  import { TokenUsage } from './chunk'

  export const RunStatus = z.enum(['created', 'running', 'completed', 'failed'])
  export type RunStatus = z.infer<typeof RunStatus>

  export const RunSummary = z.object({
    id: z.string(),
    status: RunStatus,
    agentId: z.string().nullable(),
    threadId: z.string().nullable(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    durationMs: z.number().nullable(),
    tokenUsage: TokenUsage.nullable(),
    errorCode: z.string().nullable(),
  })
  export type RunSummary = z.infer<typeof RunSummary>

  export const RunDetail = RunSummary.extend({
    tenantId: z.string(),
    chunks: z.array(z.unknown()),
    toolsUsed: z.array(z.string()),
  })
  export type RunDetail = z.infer<typeof RunDetail>

  export const ListRunsFilters = z.object({
    status: RunStatus.optional(),
    since: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  export type ListRunsFilters = z.infer<typeof ListRunsFilters>

  export const ListRunsResponse = z.object({
    items: z.array(RunSummary),
    nextCursor: z.string().optional(),
  })
  export type ListRunsResponse = z.infer<typeof ListRunsResponse>
  ```

  Note: the existing `RunStatus` type export from `platform/agent/sdk/src/types.ts` (used by `useAgentRun`) carries client-side UI states (`'idle' | 'running' | 'completed' | 'failed' | 'aborted'`). Keep that one for the hook; this new `RunStatus` is the server-side persisted enum. They are intentionally different aliases — rename the new one `PersistedRunStatus` if collision becomes a footgun.

  Update §7.2 of the master plan only if naming changes — but in this PR we keep the file-local imports unambiguous.

- [ ] **5.2** Add a failing test at `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/client/AgentClient.runs.test.ts`:

  ```ts
  import { http, HttpResponse } from 'msw'
  import { setupServer } from 'msw/node'
  import { afterAll, beforeAll, describe, expect, it } from 'vitest'
  import { AgentClient } from './AgentClient'

  const server = setupServer()
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterAll(() => server.close())

  describe('AgentClient.listRuns', () => {
    it('returns parsed RunSummary[]', async () => {
      server.use(
        http.get('http://api.test/runs', () =>
          HttpResponse.json({
            items: [
              { id: 'r1', status: 'completed', agentId: 'planner', threadId: null,
                startedAt: '2026-05-15T00:00:00Z', finishedAt: '2026-05-15T00:00:01Z',
                durationMs: 1000,
                tokenUsage: { inputTokens: 10, outputTokens: 2 }, errorCode: null },
            ],
          }),
        ),
      )
      const client = new AgentClient({ baseUrl: 'http://api.test' })
      const res = await client.listRuns({ limit: 50 })
      expect(res.items[0].id).toBe('r1')
    })
  })

  describe('AgentClient.getRun', () => {
    it('returns parsed RunDetail', async () => {
      server.use(
        http.get('http://api.test/runs/r1', () =>
          HttpResponse.json({
            id: 'r1', tenantId: 't1', status: 'completed', agentId: 'planner', threadId: null,
            startedAt: '2026-05-15T00:00:00Z', finishedAt: '2026-05-15T00:00:01Z',
            durationMs: 1000,
            tokenUsage: { inputTokens: 10, outputTokens: 2 },
            errorCode: null, chunks: [], toolsUsed: ['graph.search'],
          }),
        ),
      )
      const client = new AgentClient({ baseUrl: 'http://api.test' })
      const detail = await client.getRun('r1')
      expect(detail.toolsUsed).toEqual(['graph.search'])
    })
  })

  describe('AgentClient.streamRun (already exists; covered for the new path)', () => {
    it('threads signal to fetch and resolves to a streaming Response', async () => {
      // existing test pattern — reuse fixture
    })
  })
  ```

- [ ] **5.3** Extend `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/client/AgentClient.ts`:

  ```ts
  import { ListRunsFilters, ListRunsResponse, RunDetail } from '../schemas/run'

  // inside the class:
  listRuns(
    filters: Partial<ListRunsFilters> = {},
    init: { signal?: AbortSignal } = {},
  ): Promise<ListRunsResponse> {
    const qs = new URLSearchParams()
    if (filters.status) qs.set('status', filters.status)
    if (filters.since) qs.set('since', filters.since)
    if (filters.cursor) qs.set('cursor', filters.cursor)
    if (filters.limit !== undefined) qs.set('limit', String(filters.limit))
    const path = `/runs${qs.size ? `?${qs}` : ''}`
    const reqInit: { schema: typeof ListRunsResponse; signal?: AbortSignal } = { schema: ListRunsResponse }
    if (init.signal) reqInit.signal = init.signal
    return request(this.opts, path, reqInit)
  }

  getRun(runId: string, init: { signal?: AbortSignal } = {}): Promise<RunDetail> {
    const reqInit: { schema: typeof RunDetail; signal?: AbortSignal } = { schema: RunDetail }
    if (init.signal) reqInit.signal = init.signal
    return request(this.opts, `/runs/${encodeURIComponent(runId)}`, reqInit)
  }
  // streamRun() already exists — leave unchanged.
  ```

- [ ] **5.4** Export new schemas from `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/index.ts`:

  ```ts
  export {
    ListRunsFilters,
    ListRunsResponse,
    RunDetail,
    RunStatus as PersistedRunStatus,
    RunSummary,
  } from './schemas/run'
  ```

- [ ] **5.5** Add a second SSE fixture for replay at `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/sse/__fixtures__/run-tool-call.sse`:

  ```
  event: tool_call
  data: {"type":"tool_call","toolCallId":"c1","name":"graph.search","args":{"q":"q1"}}

  event: text
  data: {"type":"text","delta":"answer"}

  event: finish
  data: {"type":"finish","reason":"stop","usage":{"inputTokens":12,"outputTokens":4,"cacheReadInputTokens":5}}

  ```

- [ ] **5.6** `pnpm --filter @seta/agent-sdk test` — green.

- [ ] **5.7** `pnpm changeset` — minor bump for `@seta/agent-sdk`.

- [ ] **5.8** Commit: `feat(agent-sdk): add listRuns and getRun typed methods`.

---

## Phase 6 — `apps/studio`: queries + list page + detail page

Assumes PR-3 already shipped the studio scaffold (`apps/studio/src/api/{client,queries}.ts`, `_authed.tsx`). Studio is admin-only — `AppShell` is mounted without an `agentContext` prop, so there is no `agentContext.ts` helper to extend (see PR-3 Phase 0.5 and master plan §0).

### 6.1 Query options

- [ ] **6.1.1** Extend `/Users/canh/Projects/Seta/seta-os/apps/studio/src/api/queries.ts`:

  ```ts
  import { queryOptions } from '@tanstack/react-query'
  import type { ListRunsFilters } from '@seta/agent-sdk'
  import { client } from './client'

  export const runsQueryOptions = (tenantId: string, filters: Partial<ListRunsFilters> = {}) =>
    queryOptions({
      queryKey: ['runs', tenantId, filters],
      queryFn: ({ signal }) => client.listRuns(filters, { signal }),
      staleTime: 0,
    })

  export const runQueryOptions = (runId: string) =>
    queryOptions({
      queryKey: ['run', runId],
      queryFn: ({ signal }) => client.getRun(runId, { signal }),
    })
  ```

### 6.2 List page

- [ ] **6.2.1** Create the route stub if not already present: `/Users/canh/Projects/Seta/seta-os/apps/studio/src/routes/_authed/tenants.$id.runs.tsx`.

- [ ] **6.2.2** Create the feature module `/Users/canh/Projects/Seta/seta-os/apps/studio/src/features/runs/RunsPage.tsx`:

  ```tsx
  import type { RunSummary } from '@seta/agent-sdk'
  import { DataTable, StatusBadge, type Variant } from '@seta/ui'
  import { useQuery } from '@tanstack/react-query'
  import { Link, useParams } from '@tanstack/react-router'
  import { useState } from 'react'
  import { runsQueryOptions } from '../../api/queries'

  const statusVariant: Record<RunSummary['status'], Variant> = {
    created: 'neutral',
    running: 'info',
    completed: 'success',
    failed: 'error',
  }

  export function RunsPage() {
    const { id: tenantId } = useParams({ from: '/_authed/tenants/$id/runs' })
    const [cursor, setCursor] = useState<string | undefined>(undefined)
    const [items, setItems] = useState<RunSummary[]>([])

    const baseQuery = useQuery({
      ...runsQueryOptions(tenantId, { limit: 50, ...(cursor ? { cursor } : {}) }),
      refetchInterval: (q) =>
        (q.state.data?.items ?? []).some((r) => r.status === 'running') ? 5_000 : false,
    })

    // accumulate paginated cursor results into items
    if (baseQuery.data && baseQuery.data.items !== items.slice(items.length - baseQuery.data.items.length)) {
      // simple merge — fancy de-dupe lives in PR-6 once we extract a shared paginator
    }

    return (
      <DataTable
        data={baseQuery.data?.items ?? []}
        columns={[
          { id: 'id', header: 'Run', cell: (r) => (
              <Link to="/tenants/$id/runs/$runId" params={{ id: tenantId, runId: r.id }}>
                <code className="font-mono text-[12px]">{r.id.slice(0, 8)}</code>
              </Link>
            ) },
          { id: 'status', header: 'Status', cell: (r) => <StatusBadge variant={statusVariant[r.status]} label={r.status} /> },
          { id: 'agent', header: 'Agent', cell: (r) => r.agentId ?? '—' },
          { id: 'duration', header: 'Duration', cell: (r) => (r.durationMs == null ? '—' : `${(r.durationMs / 1000).toFixed(1)}s`) },
          { id: 'tokens', header: 'Tokens', cell: (r) => r.tokenUsage
              ? <span className="tnum">{r.tokenUsage.inputTokens + r.tokenUsage.outputTokens}</span>
              : '—' },
          { id: 'startedAt', header: 'Started', cell: (r) => new Date(r.startedAt).toLocaleString() },
        ]}
        footer={
          baseQuery.data?.nextCursor ? (
            <button type="button" onClick={() => setCursor(baseQuery.data.nextCursor)}>
              Load more
            </button>
          ) : null
        }
      />
    )
  }
  ```

  (`tnum` Tailwind utility exists in `@seta/ui` tokens for tabular numerals per design system.)

- [ ] **6.2.3** Wire the route component:

  ```tsx
  // routes/_authed/tenants.$id.runs.tsx
  import { createFileRoute } from '@tanstack/react-router'
  import { RunsPage } from '../../features/runs/RunsPage'
  import { runsQueryOptions } from '../../api/queries'

  export const Route = createFileRoute('/_authed/tenants/$id/runs')({
    loader: ({ context, params }) =>
      context.queryClient.ensureQueryData(runsQueryOptions(params.id, { limit: 50 })),
    component: RunsPage,
  })
  ```

### 6.3 Detail page

- [ ] **6.3.1** Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/features/runs/RunDetailPage.tsx`:

  ```tsx
  import { Card, Code, StatusBadge, Timeline, TokenUsageBar, useAgentRun } from '@seta/ui'
  import { useQuery } from '@tanstack/react-query'
  import { useParams } from '@tanstack/react-router'
  import { useEffect } from 'react'
  import { runQueryOptions } from '../../api/queries'

  export function RunDetailPage() {
    const { id: tenantId, runId } = useParams({ from: '/_authed/tenants/$id/runs/$runId' })
    const detailQuery = useQuery(runQueryOptions(runId))
    const { chunks, status, tokenUsage, start, abort } = useAgentRun(runId)

    useEffect(() => {
      start()
      return () => abort()
    }, [start, abort])

    const detail = detailQuery.data
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <code className="font-mono text-[13px]">{runId}</code>
            {detail && <StatusBadge variant={detail.status === 'failed' ? 'error' : detail.status === 'completed' ? 'success' : 'info'} label={detail.status} />}
            {detail?.agentId && <span>agent: {detail.agentId}</span>}
            {detail?.durationMs != null && <span className="tnum">{(detail.durationMs / 1000).toFixed(2)}s</span>}
          </div>
        </Card>

        <Card>
          <Timeline chunks={chunks} isStreaming={status === 'running'} />
        </Card>

        <Card>
          <TokenUsageBar
            prompt={tokenUsage.in}
            completion={tokenUsage.out}
            cached={lastCacheRead(chunks)}
          />
        </Card>
      </div>
    )
  }

  function lastCacheRead(chunks: readonly import('@seta/agent-sdk').KernelChunk[]): number {
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i]
      if (c.type === 'finish') return c.usage?.cacheReadInputTokens ?? 0
    }
    return 0
  }
  ```

  `Timeline` already handles the per-chunk variant mapping (tool_call→info, finish error→error, error→error, abort→warning) and the expandable `Code` block per spec §9.

- [ ] **6.3.2** Wire the route:

  ```tsx
  // routes/_authed/tenants.$id.runs.$runId.tsx
  import { createFileRoute } from '@tanstack/react-router'
  import { RunDetailPage } from '../../features/runs/RunDetailPage'
  import { runQueryOptions } from '../../api/queries'

  export const Route = createFileRoute('/_authed/tenants/$id/runs/$runId')({
    loader: ({ context, params }) =>
      context.queryClient.ensureQueryData(runQueryOptions(params.runId)),
    component: RunDetailPage,
  })
  ```

### 6.4 AgentContext per route — N/A in Studio

> Studio is admin-only and does NOT mount the right-side `AgentPanel`. There is no `apps/studio/src/nav/agentContext.ts` to extend for this slice (master plan §0). The `'runs' | 'run-detail'` `AgentContext['page']` union values remain reserved in `@seta/ui` for OTHER Workspace modules (Timesheet, PMO, Finance) that may surface run records contextually.

---

## Phase 7 — Studio component tests (MSW)

- [ ] **7.1** Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/features/runs/RunsPage.test.tsx`:

  - Renders 3 rows from a recorded `listRuns` response.
  - When one row is `running`, the `useQuery` `refetchInterval` is set to 5000 (mock timers; assert a second fetch after `vi.advanceTimersByTime(5000)`).
  - When all rows are `completed`/`failed`, `refetchInterval` is `false` (no second fetch after 6s).

- [ ] **7.2** Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/features/runs/RunDetailPage.test.tsx`:

  - MSW intercepts `GET /runs/r1` and `GET /runs/r1/stream` — serve the `run-tool-call.sse` fixture for the stream.
  - Assert: `TokenUsageBar` reports `inputTokens=12 outputTokens=4 cached=5` after the stream completes.
  - Assert: a `tool_call` `TimelineEvent` renders with label `graph.search` and expands to a `Code` block containing the args JSON.
  - Assert: unmounting the component fires `AbortController.abort()` (spy on the `signal.addEventListener('abort', ...)` callback OR assert MSW receives a request abort).

- [ ] **7.3** `pnpm --filter @seta/studio test` — green.

- [ ] **7.4** Commit: `feat(studio): add /runs list + /runs/:runId timeline with TokenUsageBar`.

---

## Phase 8 — E2E

- [ ] **8.1** Create `/Users/canh/Projects/Seta/seta-os/tests/e2e/studio/runs.spec.ts`:

  ```ts
  import { test, expect } from '@playwright/test'
  import { loginAsTestUser, seedCompletedRun } from '../helpers'

  test('run viewer: list → detail timeline with TokenUsageBar', async ({ page }) => {
    const { tenantId, runId } = await seedCompletedRun({
      agentId: 'planner',
      chunks: [
        { type: 'tool_call', toolCallId: 'c1', name: 'graph.search', args: { q: 'x' } },
        { type: 'text', delta: 'answer' },
        { type: 'finish', reason: 'stop', usage: { inputTokens: 10, outputTokens: 2 } },
      ],
    })
    await loginAsTestUser(page, { tenantId })

    await page.goto(`/tenants/${tenantId}/runs`)
    await expect(page.getByText(runId.slice(0, 8))).toBeVisible()

    await page.getByText(runId.slice(0, 8)).click()
    await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`))
    await expect(page.getByText('graph.search')).toBeVisible()
    await expect(page.locator('[data-testid="token-usage-bar"]')).toContainText('12')
  })
  ```

  `seedCompletedRun` is a thin helper that calls `createRunRecorder` against the test DB and replays the chunks.

- [ ] **8.2** `pnpm test:e2e --grep "run viewer"` — green.

- [ ] **8.3** Commit: `test(studio): e2e for run viewer slice`.

---

## Phase 9 — SCOPE.md updates

- [ ] **9.1** `/Users/canh/Projects/Seta/seta-os/apps/api/SCOPE.md` — under "Current state", add a bullet: `POST /agents/:agentId/run` (existing) PLUS `GET /runs`, `GET /runs/:runId`, `GET /runs/:runId/stream` (new, owned by `@seta/agent-server`'s `createRunAdminRoutes`).

- [ ] **9.2** `/Users/canh/Projects/Seta/seta-os/apps/studio/SCOPE.md` — under "Current state", change "Directory placeholder only" delta: list `/tenants/:id/runs` and `/tenants/:id/runs/:runId` as shipped. Under "Public interface", note the two query options (`runsQueryOptions`, `runQueryOptions`) and the two route paths.

- [ ] **9.3** `/Users/canh/Projects/Seta/seta-os/platform/agent/server/SCOPE.md` (if exists) — add `createRunAdminRoutes` to "Public interface" with the three routes and the auth-wall middleware stack.

- [ ] **9.4** `/Users/canh/Projects/Seta/seta-os/platform/agent/memory/SCOPE.md` — add `agent_memory.runs` + `agent_memory.run_chunks` to "Owns", `createRunRecorder` to "Public interface".

- [ ] **9.5** Commit: `docs(scope): record run viewer surfaces in api, studio, agent-server, agent-memory`.

---

## Phase 10 — Verification (superpowers:verification-before-completion)

Run, in order, and capture output for each:

- [ ] **10.1** `pnpm typecheck`
- [ ] **10.2** `pnpm lint`
- [ ] **10.3** `pnpm test:unit`
- [ ] **10.4** `pnpm test:integration`
- [ ] **10.5** `pnpm test:e2e --grep "run viewer"`
- [ ] **10.6** Exercise the demo state:
  - `pnpm db:up` (if not running).
  - `pnpm migrate` — verify the `add_runs` migration applies.
  - `pnpm dev` (apps/api) + `pnpm --filter @seta/studio dev` (Studio at `localhost:5173`).
  - Trigger a recorded agent run (e.g. via `POST /agent/agents/:agentId/run`).
  - Open `/tenants/:id/runs` — the new row appears within 5 s (refetch).
  - Click into it — the `Timeline` renders with `TokenUsageBar`; expandable rows show `Code` blocks.
  - Confirm SSE in DevTools Network tab: `Content-Type: text/event-stream`, `ping` keep-alive every 15 s.
  - Navigate away mid-stream — confirm `AbortController` aborts (no further bytes; request closed).
- [ ] **10.7** Confirm changesets present for `@seta/agent-memory`, `@seta/agent-core`, `@seta/agent-server`, `@seta/agent-sdk`. `apps/studio` and `apps/api` are private — no changeset.
- [ ] **10.8** Open the PR. Title: `feat: run viewer slice (PR-5)`. Body links §9 of the master plan and lists each commit per scope.
