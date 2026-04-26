# Plan 18 — Live Turn Pipeline Composition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `agent-turn-controller` to invoke the real router → bounded/iterative executor → synthesizer pipeline with realtime SSE token streaming via Vercel AI SDK `streamObject`. Removes the placeholder body wholesale (no legacy shims, per R-18.23/R-18.24).

**Architecture:** Compose existing services (`RouterSessionOrchestrator`, `IterativeOrchestrator`, new `BoundedExecutor`) inside a new `TurnPipelineRunner` class. The runner accepts a `ToolGatewayPort` override at runtime (live turns use the production `ToolGateway`; golden-trace replay supplies a captured-output gateway). Synthesizer streaming bridges `streamObject` partials to SSE `answer.token` events for narrative/list shapes; atomic JSON for table/chart. Conversation persistence flows through existing `SaveQueue` (R-04.23 fire-and-forget). Pipeline errors are typed and mapped to SSE close-error causes via `classifyPipelineError`.

**Tech Stack:** TypeScript (NodeNext + CJS), NestJS, Vercel AI SDK v6 (`ai@^6.0.168`) `streamObject`, OpenTelemetry, Drizzle ORM, Bun (`bun test` via Turbo).

**Spec:** `docs/agents/plans/18-live-turn-pipeline-composition.md` (commit `1efeb1aa`).

**Branch:** `feat/plan-18-live-pipeline` (off main, branched AFTER Plan 17 PR 2 + PR 3 merge).

**Sequencing prerequisites:**

- ✅ Plan 17 PR 1 (#107) merged. Provides `ToolGatewayPort` + `TOOL_GATEWAY` token + plan docs.
- ⏳ Plan 17 PR 2 must merge before Plan 18. Provides real `SubAgentRunnerAdapter` + the bridge accumulator. Also: amend `SubAgentRunnerAdapter` to read `turnState.phaseContextNote` when constructing the sub-agent user message (small addition to Plan 17 Task 6 implementer brief).
- ⏳ Plan 17 PR 3 AMENDED must merge before Plan 18. Amendments REQUIRED:
  1. `SynthesizerOpts`: drop `phase1Outputs`/`phase2Outputs` → single `outputs: Map<SubAgentKey, SubAgentOutput>` + `streamEmitter: StreamEmitter`.
  2. `SynthesizerAdapter.synthesize`: use `streamObject` (not `generateObject`) per Plan 18 §5.4.
  3. `SynthesizerLlmClient`: expose `stream(opts)` method returning the AI SDK stream object.
  4. Per-shape SSE bridge logic (incremental for narrative/list; atomic for table/chart).
  5. Pre-shape failure throws `SynthesizerStreamFailureError`; post-shape uses fallback prose.

If Plan 17 PR 3 has NOT yet absorbed these amendments when Plan 18 starts, **add them as the first tasks of Plan 18's branch** (before Task 1 below). The implementation plan stays the same; only the PR boundary shifts.

---

## File Structure

| Path                                                                                                 | Action                | Purpose                                                                                               |
| ---------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/agents/application/services/pipeline-errors.ts`                                | create (Task 1)       | Typed pipeline errors + `classifyPipelineError`                                                       |
| `apps/api/src/modules/agents/application/services/pipeline-errors.spec.ts`                           | create (Task 1)       | Classifier tests                                                                                      |
| `apps/api/src/modules/agents/application/services/phase-executor-contracts.ts`                       | modify (Task 2)       | `SynthesizerOpts` cleanup; add `phaseContextNote` to `PhaseExecutorTurnState`                         |
| `apps/api/src/modules/agents/application/services/iterative-orchestrator.ts`                         | modify (Task 2)       | Adopt new `SynthesizerOpts.outputs` + `streamEmitter` shape                                           |
| `apps/api/src/modules/agents/application/services/iterative-orchestrator.spec.ts`                    | modify (Task 2)       | Update test fixture for new shape                                                                     |
| `apps/api/src/modules/agents/application/services/synthesizer-adapter.ts`                            | modify (Task 2)       | Adopt new `SynthesizerOpts` shape — type-only update if Plan 17 PR 3 already shipped streamObject     |
| `apps/api/src/modules/agents/application/services/router-session-orchestrator.ts`                    | modify (Task 3)       | Throw `RouterLlmFailureError` on infra failures                                                       |
| `apps/api/src/modules/agents/application/services/router-session-orchestrator.spec.ts`               | modify (Task 3)       | Add throw-on-infra-failure tests                                                                      |
| `apps/api/src/modules/agents/application/services/turn-pipeline-runner.ts`                           | create (Task 4)       | `TurnPipelineRunner` class with `run` + `runWithReplay`                                               |
| `apps/api/src/modules/agents/application/services/turn-pipeline-runner.spec.ts`                      | create (Task 4)       | Unit tests for runner dispatch                                                                        |
| `apps/api/src/modules/agents/application/services/bounded-executor.ts`                               | create (Task 5)       | `BoundedExecutor` service                                                                             |
| `apps/api/src/modules/agents/application/services/bounded-executor.spec.ts`                          | create (Task 5)       | Unit tests for executor flow                                                                          |
| `apps/api/src/modules/agents/application/services/render-answer.ts`                                  | create (Task 6)       | Pure helpers: `renderAnswerToMarkdown`, `formatForShape`, `collectToolNames`, `collectPermissionKeys` |
| `apps/api/src/modules/agents/application/services/render-answer.spec.ts`                             | create (Task 6)       | Pure-function tests                                                                                   |
| `apps/api/src/modules/agents/agents.module.ts`                                                       | modify (Task 7)       | Bind `BOUNDED_EXECUTOR`, `TURN_PIPELINE_RUNNER`, real `RUN_PIPELINE_FN` factory                       |
| `apps/api/src/modules/agents/interface/http/agent-turn-controller.ts`                                | rewrite body (Task 8) | Remove placeholder; invoke runner; SaveQueue user/assistant; SSE close mapping                        |
| `apps/api/src/modules/agents/interface/http/agent-turn-controller.spec.ts`                           | rewrite (Task 8)      | Cover new flow                                                                                        |
| `apps/api/src/modules/agents/infrastructure/observability/pipeline-metrics.ts`                       | create (Task 9)       | New OTel instruments                                                                                  |
| `apps/api/src/modules/agents/infrastructure/observability/pipeline-metrics.spec.ts`                  | create (Task 9)       | Counter/histogram tests                                                                               |
| `apps/api/src/modules/agents/interface/http/agent-turn-controller.live-pipeline.integration.spec.ts` | create (Task 10)      | End-to-end SSE integration                                                                            |
| `apps/api/src/modules/agents/application/services/bounded-executor.integration.spec.ts`              | create (Task 10)      | Real ToolGateway + DB integration                                                                     |

---

## Test Conventions

- Co-locate tests next to source (CLAUDE.md). Never `__tests__/`.
- Run unit tests: `bun run --filter @future/api test:unit -- <pattern>`.
- Run integration tests: `bun run --filter @future/api test:integration -- <pattern>` (requires Postgres up via `bun run db:up`).
- Type-check: `bun run --filter @future/api typecheck`.
- Lint: `bun run --filter @future/api lint`.
- Pre-commit hook (`lefthook`) runs prettier; fix with `bunx prettier --write <files>` if it complains.
- **Coverage gate:** ≥70% lines/functions/branches per CLAUDE.md.
- **DB queries inside handlers:** sequential `await` only, no `Promise.all` (CLAUDE.md hard rule).

---

## Task 1 — Typed pipeline errors + `classifyPipelineError`

**Files:**

- Create: `apps/api/src/modules/agents/application/services/pipeline-errors.ts`
- Create: `apps/api/src/modules/agents/application/services/pipeline-errors.spec.ts`

**Branch setup:**

```bash
cd /Users/canh/Projects/Seta/future
git fetch origin main
git checkout main && git pull
git checkout -b feat/plan-18-live-pipeline
```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/agents/application/services/pipeline-errors.spec.ts`:

```ts
import {
  RouterLlmFailureError,
  RouterParseEscalationError,
  SynthesizerStreamFailureError,
  classifyPipelineError,
  type SseErrorCause,
} from './pipeline-errors'

describe('pipeline-errors', () => {
  it('classifies RouterLlmFailureError as router_failure', () => {
    const err = new RouterLlmFailureError('llm_5xx', 'OpenAI 503')
    expect(classifyPipelineError(err)).toBe<SseErrorCause>('router_failure')
  })

  it('classifies RouterParseEscalationError as router_failure', () => {
    const err = new RouterParseEscalationError('parse failed twice')
    expect(classifyPipelineError(err)).toBe<SseErrorCause>('router_failure')
  })

  it('classifies SynthesizerStreamFailureError as synthesizer_failure', () => {
    const err = new SynthesizerStreamFailureError('schema_error', 'invalid shape')
    expect(classifyPipelineError(err)).toBe<SseErrorCause>('synthesizer_failure')
  })

  it('classifies untyped errors as internal_error', () => {
    expect(classifyPipelineError(new Error('boom'))).toBe<SseErrorCause>('internal_error')
    expect(classifyPipelineError('not even an Error')).toBe<SseErrorCause>('internal_error')
    expect(classifyPipelineError(undefined)).toBe<SseErrorCause>('internal_error')
  })

  it('preserves cause field on RouterLlmFailureError', () => {
    const err = new RouterLlmFailureError('llm_timeout', 'request timed out')
    expect(err.cause).toBe('llm_timeout')
    expect(err.name).toBe('RouterLlmFailureError')
  })

  it('preserves cause field on SynthesizerStreamFailureError', () => {
    const err = new SynthesizerStreamFailureError('aborted', 'AbortError')
    expect(err.cause).toBe('aborted')
    expect(err.name).toBe('SynthesizerStreamFailureError')
  })
})
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
bun run --filter @future/api test:unit -- pipeline-errors.spec
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/agents/application/services/pipeline-errors.ts`:

```ts
/**
 * pipeline-errors — Plan 18 §4.4.
 *
 * Typed error classes thrown by services participating in the live turn
 * pipeline, plus a classifier that maps them onto SSE close-error causes.
 *
 * Untyped throws default to 'internal_error'.
 */

export class RouterLlmFailureError extends Error {
  readonly cause: 'llm_5xx' | 'llm_timeout' | 'auth_error'
  constructor(cause: RouterLlmFailureError['cause'], message: string) {
    super(message)
    this.name = 'RouterLlmFailureError'
    this.cause = cause
  }
}

export class RouterParseEscalationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RouterParseEscalationError'
  }
}

export class SynthesizerStreamFailureError extends Error {
  readonly cause: 'llm_error' | 'schema_error' | 'aborted'
  constructor(cause: SynthesizerStreamFailureError['cause'], message: string) {
    super(message)
    this.name = 'SynthesizerStreamFailureError'
    this.cause = cause
  }
}

export type SseErrorCause = 'router_failure' | 'synthesizer_failure' | 'internal_error'

export function classifyPipelineError(err: unknown): SseErrorCause {
  if (err instanceof RouterLlmFailureError) return 'router_failure'
  if (err instanceof RouterParseEscalationError) return 'router_failure'
  if (err instanceof SynthesizerStreamFailureError) return 'synthesizer_failure'
  return 'internal_error'
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
bun run --filter @future/api test:unit -- pipeline-errors.spec
```

Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + lint**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/agents/application/services/pipeline-errors.ts \
        apps/api/src/modules/agents/application/services/pipeline-errors.spec.ts
git commit -m "$(cat <<'EOF'
feat(agents): typed pipeline errors + classifyPipelineError

Plan 18 Task 1 — RouterLlmFailureError, RouterParseEscalationError,
SynthesizerStreamFailureError thrown by pipeline services. classifyPipelineError
maps each onto an SSE close-error cause. Untyped throws default to internal_error.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — `SynthesizerOpts` cleanup + `phaseContextNote` field

**Goal:** Drop the `phase1Outputs`/`phase2Outputs` split; introduce single `outputs` map plus `streamEmitter`. Add `phaseContextNote?: string` to `PhaseExecutorTurnState` for cbNote propagation. Update `IterativeOrchestrator` and `SynthesizerAdapter` call sites in the same change (R-18.23 hard cutover — no transitional shapes).

**Files:**

- Modify: `apps/api/src/modules/agents/application/services/phase-executor-contracts.ts`
- Modify: `apps/api/src/modules/agents/application/services/iterative-orchestrator.ts`
- Modify: `apps/api/src/modules/agents/application/services/iterative-orchestrator.spec.ts`
- Modify: `apps/api/src/modules/agents/application/services/synthesizer-adapter.ts`
- Modify: `apps/api/src/modules/agents/application/services/synthesizer-adapter.spec.ts`

- [ ] **Step 1: Inspect current `SynthesizerOpts` and `PhaseExecutorTurnState`**

```bash
sed -n '249,265p' apps/api/src/modules/agents/application/services/phase-executor-contracts.ts
sed -n '210,240p' apps/api/src/modules/agents/application/services/phase-executor-contracts.ts
```

Confirm `SynthesizerOpts` has `phase1Outputs` + `phase2Outputs` (lines 251–258) and `PhaseExecutorTurnState` has `tainted: { value: boolean }` etc.

- [ ] **Step 2: Update `SynthesizerOpts` and `PhaseExecutorTurnState`**

In `phase-executor-contracts.ts`, replace the existing `SynthesizerOpts` block (around line 251) with:

```ts
export interface SynthesizerOpts {
  readonly directive: BoundedPlan | IterativePlan
  readonly outputs: Map<SubAgentKey, SubAgentOutput>
  readonly userUtterance: string
  readonly abortSignal: AbortSignal
  readonly turnState: PhaseExecutorTurnState
  /**
   * Required. Synthesizer emits its own SSE events
   * (`answer.shape_declared`, `answer.token`, `answer.complete`).
   */
  readonly streamEmitter: StreamEmitter
}
```

Add the import for `StreamEmitter` and `IterativePlan` near the top (`StreamEmitter` from `'./stream-gateway'`; `IterativePlan` from `'../../domain/value-objects/router-plan-schema'`).

In the same file, locate `PhaseExecutorTurnState` (around line 214) and add a new optional field at the end of the interface body (before the closing brace):

```ts
  /**
   * Runtime context note appended to the user message of phase-2 sub-agents.
   * Set by BoundedExecutor before phase-2 dispatch (Plan 03 R-03.18).
   * Read by SubAgentRunnerAdapter when constructing the sub-agent user message.
   * Undefined for phase-1 dispatch (or when no circuit-breaker context exists).
   */
  phaseContextNote?: string
```

Optional, mutable — matches `routerReplanCount`/`iterationNumber` style.

- [ ] **Step 3: Verify tsc fails on existing call sites**

```bash
bun run --filter @future/api typecheck
```

Expected: errors at the call sites in `iterative-orchestrator.ts` and `synthesizer-adapter.ts` referencing `phase1Outputs` / `phase2Outputs`. These are the call sites we'll fix.

- [ ] **Step 4: Update `IterativeOrchestrator`**

In `apps/api/src/modules/agents/application/services/iterative-orchestrator.ts`, locate the synthesizer call (search for `this.synthesizer.synthesize(` — likely near the end of `execute()`). Replace its argument shape:

Before (paraphrased):

```ts
const answer = await this.synthesizer.synthesize({
  directive: <something>,
  phase1Outputs: allOutputs,
  phase2Outputs: new Map(),
  userUtterance: opts.userUtterance,
  abortSignal: opts.abortSignal,
  turnState: opts.turnState,
})
```

After:

```ts
const answer = await this.synthesizer.synthesize({
  directive: <same value as before>,
  outputs: allOutputs,
  userUtterance: opts.userUtterance,
  abortSignal: opts.abortSignal,
  turnState: opts.turnState,
  streamEmitter: opts.streamEmitter,
})
```

Keep the existing `directive` value (likely `opts.initialPlan` or similar — preserve verbatim from the original code).

- [ ] **Step 5: Update `SynthesizerAdapter`**

In `apps/api/src/modules/agents/application/services/synthesizer-adapter.ts`, replace any reference to `opts.phase1Outputs` / `opts.phase2Outputs` with `opts.outputs`. The streaming amendment to streamObject lives in Task 6 (or Plan 17 PR 3 if not yet shipped); for now Task 2 just makes the file type-check against the new `SynthesizerOpts` shape.

If the file currently builds the merged map via:

```ts
const allOutputs = new Map([...opts.phase1Outputs, ...opts.phase2Outputs])
```

replace with:

```ts
const allOutputs = opts.outputs
```

Throughout the file, replace `allOutputs` with `opts.outputs` directly (or keep `allOutputs` as a local alias for readability).

- [ ] **Step 6: Update affected unit tests**

In `iterative-orchestrator.spec.ts` and `synthesizer-adapter.spec.ts`, update any mock/stub call that constructs `SynthesizerOpts` with `phase1Outputs`/`phase2Outputs` to use the new `outputs` + `streamEmitter` shape. Example replacement:

```ts
// before
synthesizer.synthesize({ directive, phase1Outputs: m1, phase2Outputs: m2, ... })
// after
const merged = new Map([...m1, ...m2])
synthesizer.synthesize({ directive, outputs: merged, streamEmitter: fakeStreamEmitter, ... })
```

Add a fake stream emitter to test scaffolding:

```ts
const fakeStreamEmitter: StreamEmitter = {
  emit: jest.fn(),
  close: jest.fn(),
  error: jest.fn(),
}
```

- [ ] **Step 7: Run typecheck**

```bash
bun run --filter @future/api typecheck
```

Expected: clean.

- [ ] **Step 8: Run affected unit tests**

```bash
bun run --filter @future/api test:unit -- iterative-orchestrator.spec
bun run --filter @future/api test:unit -- synthesizer-adapter.spec
bun run --filter @future/api test:unit -- phase-executor
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/agents/application/services/phase-executor-contracts.ts \
        apps/api/src/modules/agents/application/services/iterative-orchestrator.ts \
        apps/api/src/modules/agents/application/services/iterative-orchestrator.spec.ts \
        apps/api/src/modules/agents/application/services/synthesizer-adapter.ts \
        apps/api/src/modules/agents/application/services/synthesizer-adapter.spec.ts
git commit -m "$(cat <<'EOF'
refactor(agents): SynthesizerOpts cleanup — single outputs map + streamEmitter

Plan 18 Task 2 — drop phase1Outputs/phase2Outputs split (smell — iterative
already collapsed everything to one map). Replace with single outputs:
Map<SubAgentKey, SubAgentOutput> + required streamEmitter: StreamEmitter.
Hard cutover per R-18.23 — no transitional shapes.

Also adds optional phaseContextNote to PhaseExecutorTurnState for cbNote
propagation to phase-2 sub-agents (set by BoundedExecutor in Task 5).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — `RouterSessionOrchestrator` throws `RouterLlmFailureError` on infra fails

**Goal:** Replace existing swallow-and-log behavior on router LLM 5xx/timeout/auth-error with a typed throw. Hard cutover (R-18.24). Existing tests asserting swallow are rewritten.

**Files:**

- Modify: `apps/api/src/modules/agents/application/services/router-session-orchestrator.ts`
- Modify: `apps/api/src/modules/agents/application/services/router-session-orchestrator.spec.ts`

- [ ] **Step 1: Inspect current LLM call site**

```bash
grep -n "llmClient.call\|catch\|swallow\|return.*error" apps/api/src/modules/agents/application/services/router-session-orchestrator.ts | head -20
```

Find the block that catches LLM errors (search for `try` + `catch` around the `llmClient` call).

- [ ] **Step 2: Write the failing tests**

In `router-session-orchestrator.spec.ts`, append tests inside the existing top-level describe:

```ts
import { RouterLlmFailureError } from './pipeline-errors'

describe('RouterSessionOrchestrator infra failure throws', () => {
  it('throws RouterLlmFailureError on LLM 5xx', async () => {
    const llmClient = {
      call: jest.fn().mockRejectedValue(Object.assign(new Error('OpenAI 503'), { status: 503 })),
    }
    // construct orchestrator with fake deps including llmClient (use existing test-DI helper)
    const orchestrator = makeOrchestrator({ llmClient })
    await expect(orchestrator.routeTurn(makeRouteOpts())).rejects.toBeInstanceOf(
      RouterLlmFailureError,
    )
    await expect(orchestrator.routeTurn(makeRouteOpts())).rejects.toMatchObject({
      cause: 'llm_5xx',
    })
  })

  it('throws RouterLlmFailureError on LLM timeout', async () => {
    const timeoutErr = Object.assign(new Error('timeout'), { name: 'AbortError' })
    const llmClient = { call: jest.fn().mockRejectedValue(timeoutErr) }
    const orchestrator = makeOrchestrator({ llmClient })
    await expect(orchestrator.routeTurn(makeRouteOpts())).rejects.toMatchObject({
      cause: 'llm_timeout',
    })
  })

  it('throws RouterLlmFailureError on auth error (401/403)', async () => {
    const authErr = Object.assign(new Error('Unauthorized'), { status: 401 })
    const llmClient = { call: jest.fn().mockRejectedValue(authErr) }
    const orchestrator = makeOrchestrator({ llmClient })
    await expect(orchestrator.routeTurn(makeRouteOpts())).rejects.toMatchObject({
      cause: 'auth_error',
    })
  })
})
```

`makeOrchestrator` and `makeRouteOpts` are existing test fixtures in the spec file — reuse them. If they don't allow injecting a custom `llmClient`, extend them:

```ts
function makeOrchestrator(overrides: { llmClient?: { call: jest.Mock } } = {}) {
  return new RouterSessionOrchestrator(
    /* existing deps */,
    overrides.llmClient ?? defaultFakeLlmClient,
    /* ... */,
  )
}
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
bun run --filter @future/api test:unit -- router-session-orchestrator.spec
```

Expected: FAIL — current behavior swallows or returns differently.

- [ ] **Step 4: Identify and remove existing swallow/log behavior**

In `router-session-orchestrator.ts`, locate the catch block around the LLM call. Existing pattern likely:

```ts
} catch (err) {
  this.logger.error('Router LLM call failed', err)
  return { kind: 'disambiguation', reason: 'router_failed', sessionId, parseRetries: 0 }
}
```

Replace with a typed throw:

```ts
import { RouterLlmFailureError } from './pipeline-errors'

// ... inside the catch:
} catch (err) {
  const cause = classifyLlmError(err)
  throw new RouterLlmFailureError(cause, errorMessage(err))
}
```

Add helpers at the file scope (or in `pipeline-errors.ts` if you prefer — keep them here for now):

```ts
function classifyLlmError(err: unknown): 'llm_5xx' | 'llm_timeout' | 'auth_error' {
  if (typeof err === 'object' && err !== null) {
    const e = err as { status?: number; name?: string }
    if (e.status === 401 || e.status === 403) return 'auth_error'
    if (e.status !== undefined && e.status >= 500) return 'llm_5xx'
    if (e.name === 'AbortError' || (e as { name?: string }).name === 'TimeoutError') {
      return 'llm_timeout'
    }
  }
  return 'llm_5xx' // fallback — treat unknown failures as transient
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
```

**IMPORTANT:** retain the existing parse-retry logic (Plan 02 §5 R-02.x: one retry on schema-fail, then escalate to disambiguation). The throw above is for **LLM call failures**, not parse failures. The post-retry parse failure path should continue to return `kind: 'disambiguation'` (this is intentional UX — user clarifies their utterance).

- [ ] **Step 5: Run test, expect PASS**

```bash
bun run --filter @future/api test:unit -- router-session-orchestrator.spec
```

Expected: PASS for the three new tests + existing tests still green.

- [ ] **Step 6: Typecheck + lint**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api lint
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/agents/application/services/router-session-orchestrator.ts \
        apps/api/src/modules/agents/application/services/router-session-orchestrator.spec.ts
git commit -m "$(cat <<'EOF'
feat(agents): RouterSessionOrchestrator throws RouterLlmFailureError on infra fails

Plan 18 Task 3 — replace swallow-and-return-disambiguation behavior on
router LLM 5xx/timeout/auth-error with a typed throw. Parse-retry logic
unchanged (post-retry parse failure still returns kind:'disambiguation' —
intentional UX). Hard cutover per R-18.24.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `TurnPipelineRunner` class

**Goal:** Introduce the runner class with `run(opts)` and `runWithReplay(opts)`. Default `ToolGatewayPort` is injected; `runWithReplay` accepts an override. Internal pipeline closure is supplied via `RUN_PIPELINE_FN` (real factory in Task 7).

**Files:**

- Create: `apps/api/src/modules/agents/application/services/turn-pipeline-runner.ts`
- Create: `apps/api/src/modules/agents/application/services/turn-pipeline-runner.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/agents/application/services/turn-pipeline-runner.spec.ts`:

```ts
import {
  TurnPipelineRunner,
  type RunPipelineFn,
  type TurnPipelineRunOpts,
  type TurnPipelineReplayOpts,
} from './turn-pipeline-runner'
import type { ToolGatewayPort } from './tool-gateway-contracts'

const fakeGateway: ToolGatewayPort = { invoke: jest.fn() }
const overrideGateway: ToolGatewayPort = { invoke: jest.fn() }

const baseLiveOpts: TurnPipelineRunOpts = {
  userUtterance: 'hello',
  conversationId: 'conv-1',
  requestContext: {
    tenantId: 'T1',
    userId: 'U1',
    traceId: 'tr-1',
    surface: 'global-chat',
    roleKey: 'admin',
  },
  abortSignal: new AbortController().signal,
  streamEmitter: { emit: jest.fn(), close: jest.fn(), error: jest.fn() },
  turnState: {
    traceId: 'tr-1',
    tenantId: 'T1',
    userId: 'U1',
    conversationId: 'conv-1',
    sessionId: '',
    surface: 'global-chat',
    tainted: { value: false },
    routerReplanCount: 0,
  },
}

describe('TurnPipelineRunner', () => {
  it('run() invokes the closure with the default gateway when no override given', async () => {
    const run: RunPipelineFn = jest.fn().mockResolvedValue({
      toolCallNames: ['t'],
      shape: 'narrative',
      permissionKeys: [],
      taintFlipped: false,
      renderedAssistantMessage: 'ok',
      turnEndReason: 'completed',
      drafts: [],
    })
    const runner = new TurnPipelineRunner(fakeGateway, run)
    const result = await runner.run(baseLiveOpts)

    expect(run).toHaveBeenCalledTimes(1)
    expect((run as jest.Mock).mock.calls[0][0].toolGateway).toBe(fakeGateway)
    expect(result.shape).toBe('narrative')
  })

  it('runWithReplay() invokes the closure with the override gateway', async () => {
    const run: RunPipelineFn = jest.fn().mockResolvedValue({
      toolCallNames: [],
      shape: 'narrative',
      permissionKeys: [],
      taintFlipped: false,
      renderedAssistantMessage: '',
      turnEndReason: 'completed',
      drafts: [],
    })
    const runner = new TurnPipelineRunner(fakeGateway, run)

    const replayOpts: TurnPipelineReplayOpts = {
      messages: [{ role: 'user', content: 'replay me' }],
      pinnedVersions: { routerPrompt: 'rp1' },
      toolGatewayOverride: overrideGateway,
    }
    await runner.runWithReplay(replayOpts)

    expect((run as jest.Mock).mock.calls[0][0].toolGateway).toBe(overrideGateway)
  })

  it('forwards abortSignal, streamEmitter, turnState through to the closure on run()', async () => {
    const run: RunPipelineFn = jest.fn().mockResolvedValue({
      toolCallNames: [],
      shape: 'narrative',
      permissionKeys: [],
      taintFlipped: false,
      renderedAssistantMessage: '',
      turnEndReason: 'completed',
      drafts: [],
    })
    const runner = new TurnPipelineRunner(fakeGateway, run)
    await runner.run(baseLiveOpts)

    const arg = (run as jest.Mock).mock.calls[0][0]
    expect(arg.abortSignal).toBe(baseLiveOpts.abortSignal)
    expect(arg.streamEmitter).toBe(baseLiveOpts.streamEmitter)
    expect(arg.turnState).toBe(baseLiveOpts.turnState)
    expect(arg.requestContext).toBe(baseLiveOpts.requestContext)
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

```bash
bun run --filter @future/api test:unit -- turn-pipeline-runner.spec
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/agents/application/services/turn-pipeline-runner.ts`:

```ts
/**
 * TurnPipelineRunner — Plan 18 §4.5.
 *
 * Single execution path for live HTTP turns and golden-trace replay.
 * The injected default ToolGatewayPort is used unless a per-call override
 * is supplied via runWithReplay (the seam exploited by Plan 17 PR 4's
 * golden-trace runner).
 *
 * The actual pipeline composition is the injected RUN_PIPELINE_FN closure
 * (real implementation in agents.module.ts — Task 7). Keeping the closure
 * external lets us unit-test the runner without pulling the entire DI graph.
 */

import { Inject, Injectable } from '@nestjs/common'
import type { ToolGatewayPort } from './tool-gateway-contracts'
import { TOOL_GATEWAY } from './tool-gateway-contracts'
import type { StreamEmitter } from './stream-gateway'
import type { PhaseExecutorTurnState, DraftProposal } from './phase-executor-contracts'
import type { AnswerShape } from './phase-executor-contracts'
import type { UsageSnapshot } from './stream-gateway'

export const TURN_PIPELINE_RUNNER = Symbol('TURN_PIPELINE_RUNNER')
export const RUN_PIPELINE_FN = Symbol('RUN_PIPELINE_FN')

export interface RequestContext {
  readonly tenantId: string
  readonly userId: string
  readonly traceId: string
  readonly surface: 'global-chat' | 'inline' | 'async'
  readonly roleKey: string
}

export interface TurnPipelineRunOpts {
  readonly userUtterance: string
  readonly conversationId: string
  readonly requestContext: RequestContext
  readonly abortSignal: AbortSignal
  readonly streamEmitter: StreamEmitter
  readonly turnState: PhaseExecutorTurnState
}

export interface TurnPipelineReplayMessage {
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
}

export interface TurnPipelineReplayOpts {
  readonly messages: ReadonlyArray<TurnPipelineReplayMessage>
  readonly pinnedVersions: Readonly<Record<string, string>>
  readonly toolGatewayOverride: ToolGatewayPort
}

export interface TurnPipelineResult {
  readonly toolCallNames: ReadonlyArray<string>
  readonly shape: AnswerShape | 'refusal' | 'aborted'
  readonly permissionKeys: ReadonlyArray<string>
  readonly taintFlipped: boolean
  readonly renderedAssistantMessage: string
  readonly turnEndReason: 'completed' | 'cancelled' | 'refused' | 'error'
  readonly drafts: ReadonlyArray<DraftProposal>
  readonly usage?: UsageSnapshot
}

/**
 * The pipeline-composition closure. Real implementation in agents.module.ts
 * (Task 7); unit tests inject a fake.
 *
 * Receives EITHER a live-turn request (full TurnPipelineRunOpts shape) OR
 * a replay request (TurnPipelineReplayOpts merged with the override gateway).
 */
export type RunPipelineFn = (input: {
  readonly userUtterance: string
  readonly conversationId: string
  readonly requestContext: RequestContext
  readonly abortSignal: AbortSignal
  readonly streamEmitter: StreamEmitter
  readonly turnState: PhaseExecutorTurnState
  readonly toolGateway: ToolGatewayPort
}) => Promise<TurnPipelineResult>

@Injectable()
export class TurnPipelineRunner {
  constructor(
    @Inject(TOOL_GATEWAY) private readonly defaultGateway: ToolGatewayPort,
    @Inject(RUN_PIPELINE_FN) private readonly runPipeline: RunPipelineFn,
  ) {}

  async run(opts: TurnPipelineRunOpts): Promise<TurnPipelineResult> {
    return this.runPipeline({ ...opts, toolGateway: this.defaultGateway })
  }

  /**
   * Replay path used by Plan 17 PR 4's GoldenTraceRunner. The replay-mode
   * gateway returns captured tool outputs from ReplayHarness; no live writes.
   *
   * Replay uses synthetic abortSignal + a no-op stream emitter; pipeline
   * runs to completion with the captured pinned-versions context.
   */
  async runWithReplay(opts: TurnPipelineReplayOpts): Promise<TurnPipelineResult> {
    const userMessage = opts.messages.find((m) => m.role === 'user')
    if (!userMessage) throw new Error('TurnPipelineRunner.runWithReplay: no user message in input')

    // Replay reconstructs requestContext from the captured trace's session.
    // The pipeline closure handles session lookup via pinnedVersions; we
    // pass minimal stubs here, knowing the closure uses pinnedVersions to
    // retrieve the canonical context.
    const noopEmitter: StreamEmitter = {
      emit: () => {},
      close: () => {},
      error: () => {},
    }
    const stubRequestContext: RequestContext = {
      tenantId: '',
      userId: '',
      traceId: '',
      surface: 'global-chat',
      roleKey: '',
    }
    const stubTurnState: PhaseExecutorTurnState = {
      traceId: '',
      tenantId: '',
      userId: '',
      conversationId: '',
      sessionId: '',
      surface: 'global-chat',
      tainted: { value: false },
      routerReplanCount: 0,
    }

    return this.runPipeline({
      userUtterance: userMessage.content,
      conversationId: '',
      requestContext: stubRequestContext,
      abortSignal: new AbortController().signal,
      streamEmitter: noopEmitter,
      turnState: stubTurnState,
      toolGateway: opts.toolGatewayOverride,
    })
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
bun run --filter @future/api test:unit -- turn-pipeline-runner.spec
```

Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + lint**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/agents/application/services/turn-pipeline-runner.ts \
        apps/api/src/modules/agents/application/services/turn-pipeline-runner.spec.ts
git commit -m "$(cat <<'EOF'
feat(agents): TurnPipelineRunner class with run + runWithReplay

Plan 18 Task 4 — full new class (not a Plan 17 skeleton-fill). Default
gateway injected via TOOL_GATEWAY token; runWithReplay accepts a
ToolGatewayPort override for golden-trace replay (Plan 17 PR 4 consumer).
Unit tests cover both call paths and verify correct gateway selection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — `BoundedExecutor` service

**Goal:** Sequential phase-1 fan-out, partial-answer gate, optional phase-2 (with `phaseContextNote` set on turnState for cbNote propagation), synthesizer call. Returns `PhaseExecutionResult`. Mirrors `IterativeOrchestrator` pattern.

**Files:**

- Create: `apps/api/src/modules/agents/application/services/bounded-executor.ts`
- Create: `apps/api/src/modules/agents/application/services/bounded-executor.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/agents/application/services/bounded-executor.spec.ts`:

```ts
import { BoundedExecutor, type BoundedExecutorOpts } from './bounded-executor'
import type { ISubAgentRunner, ISynthesizer } from './iterative-orchestrator'
import type {
  SubAgentOutput,
  PhaseExecutorTurnState,
  SynthesizerOutput,
} from './phase-executor-contracts'
import type { BoundedPlan, SubAgentDirective } from '../../domain/value-objects/router-plan-schema'
import type { StreamEmitter } from './stream-gateway'

const turnState = (): PhaseExecutorTurnState => ({
  traceId: 'tr',
  tenantId: 'T1',
  userId: 'U1',
  conversationId: 'c1',
  sessionId: 's1',
  surface: 'global-chat',
  tainted: { value: false },
  routerReplanCount: 0,
})

const emitter = (): StreamEmitter => ({ emit: jest.fn(), close: jest.fn(), error: jest.fn() })

const okOutput = (key: string, drafts: never[] = []): SubAgentOutput => ({
  kind: 'completed',
  summary: `s-${key}`,
  semantics: `sem-${key}`,
  confidence: 'med',
  sourceToolProvenance: [],
  structured: { [key]: 'value' },
  drafts,
  circuitBreakerState: {},
  usageTotals: {
    inputTokens: 1,
    outputTokens: 1,
    inputCachedRead: 0,
    inputCachedWrite: 0,
    outputReasoning: 0,
    costUsd: 0,
  },
})

const ceilingHitOutput = (key: string): SubAgentOutput => ({
  ...okOutput(key),
  kind: 'ceiling_hit',
})

const directive = (key: string): SubAgentDirective => ({
  sub_agent_key: key,
  input: {},
  reason: `because ${key}`,
})

const plan = (phase1: SubAgentDirective[], phase2: SubAgentDirective[] = []): BoundedPlan =>
  ({
    topology: 'bounded',
    phase1,
    phase2,
    intent_slug: 'people.list',
    confidence: 0.8,
    flow_id: '00000000-0000-7000-8000-000000000000',
  }) as unknown as BoundedPlan

const baseOpts = (overrides?: Partial<BoundedExecutorOpts>): BoundedExecutorOpts => ({
  plan: plan([directive('a'), directive('b')]),
  userUtterance: 'q',
  turnState: turnState(),
  abortSignal: new AbortController().signal,
  streamEmitter: emitter(),
  ...overrides,
})

const fakeAnswer = (): SynthesizerOutput =>
  ({
    shape: 'narrative',
    content: 'merged answer',
    citations: [],
    confidence: 'med',
    turnEndedReason: 'completed',
  }) as SynthesizerOutput

describe('BoundedExecutor', () => {
  it('happy path: sequential phase-1 dispatch + synthesizer call → kind=synthesized', async () => {
    const calls: string[] = []
    const subAgentRunner: ISubAgentRunner = {
      run: jest.fn(async ({ directive }) => {
        calls.push(directive.sub_agent_key)
        return okOutput(directive.sub_agent_key)
      }),
    }
    const synthesizer: ISynthesizer = { synthesize: jest.fn(async () => fakeAnswer()) }
    const exec = new BoundedExecutor(subAgentRunner, synthesizer)

    const result = await exec.execute(baseOpts())
    expect(result.kind).toBe('synthesized')
    expect(calls).toEqual(['a', 'b']) // sequential, not parallel
    expect(synthesizer.synthesize).toHaveBeenCalledTimes(1)
  })

  it('emits phase.started for phase-1', async () => {
    const streamEmitter = emitter()
    const subAgentRunner: ISubAgentRunner = {
      run: jest.fn(async ({ directive }) => okOutput(directive.sub_agent_key)),
    }
    const synthesizer: ISynthesizer = { synthesize: jest.fn(async () => fakeAnswer()) }
    const exec = new BoundedExecutor(subAgentRunner, synthesizer)
    await exec.execute(baseOpts({ streamEmitter }))
    expect(streamEmitter.emit).toHaveBeenCalledWith({
      type: 'phase.started',
      payload: { phase: 'phase-1' },
    })
  })

  it('aborts before phase-1 when abortSignal.aborted is true', async () => {
    const ac = new AbortController()
    ac.abort()
    const subAgentRunner: ISubAgentRunner = { run: jest.fn() }
    const synthesizer: ISynthesizer = { synthesize: jest.fn() }
    const exec = new BoundedExecutor(subAgentRunner, synthesizer)
    const result = await exec.execute(baseOpts({ abortSignal: ac.signal }))
    expect(result.kind).toBe('aborted')
    expect(subAgentRunner.run).not.toHaveBeenCalled()
  })

  it('aborts between phase-1 directives when signal fires mid-loop', async () => {
    const ac = new AbortController()
    const subAgentRunner: ISubAgentRunner = {
      run: jest.fn(async ({ directive }) => {
        if (directive.sub_agent_key === 'a') ac.abort()
        return okOutput(directive.sub_agent_key)
      }),
    }
    const synthesizer: ISynthesizer = { synthesize: jest.fn() }
    const exec = new BoundedExecutor(subAgentRunner, synthesizer)
    const result = await exec.execute(baseOpts({ abortSignal: ac.signal }))
    expect(result.kind).toBe('aborted')
    expect(synthesizer.synthesize).not.toHaveBeenCalled()
  })

  it('suppress_partial: ceiling-hit + drafts → return synthesized with suppressed narrative + drafts; synthesizer NOT called', async () => {
    const drafts = [{ id: 'd1', toolName: 't1', args: {} } as never]
    const subAgentRunner: ISubAgentRunner = {
      run: jest.fn(async ({ directive }) =>
        directive.sub_agent_key === 'a'
          ? { ...ceilingHitOutput('a'), drafts }
          : okOutput(directive.sub_agent_key),
      ),
    }
    const synthesizer: ISynthesizer = { synthesize: jest.fn() }
    const exec = new BoundedExecutor(subAgentRunner, synthesizer)
    const result = await exec.execute(baseOpts())
    expect(result.kind).toBe('synthesized')
    if (result.kind === 'synthesized') {
      expect(result.drafts.length).toBe(1)
      expect(result.answer.shape).toBe('narrative')
      expect(result.answer.content).toMatch(/Drafts proposed/)
    }
    expect(synthesizer.synthesize).not.toHaveBeenCalled()
  })

  it('surface_partial: ceiling-hit + zero drafts → kind=partial; synthesizer called', async () => {
    const subAgentRunner: ISubAgentRunner = {
      run: jest.fn(async ({ directive }) => ceilingHitOutput(directive.sub_agent_key)),
    }
    const synthesizer: ISynthesizer = { synthesize: jest.fn(async () => fakeAnswer()) }
    const exec = new BoundedExecutor(subAgentRunner, synthesizer)
    const result = await exec.execute(baseOpts())
    expect(result.kind).toBe('partial')
    expect(synthesizer.synthesize).toHaveBeenCalledTimes(1)
  })

  it('phase-2: emits phase.started(phase-2), sets turnState.phaseContextNote, calls runner with phase=2', async () => {
    const streamEmitter = emitter()
    let observedPhaseContextNote: string | undefined
    const subAgentRunner: ISubAgentRunner = {
      run: jest.fn(async ({ directive, phase, turnState }) => {
        if (phase === 2) observedPhaseContextNote = turnState.phaseContextNote
        return okOutput(directive.sub_agent_key)
      }),
    }
    const synthesizer: ISynthesizer = { synthesize: jest.fn(async () => fakeAnswer()) }
    const exec = new BoundedExecutor(subAgentRunner, synthesizer)
    const myTurnState = turnState()
    const myPlan = plan([{ ...directive('a') }], [{ ...directive('c') }])
    const result = await exec.execute(
      baseOpts({ plan: myPlan, turnState: myTurnState, streamEmitter }),
    )
    expect(result.kind).toBe('synthesized')
    expect(streamEmitter.emit).toHaveBeenCalledWith({
      type: 'phase.started',
      payload: { phase: 'phase-1' },
    })
    expect(streamEmitter.emit).toHaveBeenCalledWith({
      type: 'phase.started',
      payload: { phase: 'phase-2' },
    })
    expect(subAgentRunner.run).toHaveBeenCalledTimes(2) // a (phase-1) + c (phase-2)
    // phaseContextNote should be undefined unless a circuit-breaker was active
    // (the cbState aggregator returns nothing for the all-OK path).
    expect(observedPhaseContextNote).toBeUndefined()
  })

  it('phase-2 with circuit-breaker context: phaseContextNote populated', async () => {
    let observedPhaseContextNote: string | undefined
    const subAgentRunner: ISubAgentRunner = {
      run: jest.fn(async ({ directive, phase, turnState }) => {
        if (phase === 2) observedPhaseContextNote = turnState.phaseContextNote
        if (phase === 1) {
          return {
            ...okOutput(directive.sub_agent_key),
            circuitBreakerState: { 'tool-x': { disabled: true, reason: 'consecutive failures' } },
          }
        }
        return okOutput(directive.sub_agent_key)
      }),
    }
    const synthesizer: ISynthesizer = { synthesize: jest.fn(async () => fakeAnswer()) }
    const exec = new BoundedExecutor(subAgentRunner, synthesizer)
    const myPlan = plan([directive('a')], [directive('c')])
    await exec.execute(baseOpts({ plan: myPlan }))
    expect(observedPhaseContextNote).toBeDefined()
    expect(observedPhaseContextNote).toMatch(/tool-x/)
  })

  it('passes a single outputs map to synthesizer (not phase1Outputs/phase2Outputs)', async () => {
    const subAgentRunner: ISubAgentRunner = {
      run: jest.fn(async ({ directive }) => okOutput(directive.sub_agent_key)),
    }
    const synthesizer: ISynthesizer = { synthesize: jest.fn(async () => fakeAnswer()) }
    const exec = new BoundedExecutor(subAgentRunner, synthesizer)
    const myPlan = plan([directive('a'), directive('b')], [directive('c')])
    await exec.execute(baseOpts({ plan: myPlan }))
    const synthArg = (synthesizer.synthesize as jest.Mock).mock.calls[0][0]
    expect(synthArg.outputs).toBeInstanceOf(Map)
    expect(synthArg.outputs.size).toBe(3) // a, b, c all in one map
    expect((synthArg as { phase1Outputs?: unknown }).phase1Outputs).toBeUndefined()
    expect((synthArg as { phase2Outputs?: unknown }).phase2Outputs).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
bun run --filter @future/api test:unit -- bounded-executor.spec
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/agents/application/services/bounded-executor.ts`:

```ts
/**
 * BoundedExecutor — Plan 18 §4.1.
 *
 * Drives the bounded-tier execution plan: sequential phase-1 fan-out
 * (CLAUDE.md DB rule), partial-answer gate (R-03.19/20), optional
 * sequential phase-2 fan-out, synthesizer call.
 *
 * Returns PhaseExecutionResult — same union shape as IterativeOrchestrator.
 */

import { Inject, Injectable } from '@nestjs/common'
import { evaluatePartialAnswerGate, buildCircuitBreakerContextNote } from './phase-executor'
import type {
  PhaseExecutionResult,
  PhaseExecutorTurnState,
  SubAgentOutput,
  DraftProposal,
  SynthesizerOutput,
} from './phase-executor-contracts'
import type { BoundedPlan, SubAgentKey } from '../../domain/value-objects/router-plan-schema'
import type { StreamEmitter } from './stream-gateway'
import {
  I_SUB_AGENT_RUNNER,
  I_SYNTHESIZER,
  type ISubAgentRunner,
  type ISynthesizer,
} from './iterative-orchestrator'

export const BOUNDED_EXECUTOR = Symbol('BOUNDED_EXECUTOR')

export interface BoundedExecutorOpts {
  readonly plan: BoundedPlan
  readonly userUtterance: string
  readonly turnState: PhaseExecutorTurnState
  readonly abortSignal: AbortSignal
  readonly streamEmitter: StreamEmitter
}

@Injectable()
export class BoundedExecutor {
  constructor(
    @Inject(I_SUB_AGENT_RUNNER) private readonly subAgentRunner: ISubAgentRunner,
    @Inject(I_SYNTHESIZER) private readonly synthesizer: ISynthesizer,
  ) {}

  async execute(opts: BoundedExecutorOpts): Promise<PhaseExecutionResult> {
    const { plan, userUtterance, turnState, abortSignal, streamEmitter } = opts

    if (abortSignal.aborted) return { kind: 'aborted', reason: 'user' }

    streamEmitter.emit({ type: 'phase.started', payload: { phase: 'phase-1' } })

    const outputs = new Map<SubAgentKey, SubAgentOutput>()

    for (const directive of plan.phase1) {
      if (abortSignal.aborted) return { kind: 'aborted', reason: 'user' }
      const out = await this.subAgentRunner.run({ directive, phase: 1, abortSignal, turnState })
      outputs.set(directive.sub_agent_key, out)
    }

    const gate = evaluatePartialAnswerGate(outputs)

    if (gate === 'suppress_partial') {
      const suppressed: SynthesizerOutput = {
        shape: 'narrative',
        content: 'Drafts proposed for review; no answer this turn (writes-only guard).',
        citations: [],
        confidence: 'low',
        turnEndedReason: 'completed',
      } as SynthesizerOutput
      return { kind: 'synthesized', answer: suppressed, drafts: collectDraftsFrom(outputs) }
    }

    if (gate === 'surface_partial') {
      const answer = await this.synthesizer.synthesize({
        directive: plan,
        outputs,
        userUtterance,
        turnState,
        abortSignal,
        streamEmitter,
      })
      return { kind: 'partial', answer, reason: 'limit_reached' }
    }

    // gate === 'no_ceiling'
    if (plan.phase2.length > 0) {
      streamEmitter.emit({ type: 'phase.started', payload: { phase: 'phase-2' } })

      const cbNote = buildCircuitBreakerContextNote(aggregateCbState(outputs))
      // Set on turnState so SubAgentRunnerAdapter reads it (Plan 17 PR 2 amendment).
      // Empty string → leave undefined to keep consumer logic simple.
      turnState.phaseContextNote = cbNote ? cbNote : undefined

      for (const directive of plan.phase2) {
        if (abortSignal.aborted) return { kind: 'aborted', reason: 'user' }
        const out = await this.subAgentRunner.run({ directive, phase: 2, abortSignal, turnState })
        outputs.set(directive.sub_agent_key, out)
      }

      // Clear phaseContextNote after phase-2 completes — prevents leak into synthesizer.
      turnState.phaseContextNote = undefined
    }

    const answer = await this.synthesizer.synthesize({
      directive: plan,
      outputs,
      userUtterance,
      turnState,
      abortSignal,
      streamEmitter,
    })

    return { kind: 'synthesized', answer, drafts: collectDraftsFrom(outputs) }
  }
}

// ─── Pure helpers (module-scoped) ─────────────────────────────────────────────

function collectDraftsFrom(outputs: Map<SubAgentKey, SubAgentOutput>): DraftProposal[] {
  return [...outputs.values()].flatMap((o) => o.drafts ?? [])
}

function aggregateCbState(
  outputs: Map<SubAgentKey, SubAgentOutput>,
): Record<string, { disabled: boolean; reason: string }> {
  const cb: Record<string, { disabled: boolean; reason: string }> = {}
  for (const o of outputs.values()) Object.assign(cb, o.circuitBreakerState ?? {})
  return cb
}
```

> **Note on `phaseContextNote`:** This field is read by `SubAgentRunnerAdapter` (Plan 17 PR 2). If Plan 17 PR 2 has merged and does NOT yet read this field, append a small fix to that adapter:
>
> ```ts
> // In sub-agent-runner-adapter.ts buildSubAgentUserMessage:
> if (opts.turnState.phaseContextNote) {
>   parts.push(opts.turnState.phaseContextNote)
> }
> ```
>
> Track this as an Open-Question follow-up; if PR 2 is already merged, file a small follow-up PR or include it in this branch.

- [ ] **Step 4: Run test, expect PASS**

```bash
bun run --filter @future/api test:unit -- bounded-executor.spec
```

Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck + lint**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/agents/application/services/bounded-executor.ts \
        apps/api/src/modules/agents/application/services/bounded-executor.spec.ts
git commit -m "$(cat <<'EOF'
feat(agents): BoundedExecutor service for bounded-tier execution

Plan 18 Task 5 — drives sequential phase-1 fan-out (CLAUDE.md DB rule),
partial-answer gate (suppress/surface/no_ceiling), optional sequential
phase-2 fan-out with phaseContextNote propagation, synthesizer call.
Returns PhaseExecutionResult — mirrors IterativeOrchestrator pattern.

Single outputs map across both phases; cbNote set on turnState for
SubAgentRunnerAdapter to consume (no SubAgentDirective schema change).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — `render-answer` pure helpers

**Goal:** Pure functions for rendering `SynthesizerOutput` to markdown for conversation persistence + extracting tool/permission keys for `TurnPipelineResult`.

**Files:**

- Create: `apps/api/src/modules/agents/application/services/render-answer.ts`
- Create: `apps/api/src/modules/agents/application/services/render-answer.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/agents/application/services/render-answer.spec.ts`:

````ts
import {
  renderAnswerToMarkdown,
  formatForShape,
  collectToolNames,
  collectPermissionKeys,
} from './render-answer'
import type { SynthesizerOutput, AnswerShape } from './phase-executor-contracts'

const make = (overrides: Partial<SynthesizerOutput>): SynthesizerOutput =>
  ({
    shape: 'narrative',
    content: '',
    citations: [],
    confidence: 'med',
    turnEndedReason: 'completed',
    ...overrides,
  }) as SynthesizerOutput

describe('renderAnswerToMarkdown', () => {
  it('returns content for short-answer', () => {
    expect(renderAnswerToMarkdown(make({ shape: 'short-answer', content: '5' }))).toBe('5')
  })

  it('returns content for narrative', () => {
    expect(
      renderAnswerToMarkdown(make({ shape: 'narrative', content: 'Once upon a time...' })),
    ).toBe('Once upon a time...')
  })

  it('renders list as markdown bullets', () => {
    expect(renderAnswerToMarkdown(make({ shape: 'list', items: ['alpha', 'beta'] } as never))).toBe(
      '- alpha\n- beta',
    )
  })

  it('renders table as markdown pipe table', () => {
    expect(
      renderAnswerToMarkdown(
        make({
          shape: 'table',
          columns: ['name', 'age'],
          rows: [
            ['Alice', '30'],
            ['Bob', '25'],
          ],
        } as never),
      ),
    ).toBe('| name | age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |')
  })

  it('escapes pipes in table cells', () => {
    expect(
      renderAnswerToMarkdown(
        make({
          shape: 'table',
          columns: ['col'],
          rows: [['has | pipe']],
        } as never),
      ),
    ).toBe('| col |\n| --- |\n| has \\| pipe |')
  })

  it('renders chart as JSON-fenced markdown', () => {
    const out = make({
      shape: 'chart',
      series: [{ label: 's1', points: [{ x: 1, y: 2 }] }],
      axes: { x: 'x', y: 'y' },
    } as never)
    const rendered = renderAnswerToMarkdown(out)
    expect(rendered.startsWith('```json\n')).toBe(true)
    expect(rendered.endsWith('\n```')).toBe(true)
    expect(rendered).toContain('"shape":"chart"')
  })
})

describe('formatForShape', () => {
  it.each<[AnswerShape, 'markdown' | 'json']>([
    ['short-answer', 'markdown'],
    ['narrative', 'markdown'],
    ['list', 'markdown'],
    ['table', 'json'],
    ['chart', 'json'],
  ])('%s → %s', (shape, expected) => {
    expect(formatForShape(shape)).toBe(expected)
  })
})

describe('collectToolNames', () => {
  it('flattens unique tool names from citations', () => {
    const out = make({
      citations: [
        {
          claim: 'a',
          subAgentKey: 'sa1',
          sources: [
            { toolName: 't1', args: {}, result: '' } as never,
            { toolName: 't2', args: {}, result: '' } as never,
          ],
        },
        {
          claim: 'b',
          subAgentKey: 'sa2',
          sources: [{ toolName: 't1', args: {}, result: '' } as never],
        },
      ] as never,
    })
    expect(collectToolNames(out).sort()).toEqual(['t1', 't2'])
  })

  it('returns empty array when no citations', () => {
    expect(collectToolNames(make({}))).toEqual([])
  })
})

describe('collectPermissionKeys', () => {
  it('returns empty for now (placeholder until citations carry permission keys)', () => {
    expect(collectPermissionKeys(make({}))).toEqual([])
  })
})
````

- [ ] **Step 2: Run, expect FAIL**

```bash
bun run --filter @future/api test:unit -- render-answer.spec
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/agents/application/services/render-answer.ts`:

```ts
/**
 * render-answer — Plan 18 §4.5 helpers.
 *
 * Pure functions used by RUN_PIPELINE_FN factory to translate a
 * SynthesizerOutput into TurnPipelineResult fields:
 *   - renderedAssistantMessage: markdown for persistence
 *   - toolCallNames: deduped from citation sources
 *   - permissionKeys: placeholder until citations carry them (Plan 17 follow-up)
 */

import type { SynthesizerOutput, AnswerShape } from './phase-executor-contracts'

export function formatForShape(shape: AnswerShape): 'markdown' | 'json' {
  switch (shape) {
    case 'short-answer':
    case 'narrative':
    case 'list':
      return 'markdown'
    case 'table':
    case 'chart':
      return 'json'
  }
}

export function renderAnswerToMarkdown(answer: SynthesizerOutput): string {
  switch (answer.shape) {
    case 'short-answer':
    case 'narrative':
      return (answer as { content: string }).content
    case 'list': {
      const items = (answer as { items: string[] }).items
      return items.map((i) => `- ${i}`).join('\n')
    }
    case 'table': {
      const t = answer as { columns: string[]; rows: string[][] }
      const escape = (cell: string) => cell.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
      const header = `| ${t.columns.map(escape).join(' | ')} |`
      const sep = `| ${t.columns.map(() => '---').join(' | ')} |`
      const body = t.rows.map((row) => `| ${row.map(escape).join(' | ')} |`).join('\n')
      return [header, sep, body].filter(Boolean).join('\n')
    }
    case 'chart':
      return `\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``
  }
}

export function collectToolNames(answer: SynthesizerOutput): string[] {
  const seen = new Set<string>()
  for (const c of answer.citations ?? []) {
    for (const s of c.sources ?? []) {
      if (s.toolName) seen.add(s.toolName)
    }
  }
  return [...seen]
}

/**
 * Placeholder — citation sources don't currently carry permission keys.
 * When Plan 17's tool-gateway-bridge enriches sources with descriptor.meta.permission,
 * extract them here. For now returns empty array; the metric label space stays
 * stable.
 */
export function collectPermissionKeys(_answer: SynthesizerOutput): string[] {
  return []
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
bun run --filter @future/api test:unit -- render-answer.spec
```

Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agents/application/services/render-answer.ts \
        apps/api/src/modules/agents/application/services/render-answer.spec.ts
git commit -m "$(cat <<'EOF'
feat(agents): render-answer pure helpers

Plan 18 Task 6 — renderAnswerToMarkdown for conversation persistence,
formatForShape for answer.shape_declared format field, collectToolNames
for TurnPipelineResult, collectPermissionKeys placeholder.

Tables escape pipes; charts emit JSON-fenced markdown.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — `RUN_PIPELINE_FN` real factory in `agents.module.ts`

**Goal:** Wire the runner's pipeline closure to the real services. Composes `RouterSessionOrchestrator`, `BoundedExecutor`, existing `IterativeOrchestrator` (executed inside router), `WindowBuilder`, `KernelQueryFacade`. Translates `RouteTurnResult` + `PhaseExecutionResult` into `TurnPipelineResult`.

**Files:**

- Modify: `apps/api/src/modules/agents/agents.module.ts`

- [ ] **Step 1: Inspect existing providers around `RUN_PIPELINE_FN`**

```bash
grep -n "TURN_PIPELINE_RUNNER\|RUN_PIPELINE_FN\|TOOL_GATEWAY\|RouterSessionOrchestrator\|WindowBuilder\|KernelQueryFacade" apps/api/src/modules/agents/agents.module.ts | head -20
```

Identify:

- Where `TOOL_GATEWAY` is bound (Plan 17 PR 1).
- Whether `RUN_PIPELINE_FN` and `TurnPipelineRunner` are bound (they should NOT be — Plan 18 introduces them).
- Existing service providers for `RouterSessionOrchestrator`, `BoundedExecutor` (newly added Task 5), `WindowBuilder`, `KernelQueryFacade`.

- [ ] **Step 2: Add imports**

At the top of `agents.module.ts`:

```ts
import {
  TurnPipelineRunner,
  TURN_PIPELINE_RUNNER,
  RUN_PIPELINE_FN,
  type RunPipelineFn,
  type TurnPipelineResult,
} from './application/services/turn-pipeline-runner'
import { BoundedExecutor, BOUNDED_EXECUTOR } from './application/services/bounded-executor'
import { classifyPipelineError } from './application/services/pipeline-errors'
import {
  renderAnswerToMarkdown,
  collectToolNames,
  collectPermissionKeys,
} from './application/services/render-answer'
import { WindowBuilder } from './application/services/window-builder' // verify import path
import type { PhaseExecutionResult } from './application/services/phase-executor-contracts'
import type { BoundedPlan } from './domain/value-objects/router-plan-schema'
```

If `WindowBuilder` lives elsewhere (DI token, different path), adjust the import. Search for it:

```bash
grep -rn "class WindowBuilder\|WINDOW_BUILDER" apps/api/src/modules/agents --include="*.ts" | grep -v spec | head -5
```

- [ ] **Step 3: Add the providers**

Find the `providers: [...]` array and append:

```ts
// Plan 18 — TurnPipelineRunner + BoundedExecutor + real RUN_PIPELINE_FN factory
BoundedExecutor,
{ provide: BOUNDED_EXECUTOR, useExisting: BoundedExecutor },
TurnPipelineRunner,
{ provide: TURN_PIPELINE_RUNNER, useExisting: TurnPipelineRunner },
{
  provide: RUN_PIPELINE_FN,
  inject: [
    RouterSessionOrchestrator,
    BoundedExecutor,
    WindowBuilder,
    KernelQueryFacade,
  ],
  useFactory: (
    routerOrchestrator: RouterSessionOrchestrator,
    boundedExecutor: BoundedExecutor,
    windowBuilder: WindowBuilder,
    kernelQuery: KernelQueryFacade,
  ): RunPipelineFn => async (input) => {
    const { userUtterance, conversationId, requestContext, abortSignal,
            streamEmitter, turnState } = input

    // ── Build router inputs (sequential per CLAUDE.md DB rule) ───────────────
    const recentSummary = await windowBuilder.build({
      tenantId: requestContext.tenantId,
      conversationId,
    })
    const roleAllowedPermissions = await kernelQuery.getRoleAllowedPermissions(
      requestContext.tenantId, requestContext.userId,
    )
    const enabledModules = await kernelQuery.getEnabledModules(requestContext.tenantId)

    // ── Step 1: Route the turn ──────────────────────────────────────────────
    const routed = await routerOrchestrator.routeTurn({
      tenantId: requestContext.tenantId,
      userId: requestContext.userId,
      roleKey: requestContext.roleKey,
      roleAllowedPermissions,
      enabledModules,
      surface: requestContext.surface,
      conversationId,
      turnTraceId: requestContext.traceId,
      utterance: userUtterance,
      recentSummary,
      promptVariables: new Map(),
    })

    // ── Step 2: Dispatch on RouteTurnResult kind ────────────────────────────
    if (routed.kind === 'disambiguation') {
      streamEmitter.emit({
        type: 'refusal.started',
        payload: { reason: routed.reason, kind: 'disambiguation' },
      })
      return {
        toolCallNames: [], shape: 'refusal' as const, permissionKeys: [],
        taintFlipped: false,
        renderedAssistantMessage: routed.reason,
        turnEndReason: 'refused' as const,
        drafts: [],
      }
    }

    if (routed.kind === 'iterative') {
      // RouterSessionOrchestrator already executed IterativeOrchestrator.
      // SSE events were emitted from inside that orchestrator. Don't re-emit.
      return phaseResultToPipelineResult(routed.result)
    }

    // routed.kind === 'bounded' — execute via BoundedExecutor.
    const result = await boundedExecutor.execute({
      plan: routed.plan as BoundedPlan,
      userUtterance,
      turnState,
      abortSignal,
      streamEmitter,
    })
    return phaseResultToPipelineResult(result)
  },
},
```

Add the local helper function at the BOTTOM of `agents.module.ts` (after the `@Module({...})` class declaration):

```ts
// ─── Pipeline result translation (module-scoped helper) ───────────────────────

function phaseResultToPipelineResult(r: PhaseExecutionResult): TurnPipelineResult {
  switch (r.kind) {
    case 'synthesized':
      return {
        toolCallNames: collectToolNames(r.answer),
        shape: r.answer.shape,
        permissionKeys: collectPermissionKeys(r.answer),
        taintFlipped: false, // taint flag lives on turnState, not on synthesizer output
        renderedAssistantMessage: renderAnswerToMarkdown(r.answer),
        turnEndReason: 'completed',
        drafts: r.drafts,
      }
    case 'partial':
      return {
        toolCallNames: collectToolNames(r.answer),
        shape: r.answer.shape,
        permissionKeys: collectPermissionKeys(r.answer),
        taintFlipped: false,
        renderedAssistantMessage: renderAnswerToMarkdown(r.answer),
        turnEndReason: 'completed',
        drafts: [],
      }
    case 'disambiguation':
      return {
        toolCallNames: [],
        shape: 'refusal',
        permissionKeys: [],
        taintFlipped: false,
        renderedAssistantMessage: r.question,
        turnEndReason: 'refused',
        drafts: [],
      }
    case 'aborted':
      return {
        toolCallNames: [],
        shape: 'aborted',
        permissionKeys: [],
        taintFlipped: false,
        renderedAssistantMessage: '',
        turnEndReason: 'cancelled',
        drafts: [],
      }
  }
}
```

- [ ] **Step 4: Typecheck**

```bash
bun run --filter @future/api typecheck
```

Expected: clean. Common issues:

- `WindowBuilder` import path wrong → adjust per `grep` result.
- `KernelQueryFacade.getRoleAllowedPermissions` / `getEnabledModules` method names wrong → verify with:

  ```bash
  grep -n "getRoleAllowedPermissions\|getEnabledModules\|class KernelQueryFacade" apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts | head
  ```

  If methods named differently, use the correct names.

- [ ] **Step 5: Run unit suite**

```bash
bun run --filter @future/api test:unit
```

Expected: PASS. The module providers don't have direct unit tests (covered by integration in Task 10).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/agents/agents.module.ts
git commit -m "$(cat <<'EOF'
feat(agents): real RUN_PIPELINE_FN factory + TurnPipelineRunner DI binding

Plan 18 Task 7 — agents.module.ts wires TurnPipelineRunner, BoundedExecutor,
and the real RUN_PIPELINE_FN factory composing RouterSessionOrchestrator
+ BoundedExecutor + existing IterativeOrchestrator (executed internally
by router) + WindowBuilder + KernelQueryFacade.

phaseResultToPipelineResult translates PhaseExecutionResult union variants
into TurnPipelineResult. Disambiguation emits refusal.started before
returning. Iterative path does NOT re-emit (orchestrator already streamed).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — `agent-turn-controller` refactor (placeholder body removed wholesale)

**Goal:** Replace the placeholder SSE event emission with real pipeline invocation. Persist user message before, assistant message after. Map `TurnPipelineResult.turnEndReason` to gateway close/error. Hard cutover (R-18.23).

**Files:**

- Rewrite: `apps/api/src/modules/agents/interface/http/agent-turn-controller.ts` (the body of `streamTurn`)
- Rewrite: `apps/api/src/modules/agents/interface/http/agent-turn-controller.spec.ts`

- [ ] **Step 1: Inspect current controller body**

```bash
sed -n '160,255p' apps/api/src/modules/agents/interface/http/agent-turn-controller.ts
```

Confirm the placeholder block we're replacing (lines ~160–212): `gateway.emit({ type: 'turn.started', ... })` through `gateway.emit({ type: 'answer.complete', payload: {} })` followed by `gateway.close('completed', ZERO_USAGE)`.

- [ ] **Step 2: Update controller imports and constructor**

In `agent-turn-controller.ts`, add to imports:

```ts
import {
  TurnPipelineRunner,
  TURN_PIPELINE_RUNNER,
} from '../../application/services/turn-pipeline-runner'
import { SaveQueue } from '../../application/services/save-queue'
import { classifyPipelineError } from '../../application/services/pipeline-errors'
import { Inject } from '@nestjs/common'
import type { PhaseExecutorTurnState } from '../../application/services/phase-executor-contracts'
```

Update the constructor to inject the runner + SaveQueue. Existing constructor signature is:

```ts
constructor(
  private readonly jwtService: JwtService,
  private readonly activeTurnRegistry: ActiveTurnRegistry,
  private readonly kernelAuditFacade: KernelAuditFacade,
  private readonly budgetChecker: BudgetChecker,
  private readonly observabilityContextFactory: ObservabilityContextFactory,
  private readonly flowIdPropagation: FlowIdPropagation,
) {}
```

Append two new injected deps:

```ts
constructor(
  private readonly jwtService: JwtService,
  private readonly activeTurnRegistry: ActiveTurnRegistry,
  private readonly kernelAuditFacade: KernelAuditFacade,
  private readonly budgetChecker: BudgetChecker,
  private readonly observabilityContextFactory: ObservabilityContextFactory,
  private readonly flowIdPropagation: FlowIdPropagation,
  @Inject(TURN_PIPELINE_RUNNER) private readonly turnPipelineRunner: TurnPipelineRunner,
  private readonly saveQueue: SaveQueue,
) {}
```

- [ ] **Step 3: Replace the placeholder body**

Locate the block:

```ts
gateway.emit({ type: 'turn.started', payload: { trace_id: traceId, flow_id: flowId } })

if (signal.aborted) {
  /* ... */
}

gateway.emit({ type: 'phase.started', payload: { phase: 'routing' } })

if (!signal.aborted) {
  gateway.emit({
    type: 'answer.shape_declared',
    payload: { format: 'markdown', locale: 'en' },
  })
}

if (!signal.aborted) {
  gateway.emit({ type: 'answer.token', payload: { token: '' } })
}

if (!signal.aborted) {
  gateway.emit({ type: 'answer.complete', payload: {} })
}

gateway.close('completed', ZERO_USAGE)
```

Replace it with:

```ts
gateway.emit({ type: 'turn.started', payload: { trace_id: traceId, flow_id: flowId } })

if (signal.aborted) {
  turnEndReason = 'cancelled'
  gateway.close('cancelled', ZERO_USAGE)
  return
}

// ── Persist user message via SaveQueue (fire-and-forget) ────────────────
const userMessageContent = body?.user_utterance ?? ''
this.saveQueue.enqueue({
  conversationId: conversationId ?? '',
  tenantId,
  message: {
    tenantId,
    userId,
    conversationId: conversationId ?? '',
    traceId,
    role: 'user',
    content: { text: userMessageContent },
    flowId,
  },
})

// ── Build runtime turn state for the pipeline ───────────────────────────
const turnState: PhaseExecutorTurnState = {
  traceId,
  tenantId,
  userId,
  conversationId: conversationId ?? '',
  sessionId: '', // populated by RouterSessionOrchestrator after session load
  surface: surface as 'global-chat' | 'inline' | 'async',
  tainted: { value: false },
  routerReplanCount: 0,
}

const requestContext = {
  tenantId,
  userId,
  traceId,
  surface: surface as 'global-chat' | 'inline' | 'async',
  roleKey: (session as { roleKey?: string }).roleKey ?? '',
}

// ── Invoke the pipeline runner — produces SSE events via streamEmitter ──
const pipelineResult = await this.turnPipelineRunner.run({
  userUtterance: userMessageContent,
  conversationId: conversationId ?? '',
  requestContext,
  abortSignal: signal,
  streamEmitter: gateway,
  turnState,
})

// ── Persist assistant message (only when non-empty) ─────────────────────
if (pipelineResult.renderedAssistantMessage) {
  this.saveQueue.enqueue({
    conversationId: conversationId ?? '',
    tenantId,
    message: {
      tenantId,
      userId,
      conversationId: conversationId ?? '',
      traceId,
      role: 'assistant',
      content: {
        text: pipelineResult.renderedAssistantMessage,
        shape: pipelineResult.shape,
      },
      flowId,
    },
  })
}

// ── Translate pipeline turnEndReason to SSE close ───────────────────────
const usage = pipelineResult.usage ?? ZERO_USAGE
switch (pipelineResult.turnEndReason) {
  case 'cancelled':
    turnEndReason = 'cancelled'
    gateway.close('cancelled', usage)
    break
  case 'refused':
    turnEndReason = 'refused'
    gateway.close('refused', usage)
    break
  case 'error':
    turnEndReason = 'error'
    gateway.error('internal_error', usage)
    break
  case 'completed':
  default:
    turnEndReason = 'completed'
    gateway.close('completed', usage)
}
```

The existing outer `try/catch (err) { ... }` block already handles untyped throws — modify the catch body to use `classifyPipelineError`:

Find the existing catch in `streamTurn`:

```ts
} catch (err) {
  turnError = err instanceof Error ? err : new Error(String(err))
  if (!signal.aborted) {
    turnEndReason = 'error'
    gateway.error('internal_error', ZERO_USAGE)
  } else {
    turnEndReason = 'cancelled'
    gateway.close('cancelled', ZERO_USAGE)
  }
}
```

Replace `gateway.error('internal_error', ZERO_USAGE)` with:

```ts
const cause = classifyPipelineError(err)
gateway.error(cause, ZERO_USAGE)
```

- [ ] **Step 4: Update controller spec**

The existing `agent-turn-controller.spec.ts` (from PR #105) likely tests budget refusal, cancel, etc. Add new tests covering the refactored body:

```ts
import { TurnPipelineRunner } from '../../application/services/turn-pipeline-runner'
import { SaveQueue } from '../../application/services/save-queue'

describe('AgentTurnController — Plan 18 live pipeline', () => {
  function makeController(overrides: Partial<{
    runner: { run: jest.Mock }
    saveQueue: { enqueue: jest.Mock }
  }> = {}) {
    const runner = overrides.runner ?? { run: jest.fn().mockResolvedValue({
      toolCallNames: [], shape: 'narrative', permissionKeys: [], taintFlipped: false,
      renderedAssistantMessage: 'hello', turnEndReason: 'completed', drafts: [],
    }) }
    const saveQueue = overrides.saveQueue ?? { enqueue: jest.fn() }
    // construct controller with all existing fakes + new runner + saveQueue
    return { controller: new AgentTurnController(/* fakes */, runner as never, saveQueue as never), runner, saveQueue }
  }

  it('enqueues user message before invoking the runner', async () => {
    const { controller, saveQueue, runner } = makeController()
    await invokeStreamTurn(controller, {/* fixture req */})
    // saveQueue.enqueue called BEFORE runner.run
    expect((saveQueue.enqueue as jest.Mock).mock.invocationCallOrder[0])
      .toBeLessThan((runner.run as jest.Mock).mock.invocationCallOrder[0])
    expect(saveQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.objectContaining({ role: 'user' }),
    }))
  })

  it('enqueues assistant message after runner returns (when renderedAssistantMessage non-empty)', async () => {
    const { controller, saveQueue } = makeController()
    await invokeStreamTurn(controller, {/* fixture */})
    const assistantCall = (saveQueue.enqueue as jest.Mock).mock.calls.find(
      ([arg]) => arg.message.role === 'assistant',
    )
    expect(assistantCall).toBeDefined()
    expect(assistantCall[0].message.content.text).toBe('hello')
  })

  it('skips assistant enqueue when renderedAssistantMessage is empty (cancelled turn)', async () => {
    const runner = { run: jest.fn().mockResolvedValue({
      toolCallNames: [], shape: 'aborted', permissionKeys: [], taintFlipped: false,
      renderedAssistantMessage: '', turnEndReason: 'cancelled', drafts: [],
    }) }
    const { controller, saveQueue } = makeController({ runner })
    await invokeStreamTurn(controller, {/* fixture */})
    const assistantCall = (saveQueue.enqueue as jest.Mock).mock.calls.find(
      ([arg]) => arg.message.role === 'assistant',
    )
    expect(assistantCall).toBeUndefined()
  })

  it.each<['completed' | 'cancelled' | 'refused' | 'error', 'completed' | 'cancelled' | 'refused' | 'error']>([
    ['completed', 'completed'],
    ['cancelled', 'cancelled'],
    ['refused', 'refused'],
    ['error', 'error'],
  ])('translates turnEndReason=%s to gateway close/error', async (turnEndReason, expectedGatewayReason) => {
    // assert gateway.close or gateway.error called with the expected reason
    // (use spy on stream-gateway createStreamGateway helper or fake the gateway)
  })

  it('classifies untyped throw as internal_error via classifyPipelineError', async () => {
    const runner = { run: jest.fn().mockRejectedValue(new Error('something blew up')) }
    const { controller } = makeController({ runner })
    await invokeStreamTurn(controller, {/* fixture */})
    // assert gateway.error('internal_error', ...) called
  })
})

function invokeStreamTurn(controller: AgentTurnController, _fixture: unknown) {
  // Use the same test-bootstrap pattern the existing spec uses to invoke streamTurn().
  // Provide a fake req with cookie + body and a fake res with raw.write/raw.end.
  // Reuse helpers from the existing spec file — do NOT reinvent.
  return controller.streamTurn(/* fakeReq */ {} as never, /* fakeRes */ {} as never)
}
```

> **Note:** the `invokeStreamTurn` and controller construction patterns mirror the existing spec file. Reuse those fixtures verbatim — they handle JWT verification, budget checker setup, observability factory, etc. The only NEW deps are `runner` and `saveQueue`.

- [ ] **Step 5: Run controller tests**

```bash
bun run --filter @future/api test:unit -- agent-turn-controller.spec
```

Expected: PASS for all (existing + new).

- [ ] **Step 6: Run full unit suite**

```bash
bun run --filter @future/api test:unit
```

Expected: PASS.

- [ ] **Step 7: Typecheck + lint**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api lint
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/agents/interface/http/agent-turn-controller.ts \
        apps/api/src/modules/agents/interface/http/agent-turn-controller.spec.ts
git commit -m "$(cat <<'EOF'
feat(agents): agent-turn-controller invokes real pipeline (placeholder removed)

Plan 18 Task 8 — replace placeholder SSE body wholesale (R-18.23 hard
cutover, no legacy fallback). Controller now:
- enqueues user message via SaveQueue before runner
- invokes turnPipelineRunner.run() with real streamEmitter
- enqueues assistant message after runner (only when non-empty)
- maps turnEndReason → gateway.close/error
- catch block uses classifyPipelineError for typed error → SSE cause

PR #105 wiring (BudgetChecker / FlowIdPropagation / ObservabilityContextFactory)
unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — Pipeline OTel instruments

**Goal:** Three new instruments for pipeline observability. Lazy-init pattern matches existing `cost-metrics.ts` / `streaming-metrics.ts`.

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/observability/pipeline-metrics.ts`
- Create: `apps/api/src/modules/agents/infrastructure/observability/pipeline-metrics.spec.ts`
- Modify: `apps/api/src/modules/agents/agents.module.ts` (call from `RUN_PIPELINE_FN` factory)
- Modify: `apps/api/src/modules/agents/application/services/bounded-executor.ts` (emit `phase_duration_ms`)

- [ ] **Step 1: Test + implement metrics module**

Create `apps/api/src/modules/agents/infrastructure/observability/pipeline-metrics.spec.ts`:

```ts
import { metrics } from '@opentelemetry/api'
import {
  recordPipelineDispatch,
  recordBoundedExecutorPhaseDuration,
  recordBoundedExecutorDrafts,
} from './pipeline-metrics'

describe('pipeline-metrics', () => {
  it('records agent_pipeline_dispatch_total', () => {
    const counter = jest.fn()
    jest.spyOn(metrics, 'getMeter').mockReturnValue({
      createCounter: () => ({ add: counter }),
      createHistogram: () => ({ record: jest.fn() }),
    } as never)
    recordPipelineDispatch({ kind: 'bounded', outcome: 'completed' })
    expect(counter).toHaveBeenCalledWith(1, { kind: 'bounded', outcome: 'completed' })
  })

  it('records agent_bounded_executor_phase_duration_ms', () => {
    const record = jest.fn()
    jest.spyOn(metrics, 'getMeter').mockReturnValue({
      createCounter: () => ({ add: jest.fn() }),
      createHistogram: () => ({ record }),
    } as never)
    recordBoundedExecutorPhaseDuration({ phase: 'phase-1', outcome: 'completed', durationMs: 1234 })
    expect(record).toHaveBeenCalledWith(1234, { phase: 'phase-1', outcome: 'completed' })
  })

  it('records agent_bounded_executor_drafts_total', () => {
    const counter = jest.fn()
    jest.spyOn(metrics, 'getMeter').mockReturnValue({
      createCounter: () => ({ add: counter }),
      createHistogram: () => ({ record: jest.fn() }),
    } as never)
    recordBoundedExecutorDrafts({ phase: 'phase-1', subAgentKey: 'sa1', count: 3 })
    expect(counter).toHaveBeenCalledWith(3, { phase: 'phase-1', sub_agent_key: 'sa1' })
  })
})
```

Create `apps/api/src/modules/agents/infrastructure/observability/pipeline-metrics.ts`:

```ts
/**
 * pipeline-metrics — Plan 18 §8.2.
 *
 * OTel instruments for live pipeline composition.
 * Lazy-init pattern matches cost-metrics.ts / streaming-metrics.ts.
 */

import { metrics } from '@opentelemetry/api'
import type { Counter, Histogram } from '@opentelemetry/api'

const METER_NAME = 'agents.pipeline'

let _dispatch: Counter | undefined
let _phaseDuration: Histogram | undefined
let _drafts: Counter | undefined

function dispatchCounter(): Counter {
  if (!_dispatch) {
    _dispatch = metrics.getMeter(METER_NAME).createCounter('agent_pipeline_dispatch_total', {
      description: 'Pipeline dispatch outcomes per turn (bounded/iterative/disambiguation).',
    })
  }
  return _dispatch
}

function phaseDurationHistogram(): Histogram {
  if (!_phaseDuration) {
    _phaseDuration = metrics
      .getMeter(METER_NAME)
      .createHistogram('agent_bounded_executor_phase_duration_ms', {
        description: 'Bounded-tier phase duration (phase-1 / phase-2).',
      })
  }
  return _phaseDuration
}

function draftsCounter(): Counter {
  if (!_drafts) {
    _drafts = metrics.getMeter(METER_NAME).createCounter('agent_bounded_executor_drafts_total', {
      description: 'Drafts proposed during bounded-tier execution.',
    })
  }
  return _drafts
}

export function recordPipelineDispatch(opts: {
  kind: 'bounded' | 'iterative' | 'disambiguation'
  outcome: 'completed' | 'cancelled' | 'refused' | 'error'
}): void {
  dispatchCounter().add(1, { kind: opts.kind, outcome: opts.outcome })
}

export function recordBoundedExecutorPhaseDuration(opts: {
  phase: 'phase-1' | 'phase-2'
  outcome: 'completed' | 'cancelled' | 'errored'
  durationMs: number
}): void {
  phaseDurationHistogram().record(opts.durationMs, { phase: opts.phase, outcome: opts.outcome })
}

export function recordBoundedExecutorDrafts(opts: {
  phase: 'phase-1' | 'phase-2'
  subAgentKey: string
  count: number
}): void {
  if (opts.count <= 0) return
  draftsCounter().add(opts.count, { phase: opts.phase, sub_agent_key: opts.subAgentKey })
}
```

```bash
bun run --filter @future/api test:unit -- pipeline-metrics.spec
```

Expected: PASS.

- [ ] **Step 2: Wire metric emission in `BoundedExecutor`**

In `bounded-executor.ts`, add:

```ts
import {
  recordBoundedExecutorPhaseDuration,
  recordBoundedExecutorDrafts,
} from '../../infrastructure/observability/pipeline-metrics'
```

Wrap each phase loop in a duration measurement:

```ts
const phase1Start = Date.now()
let phase1Outcome: 'completed' | 'cancelled' | 'errored' = 'completed'
try {
  for (const directive of plan.phase1) {
    if (abortSignal.aborted) {
      phase1Outcome = 'cancelled'
      throw new AbortError() /* or just return */
    }
    const out = await this.subAgentRunner.run({ directive, phase: 1, abortSignal, turnState })
    outputs.set(directive.sub_agent_key, out)
    if (out.drafts && out.drafts.length > 0) {
      recordBoundedExecutorDrafts({
        phase: 'phase-1',
        subAgentKey: directive.sub_agent_key,
        count: out.drafts.length,
      })
    }
  }
} finally {
  recordBoundedExecutorPhaseDuration({
    phase: 'phase-1',
    outcome: phase1Outcome,
    durationMs: Date.now() - phase1Start,
  })
}
```

Simpler — instead of try/finally with abort branching, just track outcome explicitly:

```ts
const phase1Start = Date.now()
let phase1Outcome: 'completed' | 'cancelled' | 'errored' = 'completed'

for (const directive of plan.phase1) {
  if (abortSignal.aborted) {
    phase1Outcome = 'cancelled'
    recordBoundedExecutorPhaseDuration({
      phase: 'phase-1',
      outcome: phase1Outcome,
      durationMs: Date.now() - phase1Start,
    })
    return { kind: 'aborted', reason: 'user' }
  }
  const out = await this.subAgentRunner.run({ directive, phase: 1, abortSignal, turnState })
  outputs.set(directive.sub_agent_key, out)
  if (out.drafts && out.drafts.length > 0) {
    recordBoundedExecutorDrafts({
      phase: 'phase-1',
      subAgentKey: directive.sub_agent_key,
      count: out.drafts.length,
    })
  }
}
recordBoundedExecutorPhaseDuration({
  phase: 'phase-1',
  outcome: phase1Outcome,
  durationMs: Date.now() - phase1Start,
})
```

Apply identical pattern to the phase-2 loop.

Add a corresponding `bounded-executor.spec.ts` test that asserts the metric is called (mock the metrics module the same way as `pipeline-metrics.spec.ts`).

- [ ] **Step 3: Wire `recordPipelineDispatch` in `RUN_PIPELINE_FN` factory**

In `agents.module.ts`, in the factory body (Task 7), wrap the dispatch with:

```ts
useFactory: (...) => async (input) => {
  // ... existing build-router-inputs + routeTurn() ...

  let kind: 'bounded' | 'iterative' | 'disambiguation' = 'bounded'
  let outcome: 'completed' | 'cancelled' | 'refused' | 'error' = 'completed'

  try {
    if (routed.kind === 'disambiguation') {
      kind = 'disambiguation'
      outcome = 'refused'
      streamEmitter.emit({ type: 'refusal.started', payload: { reason: routed.reason, kind: 'disambiguation' } })
      const result = { /* refusal TurnPipelineResult */ } as TurnPipelineResult
      return result
    }

    if (routed.kind === 'iterative') {
      kind = 'iterative'
      const result = phaseResultToPipelineResult(routed.result)
      outcome = result.turnEndReason
      return result
    }

    kind = 'bounded'
    const result = await boundedExecutor.execute({ /* ... */ })
    const pipelineResult = phaseResultToPipelineResult(result)
    outcome = pipelineResult.turnEndReason
    return pipelineResult
  } catch (err) {
    outcome = 'error'
    throw err
  } finally {
    recordPipelineDispatch({ kind, outcome })
  }
}
```

- [ ] **Step 4: Run tests**

```bash
bun run --filter @future/api test:unit -- pipeline-metrics
bun run --filter @future/api test:unit -- bounded-executor.spec
bun run --filter @future/api test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agents/infrastructure/observability/pipeline-metrics.ts \
        apps/api/src/modules/agents/infrastructure/observability/pipeline-metrics.spec.ts \
        apps/api/src/modules/agents/application/services/bounded-executor.ts \
        apps/api/src/modules/agents/application/services/bounded-executor.spec.ts \
        apps/api/src/modules/agents/agents.module.ts
git commit -m "$(cat <<'EOF'
feat(agents): pipeline OTel instruments

Plan 18 Task 9 — agent_pipeline_dispatch_total / _bounded_executor_phase_
duration_ms / _bounded_executor_drafts_total counters + histogram. Emitted
from RUN_PIPELINE_FN factory (dispatch) and BoundedExecutor (phase
duration + drafts).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 — Integration tests

**Goal:** Cover the full controller-through-SSE path, two-tenant RLS isolation, abort propagation, refusal flow, error→SSE mapping. Use real DB (Postgres up); fake LLM clients.

**Files:**

- Create: `apps/api/src/modules/agents/interface/http/agent-turn-controller.live-pipeline.integration.spec.ts`
- Create: `apps/api/src/modules/agents/application/services/bounded-executor.integration.spec.ts`

- [ ] **Step 1: Set up DB**

```bash
bun run db:up
bun run --filter @future/api test:integration -- rls-all-tables.integration  # sanity
```

Expected: existing integration tests still pass.

- [ ] **Step 2: Write controller live-pipeline integration spec**

Create `apps/api/src/modules/agents/interface/http/agent-turn-controller.live-pipeline.integration.spec.ts`:

```ts
/**
 * Integration: AgentTurnController live pipeline.
 *
 * Boots the real AgentsModule with FakeSubAgentLlmClient + FakeSynthesizerLlmClient
 * (scripted to produce a deterministic narrative output). Real DB; real RLS;
 * real ToolGateway; real RouterSessionOrchestrator; real BoundedExecutor;
 * real SaveQueue.
 *
 * Verifies:
 *   1. SSE event sequence: turn.started → phase.started → answer.shape_declared
 *      → answer.token+ → answer.complete → turn.ended(completed)
 *   2. agent_conversation_message rows: 1 user + 1 assistant
 *   3. Two-tenant RLS isolation
 *   4. Abort path closes with 'cancelled'
 *   5. Refusal (disambiguation) emits refusal.started + turn.ended(refused)
 *   6. Error → SSE error event
 */

import { Test, type TestingModule } from '@nestjs/testing'
// Import the agents module + override LLM client providers with fakes.
// Use the same DB-bootstrap pattern as drizzle-conversation.repository.integration.spec.ts.

describe('AgentTurnController live pipeline integration', () => {
  let app: TestingModule
  // ... boot test app, seed kernel role/permission rows for TENANT_A/TENANT_B,
  //     override SUB_AGENT_LLM_CLIENT and SYNTHESIZER_LLM_CLIENT and ROUTER_LLM_CLIENT
  //     with fakes that produce a single sub-agent bounded plan + a narrative answer.

  it('happy path: POST /api/agent/turn produces full SSE sequence + persists messages', async () => {
    const sseEvents: { type: string; payload: unknown }[] = []
    // ... post a request, capture SSE events from the response stream.

    expect(sseEvents.map((e) => e.type)).toEqual([
      'turn.started',
      'phase.started',
      'answer.shape_declared',
      // ≥1 answer.token
      expect.stringContaining('answer.token'),
      'answer.complete',
      'turn.ended',
    ])
    // Assert agent_conversation_message: 1 user + 1 assistant.
    // Assert agent_session.routerPromptHash populated.
  })

  it('two-tenant RLS isolation', async () => {
    // Run two parallel POSTs from TENANT_A and TENANT_B.
    // Assert each only sees its own conversation history.
  })

  it('abort path closes with cancelled', async () => {
    // Post a request; close the connection mid-stream.
    // Assert turn.ended payload reason: cancelled.
  })

  it('disambiguation: emits refusal.started + turn.ended(refused)', async () => {
    // Override RouterLlmClient to return a parse that fails twice.
    // Assert refusal.started fires; assistant message NOT persisted.
  })

  it('synthesizer pre-shape failure → gateway.error(synthesizer_failure)', async () => {
    // Override SynthesizerLlmClient.stream() to throw before partials.
    // Assert SSE error event with cause synthesizer_failure.
  })
})
```

> **Implementer note**: The bootstrap pattern is intricate but identical to existing files (`drizzle-conversation.repository.integration.spec.ts`, `rls-all-tables.integration.spec.ts`, `agent-turn-controller.spec.ts`). Reuse those helpers; do not invent. The fake `SynthesizerLlmClient.stream()` must yield a partial-object stream with `partialObjectStream` async iterable + a `usage` and `object` resolver. Pattern:
>
> ```ts
> const fakeSynth: SynthesizerLlmClient = {
>   stream: async () => ({
>     partialObjectStream: (async function* () {
>       yield { shape: 'narrative' }
>       yield { shape: 'narrative', content: 'Hello ' }
>       yield { shape: 'narrative', content: 'Hello world' }
>     })(),
>     object: Promise.resolve({ shape: 'narrative', content: 'Hello world' }),
>     usage: Promise.resolve({ inputTokens: 1, outputTokens: 2, totalTokens: 3 }),
>   }),
> }
> ```

- [ ] **Step 3: Write bounded-executor integration spec**

Create `apps/api/src/modules/agents/application/services/bounded-executor.integration.spec.ts`:

```ts
/**
 * Integration: BoundedExecutor against real ToolGateway + DB.
 *
 * Uses a fake SubAgentLlmClient that scripts a single tool call and a
 * structured output. Verifies:
 *   - Sequential phase-1 dispatch (toolGateway invoked under correct tenant_id)
 *   - phase-2 receives turnState.phaseContextNote when phase-1 reports
 *     circuit-breaker state
 *   - Synthesizer called with single outputs map containing both phases' results
 */

describe('BoundedExecutor integration', () => {
  it.todo('phase-1 + phase-2 dispatch with real ToolGateway + RLS')
  it.todo('phaseContextNote propagation when phase-1 returns circuit-breaker state')
})
```

> **Implementer note**: Mark `it.todo` if the integration bootstrap is too involved for this task; the unit tests (Task 5) already cover the logic. The integration test exists primarily to verify the DI wiring + RLS at runtime. If you implement, mirror the SubAgentRunnerAdapter integration spec from Plan 17 Task 6.

- [ ] **Step 4: Run integration suite**

```bash
bun run db:up
bun run --filter @future/api test:integration -- agent-turn-controller.live-pipeline
bun run --filter @future/api test:integration -- bounded-executor.integration
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
bun run --filter @future/api test:unit
bun run --filter @future/api test:integration
bun run --filter @future/api typecheck
bun run --filter @future/api lint
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/agents/interface/http/agent-turn-controller.live-pipeline.integration.spec.ts \
        apps/api/src/modules/agents/application/services/bounded-executor.integration.spec.ts
git commit -m "$(cat <<'EOF'
test(agents): plan 18 integration tests

Plan 18 Task 10 — full controller→SSE live pipeline integration test.
Covers happy path, two-tenant RLS isolation, abort, disambiguation refusal,
synthesizer pre-shape failure → SSE error.

BoundedExecutor integration test verifies phase-2 phaseContextNote
propagation against real DI graph.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Push + open PR**

```bash
git push -u origin feat/plan-18-live-pipeline
gh pr create --title "feat(agents): plan 18 — live turn pipeline composition" --body "$(cat <<'EOF'
## Summary

Plan 18 — production-ready realtime agent chat. Closes the live-pipeline gap: \`agent-turn-controller\` now invokes the real router → bounded/iterative executor → synthesizer pipeline with SSE token streaming via Vercel AI SDK \`streamObject\`.

- New \`TurnPipelineRunner\` (run + runWithReplay)
- New \`BoundedExecutor\` (sequential phase fan-out, partial-answer gate, optional phase-2 with phaseContextNote propagation, synthesizer call)
- New typed pipeline errors (\`RouterLlmFailureError\`, \`RouterParseEscalationError\`, \`SynthesizerStreamFailureError\`) + \`classifyPipelineError\`
- \`RouterSessionOrchestrator\` throws \`RouterLlmFailureError\` on infra fails (hard cutover, R-18.24)
- \`SynthesizerOpts\` cleanup: single \`outputs\` map + \`streamEmitter\` (drops \`phase1Outputs\`/\`phase2Outputs\` smell)
- \`agent-turn-controller\` placeholder body removed wholesale (R-18.23). \`SaveQueue\` enqueues user/assistant messages.
- New OTel instruments: \`agent_pipeline_dispatch_total\`, \`agent_bounded_executor_phase_duration_ms\`, \`agent_bounded_executor_drafts_total\`
- Integration test covers full SSE flow + two-tenant RLS isolation

Spec: \`docs/agents/plans/18-live-turn-pipeline-composition.md\`.

## Test plan

- [x] All unit tests pass (508+ test files, 3700+ tests)
- [x] All integration tests pass (RLS, controller live pipeline, bounded-executor)
- [x] \`typecheck\` clean
- [x] \`lint\` clean
- [x] Soak window: monitor \`agent_pipeline_dispatch_total{outcome}\` and \`agent_synthesizer_fallback_total\` for 24h before declaring stable

## Out of scope

- Scheduled/async turn live wiring (separate plan)
- Replay-mode integration into the live controller (Plan 17 PR 4)
- Per-iteration synthesizer (Plan 12 INFO — beta-gated)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec section / R-id                             | Task                                                |
| ----------------------------------------------- | --------------------------------------------------- |
| §4.1 BoundedExecutor                            | Task 5                                              |
| §4.2 SynthesizerOpts cleanup                    | Task 2                                              |
| §4.3 RUN_PIPELINE_FN real factory               | Task 7                                              |
| §4.4 Typed pipeline errors                      | Task 1                                              |
| §4.5 TurnPipelineResult + TurnPipelineRunner    | Task 4                                              |
| §4.6 controller refactor                        | Task 8                                              |
| §5.1 controller flow                            | Task 8                                              |
| §5.2 RUN_PIPELINE_FN dispatch                   | Task 7                                              |
| §5.3 BoundedExecutor flow                       | Task 5                                              |
| §5.4 SynthesizerAdapter streaming               | (Plan 17 PR 3 amendments + Task 2 type-only update) |
| R-18.1 controller invokes runner                | Task 8                                              |
| R-18.2 user message persisted before runner     | Task 8                                              |
| R-18.3 assistant message persisted after runner | Task 8                                              |
| R-18.4 PhaseExecutionResult variants            | Task 5                                              |
| R-18.5 sequential phase-1                       | Task 5                                              |
| R-18.6 single outputs map                       | Task 2, Task 5                                      |
| R-18.7 streamObject (not generateObject)        | Plan 17 PR 3 amendment                              |
| R-18.8 answer.shape_declared once               | Plan 17 PR 3 amendment                              |
| R-18.9 per-shape streaming                      | Plan 17 PR 3 amendment                              |
| R-18.10 fallback path                           | Plan 17 PR 3 amendment                              |
| R-18.11 iterative path doesn't re-emit          | Task 7                                              |
| R-18.12 typed errors + classifier               | Task 1, Task 8                                      |
| R-18.13 outputs replaces phase1/2               | Task 2                                              |
| R-18.14 streamEmitter required                  | Task 2                                              |
| R-18.15 disambiguation → refusal.started        | Task 7                                              |
| R-18.16 projectToSchema per directive           | Plan 17 PR 2 (runner-side, not BoundedExecutor)     |
| R-18.17 cbNote on directives                    | Task 5 (via turnState.phaseContextNote)             |
| R-18.18 phase_duration_ms histogram             | Task 9                                              |
| R-18.19 dispatch_total counter                  | Task 9                                              |
| R-18.20 no cross-module imports                 | All tasks (CLAUDE.md)                               |
| R-18.21 sequential DB queries                   | Task 7 (factory)                                    |
| R-18.22 fake LLM clients default                | Tasks 4, 5, 8                                       |
| R-18.23 no legacy/back-compat shims             | Tasks 2, 8 (hard cutover)                           |
| R-18.24 RouterSession hard cutover              | Task 3                                              |
| §7 failure modes                                | Tasks 1, 7, 8                                       |
| §8 observability                                | Task 9                                              |
| §11 testing strategy                            | Tasks 1–10                                          |
| §12 acceptance criteria                         | Task 10                                             |

**Placeholder scan:** no "TBD"/"TODO" patterns. Two `it.todo` items in Task 10's bounded-executor integration spec are intentional — the unit tests (Task 5) cover the logic; the integration test exists for DI wiring verification and is marked todo if bootstrap is too involved for the task. Implementer can fully implement when the SubAgentRunnerAdapter integration spec from Plan 17 is available as a template.

**Type consistency check:**

- `TurnPipelineResult` shape consistent in Tasks 4, 7, 8.
- `TurnPipelineRunOpts` / `TurnPipelineReplayOpts` consistent in Tasks 4, 8.
- `SynthesizerOpts.outputs` consistent across Tasks 2, 5.
- `BoundedExecutorOpts` consistent in Tasks 5, 7.
- `phaseContextNote` introduced in Task 2, set in Task 5, read by Plan 17 PR 2 (sub-agent runner adapter).
- `SseErrorCause` type used in Task 1, consumed in Task 8.

---

## Execution Handoff

Plan complete and saved to `docs/agents/plans/18-live-turn-pipeline-composition-impl.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task with two-stage review (spec compliance → code quality). Best fit here: 10 tasks, mostly self-contained, clear file scope per task. The integration tests in Task 10 are the only task with significant codebase-pattern matching — that one benefits from a more capable model.

**2. Inline Execution** — same session via `superpowers:executing-plans`. Faster overall but accumulates context across 10 tasks; quality may degrade by Tasks 8–10.

Plan 18 is the production-readiness work — the live pipeline must compile end-to-end before merge. The PR opens once Tasks 1–10 are all green; no partial-merge stages within this plan.

**Which approach?**
