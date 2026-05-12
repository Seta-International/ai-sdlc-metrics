# Mastra spike — Workflows (suspend/resume, `.then/.branch/.parallel`)

## P1 override

**Date:** 2026-05-12. **Scope change:** the original spike recommendation in this report was a hard P2-defer on the workflow engine — the argument being that chat agents need the tool-loop + `write_continuations` preview/commit, not a DAG. **User-directed override:** multiple internal Seta workflows (procurement approvals, multi-day onboarding, scheduled report generation) require durable suspend/resume + outer-level HITL approval gates that span hours-to-days across multiple actor sessions. `write_continuations` is a single-hop HMAC TTL token; it does not model multi-step approval chains.

A new platform package **`@seta/agent-workflows`** is created in P1 under `platform/agent/workflows/`, owning the `agent_workflows` Postgres schema (`workflow_snapshots`, `workflow_steps`). Building in-house in P1 avoids a runtime dependency on Temporal or Inngest. The minimum P1 surface is intentionally smaller than what Mastra ships — see "Minimum viable P1 surface" below. The pluggable `ExecutionEngine` abstraction (`execution-engine.ts:51`) and the Inngest/Temporal adapters remain P2-deferred. See `platform/agent/workflows/SCOPE.md` for the full P1 contract.

## Minimum viable P1 surface

- **DSL:** `createWorkflow().then(step).parallel([stepA, stepB]).commit()` — linear DAG only. `.branch()` / `.dowhile()` / `.dountil()` / `.foreach()` / `.map()` / `.sleep()` / `.sleepUntil()` are **P2-deferred**.
- **Suspend/resume concurrency:** Postgres advisory lock at resume time (`pg_try_advisory_xact_lock(hashtext(run_id))`). Only one consumer wins; no Redis broker.
- **Job runner:** in-process `p-queue@9.2.0` (already pinned in setup.md §13). No external job broker. Scheduled / time-based wakeups out of P1.
- **HITL primitive:** `ctx.suspend({ reason, resumeLabel, payload })` inside a step; `workflow.resume(runId, { label, payload })` from a product route. Inner per-step writes still use `write_continuations` preview/commit; workflow-level approval is the outer gate.
- **Schema:** `agent_workflows.workflow_snapshots` + `agent_workflows.workflow_steps` (field names mirror Mastra's `WorkflowRunState` `workflows/types.ts:363` so a future port is mechanical).

## What Mastra does

Mastra ships a typed, chainable workflow builder that composes `Step`s (validated by Zod-shaped `inputSchema`/`outputSchema`/`resumeSchema`/`suspendSchema`) into a serialized step-flow graph:

- DSL on `Workflow`: `.then()` (`/Users/canh/Projects/Seta/mastra/packages/core/src/workflows/workflow.ts:1732`), `.parallel()` (`:2036`), `.branch()` (`:2087`), `.dowhile()` (`:2143`), `.dountil()` (`:2191`), `.foreach()` (`:2239`), `.map()` (`:1867`), `.sleep()` (`:1777`), `.sleepUntil()` (`:1816`), `.commit()` (`:2308`). `.waitForEvent()` is explicitly removed in favour of suspend/resume (`:1850`).
- A `Step` (`/Users/canh/Projects/Seta/mastra/packages/core/src/workflows/step.ts:148`) receives `suspend(payload, {resumeLabel})` and `bail()` as branded-void calls — the engine treats them as control flow, not return values (`step.ts:13`, `:50`).
- `ExecutionEngine` (`/Users/canh/Projects/Seta/mastra/packages/core/src/workflows/execution-engine.ts:51`) is abstract — `DefaultExecutionEngine` in `default.ts` is the in-process implementation; `workflows/inngest/src/execution-engine.ts:21` (`InngestExecutionEngine extends DefaultExecutionEngine`) and `workflows/temporal/src/workflow.ts` provide durable backends. The `execute` contract takes a `resume: { steps, stepResults, resumePayload, resumePath, forEachIndex, label }` envelope (`execution-engine.ts:159`).
- Suspend/resume is **storage-backed**, not in-memory. `WorkflowsStorage` requires `persistWorkflowSnapshot` and `loadWorkflowSnapshot` (`/Users/canh/Projects/Seta/mastra/packages/core/src/storage/domains/workflows/base.ts:39`,`:48`). The persisted `WorkflowRunState` (`workflows/types.ts:363`) carries `serializedStepGraph`, `activePaths`, `suspendedPaths`, `resumeLabels`, `waitingPaths`, `stepExecutionPath`, `tracingContext` for span continuity. Re-entry pathfinding happens in `default.ts:757` (`startIdx = resume.resumePath[0]`) and suspend collection in `default.ts:590-603`.
- `RunStatus` is a flat string union (`/Users/canh/Projects/Seta/mastra/packages/core/src/run/types.ts:1`): `'created' | 'running' | 'completed' | 'failed'`. Suspended is a `StepResult.status`, not a top-level run state.

## What setup.md plans

setup.md has **no workflow primitive, no DAG/state-machine package, no suspend/resume**. The closest existing concept is the agent's preview→commit pattern:

- §3 data layer, P1 schema list (`/Users/canh/Projects/Seta/seta-os/docs/setup.md:117`): `` `agent` | `@seta/agent` (product) | `write_continuations` — HMAC-signed preview→commit tokens; future: conversations, runs, working memory ``
- §11 layout (`setup.md:946`): `schema.ts # Drizzle: agent.write_continuations (HMAC-signed preview→commit tokens)` and `:945` `write/ # create_tasks.preview/.commit, update_tasks.preview/.commit, …`

That is the only durable two-phase primitive in P1, and it is a Planner-write idempotency token, not a general workflow engine. Tool execution itself is the agent kernel's tool-call loop (§5, `@seta/agent-core`).

## Delta

**Fold in:** the `suspendPayload` / `resumeLabel` *shape* (`step.ts:13`) is the clean spec for HITL approvals — adopted verbatim. `WorkflowRunState` (`types.ts:363`) field names are mirrored in `agent_workflows.workflow_snapshots` so a future engine swap is mechanical.

**Recommendation (P1 override):** build a minimum-viable in-house engine in `@seta/agent-workflows` covering only what the Seta P1 product flows actually need (linear DAG, advisory-lock concurrency, in-process runner). The full Mastra surface (`.branch()`, `.foreach()`, `.sleep()`, pluggable `ExecutionEngine` with Inngest/Temporal adapters) stays P2 — we expand the surface when a real product flow demonstrably needs it.

**Avoid:** importing Mastra's workflow package, Temporal SDK, or Inngest SDK directly. Implement the minimum P1 surface in-house against Postgres + `p-queue`. Mastra's source remains a reference for field names and step semantics, not a runtime dependency.

**Open questions:** (a) Snapshot retention policy — completed workflows accumulate; document a 30-day prune before P1 close-out. (b) Run-id source — share the ULID generator with `@seta/agent-core` `RunCtx.generateId` so workflow runs and kernel runs share an id space. (c) Cross-tenant fan-out in `.parallel([...])` — disallowed in P1 (steps inherit the parent tenant via `tenantContext.run()` at step boundary).

## Punch list

- `P1 (override): @seta/agent-workflows — new platform package under platform/agent/workflows/. Owns the in-house linear-DAG workflow engine (.then() / .parallel() only) plus the agent_workflows schema (workflow_snapshots, workflow_steps). See platform/agent/workflows/SCOPE.md.`
- `P1 (override): suspend/resume storage — agent_workflows.workflow_snapshots(run_id ulid pk, tenant_id, workflow_id, serialized_step_graph jsonb, active_paths jsonb, suspended_paths jsonb, step_results jsonb, status text, updated_at) + agent_workflows.workflow_steps(run_id fk, step_id, status, input_hash, output jsonb, started_at, finished_at). Field names mirror Mastra's WorkflowRunState (types.ts:363).`
- `P1 (override): suspend/resume concurrency via Postgres advisory lock — pg_try_advisory_xact_lock(hashtext(run_id)) inside the resume tx. Loser bails cleanly; at-least-once + idempotent (run_id, step_id) is the contract.`
- `P1 (override): in-process job runner using p-queue@9.2.0 (already pinned setup.md §13). No external broker; out-of-process scaling triggers the P2 broker move per setup.md §3 scaling triggers.`
- `setup.md §3 (line 117): amend the schema list — agent_memory schema owned by @seta/agent-memory, agent_workflows schema owned by @seta/agent-workflows (P1). Existing agent schema (@seta/agent product) remains for write_continuations only.`
- `setup.md §11 (line 939): replace the previous "No workflow DSL in P1" note under modules/products/agent with — "Multi-step plans that exceed one HTTP turn compose @seta/agent-workflows .then()/.parallel(); two-phase writes still use write_continuations for inner per-step HITL."`
- `@seta/agent-core: keep the Run identifier (ULID) + RunStatus ('created'|'running'|'completed'|'failed', matching run/types.ts:1) — these are the join key between kernel runs and workflow_snapshots.run_id.`
- `@seta/agent-core: tool result envelope { suspend?: { reason, resumeLabel } } discriminant is now wired by @seta/agent-workflows — when a tool returns suspend inside a workflow-step body, the engine persists the snapshot.`
- `P2-defer: .branch() / .dowhile() / .dountil() / .foreach() / .map() / .sleep() / .sleepUntil() DSL operators — linear DAG only in P1. Expand when a real product flow can't be linearized.`
- `P2-defer: pluggable ExecutionEngine abstraction (execution-engine.ts:51) and Inngest/Temporal adapters — only meaningful once an in-process runner saturates. Revisit alongside the scaling trigger in §3.`
- `P2-defer: scheduled / cron-driven step wakeups — products that need scheduled triggers use the cron / scheduled-sync surface, not workflow .sleep() in P1.`
