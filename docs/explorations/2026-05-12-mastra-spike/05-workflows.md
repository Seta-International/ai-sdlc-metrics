# Mastra spike — Workflows (suspend/resume, `.then/.branch/.parallel`)

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

**Fold in (cheap, no engine needed):** the `suspendPayload` / `resumeLabel` *shape* (`step.ts:13`) is a clean spec for human-in-the-loop approvals. `WorkflowRunState` (`types.ts:363`) is the right serialization shape if/when we need it — copy field names so a later port is mechanical.

**Avoid:** importing Mastra's workflow package. It is load-bearing for *durable, long-running* graphs (sleepUntil, foreach over batches, branch on external signal). For chat-driven agents whose unit of work is a single tool-call loop bounded by an HTTP/SSE response, it is sugar — the LLM is the planner, tools are the steps, and the kernel already owns retries + abort + streaming.

**Open questions:** (a) Will Planner *bulk* writes ever exceed one request? — bulk preview→commit already covers this without a workflow. (b) Do we need timer-driven follow-ups ("ping me in 1h")? — that is a scheduler concern, not a workflow concern; defer with the scheduler. (c) SA-9 (durable agent state): suspend/resume requires `workflow_snapshots(run_id, snapshot jsonb, updated_at)` + concurrency control (`supportsConcurrentUpdates`, `base.ts:13`) — explicit P2 cost.

## Punch list

- `P2-defer: workflow engine — chat agents need tool-loop + preview→commit, not a DAG. Re-evaluate when a product ships timer-driven, multi-hour, or HITL-approval flows that exceed one HTTP turn.`
- `P2-defer: suspend/resume storage — requires snapshot table + RLS policy + concurrency strategy mirroring storage/domains/workflows/base.ts:39. No P1 use case justifies the schema.`
- `setup.md §3 (line 117): add parenthetical to the agent schema row — "(future: workflow_snapshots if a product needs suspend/resume; until then, tool-loop is the only execution primitive)" so the absence is intentional, not an oversight.`
- `setup.md §11 (line 939): add a one-line note under modules/products/agent — "No workflow DSL in P1; multi-step plans are LLM-planned tool calls inside the kernel loop. Two-phase writes use write_continuations."`
- `@seta/agent-core: leave a minimal seam — Run identifier (ULID) threaded through the kernel and a placeholder RunStatus type ('created'|'running'|'completed'|'failed', matching run/types.ts:1) on the run record, so a later workflow_snapshots table joins by run_id without refactor.`
- `@seta/agent-core: tool result envelope should carry an optional { suspend?: { reason, resumeLabel } } discriminant (shape-only, not wired) so HITL tools have a forward-compatible return without us importing Mastra's branded InnerOutput trick.`
- `P2-defer: pluggable ExecutionEngine abstraction (execution-engine.ts:51) and Inngest/Temporal adapters — only meaningful once we own a durable workflow; revisit alongside the scheduling trigger in §3 "scaling triggers".`
