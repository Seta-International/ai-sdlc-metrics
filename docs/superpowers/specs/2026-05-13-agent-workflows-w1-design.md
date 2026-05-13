# `@seta/agent-workflows` W1 — Package skeleton + typed DSL + in-memory runner

**Status:** Draft (pending review)
**Date:** 2026-05-13
**Owner:** Platform team
**Package:** `@seta/agent-workflows` (`platform/agent/workflows/`)
**Predecessors:** Agent-core K1–K4 (kernel surface + `Run` / `RunStatus` join keys), `platform/agent/workflows/SCOPE.md`
**Reference:** Mastra `packages/core/src/workflows/` (production-proven shape — typing patterns, snapshot field names)
**Successor:** W2 — durable snapshots, advisory-lock resume, HITL `suspend()`, integration tests

---

## 1. Goal

Land the `@seta/agent-workflows` package with its public composition surface and an in-memory runner. After W1, a product author can:

- Define typed steps via `defineStep({ id, inputSchema, outputSchema, execute })`.
- Compose them into a workflow via `createWorkflow({ id, inputSchema, outputSchema }).then(...).parallel([...]).then(...).commit()`.
- Execute the workflow via `wf.run({ ... })` synchronously inside a request handler.
- Trust that step input/output types flow through `.then()` and `.parallel()` at compile time (TS catches shape mismatches before runtime).

W1 does **not** ship persistence. There is no `agent_workflows` Postgres schema, no `suspend()` / `resume()`, no `p-queue` runner, no HITL surface. Those land in W2 with integration tests. W1 is shaped so the schema and durability bits drop on top without redesigning the DSL or step contract.

## 2. Non-goals

- **Postgres schema, migrations, `drizzle.config.ts`** — W2.
- **`ctx.suspend()` / `workflow.resume()`** — W2. Not exported as `NotImplementedError` stubs; absent entirely so product code cannot start depending on them.
- **`p-queue`-backed runner** — W2 (introduced alongside cross-run snapshot reads).
- **Per-step retry / backoff** — W2. W1 propagates the first thrown error wrapped in `StepExecutionError`.
- **Audit events** — W2 (every audit row sits inside the snapshot/resume transaction).
- **`.branch()` / `.dowhile()` / `.foreach()` / `.sleep()` / `.map()`** — P2 per SCOPE.md.
- **Pluggable `ExecutionEngine`** — P2 per SCOPE.md.
- **Cron / scheduled triggers** — P2.
- **HTTP routes for run / resume** — owned by the consuming product (`modules/products/agent`), never by this package.
- **Tool-call seam to the kernel** — W1's step body is a plain async function. The `{ suspend? }` discriminant on tool envelopes (SCOPE.md "Current state") wires through in W2 when the engine has a snapshot to persist into.

## 3. Constraints (CLAUDE.md + SCOPE.md)

- ESM-only; `"type": "module"`. `import type` for type-only imports.
- No CJS shim, no legacy alias, no backwards-compat shim — pre-1.0.
- `platform/*` depends on nothing in `modules/*` or `apps/*`.
- Tenant id is never a function parameter — read via `tenantContext.getTenantId()` from `@seta/tenant`. Snapshotted at run entry, propagated via `tenantContext.run()` around every step body.
- No `console.log` — `logger` from `@seta/observability`.
- Errors throw `WorkflowError` subclasses (themselves `DomainError` subclasses from `@seta/middleware/errors`).
- Co-located unit tests in `src/**/*.test.ts`. Type tests in `src/**/*.test-d.ts`. No `tests/integration/` directory in W1.
- No internal `@seta/*` mocking.
- Package created via `pnpm new:package`. Deps added via `pnpm --filter @seta/agent-workflows add ...`. Never hand-edit `package.json` outside metadata fields.

## 4. Mastra alignment (what we keep, what we change)

What we keep from Mastra (`packages/core/src/workflows/workflow.ts`, `step.ts`, `types.ts`):

- **Typed chained builder.** `Workflow<TInitial, TCurrent>` advances `TCurrent` on each `.then()`. Mirrors Mastra's generics.
- **Step id as type-level literal.** `Step<TIn, TOut, TId extends string>` carries the id as a string literal so `.parallel([a, b])` produces `{ [a.id]: AOut; [b.id]: BOut }` keyed records.
- **`.parallel([])` join semantics.** A `.then()` after `.parallel()` consumes the keyed record built by the upstream parallel branch.
- **`.commit()` finalises.** Returns a `BuiltWorkflow<TInput, TOutput>` whose chain methods are typed `never`.
- **Field names for the future snapshot.** SCOPE.md already calls out `serialized_step_graph`, `active_paths`, `suspended_paths`, `step_results`. W1 builds the in-memory step graph in a shape that the W2 snapshot can serialise byte-for-byte from.

What we change vs Mastra:

- **No pluggable `ExecutionEngine` in W1.** The in-memory runner is the only engine. Mastra's `ExecutionEngine` interface (`workflows/execution-engine.ts:51`) does not appear.
- **No `.branch()` / `.dowhile()` / `.foreach()` / `.map()` / `.sleep()` / `.sleepUntil()`.** Linear DAG only — `.then()` + `.parallel()` + `.commit()`. P2 expansion gated on a real product flow that cannot be linearised.
- **No `suspend()` / `resume()` surface in W1.** Mastra ships these from day one; we defer to W2 because there is no durable substrate to suspend onto, and stubbing them would mislead product authors.
- **No internal evented machinery.** Mastra has `evented/`, `scheduler/`, `state-reader.ts`. W1 has none — the runner is a flat sequential/parallel executor.
- **`tenantContext.run()` wraps every step body.** Multi-tenant from day one is not Mastra's concern.

## 5. File layout

```
platform/agent/workflows/
├── SCOPE.md                              # already exists
├── package.json                          # via pnpm new:package
├── tsconfig.json
├── vitest.config.ts                      # leaf override: test.name only
├── src/
│   ├── index.ts                          # public barrel
│   ├── types/
│   │   ├── step.ts                       # Step<TIn, TOut, TId>, StepCtx, StepFn
│   │   ├── workflow.ts                   # Workflow<TInit, TCurrent>, BuiltWorkflow
│   │   └── input.ts                      # ParallelOutput<Steps> keyed-record helper
│   ├── errors.ts                         # WorkflowError + subclasses
│   ├── define-step.ts                    # defineStep(...)
│   ├── create-workflow.ts                # createWorkflow(...) — builder
│   ├── runner/
│   │   ├── in-memory.ts                  # the W1 engine
│   │   ├── step-execution.ts             # single-step run helper (validate → execute → validate)
│   │   └── parallel.ts                   # Promise.all-backed parallel join
│   ├── context/
│   │   └── step-ctx.ts                   # ctx.input/runId/stepId/tenantId/logger/bail
│   └── *.test.ts                         # co-located unit tests
│   └── *.test-d.ts                       # type-level tests
```

No `migrations/`, no `drizzle.config.ts`, no `tests/integration/` in W1.

## 6. Public API

### 6.1 `defineStep`

```ts
export interface DefineStepOptions<TIn, TOut, TId extends string> {
  id: TId
  inputSchema: ZodType<TIn>
  outputSchema: ZodType<TOut>
  execute: (input: TIn, ctx: StepCtx<TIn>) => Promise<TOut>
}

export function defineStep<TIn, TOut, TId extends string>(
  opts: DefineStepOptions<TIn, TOut, TId>,
): Step<TIn, TOut, TId>
```

The returned `Step` is opaque to callers — used only as an argument to `.then()` / `.parallel()`. Its internal shape stores the schemas and the bound execute function.

### 6.2 `createWorkflow`

```ts
export interface CreateWorkflowOptions<TIn, TOut> {
  id: string
  inputSchema: ZodType<TIn>
  outputSchema: ZodType<TOut>
}

export function createWorkflow<TIn, TOut>(
  opts: CreateWorkflowOptions<TIn, TOut>,
): Workflow<TIn, TIn>           // TCurrent starts at TIn
```

### 6.3 `Workflow` builder

```ts
interface Workflow<TInit, TCurrent> {
  then<TNext, TId extends string>(
    step: Step<TCurrent, TNext, TId>,
  ): Workflow<TInit, TNext>

  parallel<S extends readonly Step<TCurrent, unknown, string>[]>(
    steps: S,
  ): Workflow<TInit, ParallelOutput<S>>

  commit(): BuiltWorkflow<TInit, TCurrent>  // requires TCurrent extends TFinalOutput
}

type ParallelOutput<S extends readonly Step<any, any, string>[]> = {
  [K in S[number] as K extends Step<any, any, infer Id> ? Id : never]:
    K extends Step<any, infer Out, any> ? Out : never
}
```

`.commit()` checks at compile time that the accumulated `TCurrent` is assignable to the workflow's declared output type. If not, the TS error points at the `.commit()` call.

### 6.4 `BuiltWorkflow`

```ts
interface BuiltWorkflow<TIn, TOut> {
  readonly id: string
  run(input: TIn, opts?: { signal?: AbortSignal }): Promise<TOut>
  // .then / .parallel / .commit are typed `never` — calling them is a TS error
}
```

External callers (route handlers, tests) can pass a parent `AbortSignal`; the runner chains its internal controller to it.

### 6.5 Step context

```ts
interface StepCtx<TInput> {
  readonly input: TInput
  readonly runId: string                    // UUID v7 generated at run entry
  readonly stepId: string
  readonly workflowId: string
  readonly tenantId: string                 // snapshotted from tenantContext at run entry
  readonly logger: Logger                   // bound { runId, stepId, workflowId, tenantId }
  readonly signal: AbortSignal              // see §7.5

  bail(reason?: string): never              // throws WorkflowBailed — runner treats as clean stop
}
```

No `ctx.suspend()` in W1. `signal` is the production-ready cancellation surface (see §7.5).

### 6.6 Errors

```ts
export class WorkflowError extends DomainError {}            // base
export class WorkflowBuildError extends WorkflowError {}     // DSL misuse at build time
export class StepInputValidationError extends WorkflowError {}
export class StepOutputValidationError extends WorkflowError {}
export class StepExecutionError extends WorkflowError {}     // wraps thrown errors w/ runId+stepId
export class WorkflowBailed extends WorkflowError {}         // thrown by ctx.bail(), caught by runner
```

`WorkflowBuildError` fires on:
- Duplicate step id within one workflow (parallel or chained).
- `.then()` or `.parallel()` called after `.commit()` (caught at TS level too; runtime guard is the backstop).
- `.commit()` never called before `.run()`.

## 7. In-memory runner

### 7.1 Run entry

```ts
async run(input: TIn, opts?: { signal?: AbortSignal }): Promise<TOut> {
  const tenantId = tenantContext.getTenantId()        // throws if absent
  const runId = uuidv7()                              // matches createRunCtx's pattern
  const logger = baseLogger.child({ runId, workflowId: this.id, tenantId })

  const runController = new AbortController()
  const parent = opts?.signal
  if (parent) {
    if (parent.aborted) runController.abort(parent.reason)
    else parent.addEventListener('abort', () => runController.abort(parent.reason), { once: true })
  }

  return await runSpan(`workflow.${this.id}`, async () => {
    return await tenantContext.run(tenantId, async () => {
      return await this.#executeGraph(input, {
        runId, tenantId, logger, signal: runController.signal,
      })
    })
  })
}
```

### 7.5 Cancellation contract

- `ctx.signal` is always non-null. Steps that perform IO should pass it through (`fetch(url, { signal: ctx.signal })`, `pg.query(..., { signal: ctx.signal })`, etc.).
- On the **outer signal aborting**, the runner's internal controller fires; the currently-executing step (and all in-flight parallel siblings) observe `ctx.signal.aborted === true`.
- On a **parallel branch rejecting**, the *parallel* sub-controller aborts; sibling branches observe abort, the run rejects with the first error.
- The runner does **not** kill step bodies that ignore the signal — abort is cooperative. Steps that ignore cancellation will finish their work; their results are discarded. This matches Node's HTTP/DB client behaviour and is the standard contract for `AbortSignal`-aware code.

### 7.2 `.then` execution

For each chained step: input-validate via Zod → `tracer.startActiveSpan('step.<id>', ...)` → call `execute(validatedInput, ctx)` → output-validate via Zod → pass to next step. On thrown error, wrap in `StepExecutionError({ runId, stepId, cause })` (except `WorkflowBailed`, which short-circuits the chain and returns the most-recently-accumulated output cast through the workflow's `outputSchema`).

### 7.3 `.parallel` execution

```ts
// Pseudocode — see implementation plan for the concrete shape.
const branchController = new AbortController()
const parentSignal = run.signal
const onParentAbort = () => branchController.abort(parentSignal.reason)
parentSignal.addEventListener('abort', onParentAbort, { once: true })
try {
  const results = await Promise.all(
    steps.map(step =>
      this.#executeStep(step, currentInput, { ...run, signal: branchController.signal })
        .catch(err => { branchController.abort(err); throw err })
    )
  )
  return Object.fromEntries(steps.map((s, i) => [s.id, results[i]]))
} finally {
  parentSignal.removeEventListener('abort', onParentAbort)
}
```

All branches share the same `currentInput` from the upstream `.then()` (or the workflow input if `.parallel()` is the first node). On the **first rejection**, `branchController.abort(err)` fires — sibling steps observing `ctx.signal.aborted` should bail promptly. Steps whose `execute` does not poll the signal will still run to completion in the background, but their results are discarded. The runner does not `await` the in-flight branches after the first failure.

### 7.4 OTel spans

- Run span: `workflow.<workflowId>` — attributes `workflow.id`, `workflow.run.id`, `tenant.id`.
- Step span (parent = run span): `step.<stepId>` — attributes `step.id`, `step.workflow.id`, `step.run.id`, `step.input.hash` (SHA-256 hex of `JSON.stringify(input)`).
- A step throwing records the exception on its span before re-throwing.

## 8. Generics — the load-bearing investment

W1's biggest technical commitment is the typed builder. The shape mirrors Mastra's so a future swap is mechanical, and so we can port Mastra's type tests verbatim.

Concretely:

- `Step<TIn, TOut, TId extends string>` keeps `TId` literal — `defineStep({ id: 'review', ... })` produces `Step<TIn, TOut, 'review'>`, not `Step<TIn, TOut, string>`. This requires `id: TId` (not `id: string`) and TS's literal-narrowing on argument-position string literals.
- `Workflow<TInit, TCurrent>.then<TNext, TId>(step: Step<TCurrent, TNext, TId>): Workflow<TInit, TNext>` — `TCurrent` constraint on the step input is where mismatches surface.
- `.parallel(steps: readonly Step<TCurrent, unknown, string>[])` requires every branch to accept the upstream `TCurrent` as its input. Return type `ParallelOutput<S>` is the keyed record built by mapping `S[number]` through their `TId` literals.
- `BuiltWorkflow.then`, `.parallel`, `.commit` are typed as `never`-returning methods so post-commit chaining is a TS error.

Type tests in `src/types/workflow.test-d.ts` cover:
- A `.then()` with a step whose `inputSchema` does not match the upstream output is a TS error.
- `.parallel([a, b]).then(c)` requires `c.inputSchema` to accept `{ [a.id]: AOut; [b.id]: BOut }`.
- Duplicate step ids inside `.parallel([])` is a TS error (caught via `UniqueIds<S>` constraint helper).
- `.commit()` rejects a `TCurrent` not assignable to the declared `outputSchema` input.
- Post-`.commit()` chaining is a TS error.

These ports the relevant cases from Mastra's `workflow-schema-types.test-d.ts`.

## 9. Tenant + multi-tenancy contract

- `wf.run()` reads `tenantContext.getTenantId()` once at entry; throws `WorkflowError('no tenant in context')` if absent.
- That tenant id is propagated by `tenantContext.run(tenantId, ...)` around every step body — including each branch of a `.parallel()`. A step body that calls into `@seta/db` will see the right `app.tenant_id` setting and RLS will scope reads correctly.
- W1 does not write any rows, so there is no RLS surface to enforce yet. The contract is reserved.

## 10. Imports & dependencies

**Internal (workspace):**
- `@seta/agent-core` — Run id generator (`generateRunId`), `Run` / `RunStatus` types (for future W2 join keys; not used in W1 runtime but re-exported for parity).
- `@seta/tenant` — `tenantContext`.
- `@seta/observability` — `logger`, OTel tracer.
- `@seta/middleware` — `DomainError` base class.

**External (pinned per `setup.md` §13):**
- `zod@4.4.3` — schemas.
- `uuid@14.0.0` (transitive via `@seta/agent-core`'s id generator; not added directly to this package).

Not in W1: `drizzle-orm`, `postgres`, `p-queue`, `@seta/db`, `@seta/audit`. Those arrive in W2.

CLI for adding deps:
```
pnpm new:package @seta/agent-workflows
pnpm --filter @seta/agent-workflows add zod@4.4.3
pnpm --filter @seta/agent-workflows add @seta/agent-core@workspace:* @seta/tenant@workspace:* @seta/observability@workspace:* @seta/middleware@workspace:*
```

## 11. Test strategy (W1)

**Unit (co-located `src/**/*.test.ts`):**
- `define-step.test.ts` — schema/ctx/execute wiring; `id` literal preserved through factory.
- `create-workflow.test.ts` — builder happy path; duplicate id rejection; post-`.commit()` runtime guard.
- `runner/in-memory.test.ts` — sequential `.then()` ordering; `.parallel()` runs in parallel (assert via timestamps or shared mutable observer); failure in a parallel branch aborts the run.
- `runner/step-execution.test.ts` — Zod input/output validation produces typed errors with `runId` + `stepId`.
- `context/step-ctx.test.ts` — `ctx.bail()` returns the last output and the run resolves cleanly (not rejects).
- `tenant-propagation.test.ts` — `tenantContext.run()` wraps each step body; reading `tenantContext.getTenantId()` inside `execute()` returns the runtime-snapshotted id.
- `errors.test.ts` — `WorkflowError` subclasses extend `DomainError` (RFC 7807 mapping survives upstream).

**Type tests (`src/**/*.test-d.ts`):**
- Ported scenarios from Mastra's `workflow-schema-types.test-d.ts` — see §8.

**Coverage target:** match the repo's per-package threshold (lines/branches). No carve-outs.

**No integration tests in W1.** No `DATABASE_URL` dependency. No `@seta/agent-core/testkit` recordings — workflows are below the model layer; if a step body invokes the kernel, the product test for that step uses kernel recordings, not this package.

## 12. Observability

- Logger always bound `{ workflowId, runId, tenantId, stepId? }`.
- Run span + per-step spans (§7.4).
- No audit events in W1.

## 13. Verification before W1 close

Per CLAUDE.md "Verify before claiming done":

- `pnpm --filter @seta/agent-workflows typecheck` clean.
- `pnpm --filter @seta/agent-workflows lint` clean.
- `pnpm --filter @seta/agent-workflows test` green; type tests pass.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` clean — confirms no other package is affected.
- CI guards (`check-no-manual-pkg-edit.ts`, dependency-direction checks) green.
- `pnpm build` clean.
- Changeset added (`pnpm changeset`) — minor, package is `"private": false`.

No HTTP endpoint to exercise — this is a library.

## 14. What W2 adds (preview)

So the W1 design choices stay coherent with W2 expectations:

- `agent_workflows` Postgres schema (`workflow_snapshots`, `workflow_steps`) + migrations + `drizzle.config.ts`.
- `@seta/db` `OWNER_ORDER` updated.
- Persistence: every `.then()` / `.parallel()` boundary writes a step row; the runner reloads from `workflow_snapshots` to resume.
- `ctx.suspend({ resumeLabel, payload })` returns a branded `never`; engine persists the snapshot, channel sends the prompt.
- `workflow.resume(runId, { label, payload })` — entry point for product HTTP handlers.
- `pg_try_advisory_xact_lock(hashtext(run_id))` inside resume transaction; loser bails.
- `p-queue@9.2.0` runner; concurrency key = `tenant_id`.
- Per-step retry policy (defaults mirror agent-core's `withRetry`: `maxRetries: 2`, transient-only).
- `@seta/audit` integration — record suspend / resume / step transitions inside the same tx as the snapshot write.
- Integration tests in `tests/integration/`: real Postgres, advisory-lock contention, suspend → resume golden path, RLS isolation.

W2 should require **no breaking change** to the W1 public API. Adding `suspend()` to `StepCtx` is additive; persistence is a runner swap.

## 15. Open questions

1. **`StepCtx` extensibility.** Mastra threads an `engine` reference into ctx so steps can call workflow-level helpers. W1 ships a minimal ctx; if W2 needs to add (e.g.) `ctx.snapshotKey()` for the durability layer, the additive shape is the test. Confirm shape stability before W1 ships.
2. **Workflow id collisions across products.** If product A and product B both register a workflow with id `task.review`, what happens? W1 has no registry — `wf.run()` is a direct method call, so collisions are impossible. W2 adds the resume path; the registry it implies probably belongs in `apps/api/src/main.ts` per SCOPE.md §"Patterns to follow". Document explicitly in W2 spec.

### Resolved

- **Run id generation (was Q2/Q5).** `@seta/agent-core` does not export a standalone `generateRunId`; its `createRunCtx` calls `uuidv7()` inline (`platform/agent/core/src/run/make-run-ctx.ts:1`). Workflows imports `v7 as uuidv7` from `uuid` directly, matching that pattern. v7 (time-sortable) preserves the encoding so workflow `runId` and kernel `runId` share an id space.
- **`@seta/middleware` import (was Q3).** Resolved as **import `@seta/middleware`**, matching the K1 precedent at `platform/agent/core/src/errors/index.ts:1`. CLAUDE.md "Errors: throw `DomainError` subclasses from `@seta/middleware/errors`; mapped to RFC 7807" is the authoritative project contract — `WorkflowError extends DomainError` gives free RFC 7807 mapping at the HTTP edge. SCOPE.md's "forbidden: @seta/middleware" line is stale relative to K1; submit a follow-up SCOPE.md edit to scope the prohibition to route-handler imports only (not `errors`).
- **Sibling cancellation on `.parallel()` failure (was Q6).** Resolved as **production-ready AbortSignal**. `run()` accepts `{ signal?: AbortSignal }`; the runner creates an internal `AbortController`, chains to the parent if provided, threads `ctx.signal` into every step. On first rejection inside `.parallel()` a sub-controller aborts; siblings observe `ctx.signal.aborted` and should bail promptly. Steps that ignore the signal still complete in the background; their results are discarded. This matches the standard contract for `AbortSignal`-aware code (Node HTTP, `fetch`, `pg`). See §7.5.

## 16. Cross-references

- **Package contract:** `platform/agent/workflows/SCOPE.md`.
- **Spike report:** `docs/explorations/2026-05-12-mastra-spike/05-workflows.md`.
- **Kernel seam:** `platform/agent/core/SCOPE.md` § Run loop.
- **Sibling spec format:** `docs/superpowers/specs/2026-05-12-agent-memory-design.md`, `2026-05-12-agent-core-k1-design.md`.
- **Migration runner (W2 dependency):** `platform/db/SCOPE.md` — `OWNER_ORDER`.
- **Setup spec:** `docs/setup.md` §3 (schema list — amended in W2), §13 (dep pins).
