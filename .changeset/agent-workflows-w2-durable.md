---
"@seta/agent-workflows": minor
"@seta/db": patch
---

W2: durable persistence + suspend/resume + p-queue runner + opt-in
per-step retry + `@seta/audit` integration.

**New exports:**
- `workflowRegistry` (singleton: register/get/list/configure)
- `resumeWorkflow` / `resumeWorkflowAsync` (top-level dispatch by runId)
- `pruneCompletedSnapshots` (ops surface — not auto-wired)
- `setDurableSql`, `setResumeSql`, `setPruneSql` (boot-time injection hooks
  for the shared `@seta/db` pool, callable from `apps/api`)
- Schema: `agentWorkflowsSchema`, `workflowSnapshots`, `workflowSteps` and
  inferred row types
- W2 errors: `WorkflowSuspended`, `WorkflowResumeContended`,
  `WorkflowSnapshotNotFound`, `WorkflowNotSuspended`, `WorkflowMismatch`,
  `WorkflowResumeLabelUnknown`, `WorkflowNotRegistered`
- Type: `RunResult` (discriminated union: completed | suspended | failed |
  bailed), `serializeError`

**`BuiltWorkflow` API additions:**
- `runAsync(input, opts?)` — fire-and-forget, returns `{ runId }`
- `resume(runId, { label, payload }, opts?)` — sync resume; awaits next
  durable boundary
- `resumeAsync(runId, params, opts?)` — fire-and-forget resume

**Step API additions:**
- `defineStep({ ..., retry: { maxAttempts, backoff?, shouldRetry? } })` —
  opt-in per-step retry. Default predicate is
  `classifyError(err) === 'transient'` (matches agent-core's HTTP-shaped
  transient predicate). `WorkflowBailed` and `WorkflowSuspended` are never
  retried.
- `StepCtx.suspend({ resumeLabel, payload? })` — throws
  `WorkflowSuspended`; engine persists the snapshot inside `withTenant`.
- `StepCtx.resumePayload` — populated on the resumed step's first
  re-execution; otherwise undefined.

**Breaking** (pre-1.0): `BuiltWorkflow.run(input)` now returns
`Promise<RunResult<TOut>>` instead of `Promise<TOut>`. Every caller pattern-
matches on `result.status`. The W1 in-memory runner module is removed;
behavioural tests (sequential ordering, parallel concurrency, abort
propagation, tenant context, `ctx.bail`) live in integration tests now.

**Durability contract:**
- Field names mirror Mastra's `WorkflowRunState` (`serialized_step_graph`,
  `active_paths`, `suspended_paths`, `step_results`, `resume_labels`,
  `status`) so a future port stays mechanical.
- Every snapshot write goes through `withTenant`; RLS policies on both
  tables enforce `current_setting('app.tenant_id', true)::uuid = tenant_id`.
- Resume serialised by `pg_try_advisory_xact_lock(hashtext(run_id))`. Two
  concurrent resume callers: exactly one wins; the other throws
  `WorkflowResumeContended` or `WorkflowNotSuspended` on retry.
- Per-step writes use atomic `jsonb` concat on `step_results` so parallel
  branches don't race on the merge.

**Audit:** six workflow-level transitions (`workflow.started` / `.suspended`
/ `.resumed` / `.completed` / `.failed` / `.bailed`), each same-tx with its
snapshot write. Payload digest is `sha256(...).slice(0, 32)` — short for
forensic correlation without leaking PII.

**Runner:** in-process `p-queue` with `concurrencyKey = tenant_id`; caller-
injected concurrency via `workflowRegistry.configure({ perTenantConcurrency })`.

**`@seta/db`:** OWNER_ORDER now includes `agent_workflows` (after
`agent_memory`); the migration runner applies its migrations in dependency
order. No public-API change beyond the constant.
