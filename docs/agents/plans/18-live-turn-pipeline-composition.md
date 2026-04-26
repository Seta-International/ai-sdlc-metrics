# 18 — Live Turn Pipeline Composition

**Design §§:** Plan 02 §5 (Router session orchestrator); Plan 03 §3, §5, §9 (bounded execution + synthesizer); Plan 06 (streaming/cancellation); Plan 17 (sub-agent ReAct loop, synthesizer LLM, golden-trace, ToolGatewayPort + TurnPipelineRunner skeleton).

**Status:** Spec — closes the live-pipeline gap discovered during Plan 17 Task 2 setup: `agent-turn-controller.streamTurn()` currently has no real pipeline body; it emits placeholder SSE events and closes. Plan 18 wires the controller to invoke router → bounded/iterative executor → synthesizer for real, with realtime SSE token streaming via Vercel AI SDK `streamObject`.

---

## 1. Scope

### In

- **`TurnPipelineRunner` class** (new, `application/services/turn-pipeline-runner.ts`) — the full class introduced here, NOT a skeleton-fill. (Plan 17 PR 1 / PR #107 only landed `ToolGatewayPort`; the runner was deferred to Plan 18.) Provides `run(opts)` for live turns and `runWithReplay(opts)` for the golden-trace consumer (Plan 17 PR 4).
- **`BoundedExecutor` service** (new, `application/services/bounded-executor.ts`) — drives phase-1 fan-out (sequential per CLAUDE.md DB rule), partial-answer gate, optional phase-2 fan-out, synthesizer call. Mirrors `IterativeOrchestrator` shape; returns `PhaseExecutionResult`.
- **`RUN_PIPELINE_FN` factory** (in `agents.module.ts`) — composes `RouterSessionOrchestrator`, `BoundedExecutor`, existing `IterativeOrchestrator`, `WindowBuilder`, `KernelQueryFacade` into the `TurnPipelineRunner`'s pipeline closure.
- **`agent-turn-controller` refactor** — replace placeholder SSE body with `turnPipelineRunner.run(opts)` invocation; persist user message before pipeline starts and assistant message after; map pipeline result + errors onto SSE close/error contracts.
- **Synthesizer streaming amendment** — `SynthesizerAdapter.synthesize` switches from `generateObject` to `streamObject` (Vercel AI SDK). Bridges per-shape: narrative/short-answer/list stream incrementally as `answer.token` deltas; table/chart hold partials and emit one atomic JSON token. Pre-shape failures rethrow; post-shape failures fall back to deterministic prose with a single token + `answer.complete`.
- **`SynthesizerOpts` contract cleanup** — drop `phase1Outputs`/`phase2Outputs` (smell: split is artificial; iterative already collapses to one map). Replace with single `outputs: Map<SubAgentKey, SubAgentOutput>` plus `streamEmitter: StreamEmitter`. `IterativeOrchestrator` updates one call site; `BoundedExecutor` consumes the same shape.
- **Typed pipeline errors** — new error classes `RouterLlmFailureError`, `RouterParseEscalationError`, `SynthesizerStreamFailureError` thrown from existing services; `classifyPipelineError(err): SseErrorCause` maps them onto SSE close-error causes.
- **Conversation persistence** — controller writes both user and assistant messages via existing `SaveQueue` (R-04.23 debounced fire-and-forget).
- **OTel instrumentation** — new `agent_bounded_executor_phase_duration_ms` histogram; `agent_pipeline_dispatch_total{kind}` counter; reuse Plan 17's synthesizer/sub-agent metrics.
- **Integration tests** — full controller-through-SSE path, two-tenant RLS isolation, abort propagation, refusal flow, error→SSE error mapping.

### Out

- Scheduled/async turn live wiring (`ScheduledTurnService` stays MVP-stubbed; separate plan if needed).
- Replay-mode integration into the live controller (Plan 17 PR 4 owns the golden-trace consumer via `TurnPipelineRunner.runWithReplay`).
- Multi-region / cross-provider failover (Plan 11 §17 deferral).
- Per-iteration synthesizer for iterative-tier turns (Plan 12 INFO — beta-gated).
- Frontend-side renderer changes for the new shapes (table/chart consume `format: 'json'` payload — frontend work owned by zone teams).

---

## 2. Design Context

**Why now.** The audit's Theme B/C "shipped but inert" extends deeper than sub-agent stubs: the controller never invokes any pipeline. Plan 17 PR 2 and PR 3 produce the real sub-agent ReAct loop and synthesizer, but they have no production caller without Plan 18. Production-ready realtime chat requires this composition layer.

**Why one plan, not split.** All five deliverables share infrastructure: the same `TurnPipelineRunner` introduced in Plan 17 PR 1, the same `SaveQueue`, the same SSE state machine. Splitting risks leaving the runner with no real factory body for an extended period; the integration tests need the full path to be meaningful.

**Why `streamObject` over `generateObject`.** Realtime feel was an explicit requirement. AI SDK `streamObject` is the canonical pattern for schema-validated incremental output — partial objects fire as the LLM generates, schema validation runs on the final object. The bridge to existing `answer.token` SSE events is straightforward (diff-based emit on growing content fields).

**Why sequential phase-1 fan-out.** CLAUDE.md prohibits `Promise.all` of DB queries inside a single request handler (request-bound `pg.PoolClient` cannot multiplex). Each sub-agent's ReAct loop fires DB queries through `ToolGateway`. Parallel fan-out would race those queries on a shared client. Plan 03 §10 wallclock budgets accommodate sequential dispatch (3 sub-agents × 3s p50 = 9s, within iterative budget). Revisit only when DB pooling shape changes.

---

## 3. Data Model

No new tables. No schema changes. Reuses existing:

- `agent_conversation_message` — populated by controller via `SaveQueue` (R-04.23, write path already exists; today's controller doesn't call it because its body is placeholder).
- `agent_session.routerPromptHash`, `pinnedSubAgentPromptHashes`, etc. — populated by `RouterSessionOrchestrator`.
- `agent_tool_invocation` — populated by `ToolGateway` per tool call.
- `agent_cost_event` — populated by existing `cost-recorder` from sub-agent + synthesizer usage rollups.
- `agent_iteration` — populated by `IterativeOrchestrator` (existing).

---

## 4. Interface Contracts

### 4.1 `BoundedExecutor`

`apps/api/src/modules/agents/application/services/bounded-executor.ts`:

```ts
import type {
  PhaseExecutionResult,
  PhaseExecutorTurnState,
  SubAgentOutput,
  DraftProposal,
  SynthesizerOutput,
} from './phase-executor-contracts'
import type {
  BoundedPlan,
  SubAgentDirective,
  SubAgentKey,
} from '../../domain/value-objects/router-plan-schema'
import type { StreamEmitter } from './stream-gateway'
import type { ISubAgentRunner, ISynthesizer } from './iterative-orchestrator'

export interface BoundedExecutorOpts {
  readonly plan: BoundedPlan
  readonly userUtterance: string
  readonly turnState: PhaseExecutorTurnState
  readonly abortSignal: AbortSignal
  readonly streamEmitter: StreamEmitter
}

export const BOUNDED_EXECUTOR = Symbol('BOUNDED_EXECUTOR')

@Injectable()
export class BoundedExecutor {
  constructor(
    @Inject(I_SUB_AGENT_RUNNER) private readonly subAgentRunner: ISubAgentRunner,
    @Inject(I_SYNTHESIZER) private readonly synthesizer: ISynthesizer,
  ) {}

  execute(opts: BoundedExecutorOpts): Promise<PhaseExecutionResult>
}
```

Internal flow per Plan 03 §3 + §5 — see §5 below for the full control flow.

### 4.2 `SynthesizerOpts` cleanup (contract amendment to Plan 17 PR 3)

Before:

```ts
interface SynthesizerOpts {
  readonly directive: BoundedPlan
  readonly phase1Outputs: Map<SubAgentKey, SubAgentOutput>
  readonly phase2Outputs: Map<SubAgentKey, SubAgentOutput>
  readonly userUtterance: string
  readonly abortSignal: AbortSignal
  readonly turnState: PhaseExecutorTurnState
}
```

After:

```ts
interface SynthesizerOpts {
  readonly directive: BoundedPlan | IterativePlan // widened (iterative path also calls)
  readonly outputs: Map<SubAgentKey, SubAgentOutput> // single source of truth
  readonly userUtterance: string
  readonly abortSignal: AbortSignal
  readonly turnState: PhaseExecutorTurnState
  readonly streamEmitter: StreamEmitter // NEW — synthesizer emits its own SSE events
}
```

Existing `IterativeOrchestrator` updates: change the synthesize call to pass `outputs: allOutputs` (the existing variable name) and `streamEmitter: opts.streamEmitter`. Drop the empty-Map workaround for `phase2Outputs`.

### 4.3 `RUN_PIPELINE_FN` real implementation

`apps/api/src/modules/agents/agents.module.ts` provider:

```ts
{
  provide: RUN_PIPELINE_FN,
  inject: [
    RouterSessionOrchestrator,
    BoundedExecutor,
    ITERATIVE_ORCHESTRATOR,
    WindowBuilder,
    KernelQueryFacade,
  ],
  useFactory: (
    routerOrchestrator: RouterSessionOrchestrator,
    boundedExecutor: BoundedExecutor,
    iterativeOrchestrator: IterativeOrchestrator,    // unused directly — RouterSessionOrchestrator owns iterative dispatch
    windowBuilder: WindowBuilder,
    kernelQuery: KernelQueryFacade,
  ): RunPipelineFn => async (input) => { /* dispatch as in §5 */ }
}
```

Note: `IterativeOrchestrator` is NOT directly invoked by the factory — `RouterSessionOrchestrator.routeTurn` already executes it internally for iterative plans, returning `PhaseExecutionResult` in `RouteTurnResult.result`. The injection is kept only to ensure the DI graph is well-formed.

### 4.4 Typed pipeline errors

`apps/api/src/modules/agents/application/services/pipeline-errors.ts` (new):

```ts
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

`RouterSessionOrchestrator` is amended to throw `RouterLlmFailureError` on LLM 5xx/timeout (currently swallows / retries) and `RouterParseEscalationError` on the post-retry parse failure (currently returns a `disambiguation` kind for two failed parses — keep that behavior; only throw on infra failures). `SynthesizerLlmClient` (Plan 17 PR 3) and `SynthesizerAdapter` throw `SynthesizerStreamFailureError` on pre-shape failures (post-shape uses fallback path, no throw).

### 4.5 `TurnPipelineResult` (single source of truth)

Defined in this plan as the only contract — there is no prior skeleton to extend or migrate from.

```ts
interface TurnPipelineResult {
  readonly toolCallNames: ReadonlyArray<string>
  readonly shape: AnswerShape | 'refusal' | 'aborted'
  readonly permissionKeys: ReadonlyArray<string>
  readonly taintFlipped: boolean
  readonly renderedAssistantMessage: string // markdown for narrative; JSON for table/chart; reason text for refusal
  readonly turnEndReason: 'completed' | 'cancelled' | 'refused' | 'error'
  readonly drafts: ReadonlyArray<DraftProposal>
  readonly usage?: UsageSnapshot
}
```

This is consumed by the controller for both `gateway.close(...)` reason and `SaveQueue.enqueue(assistantMessage)`.

### 4.6 `agent-turn-controller` refactor

See §5 for the full sequence. Public HTTP contract (`POST /api/agent/turn`) and SSE event protocol (`turn.started` → `phase.started` → `answer.shape_declared` → `answer.token`× → `answer.complete` → `turn.ended`) are unchanged.

---

## 5. Control Flow

### 5.1 Live HTTP turn (controller)

1. Auth (existing): JWT verify → `userId`, `tenantId`.
2. Mint `flowId` + create root `TURN` span (existing PR #105).
3. Pre-turn budget gate (existing PR #105). On refusal: 429 HTTP, span closed with error, NO SSE stream opened.
4. Open SSE stream + `composeTurnAbortSignal` (existing).
5. **Persist user message** via `saveQueue.enqueue({ role: 'user', content: { text: utterance }, ... })`.
6. Register active turn (existing).
7. Emit `turn.started` (existing).
8. **Invoke `turnPipelineRunner.run(opts)`** with `streamEmitter: gateway`, `requestContext`, `turnState`, `abortSignal`. Awaits the entire pipeline.
9. **Persist assistant message** via `saveQueue.enqueue({ role: 'assistant', content: { text: result.renderedAssistantMessage, shape: result.shape }, ... })` (only when `renderedAssistantMessage` non-empty — cancelled turns may have no assistant message).
10. Translate `result.turnEndReason` to `gateway.close(reason, usage)` or `gateway.error(...)` per the Q4 taxonomy.
11. Finally block (existing): close span, record `turn_total` + `turn_duration` metrics, emit abort metric if signal fired, unregister, end response.

### 5.2 `RUN_PIPELINE_FN` dispatch

1. Extract `userUtterance` from `messages[].findLast(m => m.role === 'user')`.
2. Build router inputs in parallel-OK order (these are all read-only and sequential per CLAUDE.md):
   - `recentSummary = await windowBuilder.build({ tenantId, conversationId })`
   - `roleAllowedPermissions = await kernelQuery.getRoleAllowedPermissions(...)`
   - `enabledModules = await kernelQuery.getEnabledModules(tenantId)`
3. `routed = await routerOrchestrator.routeTurn({ ... })`. Throws `RouterLlmFailureError` on infra fail; returns `disambiguation` kind on parse-twice fail.
4. Switch on `routed.kind`:
   - **`disambiguation`**: emit `refusal.started` with `payload: { reason: routed.reason, kind: 'disambiguation' }`. Return `TurnPipelineResult { shape: 'refusal', renderedAssistantMessage: routed.reason, turnEndReason: 'refused', ... }`.
   - **`iterative`**: SSE events were emitted by `IterativeOrchestrator` already (running inside `RouterSessionOrchestrator`). Return `phaseResultToPipelineResult(routed.result)`. Factory does NOT re-emit.
   - **`bounded`**: `result = await boundedExecutor.execute({ plan: routed.plan, userUtterance, turnState, abortSignal, streamEmitter })`. Return `phaseResultToPipelineResult(result)`.
5. `phaseResultToPipelineResult(r)` translates each `PhaseExecutionResult.kind` to a `TurnPipelineResult` (full mapping in §4.5 example code).

### 5.3 `BoundedExecutor.execute`

(Detailed concrete code in §4.1 of brainstorm, summarized here):

1. Abort pre-flight + `validatePlanEntry(plan)`.
2. Emit `phase.started` for `phase-1`.
3. Sequential phase-1 fan-out, each iteration calls `subAgentRunner.run({ directive, phase: 1, abortSignal, turnState })`. Collect into single `outputs` map keyed by `sub_agent_key`.
4. `gate = evaluatePartialAnswerGate(outputs)`:
   - `'suppress_partial'` → return `{ kind: 'synthesized', answer: <suppressed-narrative>, drafts: collectDraftsFrom(outputs) }`.
   - `'surface_partial'` → call synthesizer; return `{ kind: 'partial', answer, reason: 'limit_reached' }`.
   - `'no_ceiling'` → continue.
5. If `plan.phase2.length > 0`:
   - Emit `phase.started` for `phase-2`.
   - Build `phase1Merged = mergeStructuredOutputs(outputs)` (only `completed`/`ceiling_hit` kinds contribute).
   - Compute `cbNote = buildCircuitBreakerContextNote(aggregateCbState(outputs))`.
   - Sequential phase-2 fan-out. Each directive enriched via `enrichPhase2Directive(directive, phase1Merged, cbNote)` which calls `projectToSchema(phase1Merged, directive.inputSchema)` for sanitization (R-03.38). Add to same `outputs` map.
6. `answer = await synthesizer.synthesize({ directive: plan, outputs, userUtterance, turnState, abortSignal, streamEmitter })`. Synthesizer drives `streamObject` and emits `answer.shape_declared` + `answer.token`× + `answer.complete` directly to the stream emitter.
7. Return `{ kind: 'synthesized', answer, drafts: collectDraftsFrom(outputs) }`.

### 5.4 `SynthesizerAdapter.synthesize` (streaming)

(Detailed code in §4 brainstorm; summary):

1. Compute pre-prompt context via existing pure helpers (`detectContradiction`, `buildCitations`, `buildDisclosureStatements`).
2. `userContext = buildSynthesizerPrompt({ outputs, disclosures, hasContradiction, expectedShape, userUtterance })`.
3. Pick model + schema (inline narrows; global uses full union).
4. Call `synthesizerLlmClient.stream({ model, system, userContext, schema, abortSignal })`. Returns AI SDK stream object with `partialObjectStream` async iterator.
5. Iterate `partialObjectStream`:
   - On first `partial.shape` set: emit `answer.shape_declared` with `format = formatForShape(shape)`, set `shapeDeclared = true`.
   - For streamable shapes: compute new content via `renderPartialToTokens(partial, shape)`. If grew, emit `answer.token` with the delta.
6. After stream end: `await stream.object` validates against schema (throws on schema fail).
7. For atomic shapes: emit one `answer.token` with `JSON.stringify(stripDiscriminator(finalObject))`.
8. Emit `answer.complete`.
9. Return `SynthesizerOutput` merging LLM output with adapter-controlled fields (citations, rule-derived confidence, `turnEndedReason`).
10. **Failure paths:**
    - Pre-shape failure → throw `SynthesizerStreamFailureError`. Factory translates to `gateway.error('synthesizer_failure')`.
    - Post-shape failure (mid-stream LLM error or schema fail) → render fallback prose, emit one `answer.token` with `safeContent.slice(lastEmittedContent.length)`, emit `answer.complete`. Return `SynthesizerOutput` with `turnEndedReason: 'errored'`.
    - Abort signal → mid-stream abort triggers AI SDK abort path. Synthesizer rethrows; factory's caller (controller) sees signal already fired and closes with `cancelled`.

---

## 6. Requirements

| ID      | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Source                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| R-18.1  | `agent-turn-controller.streamTurn()` invokes `turnPipelineRunner.run(opts)` for the live turn pipeline. The placeholder SSE event emission is removed.                                                                                                                                                                                                                                                                                                                                                                                                                                 | This plan                       |
| R-18.2  | Controller persists the user message via `SaveQueue` BEFORE invoking the runner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | This plan                       |
| R-18.3  | Controller persists the assistant message via `SaveQueue` AFTER the runner returns, only when `renderedAssistantMessage` is non-empty.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | This plan                       |
| R-18.4  | `BoundedExecutor.execute` produces `PhaseExecutionResult` with the same union variants as `IterativeOrchestrator`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Plan 03 §3                      |
| R-18.5  | Phase-1 sub-agent fan-out is sequential (one `await` per directive). Same for phase-2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | CLAUDE.md DB rule               |
| R-18.6  | `BoundedExecutor` uses a single `outputs: Map<SubAgentKey, SubAgentOutput>` for both phases. The `phase1Outputs`/`phase2Outputs` split in `SynthesizerOpts` is removed.                                                                                                                                                                                                                                                                                                                                                                                                                | This plan                       |
| R-18.7  | `SynthesizerAdapter.synthesize` uses Vercel AI SDK `streamObject`, NOT `generateObject`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | This plan (amends Plan 17 PR 3) |
| R-18.8  | `SynthesizerAdapter` emits `answer.shape_declared` exactly once on first sighting of `partial.shape`, before any `answer.token`.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Stream state machine            |
| R-18.9  | For shapes `short-answer`, `narrative`, `list`: synthesizer emits incremental `answer.token` deltas as content fields grow. For shapes `table`, `chart`: synthesizer holds the partials and emits one atomic JSON `answer.token` after the stream finalizes.                                                                                                                                                                                                                                                                                                                           | This plan                       |
| R-18.10 | Synthesizer pre-shape stream failures throw `SynthesizerStreamFailureError`; post-shape failures fall back to deterministic prose with `turnEndedReason: 'errored'`.                                                                                                                                                                                                                                                                                                                                                                                                                   | This plan                       |
| R-18.11 | `RUN_PIPELINE_FN` does NOT emit SSE events for the iterative path (the `IterativeOrchestrator` running inside `RouterSessionOrchestrator` already did). It DOES emit `phase.started` and forward synthesizer events for the bounded path via `BoundedExecutor`.                                                                                                                                                                                                                                                                                                                        | This plan                       |
| R-18.12 | Pipeline errors are typed (`RouterLlmFailureError`, `RouterParseEscalationError`, `SynthesizerStreamFailureError`); `classifyPipelineError(err)` maps them to SSE error causes. Untyped throws → `'internal_error'`.                                                                                                                                                                                                                                                                                                                                                                   | This plan                       |
| R-18.13 | `SynthesizerOpts.outputs` replaces `phase1Outputs`/`phase2Outputs`. `IterativeOrchestrator` updates its synthesize call site accordingly.                                                                                                                                                                                                                                                                                                                                                                                                                                              | This plan                       |
| R-18.14 | `SynthesizerOpts.streamEmitter` is required — synthesizer emits its own SSE events.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | This plan                       |
| R-18.15 | Disambiguation result from `RouterSessionOrchestrator` produces `refusal.started` SSE event + `turn.ended(refused)`, NOT `gateway.error(...)`.                                                                                                                                                                                                                                                                                                                                                                                                                                         | Q4 taxonomy                     |
| R-18.16 | Phase-2 directive sanitization uses `projectToSchema(phase1Merged, directive.inputSchema)` per directive (R-03.38), not globally.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Plan 03 R-03.38                 |
| R-18.17 | Phase-2 directives receive `cbNote` (from `buildCircuitBreakerContextNote`) appended to their `contextNote` field.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Plan 03 R-03.18                 |
| R-18.18 | `agent_bounded_executor_phase_duration_ms` histogram emits per-phase duration with `{phase, outcome}` labels.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | This plan                       |
| R-18.19 | `agent_pipeline_dispatch_total{kind}` counter increments once per turn with `kind ∈ {bounded, iterative, disambiguation}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | This plan                       |
| R-18.20 | All new code lives in `apps/api/src/modules/agents/`; no cross-module imports from another module's `domain/` or `infrastructure/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | CLAUDE.md DDD                   |
| R-18.21 | DB queries within `RUN_PIPELINE_FN` (e.g., `windowBuilder.build`, `kernelQuery.*`) are sequential (`await` per call) — no `Promise.all`.                                                                                                                                                                                                                                                                                                                                                                                                                                               | CLAUDE.md DB rule               |
| R-18.22 | Tests default to fake LLM clients (`FakeSubAgentLlmClient`, `FakeSynthesizerLlmClient`); real LLM is gated behind `process.env.OPENAI_API_KEY` and skipped when absent.                                                                                                                                                                                                                                                                                                                                                                                                                | Plan 17 R-17.20                 |
| R-18.23 | **No legacy / no backward-compat shims.** Per CLAUDE.md "No Backward Compatibility": the `SynthesizerOpts` cleanup (`phase1Outputs`/`phase2Outputs` → `outputs`) is a hard cutover — every call site rewrites in the same change. The placeholder body in `agent-turn-controller.streamTurn()` is removed wholesale, not gated behind a flag. The placeholder SSE event sequence (`turn.started` → `phase.started` → empty `answer.token` → `answer.complete`) is NOT preserved as a fallback path. No deprecated aliases, no `@deprecated` tags, no transitional dual-shape handlers. | CLAUDE.md, this plan            |
| R-18.24 | `RouterSessionOrchestrator`'s amendment to throw `RouterLlmFailureError` on infra failures replaces any existing swallow/log-and-return behavior — no opt-in flag, no parallel "legacy mode" path. Existing tests that asserted the swallow behavior are rewritten to assert the throw.                                                                                                                                                                                                                                                                                                | This plan                       |

---

## 7. Failure Modes & Recovery

| Failure                                  | Source                                          | SSE outcome                                                                                                                                                                                                                                 | Recovery                                                       |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Pre-pipeline budget refusal              | `BudgetChecker.preTurnCheck`                    | 429 HTTP, no SSE stream opened (existing PR #105)                                                                                                                                                                                           | Operator inspects budget config; user retries after window.    |
| Router LLM 5xx / timeout                 | `RouterSessionOrchestrator`                     | Throws `RouterLlmFailureError` → factory rethrows → controller catches → `gateway.error('router_failure')` → `turn.ended(error)`                                                                                                            | Transient — SDK no-retry; user retries. Persistent → operator. |
| Router parse-fail twice                  | `RouterSessionOrchestrator`                     | Returns `disambiguation` kind (existing) → `refusal.started` + `turn.ended(refused)`                                                                                                                                                        | User clarifies utterance and retries.                          |
| Bounded executor: all sub-agents errored | `BoundedExecutor`                               | Synthesizer still runs with R-03.31 disclosures; normal `answer.*` flow → `turn.ended(completed)`                                                                                                                                           | None — disclosure is the response.                             |
| Sub-agent hard tripwire (`infra_error`)  | Bridge → `SubAgentRunnerAdapter` (Plan 17 PR 2) | Sub-agent returns `kind: 'errored'`; synthesizer surfaces via disclosure → normal flow                                                                                                                                                      | Same.                                                          |
| Sub-agent ceiling-hit + drafts           | partial-answer gate                             | `'suppress_partial'` → no synthesizer; `BoundedExecutor` returns suppressed-narrative; controller emits `answer.shape_declared` + token + complete (synthesizer not invoked, controller renders the suppressed answer directly via factory) | None — drafts go to inbox.                                     |
| Synthesizer pre-shape failure            | `SynthesizerAdapter`                            | Throws `SynthesizerStreamFailureError` → factory rethrows → controller catches → `gateway.error('synthesizer_failure')` → `turn.ended(error)`                                                                                               | Inspect logs; usually OPENAI_API_KEY or schema drift.          |
| Synthesizer mid-stream failure           | `SynthesizerAdapter`                            | Fallback prose path (Q4 sub-option i) → single `answer.token` + `answer.complete` → `turn.ended(completed)`; metric `agent_synthesizer_fallback_total` increments                                                                           | Operator monitors fallback rate (alert at >1%).                |
| AbortSignal mid-stream                   | client disconnect / wallclock / system          | `gateway.close('cancelled', usage)` → `turn.ended(cancelled)`                                                                                                                                                                               | None — abort is intentional.                                   |
| Untyped throw                            | anywhere                                        | Controller catches in outer try/catch → `gateway.error('internal_error')` → `turn.ended(error)`                                                                                                                                             | Inspect span + logs.                                           |

**Critical wrinkle — `'suppress_partial'` path:** when `BoundedExecutor` returns a writes-only suppressed narrative (no synthesizer call), the SSE stream still needs `answer.shape_declared` + `answer.token` + `answer.complete` events to satisfy the state machine and inform the client. The `RUN_PIPELINE_FN` factory inspects the returned `PhaseExecutionResult.kind === 'synthesized'` AND `r.answer.turnEndedReason === 'completed'` AND no synthesizer LLM was invoked (detected by checking the absence of usage on the answer): if so, emit the three answer events directly using the suppressed content. See §5.3 step 4 for the explicit dispatch — this is a small additional responsibility for the factory (or for `BoundedExecutor` itself, if cleaner).

**Implementation choice for the suppress_partial SSE emission:** put it in `BoundedExecutor` directly (it has the streamEmitter and produces the suppressed answer) — keeps the factory simple and consistent: synthesizer always handles its own SSE; `BoundedExecutor` handles SSE for non-synthesized return paths (suppress_partial only).

---

## 8. Observability Surface

### 8.1 Spans

- `pipeline.dispatch` — root child of `TURN` span. Attributes: `kind` (`bounded` / `iterative` / `disambiguation`), `tenant_id`, `flow_id`, `outcome`.
- `pipeline.bounded.phase` — per phase. Attributes: `phase` (`phase-1` / `phase-2`), `sub_agent_count`, `outcome`.
- All sub-agent spans, gateway spans, synthesizer spans inherit existing definitions (Plans 03, 07, 17).

### 8.2 Metrics (new instruments)

| Instrument                                 | Type      | Labels                                               | Description                              |
| ------------------------------------------ | --------- | ---------------------------------------------------- | ---------------------------------------- |
| `agent_pipeline_dispatch_total`            | counter   | `kind` (bounded/iterative/disambiguation), `outcome` | One per turn                             |
| `agent_bounded_executor_phase_duration_ms` | histogram | `phase`, `outcome`                                   | Phase-1/phase-2 duration                 |
| `agent_bounded_executor_drafts_total`      | counter   | `phase`, `sub_agent_key`                             | Drafts proposed during bounded execution |

Existing instruments unchanged: Plan 17's `agent_sub_agent_*`, `agent_synthesizer_*`. Plan 06's `recordTurnTotal` / `recordTurnDuration` / `recordAbortTotal` (already wired in PR #105) continue to fire from the controller's finally block.

### 8.3 Audit events

No new kernel audit events. Existing Plan 02/03 emits (sub-agent invocations, router decisions, synthesizer outcome) cover the surface; flow_id/tenant_id propagation already implemented in PR #105.

---

## 9. Security Considerations

- **RLS isolation**: every DB read/write inside the pipeline runs under the request-bound `pg.PoolClient` with `app.tenant_id` set by `RlsMiddleware`. The pipeline never accesses cross-tenant data; sub-agent ReAct loop tool calls go through `ToolGateway` which respects RLS for every query. Integration test §11 verifies no leak across two tenants.
- **OPENAI_API_KEY sourcing**: identical to existing pattern (Secrets Manager → ECS env in prod, dev shell export). No new secret.
- **Prompt injection**: `userUtterance` is the only untrusted text field flowing into the LLM. It enters the router prompt (already sanitized via `sanitizeUtteranceForApprover` at relevant boundaries per Plan 02) and the synthesizer prompt (rendered as JSON-quoted user text in the prompt builder per Plan 17 PR 3 spec). No new injection surface.
- **SSE response leakage**: `streamObject` partials are validated against `SynthesizerOutputSchema` — the LLM cannot emit shapes outside the discriminated union. Pre-shape failures rethrow rather than partially emit; the schema is the gate.
- **Conversation persistence**: `SaveQueue.enqueue` writes through `ConversationMessageRepository` which respects RLS. The `flow_id` field is captured per row for cross-table correlation (Plan 07).

---

## 10. Performance Budget

| Operation                                                 | p50      | p95       | p99 hard cap                                               |
| --------------------------------------------------------- | -------- | --------- | ---------------------------------------------------------- |
| Live turn (router → bounded → synthesizer)                | <5000 ms | <15000 ms | <30000 ms (matches `composeTurnAbortSignal` wallclock 30s) |
| `BoundedExecutor` phase-1 (3 sub-agents sequential)       | <9000 ms | <20000 ms | <30000 ms                                                  |
| `BoundedExecutor` phase-2 (1-3 sub-agents sequential)     | <3000 ms | <8000 ms  | <12000 ms                                                  |
| Synthesizer time-to-first-token (`answer.shape_declared`) | <800 ms  | <2000 ms  | <5000 ms                                                   |
| Total synthesizer streaming duration                      | <3000 ms | <6000 ms  | <10000 ms                                                  |
| `SaveQueue.enqueue` (debounced fire-and-forget)           | <1 ms    | <5 ms     | <10 ms (it's just adding to an in-memory queue)            |

The 30s wallclock in `composeTurnAbortSignal` is the hard cap. Sub-agent ReAct loop's own ceilings (Plan 03 R-03.13/R-03.14) bound per-sub-agent latency. Synthesizer uses `streamObject` with `abortSignal: opts.abortSignal` so it inherits the wallclock.

---

## 11. Testing Strategy

**Unit (mocks/stubs):**

- `bounded-executor.spec.ts`:
  - happy path: phase-1 only, returns `synthesized`.
  - phase-1 + phase-2: directive enrichment exercised, `projectToSchema` invoked, synthesizer receives merged `outputs`.
  - `surface_partial`: ceiling hit + zero drafts → `partial` kind.
  - `suppress_partial`: ceiling hit + drafts → suppressed narrative + drafts, synthesizer NOT called, BUT SSE answer.\* events still emitted.
  - abort at every step boundary → `aborted` kind.
  - sub-agent returning `kind: 'errored'` → flows to synthesizer (no error propagation).
- `run-pipeline-fn.spec.ts`:
  - Each `RouteTurnResult.kind` (bounded/iterative/disambiguation) → correct dispatch.
  - Iterative path does NOT emit `phase.started` from factory (orchestrator already did).
  - Disambiguation emits `refusal.started` exactly once.
  - Bounded path forwards `streamEmitter` correctly to `BoundedExecutor`.
- `synthesizer-adapter.streaming.spec.ts`:
  - Fake `SynthesizerLlmClient.stream()` yields scripted partial-object chunks. Cover: shape-declared firing once; token diff for narrative; atomic emit for table; mid-stream LLM error → fallback prose; pre-shape error → throw; abortSignal mid-stream.
- `pipeline-errors.spec.ts`:
  - `classifyPipelineError` for each error class + untyped error.
- `agent-turn-controller.spec.ts` (expand existing):
  - SaveQueue enqueue called for user message before runner.
  - SaveQueue enqueue called for assistant message after runner (only when non-empty).
  - turnEndReason translation: completed/cancelled/refused/error → correct gateway call.
  - Untyped throw → `gateway.error('internal_error')`.

**Integration (real DB, real DI, fake LLMs):**

- `agent-turn-controller.live-pipeline.integration.spec.ts`:
  - POST a streaming request; consume SSE stream; assert event sequence: `turn.started` → `phase.started(phase-1)` → `answer.shape_declared` → ≥1× `answer.token` → `answer.complete` → `turn.ended(completed)`.
  - Assert `agent_conversation_message` rows: 1 user + 1 assistant, both with correct tenantId/conversationId/traceId.
  - Assert `agent_session.routerPromptHash` populated.
  - Two-tenant RLS isolation: parallel POSTs from T1 and T2 with same conversationId — each only sees its own messages.
  - Abort path: client disconnects mid-stream → assertions for `gateway.close('cancelled')` + `turn.ended(cancelled)`.
  - Refusal: scripted RouterSessionOrchestrator returns disambiguation → assert `refusal.started` + `turn.ended(refused)` + assistant message NOT persisted (or persisted with `role: 'system'`/refusal — pick one consistently).
- `bounded-executor.integration.spec.ts`:
  - Real ToolGateway + fake LLM. Bounded plan with 2 phase-1 sub-agents + 1 phase-2 sub-agent. Assert phase-2 directive's sanitizedInput came from `projectToSchema(phase1Merged, ...)`.

**Coverage gate:** ≥70% lines/functions/branches per CLAUDE.md.

**E2E with real OpenAI:** deferred (CI cost). Plan 13's harness covers when activated.

---

## 12. Acceptance Criteria

1. **A live POST /api/agent/turn produces real SSE token stream backed by Vercel AI SDK `streamObject`.** Verified by integration test asserting actual `answer.token` events with non-empty deltas.
2. **`agent_conversation_message` table has both user and assistant rows after a successful turn.** Verified by integration test.
3. **Bounded executor's three gate branches (no_ceiling / surface_partial / suppress_partial) each produce the correct `PhaseExecutionResult` AND the correct SSE event sequence.** Verified by unit + integration tests.
4. **Two tenants running parallel turns observe complete isolation.** Verified by integration test against real DB with RLS.
5. **Disambiguation, abort, router-failure, synthesizer-failure paths each produce the documented SSE close event.** Verified by integration tests.
6. **`SynthesizerOpts.phase1Outputs`/`phase2Outputs` are removed; both `IterativeOrchestrator` and `BoundedExecutor` use `outputs` and `streamEmitter`.** Verified by `tsc` + spec coverage.
7. **No regression in PR #105 surface.** Existing `agent-turn-controller.spec.ts`, `rls-all-tables.integration.spec.ts`, `cost-recorder.spec.ts` continue to pass without modification (the controller spec gets EXTENDED, not replaced).

---

## 13. Rollout Plan

**Sequencing relative to Plan 17:**

1. **Plan 17 PR 1** (already opened, #107) — merges first. Provides `ToolGatewayPort` + DI token + plan docs. Does NOT include `TurnPipelineRunner` (deferred to Plan 18 per the spec erratum).
2. **Plan 17 PR 2** (sub-agent ReAct loop) — merges next. Provides real `SubAgentRunnerAdapter`.
3. **Plan 17 PR 3** (synthesizer LLM, AMENDED) — merges next. Provides real `SynthesizerAdapter` using `streamObject` (Plan 18 amendment) with `outputs` map + `streamEmitter` (also Plan 18 amendments).
4. **Plan 18 PR** (this plan) — merges last in this group. Introduces `TurnPipelineRunner`, `BoundedExecutor`, real `RUN_PIPELINE_FN` factory, and the controller refactor.
5. **Plan 17 PR 4** (golden-trace) — merges after Plan 18. Now `TurnPipelineRunner.runWithReplay` has a real factory to override.

The amendments to Plan 17 PR 3 (streamObject, outputs map, streamEmitter in SynthesizerOpts) are **prerequisites** for Plan 18 to compile. The Plan 17 PR 3 implementation plan must be updated before that PR ships.

**No feature flag.** Once Plan 18 merges, every live turn flows through the real pipeline. There is no halfway state.

**Soak window:** after Plan 18 merges, monitor:

- `agent_pipeline_dispatch_total{outcome}` — error rate <1%.
- `agent_synthesizer_fallback_total / agent_synthesizer_call_total` — <1% sustained.
- `agent_turn_total{turn_end_reason}` — `completed` >95%, `cancelled` <2%, `error` <1%.
- p95 turn duration <15s.

If any threshold breached for 6h sustained → roll back via revert + redeploy. Plan 17's components (PR 2/PR 3) stay merged; only Plan 18's controller wiring rolls back, which restores the placeholder body.

---

## 14. Dependencies

**In-repo:**

- Plan 17 PR 1 — `TurnPipelineRunner` skeleton + `ToolGatewayPort` + `TOOL_GATEWAY` token + `RUN_PIPELINE_FN` token.
- Plan 17 PR 2 — `SubAgentRunnerAdapter` real implementation (consumed by `BoundedExecutor` via `ISubAgentRunner`).
- Plan 17 PR 3 — `SynthesizerAdapter` real implementation, AMENDED for streamObject + outputs map + streamEmitter (consumed by `BoundedExecutor` via `ISynthesizer`).
- Plan 02 — `RouterSessionOrchestrator`, `WindowBuilder`, `KernelQueryFacade` (existing).
- Plan 03 — `phase-executor.ts` pure helpers (`validatePlanEntry`, `evaluatePartialAnswerGate`, `buildCircuitBreakerContextNote`), `projectToSchema` (existing).
- Plan 04 — `SaveQueue` (existing).
- Plan 05 — `BudgetChecker.preTurnCheck` (already wired by PR #105).
- Plan 06 — `StreamGateway`, `composeTurnAbortSignal`, streaming metrics (existing).
- Plan 07 — `ObservabilityContextFactory`, `FlowIdPropagation` (already wired by PR #105).
- Plan 12 — `IterativeOrchestrator` (existing).

**External:**

- `ai@^6.0.168` (already present) — `streamObject` API.
- `@ai-sdk/openai` (already present).
- `OPENAI_API_KEY` secret (already provisioned).

**No new infrastructure, no new tables, no new external services.**

---

## 15. Integration Points

- **`agent-turn-controller`**: only the placeholder body in `streamTurn()` is replaced. Existing PR #105 wiring stays.
- **`agent-cancel-controller`**: untouched. AbortSignal already plumbed.
- **`SaveQueue`**: gets its first live caller (controller).
- **`RouterSessionOrchestrator`**: amended to throw `RouterLlmFailureError` on infra failures (currently swallows). No public API change.
- **`IterativeOrchestrator`**: one call site change (synthesize args) per `SynthesizerOpts` cleanup.
- **`agents.module.ts`**: `RUN_PIPELINE_FN` provider's factory body is replaced (placeholder → real). `BoundedExecutor` provider added; bound to `BOUNDED_EXECUTOR` token.

---

## 16. Activation Gate

Not applicable. Plan 18 removes a placeholder; there is no "off" state to gate. Closure criteria are §12 acceptance + soak window in §13.

---

## 17. Out of Scope

Per §1 Out:

- Scheduled/async turn live wiring.
- Replay-mode integration into the live controller (Plan 17 PR 4 owns).
- Multi-region / cross-provider failover (Plan 11 §17 deferral).
- Per-iteration synthesizer for iterative-tier turns (Plan 12 INFO).
- Frontend-side renderer changes for table/chart shapes (zone team work).

---

## 18. Open Questions

None at design time. Implementation may surface:

- **`SubAgentDirective.inputSchema` field** — Plan 03 §3 / R-03.8 / R-03.38 reference per-phase-2-directive input schemas. The exact Zod schema reference on `SubAgentDirective` needs to be verified in `router-plan-schema.ts`. If the field is named differently or is absent, `enrichPhase2Directive` must be adjusted accordingly. Implementation plan includes a verification step.
- **`SubAgentDirective.contextNote` field** — same verification: the `cbNote` append in `enrichPhase2Directive` assumes a `contextNote` field exists. If absent, the field is added (small schema amendment) or the cbNote is inlined into another existing field.
- **`ISubAgentRunner.run` `phase` parameter** — current `IterativeSubAgentRunOpts` (omit `phase` from `SubAgentRunnerOpts`) may not have a `phase: 1 | 2` field in the path used by `BoundedExecutor`. If absent, add it as an optional discriminator. Plan 17 PR 2 (sub-agent runner adapter rewrite) absorbs this small contract amendment.
- **`renderAnswerToMarkdown` table rendering** — markdown tables are sensitive to cell content (pipes, newlines). The renderer must escape pipes and replace newlines with `<br>` (or use ` ` + line break); details captured in the Plan 18 implementation plan.
- **Frontend client expectations for `format: 'json'` in `answer.shape_declared`** — the current frontend assumes markdown. Plan 18 decision: the controller-side rendering for `format: 'json'` produces a JSON-fenced markdown snippet (` ```json ... ``` `) so existing markdown clients still render the payload as a code block. Future frontend work (out of scope) can add native chart/table rendering keyed on `format: 'json'` + `shape: 'table' | 'chart'`.
