# @seta/agent-core K4 — Tool-call iteration outer loop

**Status:** Draft (pending review)
**Date:** 2026-05-12
**Owner:** Platform team
**Package:** `@seta/agent-core` (`platform/agent/core`)
**Predecessors:** K1 (kernel surface), K1.5 (MSW testkit), K2 (concrete adapters + first wire-up)
**Successors:** MEM stream (real memory provider), Workflows stream (`{suspend}` discriminant binding)

## 1. Goal

Light up the kernel's outer loop. After K4 lands, an agent product can call
`run(cfg, input, { adapters, tools, ... })` and the kernel will iterate
model→tools→model→… until natural completion, a `stopWhen` predicate fires,
`maxSteps` is reached, the run is aborted, or a fatal error terminates it.
The 4 fields K1 reserved on `RunLoopOptions` (`stopWhen`, `maxSteps`,
`toolCallConcurrency`, `perToolBudget`) and the 2 fields it reserved on
`AgentConfig` (`fallback`) become live. The 3 processor hooks K1 reserved
(`processInput`, `processOutputStep`, `processAPIError`) wire in.

K4 closes three open questions from K1/K2/SCOPE:
- StopCondition[] semantics → logical OR, async-aware, only evaluated when
  the loop would otherwise continue.
- Per-tool budget shape → `{ maxCalls?, timeoutMs? }`. `maxTokens` dropped
  pending a concrete use case that picks the unit.
- Loop termination when no `stopWhen` provided → natural `finishReason` from
  the model, `maxSteps` ceiling, abort, or fatal error (in that order).

## 2. Non-goals

- Real `@seta/agent-memory` provider — the MEM stream binds it at the
  composition root.
- `@seta/agent-workflows` runtime — K4 returns `TOOL_SUSPEND_NOT_SUPPORTED`
  when a tool returns `{suspend}`. The workflows stream replaces that path.
- Cost-record sink (`@seta/audit` row vs OTel-only) — still open.
- Loop-level span (`agent.run`). The agent product wraps `run()` at the
  route layer; the kernel emits per-model and per-tool spans only.
- Force-cancel of in-flight tools on abort — tools observe `abortSignal`;
  K4 does not aggressively reject sibling promises.
- HTTP routes, OpenAPI docs, product modules.
- Chunk-replay cache / `resumeStream()`.
- Mid-stream model resume after a transient error mid-stream (no rewinding).

## 3. Constraints (CLAUDE.md + SCOPE.md)

- ESM-only; `"type": "module"`. `import type` for type-only imports.
- No CJS shim, no legacy alias, no backwards-compat shim — pre-1.0.
- No DI container, no plugin loader, no module-singleton state.
- `platform/*` depends on nothing in `modules/*` or `apps/*`.
- Tenant id is never a function parameter. Read via
  `tenantContext.getTenantId()` from `@seta/tenant`.
- No `console.log` — `logger` from `@seta/observability`.
- No new runtime deps. Specifically not `p-queue`: bounded fan-out is
  implemented inline with a ~15-line semaphore.
- No mocking of internal `@seta/*` modules. External HTTP via `msw` only,
  through the K1.5 testkit.
- Node 22+ required (already project minimum). `AbortSignal.any` and
  `AbortSignal.timeout` are native.
- No `process.env.X` outside `apps/api/src/env.ts` (K4 reads no env).

## 4. File layout

```
platform/agent/core/
├── src/
│   ├── run/
│   │   ├── run.ts                CHANGED — thin entry; setup ctx/memory; delegate to runToolLoop
│   │   ├── run.test.ts           CHANGED — K1 single-step tests preserved; multi-step added
│   │   ├── tool-loop.ts          NEW    — outer iteration: model→tools→stopWhen→loop
│   │   ├── tool-loop.test.ts     NEW
│   │   ├── execute-tools.ts      NEW    — bounded fan-out + per-tool budgets + timeout
│   │   ├── execute-tools.test.ts NEW
│   │   ├── fallback.ts           NEW    — runOneModelStep + runModelStepWithFallback
│   │   ├── fallback.test.ts      NEW
│   │   ├── processors.ts         NEW    — sequential hook runners
│   │   ├── processors.test.ts    NEW
│   │   ├── make-run-ctx.ts       unchanged
│   │   └── safe-stream.ts        unchanged
│   ├── types/
│   │   ├── run.ts                CHANGED — StepResult gains 4 optional fields
│   │   └── config.ts             unchanged (StopCondition signature change documented inline)
│   └── errors/
│       └── codes.md              NEW    — single OSS-facing catalog of stable error codes
├── tests/
│   └── integration/
│       ├── loop-multi-step.test.ts  NEW
│       ├── loop-fallback.test.ts    NEW
│       ├── loop-stop-when.test.ts   NEW
│       ├── loop-max-steps.test.ts   NEW
│       └── loop-abort.test.ts       NEW
├── __recordings__/                  5 new fixtures
└── src/testkit/fake-adapter.ts      CHANGED — multi-step script chaining
```

No changes to `apps/api/*`. No changes to K2 model translators.

## 5. Architecture

The loop is three nested layers, each one file.

```
run()                                              [run/run.ts]
  ├── createRunCtx, recall memory, run processInput once
  └── yield* runToolLoop(...)                      [run/tool-loop.ts]
        loop:
          ├── yield* runModelStepWithFallback(...) [run/fallback.ts]
          │     └── for each candidate model:
          │           yield* runOneModelStep(...) → StepResult{kind:'model'}
          │           on transient-exhausted: consult processAPIError, then next candidate
          ├── if finishReason !== 'tool_calls': return
          ├── if modelStepCount >= maxSteps: synthesize finish('length'); return
          ├── yield* executeTools(...)             [run/execute-tools.ts]
          │     bounded fan-out, per-tool budgets, returns StepResult[]
          └── if stopWhen returns truthy: synthesize finish('stop'); return
```

Dependency direction unchanged from K2; no new runtime deps.

## 6. Types

### 6.1 `StepResult` — 4 new optional fields

```ts
// types/run.ts
export interface StepResult {
  kind: 'model' | 'tool'
  chunks: KernelChunk[]
  message?: KernelMessage
  // NEW in K4:
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'error'  // model steps only
  toolCallId?: string                                         // tool steps only
  toolName?: string                                           // tool steps only
  error?: KernelError                                         // model: present iff finishReason='error'; tool: present iff execution threw / timed out / budget exceeded (validation errors live on the tool message as isError:true and do NOT populate this field)
}
```

### 6.2 `StopCondition` — signature change

```ts
// types/config.ts
/**
 * Evaluated after each iteration (one model call + its tool executions).
 * Only invoked when the most recent model step's finishReason === 'tool_calls'.
 * Array form combines with logical OR; predicates awaited in parallel.
 */
export type StopCondition = (args: { steps: StepResult[] }) => boolean | Promise<boolean>
```

K1 reserved the signature as `(steps) => ...`; K4 changes it to
`({ steps }) => ...`. No in-tree consumers; CLAUDE.md "no legacy" — single
PR rename, no shim. Changeset records the shape change.

### 6.3 Public API surface delta (the full OSS-visible diff for K4)

- `StepResult` — gains 4 optional fields above.
- `StopCondition` — argument shape change.
- 12 new error codes (§7.1) — additive.

No other public type additions, no new exports.

## 7. Errors

### 7.1 New stable error codes

| Code | Domain | Category | When |
|---|---|---|---|
| `INVALID_MAX_STEPS` | AGENT | USER | `opts.maxSteps <= 0` |
| `INVALID_CONCURRENCY` | AGENT | USER | `opts.toolCallConcurrency <= 0` |
| `ADAPTER_PROTOCOL_VIOLATION` | AGENT | THIRD_PARTY | `finishReason='tool_calls'` but message has no `tool_use` content |
| `TOOL_UNKNOWN` | TOOL | THIRD_PARTY | Model called a tool name not in `cfg.tools` |
| `TOOL_EXECUTION_FAILED` | TOOL | SYSTEM | `execute()` rejected |
| `TOOL_TIMEOUT` | TOOL | SYSTEM | Per-tool `timeoutMs` elapsed |
| `TOOL_BUDGET_EXCEEDED` | TOOL | USER | Per-tool `maxCalls` reached |
| `TOOL_SUSPEND_NOT_SUPPORTED` | TOOL | SYSTEM | Tool returned `{suspend}` with no workflow runtime bound |
| `PROCESSOR_ABORTED` | AGENT | USER | A processor called `ctx.abort()` |
| `PROCESSOR_RETRY_EXHAUSTED` | AGENT | SYSTEM | `processAPIError` returned `'retry'` past `maxProcessorRetries` (1) |
| `PROCESSOR_FAILED` | AGENT | SYSTEM | A processor hook threw a non-abort error |
| `STOP_WHEN_FAILED` | AGENT | SYSTEM | A `stopWhen` predicate threw |

All round-trip through `KernelError.toJSON()`. Listed in `errors/codes.md`
alongside the K2 `LLM_*` catalog.

### 7.2 Failover-eligible LLM error codes (from K2)

```
LLM_TRANSIENT_EXHAUSTED   — SDK retries done, still 5xx/429
LLM_SERVER_ERROR          — 5xx beyond retry budget
LLM_RATE_LIMITED          — 429 with explicit no-retry header
```

Any other `LLM_*` is terminal — fallback chain not consulted.

## 8. Loop semantics

### 8.1 Termination order (first match wins)

| # | Condition | Final chunk emitted | `finish.reason` |
|---|---|---|---|
| 1 | `ctx.signal.aborted` | `{type:'abort'}` | — |
| 2 | Fatal error (terminal class, fallback exhausted, processAPIError 'rethrow') | `{type:'error', error}` | — |
| 3 | Most recent model step `finishReason === 'stop'` | Model's own `{type:'finish', reason:'stop', usage}` | `'stop'` |
| 4 | Most recent model step `finishReason === 'length'` | Model's own `{type:'finish', reason:'length', usage}` | `'length'` |
| 5 | `stopWhen` predicate truthy after iteration | Synthesized `{type:'finish', reason:'stop', usage: aggregatedUsage}` | `'stop'` |
| 6 | `modelStepCount >= maxSteps` AND step had `tool_calls` | Synthesized `{type:'finish', reason:'length', usage: aggregatedUsage}` | `'length'` |

Detail on which terminator fired is exposed via OTel span attribute
`loop.stop_reason ∈ {natural_stop, natural_length, stop_when, step_limit,
error, aborted, processor_aborted}`. K4 does NOT widen the `KernelChunk`
finish-reason union; that is a reserved follow-up.

### 8.2 `maxSteps`

- Counts model calls (LLM round-trips). Default 16.
- Validated at run start (`INVALID_MAX_STEPS` if `<=0`).
- Check fires *after* a model step completes: if the step requested tools
  and `++modelStepCount >= maxSteps`, the loop synthesizes `finish('length')`
  WITHOUT executing the tools — running tools whose follow-up model call
  will never happen is wasted work and potentially destructive.
- `maxSteps: 1` collapses to K1 single-shot behavior (no tool execution).

### 8.3 `stopWhen`

- Scalar or array. Array combines with logical OR; predicates may be async
  and are awaited in parallel.
- Evaluated ONLY when the most recent model step's `finishReason ===
  'tool_calls'`. On natural `stop` or `length`, predicates are not consulted.
- Receives `{ steps: StepResult[] }` — the cumulative `accumulatedSteps`
  array, append-only, model and tool entries interleaved in iteration order.
- A predicate that throws aborts the run with `error` chunk wrapping the
  thrown value as `AgentError({ code: 'STOP_WHEN_FAILED' })` (§7.1).

### 8.4 `accumulatedSteps[]` shape

- Internal to the loop, passed to `stopWhen` and to `processOutputStep`.
- Append-only. Each iteration appends one `kind:'model'` then zero or more
  `kind:'tool'` entries in **call-emission order** (not completion order)
  for replay stability.
- Bounded by `maxSteps × (1 + concurrency)` in entry count. Each entry
  retains its `chunks: KernelChunk[]` — primary memory cost. Documented in
  `runToolLoop`'s JSDoc.

### 8.5 Tool execution

- Default concurrency: `toolCallConcurrency ?? 10`.
- Auto-collapse to 1 if ANY tool in the current batch has
  `annotations.requireApproval === true`.
- Validated at run start (`INVALID_CONCURRENCY` if `<=0`).
- Bounded fan-out via inline semaphore. `Promise.allSettled` for the batch.
- Results returned in call-emission order via indexed slots (deterministic
  replay regardless of resolution order).
- Per-tool `timeoutMs`: implemented via
  `AbortSignal.any([ctx.signal, AbortSignal.timeout(ms)])` passed into the
  `ToolExecutionContext.abortSignal`. Native Node 22+.
- Per-tool `maxCalls`: counted by `tool.id` across the whole run. 11th call
  to a tool with `maxCalls: 10` resolves to `TOOL_BUDGET_EXCEEDED` without
  invoking `execute()`.
- Sibling tools are NOT aggressively cancelled on abort or first error.
  Tools observe `abortSignal`; results from completed-after-abort tools are
  discarded by the outer `ctx.signal.aborted` check before next iteration.

### 8.6 Tool result paths

Every tool_call produces exactly one `tool` `KernelMessage` and one
`StepResult{kind:'tool'}`. Four outcomes uniformly handled:

1. `execute()` returns `{ok:true, value}` →
   `{ role:'tool', content:[{type:'tool_result', toolCallId, result:value, isError:false}] }`,
   `StepResult.error = undefined`.
2. `execute()` returns `{ok:false, error}` (validation) →
   `{ role:'tool', content:[{type:'tool_result', toolCallId, result:{name,message,details}, isError:true}] }`,
   `StepResult.error = undefined` (validation is the LLM's job to recover).
3. `execute()` returns `{suspend}` →
   tool_result with `isError:true` containing `TOOL_SUSPEND_NOT_SUPPORTED`,
   `StepResult.error = ToolError('TOOL_SUSPEND_NOT_SUPPORTED')`.
4. `execute()` rejects or times out →
   tool_result with `isError:true` containing the error name+message (so
   the LLM can self-correct), `StepResult.error = ToolError('TOOL_EXECUTION_FAILED' | 'TOOL_TIMEOUT')`.

The kernel emits no new chunk type for tool results; results live on the
next model call's message history. The K1 chunk union stays at 6 variants.

### 8.7 Fallback failover

```
candidates = [cfg.model, ...(cfg.fallback ?? [])]
for each candidate:
  try runOneModelStep
  on success: return StepResult
  on error:
    if processors present: call processAPIError chain → 'retry' | 'rethrow'
      'retry': retry SAME candidate (bounded by maxProcessorRetries=1)
      'rethrow': skip remaining candidates, surface error
    if error code NOT in FAILOVER_CODES: surface error
    if last candidate: surface error
    else: try next candidate
```

Each candidate produces its own OTel `llm.<provider>.stream` span, so
failover is visible in traces.

### 8.8 Processor hooks

`runProcessInput(processors, ctx, input)` — sequential left-to-right;
result threads through. Called once at run start, before any model call.

`runProcessOutputStep(processors, ctx, step)` — sequential left-to-right;
result threads through. Called after EVERY StepResult (model and tool).
A rewritten message replaces the original in the running history.

`runProcessAPIError(processors, ctx, err)` — sequential left-to-right.
First processor returning `'retry'` wins (chain short-circuits). Otherwise
the chain's last verdict.

A processor calling `ctx.abort()` throws an internal sentinel caught by
the runner, which then aborts the loop's signal. The loop emits
`error(PROCESSOR_ABORTED, details:{processorIndex, hookName})` followed by
`abort` — the only place the kernel emits both in the same run.

A processor hook that throws any other error aborts the run with
`error(PROCESSOR_FAILED, cause:err, details:{processorIndex, hookName})`.
Processors are kernel-trusted code; we do not rescue.

`maxProcessorRetries` defaults to 1 and is an internal constant in K4
(not a public option). Promote to `RunLoopOptions` if needed.

## 9. Abort propagation

```
client disconnect → streamKernelSSE.onAbort
  → iter.return() on run() generator
  → run() finally unwind
    → runOneModelStep finally: stream.abort() → SDK fetch AbortController.abort()
  → run() yields {type:'abort'}, returns
```

Two signal scopes:

- `ctx.signal` — run-wide. From `opts.signal ?? internal controller`.
- `toolCtx.abortSignal` — per tool execution.
  `AbortSignal.any([ctx.signal, AbortSignal.timeout(timeoutMs)])`.

The kernel never holds an AbortController past the generator's lifetime.

## 10. OTel spans

K2 already emits one `llm.<provider>.stream` span per model call. K4 adds:

- One `tool.<name>.execute` span per tool call. Attrs: `tool.name`,
  `tool.id`, `run.id`, `tenant.id`, `tool.error_code?`, `tool.timed_out?`,
  `tool.budget_exceeded?`. Closes on resolve / reject / timeout.
- Span attr `loop.stop_reason` and `loop.iterations` set on the final
  iteration's model span (whichever terminator fired).

No loop-level (`agent.run`) span in K4. The agent product wraps `run()` at
the route layer.

## 11. Memory

- `recall` runs once at run start (unchanged from K1).
- `saveTurn` runs ONCE at the end, ONLY on natural completion / stopWhen /
  maxSteps termination. Not called on abort or fatal error — partial state
  would corrupt the next turn.
- `onIterationComplete` (already reserved on `RunLoopOptions`) fires
  fire-and-forget after each iteration; caller errors do not break the loop.
  Docs note: this is the seam for per-iteration checkpointing if an agent
  product needs it.

## 12. Test strategy

### 12.1 Unit (co-located, FakeAdapter-driven)

- `run/tool-loop.test.ts` — termination order; maxSteps cap; stopWhen OR;
  async stopWhen; `accumulatedSteps` ordering; ADAPTER_PROTOCOL_VIOLATION.
- `run/execute-tools.test.ts` — concurrency cap observed; requireApproval
  collapse; 4 tool outcomes; timeout; budget exceeded; unknown tool;
  suspend rejection; abort mid-fan-out; call-emission order preserved.
- `run/fallback.test.ts` — primary success no fallback; transient → next
  candidate; terminal error no fallback; processAPIError 'retry' / 'rethrow';
  maxProcessorRetries=1 honored; abort during failover; per-candidate spans.
- `run/processors.test.ts` — input threading; output rewrite reflected in
  next iteration; ctx.abort() → PROCESSOR_ABORTED + abort; thrown →
  PROCESSOR_FAILED; processAPIError chain short-circuits on 'retry'.
- `run/run.test.ts` — K1 single-step preserved; multi-turn round-trip;
  saveTurn called once with full chain; INVALID_MAX_STEPS / INVALID_CONCURRENCY
  thrown before recall.

100% line coverage on the four new files.

### 12.2 Integration (recording-driven)

5 new fixtures under `__recordings__/`:

| Test | Asserts |
|---|---|
| `loop-multi-step.test.ts` (anthropic) | 2-step round-trip; 2 model spans + N tool spans; saveTurn full chain |
| `loop-fallback.test.ts` | anthropic 503 → openai 200; both spans; provider attr changes |
| `loop-stop-when.test.ts` (openai) | synth finish:stop; OTel loop.stop_reason='stop_when'; tools-after-stop NOT executed |
| `loop-max-steps.test.ts` (anthropic) | maxSteps:2; synth finish:length; loop.stop_reason='step_limit' |
| `loop-abort.test.ts` (openai) | signal.abort() mid-stream; abort chunk; no further model calls |

### 12.3 Determinism

Every integration test injects the same fixed `now / generateId /
currentDate` as K2. Semaphore is FIFO. `Promise.allSettled` order does not
affect step ordering (indexed slot writes). Tool timeout tests use
`vi.useFakeTimers()`.

### 12.4 Gates

- `typecheck`, `lint` clean
- `test:unit` — 100% line coverage on `src/run/{tool-loop,execute-tools,
  fallback,processors}.ts`
- `test:integration` passes with checked-in fixtures
- `@seta/api` typecheck clean (no breaking public API change beyond the
  documented `StopCondition` argument shape)

### 12.5 Coverage exemptions

Documented `/* c8 ignore */` on:
- `runOneModelStep`'s exhaustive `finishReason` switch default arm.
- `runModelStepWithFallback`'s 'no candidate succeeded' arm (unreachable
  given `validateRunLoopOptions`).

## 13. Acceptance criteria

1. Gates in §12.4 pass.
2. Public API delta from K2 = `StepResult` 4 new optional fields +
   `StopCondition` argument shape + 12 new error codes. Verified by diffing
   `dist/index.d.ts` against the K2 build.
3. Multi-step run with two tool turns → 3 model calls, 4 tool executions,
   one `saveTurn` with full chain.
4. Fallback recording: primary 503 → fallback success; both OTel spans;
   one final chunk pair from the successful candidate.
5. Processor `ctx.abort()` from `processOutputStep` after iteration 2 →
   caller observes `error(PROCESSOR_ABORTED)` then `abort` chunk in that
   order.
6. SCOPE.md "Current state" lists K4 done; "Outstanding" reduces to MEM
   binding only.
7. SCOPE.md "Open questions" entries for StopCondition[] and per-tool
   budget shape moved to "Resolved" with this spec's decisions.
8. K1 spec §11 / K2 spec §12 K4 follow-up entries marked superseded.
9. No edits to `apps/api/*`, `@seta/middleware`, `@seta/observability`,
   `@seta/tenant`, or K2 model translators / span / cache-control / tokens.
10. Changeset for `@seta/agent-core` (minor bump) — notes the
    `StopCondition` shape change explicitly.
11. ADR-0010 unchanged.

## 14. Risks and trade-offs

- **`StopCondition` argument shape change.** K1 reserved a positional
  signature with no consumers; K4 switches to `{ steps }`. CLAUDE.md
  "no legacy" — single-PR rename. Risk: an out-of-tree consumer who
  built against the K1 RC types breaks. Changeset flags it.
- **`accumulatedSteps` unbounded by config default.** Memory bound is
  `maxSteps × (1 + concurrency)` entries, each retaining chunks. For
  default 16 × 11 = 176 entries this is comfortable; documented for
  callers writing custom stopWhen.
- **Processors are kernel-trusted.** A processor that throws aborts the
  whole run with `PROCESSOR_FAILED`. No sandboxing.
- **Tool authors must observe `abortSignal`.** Concurrent sibling tools
  not cancelled aggressively on abort; we rely on signal observance.
  Tools that ignore it complete but their results are discarded.
- **`saveTurn` skipped on abort / fatal error.** Partial state would
  corrupt history. Agents needing checkpoints use `onIterationComplete`.
- **`processAPIError` retry counter is global per-run.** A processor
  returning `'retry'` for two different transient errors during one run
  spends both budget units. Simpler than per-error counters.
- **Fallback chain doesn't dedupe.** Caller responsibility.
- **`onIterationComplete` fired but not awaited.** Caller errors don't
  break the loop.
- **No loop-level kernel span in K4.** Product wraps `run()`; if a future
  kernel-side run-level metric is needed, additive change.

## 15. Follow-ups (post-K4)

- **MEM stream**: real `@seta/agent-memory` binds at the composition root.
- **Workflow stream**: `@seta/agent-workflows` consumes `{suspend}` —
  replaces `TOOL_SUSPEND_NOT_SUPPORTED`.
- **Audit sink decision**: per-call cost row in `@seta/audit` vs OTel-only.
- **Force-cancel mode for tools**: opt-in `RunLoopOptions.toolForceCancel`.
- **Promote `maxProcessorRetries`** to public option when needed.
- **Widen `KernelChunk.finish.reason`** to include `'step_limit' |
  'stop_when'` if callers need programmatic distinction.
- **`StopCondition` arg widened** to `{ steps, iteration, usage }` if a
  predicate needs them (additive).
- **`perToolBudget.byTool`** keyed override if uniform budgets aren't
  enough.
- **`processBeforeModelCall` hook** for per-turn input mutation.
- **`toolFailFast` option** — opt-in cancellation of siblings on first
  tool error.

## 16. Open questions reserved for later

- Stop-reason exposure in the chunk union vs OTel-only. Currently OTel
  attr; revisit if callers need programmatic distinction.
- Per-tool budgets keyed by `tool.id` vs uniform. Currently uniform;
  additive non-breaking change later.
- `processInput` per-iteration variant. Currently once at run start;
  add a new hook if a use case appears.
- Sibling-tool cancellation on first error. Currently lazy via signal;
  add `toolFailFast` if needed.

---

**End of design.**
