# SCOPE — platform/agent/workflows  (P2-deferred — no package planned)

> **Status:** **P2-deferred.** This SCOPE.md exists as a discoverability stub so a future agent searching for "workflow" finds the rationale at a predictable path. **The spike's strong recommendation is to NOT build a workflow engine.** See "Why P2-deferred" below.

## Purpose

A workflow engine — `.then()` / `.branch()` / `.parallel()` / `.dowhile()` / `.foreach()` DSL with suspend/resume, durable execution, and HITL approval gates — gives a product author explicit control over multi-step orchestration that can't be expressed cleanly as an LLM-planned tool-call loop.

Mastra ships one (`/Users/canh/Projects/Seta/mastra/workflows/`, `packages/core/src/run/`). Temporal, Inngest, and AWS Step Functions occupy the same niche externally.

**Seta OS does not need one in P1, and the spike recommends not building one in P2 either.** Read on for why.

## Why P2-deferred

Per spike report `05-workflows.md`:

1. **Chat agents don't need a DAG primitive.** The LLM is the planner. Multi-step plans are LLM-planned tool calls executed inside the kernel loop. The kernel's tool-call loop *is* the workflow engine for the things we ship.
2. **Two-phase writes use `write_continuations`.** When a sensitive action needs human approval, the `preview` tool returns a continuation token; the user confirms in chat; the `commit` tool consumes the token. This covers the most common HITL pattern statelessly — no workflow primitive needed. (See `modules/products/agent/tools/planner/write/` per setup.md §11.)
3. **Suspend/resume requires durable state.** Mastra's suspend/resume needs `workflow_snapshots` tables with RLS, concurrency-safe resume locks, and a job runner. That's a project the size of `@seta/db` itself — a steep cost without a P1 driver.
4. **No P1 use case justifies it.** Setup.md §3 line 117 lists future memory tables but no workflow tables. Setup.md §11 lists future product modules (PMO, Timesheet, Finance) but none have stated workflow needs.

**Re-evaluate when:** A product ships timer-driven, multi-hour, or HITL-approval flows that genuinely exceed one HTTP turn AND can't be expressed as preview/commit pairs. Cron jobs, scheduled syncs, and message bus consumers count as that "exceeds one HTTP turn" — but those are best served by `p-queue` in-process today and a real queue (Redis/SQS) once setup.md's scaling triggers fire. Neither needs a workflow DSL.

## Responsibilities (if/when it lands)

- **Owns:**
  - The DSL builder (`createWorkflow().then(...).branch(...).parallel(...)`).
  - `workflow_snapshots` schema (durable state per workflow run).
  - The execution engine (event loop, step retry, suspend/resume locking).
- **Does NOT own:**
  - The `Run` identifier (ULID) or `RunStatus` type — those live in `@seta/agent-core` already as a forward-compat seam. (See [`platform/agent/core/SCOPE.md`](../core/SCOPE.md) lines 153–156.)
  - The tool execution context — that's `@seta/agent-core`.
  - Per-product workflow definitions — those live alongside the product (e.g., `modules/products/<name>/workflows/`).

## Current state (P1)

- **Nothing implemented and nothing planned for P1.**
- The kernel does leave a forward-compatibility seam (per spike `05-workflows.md:36`):
  - `Run` identifier (ULID) is threaded through the kernel loop.
  - `RunStatus` type (`'created' | 'running' | 'completed' | 'failed'`) is exported from `@seta/agent-core`.
  - Tool result envelope supports an optional `{ suspend?: { reason: string; resumeLabel: string } }` discriminant — **shape-only, not wired** in P1.
- These seams cost ~10 lines of code and unlock joining a future `workflow_snapshots.run_id` without refactoring the kernel.

## Public interface (deferred)

Not specified. When the time comes, see Mastra's `workflows/` directory as a reference (`createWorkflow`, `Step`, `WorkflowRun`, `ProcessorRunner`).

## Imports (deferred)

Not specified.

## Patterns to follow (today, even without a workflow engine)

- **Use the kernel tool-call loop for multi-step plans.** Trust the LLM to plan. (Spike `05-workflows.md:32-33`.)
- **Use preview/commit + `write_continuations` for HITL.** Two-phase writes are the P1 HITL primitive. (Setup.md §11 `modules/products/agent/tools/`.)
- **Thread `Run` identifier through the kernel from day one.** The seam is cheap; not leaving it forces a refactor when (if) a workflow engine lands later. (Spike `05-workflows.md:36`, `platform/agent/core/SCOPE.md` lines 153–156.)
- **Carry the `{ suspend?: ... }` discriminant on tool results.** Shape only; never set in P1. (Spike `05-workflows.md` punch list.)

## Patterns to avoid

- **Do NOT import `@mastra/workflows`, Temporal SDK, or Inngest SDK** in any seta-os package. (Spike `05-workflows.md`.)
- **Do NOT add a `workflow_snapshots` table speculatively.** No code reads it; RLS policy unwritten; concurrency strategy undefined. Wait for a real use case.
- **Do NOT add `.then()`/`.branch()` style helpers to `@seta/agent-core`** — they imply a DAG that doesn't exist. Keep the kernel as a tool-call loop.
- **Do NOT model "approval queues" as workflows.** Use `write_continuations` (HMAC-signed preview → commit) — it's stateless, audit-friendly, and survives multi-instance deploys without a workflow runner.

## Test strategy (deferred)

Not applicable in P1. When/if implemented: integration tests against dockerized pg + an in-process job runner; suspend/resume golden-path tests; concurrency tests (two consumers resume the same workflow — only one wins).

## Open questions (queued for the P2-revisit moment)

1. **Engine ownership — build in-house vs adopt Temporal/Inngest/Restate?** If we ever need a durable workflow, adopting (rather than building) is almost certainly the right call. Setup.md §10 already rejects LangChain/Vercel AI SDK because they duplicate the kernel — workflow engines do NOT duplicate the kernel, so they aren't subject to the same rejection.
2. **Storage shape — `agent` schema vs new `workflows` schema?** New schema, owned by whichever package adopts it.
3. **Job runner — `p-queue` in-process vs Redis-backed?** Setup.md's scaling triggers in §3 already enumerate when in-process becomes insufficient. Same triggers apply here.
4. **Suspend/resume semantics — exactly-once vs at-least-once?** Idempotency comes from the underlying tool (HMAC continuations); exactly-once is rarely worth the cost.

## Cross-references

- **Spike report:** [`docs/explorations/2026-05-12-mastra-spike/05-workflows.md`](../../../docs/explorations/2026-05-12-mastra-spike/05-workflows.md) — full P2-defer rationale.
- **Kernel seam:** [`platform/agent/core/SCOPE.md`](../core/SCOPE.md) lines 51–53, 72–73, 153–156 — `Run` + `RunStatus` + `{ suspend? }` discriminant.
- **Product non-responsibility:** [`modules/products/agent/SCOPE.md`](../../../modules/products/agent/SCOPE.md) lines 25, 77, 100–101, 115 — workflow engines under "Patterns to avoid".
- **Setup spec:** [`docs/setup.md`](../../../docs/setup.md) §3 line 117 (no workflow tables planned), §11 (no workflow primitive in `modules/products/agent`).
