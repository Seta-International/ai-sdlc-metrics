# `@seta/agent-workflows` W2 — Durable persistence, suspend/resume, p-queue runner

**Status:** Draft (pending review)
**Date:** 2026-05-13
**Owner:** Platform team
**Package:** `@seta/agent-workflows` (`platform/agent/workflows/`)
**Predecessors:** W1 — typed DSL + in-memory runner (`docs/superpowers/specs/2026-05-13-agent-workflows-w1-design.md`)
**Reference:** Mastra `packages/core/src/workflows/` (production-proven shape — entry-point design, snapshot field names, registry pattern)
**Successor:** P2 — pluggable `ExecutionEngine`, orphan-recovery sweeper, cross-instance claim queue, `.branch()`/`.foreach()`/`.sleep()` operators

---

## 1. Goal

Land durable persistence and human-in-the-loop suspend/resume on top of W1's in-memory runner, without breaking the W1 DSL surface beyond what production-ready return types require. After W2, a product author can:

- Persist every step boundary to Postgres so a host restart does not lose progress.
- Suspend a workflow on a HITL gate via `ctx.suspend({ resumeLabel, payload })`, return control to the caller, and resume from any process replica via `resumeWorkflow(runId, { label, payload })`.
- Express per-step retry policy at the step definition; failed transient errors retry; non-retryable errors fail fast.
- Trust that two concurrent resume calls on the same `runId` cannot both advance the workflow — Postgres advisory locks coordinate.
- Trust that audit rows for every workflow-level transition land in the same transaction as the snapshot write.

W2 is the final P1 milestone for the package. After W2 the package is feature-complete for the documented P1 scope; further expansion is gated on P2 scaling triggers.

## 2. Non-goals

- `.branch()` / `.dowhile()` / `.dountil()` / `.foreach()` / `.map()` / `.sleep()` / `.sleepUntil()` operators — P2 per SCOPE.md.
- Pluggable `ExecutionEngine` (Inngest / Temporal adapters) — P2 per SCOPE.md.
- Cron / scheduled triggers — P2.
- Orphan-run recovery sweeper (host crash → run stuck at `status='running'`) — P2 scaling trigger.
- Cross-instance work distribution via Postgres-backed claim queue (`SKIP LOCKED`) — P2 scaling trigger.
- HTTP routes for run / resume — owned by the consuming product (`modules/products/agent`).
- Persisted retry attempt count — durability boundary is the step, not the retry loop.
- Per-tenant configurable retention TTL.
- LISTEN/NOTIFY-based cross-process awaiters.

## 3. Constraints (CLAUDE.md + SCOPE.md)

- ESM-only; `"type": "module"`. `import type` for type-only imports.
- No CJS shim, no legacy alias, no backwards-compat shim — pre-1.0; the W1 return type change to `RunResult` is in-scope.
- `platform/*` depends on nothing in `modules/*` or `apps/*`.
- Tenant id is never a function parameter — read via `tenantContext.getTenantId()` from `@seta/tenant`. Snapshotted at run entry, propagated via `tenantContext.run()` around every step body.
- No `console.log` — `logger` from `@seta/observability`.
- Errors throw `WorkflowError` subclasses (themselves `DomainError` subclasses from `@seta/middleware/errors`).
- Co-located unit tests in `src/**/*.test.ts`. Integration tests in `tests/integration/**` requiring `DATABASE_URL`.
- No internal `@seta/*` mocking.
- Deps added via `pnpm --filter @seta/agent-workflows add ...`. Never hand-edit `package.json` outside metadata fields.
- Drizzle schema → migration via `drizzle-kit generate`; custom DDL via `drizzle-kit generate --custom`. Never hand-edit migration SQL or `meta/_journal.json`.

## 4. Mastra alignment (what we keep, what we change)

What we keep from Mastra (`packages/core/src/workflows/workflow.ts:3321..3913`, `types.ts:363`):

- **Snapshot field names.** `serializedStepGraph`, `activePaths`, `suspendedPaths`, `stepResults`, `resumeLabels`, `status` — byte-for-byte field names so a future port stays mechanical.
- **Four-entry-point API.** `start()` (sync) / `startAsync()` (fire-and-forget) / `resume()` (sync) / `restart()` — production OSS shape. We map to `run` / `runAsync` / `resume` / `resumeAsync`. No `awaitMs` knob: caller intent is explicit at the call site.
- **Registry lookup → workflow → run handle.** Mastra's `mastra.getWorkflowById(snapshot.workflowName)` (mastra/index.ts:2339) is the canonical resume dispatch pattern. We mirror with `workflowRegistry.get(id)`.
- **Resume payload via `ctx.resumePayload`.** Mastra threads `resumeData` onto step ctx; we use the same shape. Step body branches on its presence — first run vs. resumed run is the same code, no generator-fn or `yield` coroutine.
- **`resumeLabels` map.** Mastra stores `{ [label]: { stepId, executionPath } }` on the snapshot to disambiguate resume targets when a workflow has multiple suspended branches. We mirror.

What we change vs Mastra:

- **No pluggable `ExecutionEngine`.** In-process `p-queue` runner is the only engine. Inngest / Temporal adapters are P2.
- **No `.branch()` / `.dowhile()` / `.foreach()` / `.map()` / `.sleep()` / `.sleepUntil()`.** Linear DAG only — `.then()` + `.parallel()` + `.commit()`.
- **`withTenant` + advisory lock around every snapshot write.** Multi-tenancy with RLS is not Mastra's concern; ours from day one.
- **Per-tenant p-queue concurrency.** Mastra's queueing is flat; ours partitions by `tenant_id` to prevent noisy-neighbour starvation.
- **Audit-row-per-workflow-transition.** Mastra has no audit surface; seta-os requires `@seta/audit` integration for compliance.
- **Opt-in per-step retry.** Mastra retries on any error by default; we require explicit `retry: { maxAttempts, ... }` configuration. Silent retry-of-permanent-error is a production footgun for side-effecting steps.

## 5. File layout (W2 additions)

W1 already exists. W2 adds — without removing anything:

```
platform/agent/workflows/
├── SCOPE.md                              # edited: middleware-forbidden line scoped
├── package.json                          # via pnpm add — drizzle-orm, postgres, p-queue, @seta/db, @seta/audit
├── tsconfig.json                         # no change
├── vitest.config.ts                      # no change (or extend `projects:` for integration)
├── drizzle.config.ts                     # NEW — schemaFilter: ['agent_workflows']
├── migrations/                            # NEW
│   ├── 0000_<slug>.sql                   # drizzle-kit generate output
│   ├── 0001_security_hardening.sql       # drizzle-kit generate --custom (FORCE RLS, GRANTs)
│   └── meta/_journal.json                # drizzle-kit owned
├── tests/
│   └── integration/                      # NEW — requires DATABASE_URL
│       ├── golden-path.test.ts
│       ├── advisory-lock-contention.test.ts
│       ├── rls-isolation.test.ts
│       ├── failure-rollback.test.ts
│       ├── retry-transient.test.ts
│       ├── parallel-suspend.test.ts
│       ├── async-entry.test.ts
│       └── migration-runner.test.ts
└── src/
    ├── index.ts                          # extended barrel
    ├── schema.ts                         # NEW
    ├── persistence/                       # NEW
    │   ├── snapshot-store.ts             # load/save/list — tenant-scoped via withTenant
    │   ├── step-store.ts                 # write per-step rows
    │   └── advisory-lock.ts              # pg_try_advisory_xact_lock(hashtext(run_id))
    ├── registry.ts                       # NEW — workflowRegistry singleton
    ├── resume.ts                         # NEW — top-level resumeWorkflow / resumeWorkflowAsync
    ├── runner/
    │   ├── in-memory.ts                  # W1 — kept, but renamed internal helpers
    │   ├── durable.ts                    # NEW — wraps in-memory runner with persistence
    │   ├── awaiter.ts                    # NEW — per-instance Deferred map keyed by runId
    │   ├── queue.ts                      # NEW — p-queue, per-tenant concurrency
    │   ├── step-execution.ts             # W1 — minor extension: catch WorkflowSuspended
    │   └── parallel.ts                   # W1
    ├── retry/                             # NEW
    │   ├── classify.ts                   # adapter to agent-core's classifyError
    │   └── apply-retry.ts                # wraps executeStep with retry policy
    ├── prune.ts                          # NEW — pruneCompletedSnapshots ops surface
    ├── context/
    │   └── step-ctx.ts                   # W1 + new: suspend(), resumePayload
    ├── types/
    │   ├── step.ts                       # extended: retry field, suspend(), resumePayload
    │   ├── workflow.ts                   # extended: RunResult, ResumeParams
    │   ├── input.ts                      # W1
    │   └── result.ts                     # NEW — RunResult discriminated union, error serializer
    ├── errors.ts                         # extended: WorkflowSuspended, WorkflowResumeContended, ...
    └── *.test.ts                         # co-located unit tests for new files
```

## 6. Postgres schema (`agent_workflows`)

Field names mirror Mastra's `WorkflowRunState` (`mastra/packages/core/src/workflows/types.ts:363`) so a future port stays mechanical.

```ts
// src/schema.ts
import { tenantUser } from '@seta/db'
import { sql } from 'drizzle-orm'
import { index, jsonb, pgPolicy, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const agentWorkflowsSchema = pgSchema('agent_workflows')

export const workflowSnapshots = agentWorkflowsSchema.table(
  'workflow_snapshots',
  {
    runId:               uuid('run_id').primaryKey(),
    tenantId:            uuid('tenant_id').notNull(),
    workflowId:          text('workflow_id').notNull(),
    serializedStepGraph: jsonb('serialized_step_graph').$type<SerializedStepGraph>().notNull(),
    activePaths:         jsonb('active_paths').$type<number[]>().notNull(),
    suspendedPaths:      jsonb('suspended_paths').$type<Record<string, number[]>>().notNull(),
    stepResults:         jsonb('step_results').$type<Record<string, StepResultRow>>().notNull(),
    resumeLabels:        jsonb('resume_labels').$type<Record<string, ResumeLabelRef>>().notNull().default(sql`'{}'::jsonb`),
    status:              text('status', { enum: ['running','suspended','completed','failed','bailed'] }).notNull(),
    error:               jsonb('error').$type<SerializedError | null>(),
    createdAt:           timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt:           timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('wf_snapshots_tenant_status_updated_idx').on(t.tenantId, t.status, t.updatedAt.desc()),
    index('wf_snapshots_workflow_status_idx').on(t.tenantId, t.workflowId, t.status),
    pgPolicy('tenant_isolation_wf_snapshots', {
      as: 'permissive', to: tenantUser, for: 'all',
      using:     sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export const workflowSteps = agentWorkflowsSchema.table(
  'workflow_steps',
  {
    runId:       uuid('run_id').notNull(),       // logical reference to workflow_snapshots.run_id (no cross-schema FK)
    stepId:      text('step_id').notNull(),
    tenantId:    uuid('tenant_id').notNull(),
    workflowId:  text('workflow_id').notNull(),
    status:      text('status', { enum: ['running','completed','failed','suspended'] }).notNull(),
    inputHash:   text('input_hash').notNull(),
    output:      jsonb('output'),
    error:       jsonb('error'),
    startedAt:   timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt:  timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.runId, t.stepId] }),
    index('wf_steps_tenant_run_idx').on(t.tenantId, t.runId),
    pgPolicy('tenant_isolation_wf_steps', {
      as: 'permissive', to: tenantUser, for: 'all',
      using:     sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export type WorkflowSnapshotRow = typeof workflowSnapshots.$inferSelect
export type NewWorkflowSnapshot = typeof workflowSnapshots.$inferInsert
export type WorkflowStepRow = typeof workflowSteps.$inferSelect
export type NewWorkflowStep = typeof workflowSteps.$inferInsert
```

**Notes:**

- **No cross-schema FK** from `workflow_steps.run_id` → `workflow_snapshots.run_id` (CLAUDE.md "Schema-per-module: no cross-schema foreign keys"). Logical reference only; RLS + same-tx writes prevent orphans.
- **`serialized_step_graph`** is the array shape Mastra calls `SerializedStepFlowEntry[]`:
  ```ts
  type SerializedStepGraph = Array<
    | { kind: 'single'; stepId: string }
    | { kind: 'parallel'; branches: string[] }
  >
  ```
  W1's `graph.ts` already produces an in-memory shape with this structure; serializing is a 1:1 mapping.
- **`step_results`** is `Record<stepId, { status, output?, error?, finishedAt }>`.
- **`resume_labels`** is `Record<resumeLabel, { stepId, executionPath: number[] }>` — populated when a step calls `ctx.suspend({ resumeLabel })`; consumed on `resume({ label })`.

## 7. Migration wiring

- **`drizzle.config.ts`** in package root (mirrors `agent-memory`'s shape):
  ```ts
  import 'dotenv/config'
  import { defineConfig } from 'drizzle-kit'

  export default defineConfig({
    dialect: 'postgresql',
    schema: './src/schema.ts',
    out: './migrations',
    schemaFilter: ['agent_workflows'],
    dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta' },
    verbose: true,
    strict: true,
  })
  ```
- **`drizzle-kit generate`** produces `migrations/0000_<slug>.sql`. Never hand-edited.
- **`drizzle-kit generate --custom --name security_hardening`** produces `0001_security_hardening.sql` skeleton for DDL drizzle cannot express:
  - `ALTER TABLE agent_workflows.workflow_snapshots FORCE ROW LEVEL SECURITY;`
  - `ALTER TABLE agent_workflows.workflow_steps FORCE ROW LEVEL SECURITY;`
  - `GRANT USAGE ON SCHEMA agent_workflows TO tenant_user;`
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA agent_workflows TO tenant_user;`
- **`@seta/db` `OWNER_ORDER` edit** at `platform/db/src/migrate.ts:7`:
  ```diff
   const OWNER_ORDER = [
     'auth','tenant','directory','oauth','audit',
     'connector_ms365_directory','connector_ms365_planner',
  -  'agent','agent_memory',
  +  'agent','agent_memory','agent_workflows',
   ]
  ```
  Plus `OWNER_PACKAGE_PATH['agent_workflows'] = 'platform/agent/workflows/migrations'`.

## 8. Public API additions

```ts
// @seta/agent-workflows — additions on top of W1 exports

// (1) Step definitions gain optional retry
interface DefineStepOptions<TIn, TOut, TId extends string> {
  /* ...W1 fields... */
  retry?: {
    maxAttempts: number       // total attempts including first
    backoff?: BackoffOpts     // defaults: agent-core curve (250ms→4s, x2, ±20% jitter)
    shouldRetry?: (err: unknown) => boolean  // default: classifyError(err) === 'transient'
  }
}

// (2) StepCtx gains suspend() and resumePayload
interface StepCtx<TIn> {
  /* ...W1 fields: input, runId, stepId, workflowId, tenantId, logger, signal, bail... */
  suspend<P>(opts: { resumeLabel: string; payload?: P }): never
  resumePayload?: unknown  // populated only on resume invocations
}

// (3) BuiltWorkflow gains async + resume variants. run() return type changes.
interface BuiltWorkflow<TIn, TOut> {
  readonly id: string
  run(input: TIn, opts?: RunOpts): Promise<RunResult<TOut>>
  runAsync(input: TIn, opts?: RunOpts): Promise<{ runId: string }>
  resume<TPayload = unknown>(runId: string, params: ResumeParams<TPayload>, opts?: RunOpts): Promise<RunResult<TOut>>
  resumeAsync<TPayload = unknown>(runId: string, params: ResumeParams<TPayload>, opts?: RunOpts): Promise<{ runId: string }>
}

type RunResult<TOut> =
  | { status: 'completed'; runId: string; output: TOut }
  | { status: 'suspended'; runId: string; resumeLabel: string; stepId: string }
  | { status: 'failed';    runId: string; error: SerializedError }
  | { status: 'bailed';    runId: string; reason?: string }

interface ResumeParams<TPayload> { label: string; payload?: TPayload }
interface RunOpts { signal?: AbortSignal }

// (4) Process-wide registry + top-level resume helpers
export const workflowRegistry: WorkflowRegistry
export function resumeWorkflow(
  runId: string,
  params: ResumeParams,
  opts?: RunOpts,
): Promise<RunResult<unknown>>
export function resumeWorkflowAsync(
  runId: string,
  params: ResumeParams,
  opts?: RunOpts,
): Promise<{ runId: string }>

// (5) Ops surface — exported, not auto-invoked
export function pruneCompletedSnapshots(
  opts: { olderThan: Date; batchSize?: number },
): Promise<{ pruned: number }>
```

**Breaking change vs W1.** W1's `BuiltWorkflow.run(input)` returned `Promise<TOut>`. W2 changes it to `Promise<RunResult<TOut>>`. Per CLAUDE.md "No legacy, no backward compat", every caller (currently only co-located tests inside the package) changes in the same PR. No deprecation alias.

## 9. Runtime — durable persistence

### 9.1 Run entry (`run` / `runAsync`)

```
1. tenantId = tenantContext.getTenantId()                       # throws if absent
2. runId = uuidv7()
3. Sync path only: register Deferred in awaiters[runId] BEFORE enqueue
   (prevents the settle-before-await race).
4. Open tenant tx (withTenant):
   a. pg_try_advisory_xact_lock(hashtext(run_id))               # must acquire — fresh runId
   b. INSERT workflow_snapshots (status='running', serialized_step_graph, active_paths=[0], ...)
   c. recordAudit(tx, { operation: 'workflow.started', metadata: { workflowId, inputHash } })
5. Commit tx (lock released).
6. Enqueue worker fn onto getQueue(tenantId).
7. Sync path: await the Deferred registered in step 3.
   Async path: return { runId }.
```

**Ordering rationale.** The deferred must exist in `awaiters[runId]` before the worker can settle, otherwise `settleRun()` finds no awaiter and drops the result. Registering the deferred before the snapshot INSERT is safe (the deferred is process-local; if the INSERT fails and the run never starts, the caller's `await` rejects via the error path on step 4).

### 9.2 Step boundary

Each `.then()` / `.parallel()` step:

```
1. Open tenant tx + advisory lock (short-held).
2. UPSERT workflow_steps row for (run_id, step_id):
   { status: 'running', input_hash, started_at: now }
3. Commit tx (release advisory lock).
4. Execute step body OUTSIDE the tx (steps may take seconds; never hold locks across step execution).
   - WorkflowSuspended → see §9.3.
   - WorkflowBailed → see §9.4.
   - Any other error → retry per §9.5; if retries exhausted → §9.6.
5. On success: open tx, UPDATE step row → status='completed', output, finished_at;
   UPDATE snapshot.step_results[stepId] and advance active_paths.
   Commit.
```

**Advisory locks are short-held.** Only around DB writes; never wrapping step execution. Long-running steps don't hold any DB lock.

### 9.3 Suspend

`ctx.suspend({ resumeLabel, payload? })` throws `WorkflowSuspended`. The step-execution wrapper catches it:

```
1. Open tenant tx + advisory lock.
2. UPDATE workflow_steps → status='suspended', finished_at=now.
3. UPDATE workflow_snapshots:
   - status = 'suspended'
   - suspendedPaths[stepId] = currentExecutionPath
   - resumeLabels[resumeLabel] = { stepId, executionPath }
4. recordAudit(tx, { operation: 'workflow.suspended',
                     metadata: { workflowId, stepId, resumeLabel } })
5. Commit.
6. settleRun(runId, { status: 'suspended', runId, resumeLabel, stepId })
   → resolves the sync awaiter; async caller already returned.
```

`payload` from `ctx.suspend({ payload })` is **outbound** — what the step wants to publish (e.g., the planner agent posts this as a Teams card body). It is NOT stored in the snapshot beyond what the audit row captures. The inbound payload comes via `resume({ label, payload })`.

### 9.4 Bail (carried from W1)

`ctx.bail(reason?)` throws `WorkflowBailed`. The step-execution wrapper catches it:

```
1. Open tenant tx + advisory lock.
2. UPDATE workflow_steps → status='completed' (bail is a clean stop, not a failure).
3. UPDATE workflow_snapshots → status='bailed'.
4. recordAudit(tx, { operation: 'workflow.bailed',
                     metadata: { workflowId, stepId, reason } })
5. Commit. settleRun(runId, { status: 'bailed', runId, reason }).
```

### 9.5 Retry application

```ts
// src/retry/apply-retry.ts
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy | undefined,
  signal: AbortSignal,
): Promise<T> {
  if (!policy) return fn()  // No retry config → fail fast on first error
  const predicate = policy.shouldRetry ?? ((err) => classifyError(err) === 'transient')
  return withRetry(fn, {
    maxRetries: policy.maxAttempts - 1,
    signal,
    onAttempt: (_attempt, err) => {
      // WorkflowBailed / WorkflowSuspended are control flow — never retry.
      if (err instanceof WorkflowBailed || err instanceof WorkflowSuspended) throw err
      if (!predicate(err)) throw err
    },
  })
}
```

Wraps `executeStep()` from W1. Attempt count is in-memory only; on host crash mid-retry, resume re-runs the step from attempt 0 (durable boundary is the step, not the retry).

### 9.6 Failure terminal

When retry exhausted (or no retry config) and the thrown error is neither `WorkflowSuspended` nor `WorkflowBailed`:

```
1. Open tenant tx + advisory lock.
2. UPDATE workflow_steps → status='failed', error=serialized(err), finished_at=now.
3. UPDATE workflow_snapshots → status='failed', error=serialized(err).
4. recordAudit(tx, { operation: 'workflow.failed',
                     metadata: { workflowId, failedStepId, errorType } })
5. Commit. settleRun(runId, { status: 'failed', runId, error }).
```

### 9.7 Completion terminal

```
1. Open tenant tx + advisory lock.
2. UPDATE workflow_snapshots → status='completed', updated_at=now.
3. recordAudit(tx, { operation: 'workflow.completed',
                     metadata: { workflowId, durationMs, stepCount } })
4. Commit. settleRun(runId, { status: 'completed', runId, output }).
```

## 10. Resume

```
wf.resume(runId, { label, payload }, opts?):

1. Open tenant tx (withTenant):
   a. pg_try_advisory_xact_lock(hashtext(run_id))
      → if not acquired: throw WorkflowResumeContended.
   b. SELECT snapshot for runId.
      → if missing (RLS filters cross-tenant): throw WorkflowSnapshotNotFound.
      → if status !== 'suspended': throw WorkflowNotSuspended.
      → if workflow_id !== this.id: throw WorkflowMismatch.
      → if !resume_labels[label]: throw WorkflowResumeLabelUnknown.
   c. Resolve target step: { stepId, executionPath } = resume_labels[label].
   d. UPDATE snapshot:
      - status = 'running'
      - delete suspendedPaths[stepId]
      - delete resume_labels[label]
      - updated_at = now
   e. recordAudit(tx, { operation: 'workflow.resumed',
                        metadata: { workflowId, label, payloadHash: sha256(payload).slice(0, 32) } })
2. Commit (lock released at commit, not held across step execution).
3. Stash `payload` in a per-instance resumeInbox[runId] = payload.
   (Inbox cleared after the step that reads it completes; survives only within this process.)
4. Enqueue worker fn that resumes from the recorded execution_path.
   - The runner's step-execution wrapper sets ctx.resumePayload = resumeInbox[runId] for that step.
5. Sync path: register awaiter, await Deferred.
   Async path: return { runId }.
```

**Resumed-step semantics.** The step that was suspended is re-executed from the top with `ctx.resumePayload` populated. Step authors branch on its presence:

```ts
const reviewStep = defineStep({
  id: 'review',
  inputSchema: z.object({ taskId: z.string() }),
  outputSchema: z.object({ approved: z.boolean() }),
  async execute(input, ctx) {
    const decision = ctx.resumePayload as { approved: boolean } | undefined
    if (!decision) {
      await postTeamsCard(input.taskId, ctx)
      ctx.suspend({ resumeLabel: 'manager-approval' })  // throws — never returns
    }
    return { approved: decision.approved }
  },
})
```

Pre-suspend side effects (Teams card posting) must be **idempotent at the product layer** — a re-execution from the top on resume will not re-post if the product checks for an existing conversation. That discipline is the product author's; the workflow engine does not deduplicate.

`resumePayload` lives only on the resumed-step ctx. It is **not** stored in `workflow_snapshots` (only the audit row's `payloadHash` survives). This is a privacy property: sensitive approval payloads do not persist beyond the audit hash.

**Failure mode — resume contention.** Two concurrent `resume()` callers race on the same `runId`:
- Caller A acquires the advisory lock, advances the snapshot to `status='running'`, commits.
- Caller B's `pg_try_advisory_xact_lock` returns false → throws `WorkflowResumeContended`. Caller can retry; on retry the snapshot will be `status='running'` and B will see `WorkflowNotSuspended`. This is the correct at-least-once contract.

## 11. Runner

### 11.1 p-queue per tenant

`platform/*` cannot read `process.env` directly (CLAUDE.md "`process.env` → typed `env` via Zod once at boot (`apps/api/src/env.ts`). Never read `process.env.X` elsewhere") and cannot import from `apps/*`. Concurrency is therefore caller-injected via the registry:

```ts
// src/runner/queue.ts
import PQueue from 'p-queue'

const queues = new Map<string, PQueue>()
let perTenantConcurrency = 4  // sane default; overridable via workflowRegistry.configure()

export function setPerTenantConcurrency(n: number): void {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('concurrency must be a positive integer')
  perTenantConcurrency = n
  // Existing queues continue with their original setting; new tenants get the new value.
  // This is intentional — runtime reconfiguration of in-flight queues is out of P1 scope.
}

export function getQueue(tenantId: string): PQueue {
  let q = queues.get(tenantId)
  if (!q) {
    q = new PQueue({ concurrency: perTenantConcurrency })
    queues.set(tenantId, q)
  }
  return q
}

export async function enqueueRun(tenantId: string, fn: () => Promise<void>): Promise<void> {
  await getQueue(tenantId).add(fn, { throwOnTimeout: false })
}
```

`workflowRegistry.configure({ perTenantConcurrency })` is called once at boot from `apps/api/src/main.ts`, where the typed `env` is available:

```ts
// apps/api/src/main.ts (illustrative)
import { workflowRegistry } from '@seta/agent-workflows'
import { env } from './env'

workflowRegistry.configure({
  perTenantConcurrency: env.AGENT_WORKFLOWS_PER_TENANT_CONCURRENCY,
})
```

Per-tenant partitioning prevents a noisy tenant from starving others. The queue is in-process; advisory locks coordinate across processes for the same runId.

### 11.2 Awaiter map

```ts
// src/runner/awaiter.ts
type Deferred<T> = { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void }

const awaiters = new Map<string, Deferred<RunResult<unknown>>>()

export function awaitRun(runId: string): Promise<RunResult<unknown>> {
  let d = awaiters.get(runId)
  if (!d) {
    let resolve!: (v: RunResult<unknown>) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<RunResult<unknown>>((res, rej) => { resolve = res; reject = rej })
    d = { promise, resolve, reject }
    awaiters.set(runId, d)
  }
  return d.promise
}

export function settleRun(runId: string, result: RunResult<unknown>): void {
  const d = awaiters.get(runId)
  if (d) { d.resolve(result); awaiters.delete(runId) }
  // No awaiter: this was a fire-and-forget call; result drops on the floor (already persisted).
}
```

The awaiter is **per-instance**. In P1 the enqueue always lands on the same instance that called `run()`/`resume()`, so this is safe. P2 scaling trigger: cross-instance dispatch requires either LISTEN/NOTIFY or a status-poll fallback.

## 12. Registry and top-level resume

```ts
// src/registry.ts
class WorkflowRegistry {
  #byId = new Map<string, BuiltWorkflow<unknown, unknown>>()

  register<TIn, TOut>(wf: BuiltWorkflow<TIn, TOut>): void {
    if (this.#byId.has(wf.id)) {
      throw new WorkflowBuildError(`workflow already registered: ${wf.id}`)
    }
    this.#byId.set(wf.id, wf as BuiltWorkflow<unknown, unknown>)
  }
  get(id: string): BuiltWorkflow<unknown, unknown> | undefined { return this.#byId.get(id) }
  list(): ReadonlyArray<{ id: string }> { return [...this.#byId.values()].map((w) => ({ id: w.id })) }

  configure(opts: { perTenantConcurrency?: number }): void {
    if (opts.perTenantConcurrency !== undefined) setPerTenantConcurrency(opts.perTenantConcurrency)
  }
}

export const workflowRegistry = new WorkflowRegistry()
```

```ts
// src/resume.ts
export async function resumeWorkflow(
  runId: string,
  params: ResumeParams,
  opts?: RunOpts,
): Promise<RunResult<unknown>> {
  const snap = await readSnapshot(runId)  // tenant-scoped; RLS-filtered
  if (!snap) throw new WorkflowSnapshotNotFound(runId)
  const wf = workflowRegistry.get(snap.workflowId)
  if (!wf) throw new WorkflowNotRegistered(snap.workflowId)
  return wf.resume(runId, params, opts)
}

export async function resumeWorkflowAsync(
  runId: string,
  params: ResumeParams,
  opts?: RunOpts,
): Promise<{ runId: string }> { /* parallel: ...wf.resumeAsync(...) */ }
```

**Registration site.** `apps/api/src/main.ts` (or its side-effect `./agent.ts`) calls `workflowRegistry.register(taskReviewWorkflow)` at boot. This mirrors the existing `agentRegistry.register('anthropic', adapter)` and `connectorRegistry.register(plannerConnector)` patterns at the same composition point.

## 13. Audit integration

Workflow-level transitions only — six audit-row types per run lifecycle, every row same-tx with its snapshot write:

| Operation                 | Where written            | Metadata                                           |
| ------------------------- | ------------------------ | -------------------------------------------------- |
| `workflow.started`        | run entry tx             | `{ workflowId, inputHash }`                        |
| `workflow.suspended`      | suspend handler tx       | `{ workflowId, stepId, resumeLabel }`              |
| `workflow.resumed`        | resume entry tx          | `{ workflowId, label, payloadHash }`               |
| `workflow.completed`      | terminal tx              | `{ workflowId, durationMs, stepCount }`            |
| `workflow.failed`         | terminal tx              | `{ workflowId, failedStepId, errorType }`          |
| `workflow.bailed`         | terminal tx              | `{ workflowId, bailedStepId, reason }`             |

**Actor source:** `actorFromContext()` (already used in `agent-memory/provider.ts:84`) — pulls from tenant ALS or returns `{ type: 'system', label: 'agent-workflows' }`.

**Payload digest:** `sha256(JSON.stringify(payload)).slice(0, 32)` — short enough for `audit.metadata`, replay-attack-safe for forensic correlation, doesn't leak PII into the audit table.

**Step-level transitions stay in OTel spans + logs**, not in the audit table. Step-level forensic data lives in `workflow_steps` already; duplicating into `audit_log` would balloon the table.

## 14. Errors

```ts
// src/errors.ts — additions to W1

export class WorkflowSuspended extends WorkflowError {        // control flow, not error
  constructor(public readonly resumeLabel: string, public readonly payload?: unknown) {
    super(500, `workflow suspended: ${resumeLabel}`, { type: `${BASE}/suspended` })
  }
}

export class WorkflowResumeContended extends WorkflowError {  // advisory lock contention
  constructor(runId: string) { super(409, `resume contended: ${runId}`, { type: `${BASE}/resume-contended` }) }
}

export class WorkflowSnapshotNotFound extends WorkflowError {  // RLS-filtered or absent
  constructor(runId: string) { super(404, `snapshot not found: ${runId}`, { type: `${BASE}/snapshot-not-found` }) }
}

export class WorkflowNotSuspended extends WorkflowError {     // resume called on running / terminal run
  constructor(runId: string, status: string) {
    super(409, `workflow not suspended: ${runId} (status=${status})`, { type: `${BASE}/not-suspended` })
  }
}

export class WorkflowMismatch extends WorkflowError {         // resume(runId) on wrong BuiltWorkflow
  constructor(expected: string, actual: string) {
    super(409, `workflow id mismatch: expected ${expected}, got ${actual}`, { type: `${BASE}/mismatch` })
  }
}

export class WorkflowResumeLabelUnknown extends WorkflowError {
  constructor(label: string) {
    super(400, `resume label unknown: ${label}`, { type: `${BASE}/resume-label-unknown` })
  }
}

export class WorkflowNotRegistered extends WorkflowError {     // workflowRegistry.get(id) returned undefined
  constructor(id: string) {
    super(500, `workflow not registered: ${id}`, { type: `${BASE}/not-registered` })
  }
}
```

All extend `WorkflowError` (W1) → `DomainError` (`@seta/middleware/errors`) → RFC 7807 mapping at the HTTP edge.

## 15. Retention — exported, not wired

```ts
// src/prune.ts
export async function pruneCompletedSnapshots(opts: {
  olderThan: Date
  batchSize?: number
}): Promise<{ pruned: number }> {
  // DELETE FROM agent_workflows.workflow_snapshots
  //   WHERE status IN ('completed','failed','bailed')
  //   AND updated_at < $olderThan
  //   AND run_id IN (SELECT run_id FROM agent_workflows.workflow_snapshots ... LIMIT $batchSize)
  // RETURNING run_id;
  // Then batched DELETE FROM workflow_steps WHERE run_id = ANY($pruned).
  // Suspended runs are NEVER pruned by this helper.
}
```

Exported with a doc comment: *"P1 ops surface — not invoked automatically. Wire from a cron job when storage growth becomes a documented concern (see setup.md §3 scaling triggers)."*

Documented in setup.md §3 schema table footnote (see §17 below).

## 16. Tenant + multi-tenancy contract

- Run entry reads `tenantContext.getTenantId()` once; snapshotted into the snapshot row's `tenant_id`.
- Every step body executes inside `tenantContext.run({ tenantId }, ...)` (carried from W1).
- Every snapshot read/write goes through `withTenant(sql, tenantId, async (tx) => ...)`.
- RLS policies on both tables enforce `current_setting('app.tenant_id', true)::uuid = tenant_id` for ALL operations under the `tenant_user` role. `FORCE ROW LEVEL SECURITY` ensures policies apply even if the role owns the table.
- **Cross-tenant resume is impossible by construction.** If tenant B calls `resumeWorkflow(runId, ...)` for tenant A's run, the snapshot read returns zero rows → `WorkflowSnapshotNotFound`. No leakage into audit rows or error messages.
- **Cross-tenant fan-out** in `.parallel([...])` is unchanged from W1: branches inherit the parent tenant. The advisory lock on `hashtext(run_id)` provides a single per-run mutex regardless of branch parallelism.

## 17. Follow-up bug fixes bundled in this PR

**Bundle 1: Strike stale `@seta/middleware` prohibitions.** Five SCOPE.md files carry the same line predating K1's establishment that `DomainError` from `@seta/middleware/errors` is the canonical project contract:

| File                                            | Line | Edit |
| ----------------------------------------------- | ---- | ---- |
| `platform/agent/workflows/SCOPE.md`             | 91   | scope to route helpers only |
| `platform/agent/memory/SCOPE.md`                | 82   | same |
| `platform/agent/embeddings/SCOPE.md`            | 59   | same |
| `platform/agent/rag/SCOPE.md`                   | 86   | same |
| `platform/agent/vector/SCOPE.md`                | 69   | same |

Replacement text (consistent across all five):

> *"Forbidden: any `modules/*` package, `apps/*`. `@seta/middleware` route helpers (Hono / OpenAPI) are forbidden — this is a library, not a route module. The `@seta/middleware/errors` subpath (`DomainError` base) is allowed and is the canonical project contract per CLAUDE.md."*

**Bundle 2: `docs/setup.md` §3 schema table.** Two rows missing — `agent_memory` (shipped in PR #153 but not added to the table) and `agent_workflows` (this PR):

```diff
 | `agent` | `@seta/agent` (product) | `write_continuations` — HMAC-signed preview→commit tokens; future: conversations, runs, working memory |
+| `agent_memory` | `@seta/agent-memory` | `threads`, `messages`, `resources` — durable conversation memory (Mastra-aligned) |
+| `agent_workflows` | `@seta/agent-workflows` | `workflow_snapshots`, `workflow_steps` — durable workflow execution state, suspend/resume |
```

Plus a one-line footnote: *"Snapshot retention for `agent_workflows` is forward-only in P1. The package exports `pruneCompletedSnapshots()` as an ops surface; wire from cron when storage growth is documented."*

## 18. Test strategy

### 18.1 Unit (`src/**/*.test.ts`)

Extending W1's coverage:

- `persistence/snapshot-store.test.ts` — serialize/deserialize round-trip; enum constraints; jsonb shape.
- `persistence/step-store.test.ts` — UPSERT idempotency on `(run_id, step_id)`; input_hash determinism.
- `persistence/advisory-lock.test.ts` — mock SQL; verify `pg_try_advisory_xact_lock(hashtext(run_id))` call shape; lock acquired/contended branches.
- `registry.test.ts` — duplicate registration throws `WorkflowBuildError`; `.get(unknown)` returns undefined; `.list()` shape.
- `runner/awaiter.test.ts` — deferred wiring; settle resolves; awaiter map clears after settle (no leak).
- `runner/queue.test.ts` — per-tenant queue isolation; concurrency reads from env.
- `retry/apply-retry.test.ts` — no `retry` config → no retry; `shouldRetry` predicate honored; `WorkflowBailed`/`WorkflowSuspended` never retried; backoff curve.
- `prune.test.ts` — query shape; batch boundary; suspended rows never selected.
- `errors.test.ts` — every new error class extends `WorkflowError` extends `DomainError`; correct status codes.
- `context/step-ctx.test.ts` — `ctx.suspend()` throws `WorkflowSuspended`; `ctx.resumePayload` defined only on resume.

### 18.2 Integration (`tests/integration/**`, requires `DATABASE_URL`)

| Test                                  | Purpose                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `golden-path.test.ts`                 | 3-step workflow with one HITL gate. `run()` → suspends. `resume()` → completes. Assert audit rows in order, snapshot terminal state, step rows. |
| `advisory-lock-contention.test.ts`    | Two concurrent `resume(runId, ...)` callers (same tenant). Exactly one wins. Loser throws `WorkflowResumeContended`. Snapshot consistent. |
| `rls-isolation.test.ts`               | Tenant A's run. Tenant B's `resumeWorkflow(runId, ...)` throws `WorkflowSnapshotNotFound`. No data leakage in audit rows. |
| `failure-rollback.test.ts`            | Step throws non-retryable error. Snapshot → `failed`; audit row `workflow.failed`; subsequent `resume()` → `WorkflowNotSuspended`. |
| `retry-transient.test.ts`             | Step with `retry: { maxAttempts: 3 }` throws HTTP 503 twice then succeeds. Single step row; output recorded once. |
| `parallel-suspend.test.ts`            | `.parallel([a, b])` where `a` suspends and `b` completes. `suspendedPaths` contains only `a`; resume satisfies `a`. |
| `async-entry.test.ts`                 | `runAsync()` returns immediately with `{ runId }`. Poll snapshot until terminal. |
| `migration-runner.test.ts`            | `@seta/db` `runMigrations` applies `agent_workflows` after `agent_memory`. Schema present; RLS forced; tenant_user has grants. |

**TDD per CLAUDE.md** — for persistence, retry, registry, resume layers, write tests first.

**No LLM fixtures.** Workflows are below the model layer.

### 18.3 Coverage

Match the repo's per-package threshold (lines/branches). No carve-outs.

## 19. Observability

- Run span: `workflow.<workflowId>` — attributes `workflow.id`, `workflow.run.id`, `tenant.id`, `workflow.run.status` (set at terminal).
- Step span (parent = run span): `step.<stepId>` — attributes `step.id`, `step.workflow.id`, `step.run.id`, `step.input.hash`, `step.attempt` (1-indexed retry counter).
- Suspend span event: `workflow.suspended` with `{ resumeLabel, stepId }`.
- Resume span: `workflow.resume.<workflowId>` — attributes `workflow.id`, `workflow.run.id`, `tenant.id`, `resume.label`.
- Logger always bound `{ workflowId, runId, tenantId, stepId? }`.

## 20. Verification before W2 close

Per CLAUDE.md "Verify before claiming done":

- `pnpm --filter @seta/agent-workflows typecheck` clean.
- `pnpm --filter @seta/agent-workflows lint` clean.
- `pnpm --filter @seta/agent-workflows test` green (unit + type tests).
- `pnpm db:up && pnpm migrate && pnpm test:integration` green (real Postgres; advisory-lock contention, RLS isolation, golden-path).
- Root `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` clean — confirms no other package is affected.
- CI guards (`check-no-manual-pkg-edit.ts`, dependency-direction checks) green.
- `pnpm build` clean.
- `pnpm dev` boots `apps/api` with the new schema applied; an integration product workflow runs end-to-end via curl.
- Changeset added (`pnpm changeset`) — minor; package is `"private": false`.

## 21. P2 scaling triggers (documented, not built)

- **Orphan-run recovery.** Host crash leaves a run at `status='running'` with no live worker. Triggered when: a snapshot has `status='running'` and `updated_at` older than a configurable threshold. Fix: a sweeper that promotes stale-running runs back to `suspended` with a synthetic resume label, or directly to `failed`.
- **Cross-instance work distribution.** When per-instance p-queue saturation causes tail latency. Fix: Postgres-backed claim queue using `SELECT ... FOR UPDATE SKIP LOCKED` to distribute work across instances. Or move to a broker (Redis Streams, NATS, BullMQ).
- **Cross-instance sync awaiters.** When sync `run()`/`resume()` callers must wait for work that landed on a different instance. Fix: `LISTEN/NOTIFY` on snapshot updates, or a polling fallback.
- **Per-tenant configurable retention.** When tenants need differentiated retention windows. Fix: `tenant.tenants.workflow_retention_days` column + a per-tenant prune sweeper.
- **DSL expansion.** When a product flow cannot be linearised via `.then()` + `.parallel()`. Fix: `.branch()` / `.dowhile()` / `.foreach()` / `.sleep()` operators with the same Mastra type shapes.
- **Pluggable `ExecutionEngine`.** When sustained scaling needs a Temporal/Inngest backend. Fix: extract the `runner/durable.ts` interface into an `ExecutionEngine` abstraction (Mastra's `workflows/execution-engine.ts:51` is the reference shape).

## 22. Open questions

None at design close. Decisions resolved in design:

- **Snapshot retention** — retain forever in P1; `pruneCompletedSnapshots()` exported as ops surface, not wired.
- **Workflow registry shape** — hybrid: `workflowRegistry` singleton + `BuiltWorkflow.resume()` instance method + top-level `resumeWorkflow()` dispatch. Registration at `apps/api/src/main.ts`.
- **StepCtx W2 extensions** — minimal: `suspend()` + `resumePayload` only.
- **Retry semantics** — opt-in per step (`retry: { maxAttempts, backoff?, shouldRetry? }`); default `shouldRetry` is `classifyError(err) === 'transient'`; in-memory attempt count only.
- **Resume return contract** — four entry points (`run`/`runAsync`/`resume`/`resumeAsync`), no `awaitMs` knob; caller intent explicit at call site.
- **Audit granularity** — workflow-level transitions only (six row types per lifecycle); same-tx with snapshot writes.

## 23. Cross-references

- **W1 spec:** `docs/superpowers/specs/2026-05-13-agent-workflows-w1-design.md`.
- **Package contract:** `platform/agent/workflows/SCOPE.md`.
- **Spike report:** `docs/explorations/2026-05-12-mastra-spike/05-workflows.md`.
- **Mastra reference:** `/Users/canh/Projects/Seta/mastra/packages/core/src/workflows/` — `workflow.ts:3321..3913`, `types.ts:363`, `mastra/index.ts:2339`.
- **Sibling spec for schema-per-module shape:** `docs/superpowers/specs/2026-05-12-agent-memory-design.md`.
- **Migration runner:** `platform/db/src/migrate.ts` — `OWNER_ORDER` edit at line 7.
- **Audit:** `platform/audit/src/writer.ts` — `recordAudit(sql, entry)`.
- **Retry:** `platform/agent/core/src/models/retry.ts` — `withRetry()`; `platform/agent/core/src/errors/classify.ts` — `classifyError()`.
- **Setup spec:** `docs/setup.md` §3 (schema table — amended in this PR).
