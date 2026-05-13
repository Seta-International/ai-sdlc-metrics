# SCOPE — platform/agent/workflows  (@seta/agent-workflows — P1)

> **Status:** **P1 — own package `@seta/agent-workflows` lands under `platform/agent/workflows/`.** The package.json + `src/` + `migrations/` are NOT created in this PR; this SCOPE.md is the P1 contract and the directory placeholder. The package is created in a follow-up PR when real code lands — see CLAUDE.md "CLI-only — packages and dependencies".
>
> **P1 scope override (2026-05-12):** the spike report `05-workflows.md` originally recommended P2-deferring the workflow engine outright. User-directed scope change: multiple internal Seta workflows require durable suspend/resume + HITL approval gates beyond what `write_continuations` (the kernel's two-phase preview/commit token) covers. Building a minimum-viable engine in-house in P1 avoids taking a runtime dependency on Temporal or Inngest. The minimum P1 surface is intentionally smaller than what Mastra ships — see "Minimum viable P1 surface" below.

## Purpose

A workflow engine — chainable step DSL with suspend/resume, durable execution, and HITL approval gates — gives a product author explicit control over multi-step orchestration that can't be expressed cleanly as an LLM-planned tool-call loop inside a single HTTP turn.

Mastra ships one (`mastra/workflows/`, `packages/core/src/run/`). Temporal, Inngest, AWS Step Functions, and Restate occupy the same niche externally.

**Seta OS builds a minimal in-house engine in P1 so it composes natively with the kernel, the tenant ALS, and the existing `write_continuations` preview/commit primitive.** Read on for the scope boundaries.

## Why P1 (overriding spike recommendation)

The spike `05-workflows.md` originally argued for P2-defer on four grounds. Those arguments are preserved here so the trade-offs stay visible — and each is paired with the override rationale.

1. **Spike argued: chat agents don't need a DAG primitive — the LLM is the planner.** *Override:* Several internal Seta flows (procurement approvals, multi-day onboarding sequences, scheduled report generation) span hours-to-days and multiple actor sessions. The LLM-planned tool loop is bounded by one HTTP/SSE turn; these flows are not.
2. **Spike argued: two-phase writes use `write_continuations`.** *Override:* `write_continuations` is a single preview→commit hop bounded by HMAC TTL. It does not model multi-step approval chains (request → manager → finance → archive) or persistent state across multiple human acknowledgements. Workflows extend the same idempotency idea over a longer durable timeline.
3. **Spike argued: suspend/resume requires durable state — a project the size of `@seta/db`.** *Override:* True in full generality. The P1 surface deliberately shrinks the scope (linear DAG only, advisory-lock concurrency, in-process runner) so the cost is bounded — see "Minimum viable P1 surface". The full Mastra `ExecutionEngine` abstraction (Inngest / Temporal adapters) stays P2.
4. **Spike argued: no P1 use case justifies it.** *Override:* User-directed; this is the change being made.

**Re-evaluate scope expansion (`.branch()`, `.dowhile()`, `.foreach()`, pluggable `ExecutionEngine`) when:** A product ships a flow whose shape genuinely cannot be linearized via `.then()` / `.parallel()` (data-dependent branching, dynamic fan-out), or when the in-process `p-queue` runner hits a documented scaling trigger from setup.md §3.

## Minimum viable P1 surface

- **DSL:** `createWorkflow().then(step).parallel([stepA, stepB]).commit()` — linear DAG only. **Drop `.branch()` / `.dowhile()` / `.dountil()` / `.foreach()` / `.map()` / `.sleep()` / `.sleepUntil()` to P2.** A `.then(step)` after a `.parallel([...])` is a join; that's the entire composition surface.
- **Schema (owned by this package):** `agent_workflows.workflow_snapshots(run_id uuid pk, tenant_id, workflow_id, serialized_step_graph jsonb, active_paths jsonb, suspended_paths jsonb, step_results jsonb, status text, updated_at)` and `agent_workflows.workflow_steps(run_id fk, step_id, status, input_hash, output jsonb, started_at, finished_at)`. Names mirror Mastra's `WorkflowRunState` (`workflows/types.ts:363`) so a future port is mechanical.
- **Suspend/resume concurrency:** Postgres advisory lock at resume time — `pg_try_advisory_xact_lock(hashtext(run_id))` inside the resume transaction. Only one consumer wins; the loser observes `lock not acquired` and bails. No Redis required.
- **Job runner:** in-process `p-queue@9.2.0` (already pinned in setup.md §13). No external job broker. Scheduled / time-based wakeups are out of P1 scope — products use cron / scheduled sync paths instead.
- **HITL primitive:** a `step.suspend({ reason, resumeLabel, payload })` call inside an executing step returns a branded-void; the engine persists the snapshot and the channel sends a card prompt. Resume is `workflow.resume(runId, { label, payload })` from any product-owned route handler. The inner per-step write (e.g., "set task status") still uses the kernel's `write_continuations` preview/commit; workflow-level approval is the *outer* gate.

## Responsibilities

- **Owns:**
  - The DSL builder (`createWorkflow().then(...).parallel(...).commit()` — linear DAG only in P1).
  - The `agent_workflows` Postgres schema (`workflow_snapshots`, `workflow_steps`). Owns its own Drizzle schema file, `drizzle.config.ts` (with `schemaFilter: ['agent_workflows']`), and `migrations/` directory per CLAUDE.md "Schema-per-module (DDD)".
  - The in-process execution engine (`p-queue`-backed runner, step retry per-step, suspend/resume via advisory lock).
  - The `Step` contract: input/output Zod schemas, `suspend(payload, {resumeLabel})` and `bail()` branded-void helpers (shape per Mastra `step.ts:13`).
  - `resume(runId, { label, payload })` entrypoint.
- **Does NOT own:**
  - The `Run` identifier (UUID) or `RunStatus` type — those live in `@seta/agent-core` already as the join key between kernel runs and workflow snapshots. (See [`platform/agent/core/SCOPE.md`](../core/SCOPE.md) § Run loop, lines around 153–156. `workflow_snapshots.run_id` joins to the kernel's `Run`.)
  - The tool execution context — that's `@seta/agent-core`.
  - Per-product workflow definitions — those live alongside the product (e.g., `modules/products/agent/src/workflows/`).
  - HTTP routes for kicking off / resuming workflows — those live in the consuming product (e.g., `modules/products/agent`).
  - The pluggable `ExecutionEngine` abstraction (Mastra `execution-engine.ts:51`) and Inngest/Temporal adapters — P2-deferred.
  - `.branch()` / `.dowhile()` / `.dountil()` / `.foreach()` / `.map()` / `.sleep()` / `.sleepUntil()` DSL operators — P2-deferred.

## Current state (P1)

- **Directory placeholder only.** This SCOPE.md exists; no `package.json`, no `src/`, no migrations land in this PR. The package is created in the next PR via `pnpm new:package`.
- The kernel-side seams are already specified in `@seta/agent-core` (and remain there):
  - `Run` identifier (UUID) threaded through the kernel loop — the join key.
  - `RunStatus` type (`'created' | 'running' | 'completed' | 'failed'`) exported from `@seta/agent-core`.
  - Tool result envelope's optional `{ suspend?: { reason: string; resumeLabel: string } }` discriminant — in P1 the engine wires this so a tool returning `suspend` causes the *workflow step* wrapping that tool call to persist a snapshot.
- **P1 composition (apps/api/src/main.ts):** mounts the `@seta/agent-workflows` in-process runner alongside the kernel; products register named workflows at boot.

## Public interface (when implementation lands — P1)

```ts
// Sketch — full surface lands with the package.
import { createWorkflow, defineStep } from '@seta/agent-workflows'

const reviewStep = defineStep({
  id: 'review',
  inputSchema: z.object({ taskId: z.string() }),
  outputSchema: z.object({ approved: z.boolean() }),
  async execute(input, ctx) {
    // ctx.suspend({ reason, resumeLabel, payload }) for HITL
    // ctx.bail() to terminate the workflow early
  },
})

const wf = createWorkflow({ id: 'task.review' })
  .then(reviewStep)
  .parallel([notifyStep, auditStep])
  .then(archiveStep)
  .commit()

// product mounts:
await wf.run({ taskId: 'abc' })
await wf.resume(runId, { label: 'manager-approval', payload: { ok: true } })
```

The package also exports its Drizzle schema (`agentWorkflowsSchema`, `workflowSnapshots`, `workflowSteps`) and inferred row types.

## Imports (when implementation lands — P1)

- **Allowed internal:** `@seta/agent-core` (`Run` / `RunStatus` types, `KernelError` subclasses), `@seta/db` (pool + `withTenant` + role exports + migration runner), `@seta/tenant` (context reads — workflows run under the originating tenant), `@seta/audit` (record suspend / resume / step transitions), `@seta/observability` (logger + OTel spans for step boundaries).
- **Forbidden:** any `modules/*` package, `apps/*`. `@seta/middleware` route helpers (Hono / OpenAPI) are forbidden — this is a library, not a route module. The `@seta/middleware/errors` subpath (`DomainError` base) is allowed and is the canonical project contract per CLAUDE.md. No model SDKs.
- **External (pinned per setup.md §13):** `zod@4.4.3`, `drizzle-orm@0.45.2`, `postgres@3.4.9` (transitively via `@seta/db`), `p-queue@9.2.0`, `uuid` (or `uuid@14.0.0` v7) for run id generation.

## Patterns to follow

- **Workflows compose `@seta/agent-core` tools as step bodies** — a workflow step's `execute()` can call into the kernel `run()` for a bounded tool-loop. The workflow handles the *outer* multi-turn shape; the kernel handles each inner LLM turn.
- **Use `write_continuations` for inner per-step HITL preview/commit; use workflow `suspend()` for outer multi-turn approval gates.** The two primitives compose — they do not overlap.
- **Persist via `withTenant`** — every snapshot write and resume read goes through the tenant-scoped seam. RLS is the backstop. (Setup.md §3 footgun discussion.)
- **Advisory-lock the resume path** — `pg_try_advisory_xact_lock(hashtext(run_id))` inside the resume tx; loser bails cleanly without retrying. Idempotent at-least-once is the contract (not exactly-once).
- **Idempotent step execution** — every step's `(run_id, step_id)` is the natural idempotency key; a re-run of the same step with the same input returns the recorded output.
- **Run advances via `p-queue`** — bounded concurrency from the start (per CLAUDE.md "LRU + `p-queue` + pgvector"). Concurrency is per-tenant; the queue key is `tenant_id`.
- **Thread `Run` identifier through to the kernel** — `workflow_snapshots.run_id` is the same UUID the kernel uses for its run, joining workflow-level and kernel-level audit rows without an extra correlation column.
- **Schema-per-module migrations** — `drizzle-kit generate` produces `migrations/*.sql` in this package; the top-level runner in `@seta/db` applies them in `OWNER_ORDER`. Never hand-edit migration SQL.

## Patterns to avoid

- **Do NOT add `.branch()` / `.dowhile()` / `.dountil()` / `.foreach()` / `.map()` / `.sleep()` / `.sleepUntil()` operators in P1** — linear DAG (`.then()` + `.parallel()`) only. P2 expansion is gated on a real product use case that cannot be linearized.
- **Do NOT introduce a pluggable `ExecutionEngine` abstraction (Mastra `execution-engine.ts:51`) in P1** — the in-process `p-queue` runner is the only engine. Inngest / Temporal adapters are P2.
- **Do NOT import `@mastra/workflows`, Temporal SDK, or Inngest SDK** in any seta-os package. (Spike `05-workflows.md`.)
- **Do NOT cross-schema FK** into kernel or product tables — reference by id (CLAUDE.md "Schema-per-module").
- **Do NOT model approval-without-state as workflows** — single-hop preview→commit stays as `write_continuations`. Workflows are for chains the HMAC token cannot model.
- **Do NOT add scheduled / cron-driven step wakeups in P1** — `.sleep()` / `.sleepUntil()` are P2. Products that need scheduled triggers use the cron / scheduled-sync surface instead.
- **Do NOT spin up a separate node process or job runner** — the runner is in-process inside `apps/api`. Multi-instance is OK because advisory locks coordinate; out-of-process scaling triggers the P2 broker move (setup.md §3 scaling triggers).

## Test strategy (P1)

- **Unit tests (`src/**/*.test.ts`):** DSL composition, step contract typing, snapshot serialization, `suspend()` / `bail()` branded-void semantics, advisory-lock contention shape (mock the SQL).
- **Integration tests (`tests/integration/**`, requires `DATABASE_URL`):** real Postgres + advisory lock — two concurrent `resume(runId)` callers, exactly one wins; suspend → persist → resume → continue golden path; RLS isolation across tenants.
- **Concurrency tests required** — two consumers resume the same workflow; only one wins. This is the load-bearing test for the durability contract.
- **No LLM fixtures needed** — workflow engine is below the model layer. Step bodies that call into `@seta/agent-core` use the `@seta/agent-core/testkit` recordings; the engine itself does not.

## Open questions

1. **Schema name confirmed `agent_workflows`.** Setup.md §3 line 117's "future" list should be amended in a follow-up setup.md PR to mention the `agent_workflows` schema explicitly (no `workflow_snapshots` rows in P1's *existing* spec, but the override changes that).
2. **`@seta/db` `OWNER_ORDER` placement.** Runner list in `platform/db/SCOPE.md` must include `agent_workflows` (added after `agent` and `agent_memory`). See `platform/db/SCOPE.md` for the canonical order.
3. **Cross-tenant fan-out.** `.parallel([...])` steps inherit the parent tenant — never split across tenants in P1. Confirmed by `tenantContext.run()` scoping at step boundary.
4. **Retry policy per step — exponential vs fixed?** Mirror `@seta/agent-core`'s `withRetry` defaults (`maxRetries: 2`, transient-only). Per-step override via the step definition.
5. **Snapshot pruning.** Completed snapshots accumulate. Document a retention policy (e.g., 30 days post-completion) before P1 close-out; not enforced in v1.
6. **Run id source.** Use the same UUID generator (`@seta/agent-core` `RunCtx.generateId`) so a workflow-created run and a kernel-created run share an id space.

## Cross-references

- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/05-workflows.md`](../../../docs/explorations/2026-05-12-mastra-spike/05-workflows.md) — original P2-defer rationale + P1 override note.
- **Kernel seam:** [`platform/agent/core/SCOPE.md`](../core/SCOPE.md) § Run loop — `Run` / `RunStatus` / `{ suspend? }` discriminant.
- **Product consumer:** [`modules/products/agent/SCOPE.md`](../../../modules/products/agent/SCOPE.md) — products register named workflows and expose run / resume HTTP routes.
- **Migration runner:** [`platform/db/SCOPE.md`](../../db/SCOPE.md) — `OWNER_ORDER` must include `agent_workflows`.
- **Setup spec:** [`docs/setup.md`](../../../docs/setup.md) §3 (schema list — to be amended), §11 (product layout — workflows live alongside the product).
