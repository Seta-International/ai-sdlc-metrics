# 12 — Iterative Supervisor Topology

**Design §§:** §3.1 (Iterative Supervisor Topology), §2.1 (two-topology runtime), §4 (error classes).

## Revision 2026-04-22

Iterative topology promoted from **Beta opt-in** to **MVP Tier 2** of the four-tier router taxonomy (§3 table: Tier 0 direct / Tier 1 bounded DAG / Tier 2 iterative / Tier 3 async). Ships live at first production turn, permission-gated on `canDo('agent.iterative')` with staged per-tenant rollout (default-off → admin opt-in → gradual ramp). The permission gate is the load-bearing guard — external 2025-2026 research on unstructured multi-agent networks documents up to **17.2× error amplification** on routine queries; the gate ensures iterative self-selects only where its cost is justified. All §3.1 invariants 1-7 (iteration cap, per-iteration cost gate, taint turn-scoped, deterministic-scorers-only, single synthesizer, replay-determinism, topology-downgrade-candidate signal) are preserved. Section structure unchanged.

**Activation gate:** MVP Tier 2 — ships live at first production turn. Permission-gated on `canDo('agent.iterative')`; tenant rollout staged (default-off, admin opt-in, gradual ramp). Absence of the permission yields disambiguation fallback (no silent downgrade without operator awareness).

---

## 1. Scope

### In

- **Tier 2 of the four-tier router taxonomy** (§3 table: Tier 0 direct / Tier 1 bounded DAG / Tier 2 iterative / Tier 3 async). Selection criteria per §3.1: open-ended investigation, multi-step planning, or any task whose plan shape cannot be fixed before the first tool call returns (~5% of flows — the investigative tail).
- Router `topology: 'iterative'` classification path (extension of plan 02 router plan shape).
- Iterative orchestrator: picks one sub-agent per iteration, executes, evaluates completion scorers, re-plans or exits.
- Per-iteration cost + wallclock gates enforced BETWEEN iterations.
- Turn-scoped taint persistence (not iteration-scoped).
- `SetaScorer.kind: 'deterministic'` completion scorers only (LLM-judge GA-gated).
- Per-turn iteration caps (10 interactive, 20 async).
- Synthesizer runs once after loop exit.
- Iteration event triplet `iteration.started / .validated / .ended` activation (SSE contract defined in plan 06; this plan activates it).
- Observability: new `iteration_count_exceeded_p95` + `topology_downgrade_candidate` signals.
- Replay determinism preservation: iterative turns are replay-deterministic iff all scorers deterministic.

### Out

- LLM-judge scorers for completion gates (GA activation-gated; deferred from §3.1 invariant 4).
- Per-iteration synthesizer (GA activation-gated).
- Mid-loop human-in-loop pause (§10 turn-termination rule — iterative turns still end at "draft submitted").
- Unified `agent | workflow | tool` primitives (rejected; sub-agents are homogeneous).
- Topology mid-turn switch (bounded cannot become iterative mid-turn; router decides at entry).

---

## 2. Design Context

**Iterative is the second supported topology, not a replacement for bounded.** Two-phase bounded (plan 03) serves ~90% of HR/Time/Projects/Finance/KPI queries well. Iterative serves the other ~10%: open-ended investigation ("why did KPI X regress?"), multi-step planning ("build a comparison across 5 dimensions"), anything whose plan shape cannot be fixed before the first tool call returns.

**Router classifies topology at entry, alongside the plan.** This is the critical decision: does this intent fit bounded (≤3 parallel + 1 sequential) or does it need iterative re-planning? Router heuristic at MVP first-production-turn activation: keyword + intent-pattern match (explicit product-tunable allowlist of iterative-apt patterns). GA: structured classification against a labeled corpus.

**Why the permission gate (`canDo('agent.iterative')`) exists even though iterative is MVP.** External research (2025-2026) on unstructured multi-agent networks documents up to **17.2× error amplification** when supervisor-style loops self-select on routine queries. Without the permission gate, iterative would self-select on low-value turns the router could classify as bounded-or-direct, degrading quality and inflating cost. The gate is a correctness guard, not a timeline deferral — it ships alongside the topology at first production turn.

**Inline copilots stay bounded-only by hard contract** (§3). Inline = single sub-agent; iterative would break the contract. Enforced at router entry: inline surface + iterative topology → immediate fallback to bounded or escalate to global chat.

**Invariants specific to iterative:**

1. **Per-turn iteration cap** — hard ceiling prevents runaway. Default 10 for interactive, 20 for async. Exceeding aborts `reason: budget`.
2. **Per-iteration cost + wallclock gates** enforced between iterations, not only within sub-agent. A sub-agent may stay under its own wallclock but iterations stack — need cumulative check.
3. **Taint is turn-scoped, persists across iterations.** Once flipped, any draft from any subsequent iteration inherits the approval-tier bump.
4. **Completion scorers rule-based or structural only in v1.** LLM-judge exit gating requires meta-eval first (plan 10 Beta path).
5. **Synthesizer runs once** after loop exit. Per-iteration synth deferred.
6. **Replay determinism** conditional on all scorers being deterministic — enforced at registration (plan 10 `SetaScorer.kind` discriminator).
7. **Topology downgrade signal** emitted when bounded fires its one re-plan; suggests router misclassified.

**Router re-plans in iterative are different from bounded's one-shot plan.** In iterative, every iteration IS a re-plan; the router's first plan is "try this sub-agent first with this directive," then on re-entry "given what we learned, try this next." This is exactly what our §2.1 pre-1.1 spec rejected — we bring it back as a named opt-in topology, not as runtime-wide behavior.

**Rejected alternatives:**

- Mastra-style unbounded `dountil(scorer passes)` (spike 01). Our hard cap + scorer-kind restriction preserves cost predictability + replay determinism.
- Arbitrary DAG / phase 3+ (§16 Out of Scope). Iterative covers the "complex plan" case with less architectural surface.
- LLM-judge scorers in gating at MVP/Beta. Gated on plan 10 Beta meta-eval before GA.

**What this is NOT:** a general-purpose supervisor framework. It is a strictly-bounded iterative loop with opinionated invariants.

---

## 3. Data Model

### Router plan shape extension (plan 02 `RouterPlan`)

```
type RouterPlan =
  | { topology: 'bounded'; phase1: SubAgentDirective[1..3]; phase2?: SubAgentDirective; disambiguation?: string }
  | { topology: 'iterative'; initialDirective: SubAgentDirective; completionCriteria: CompletionSpec; disambiguation?: string }

type CompletionSpec = {
  scorerIds: string[];        // references registered deterministic scorers (plan 10)
  strategy: 'all' | 'any';
  maxIterations: number;      // <= 10 interactive; <= 20 async
  hintToRouter: string;       // what "done" means for this task, in prose (router uses to re-plan)
}
```

### `agent_iteration` (audit trail per iteration)

- `id UUID PK`.
- `trace_id UUID` (RLS via tenant_id).
- `tenant_id UUID`.
- `turn_id UUID` — correlates to `TURN` span.
- `iteration_number INT` — 1-based.
- `sub_agent_key TEXT` — which sub-agent ran.
- `selection_reason TEXT` — router's rationale.
- `completion_scorer_results JSONB` — `ScorerResult[]`.
- `is_complete BOOLEAN`.
- `started_at TIMESTAMPTZ`, `ended_at TIMESTAMPTZ`.
- `usage JSONB` — iteration's token/cost snapshot.
- `taint_at_start BOOLEAN` — turn taint state at iteration start.
- Index: `(turn_id, iteration_number)`.

Per §9 replay-determinism invariant: iteration trace rows are part of the 100% capture for iterative turns.

### Iterative turn extensions to `TurnState`

Additional in-memory fields per iterative turn:

- `iterationNumber: number` — current 1-based.
- `completionCriteria: CompletionSpec` — from router plan.
- `iterationHistory: IterationRecord[]` — for replan context.
- `cumulativeCostUsd: number`.
- `cumulativeWallclockMs: number`.

```
type IterationRecord = {
  iterationNumber: number;
  subAgentKey: string;
  directive: SubAgentDirective;
  output: SubAgentOutput;
  scorerResults: ScorerResult[];
  isComplete: boolean;
}
```

---

## 4. Interface Contracts

### Extended `RouterDecisionParser` (plan 02 augmentation)

```
parse(rawLlmOutput, schema): ParseResult
// schema extended to match `RouterPlan` discriminated union above.
```

Rejection rule: at inline surface, iterative plan → treat as parse error; router retries with explicit "use bounded topology" system message.

### `IterativeOrchestrator`

```
execute(opts: {
  initialPlan: { topology: 'iterative'; initialDirective; completionCriteria };
  turnState: TurnState;
  abortSignal: AbortSignal;
  streamEmitter: StreamEmitter;
}): Promise<PhaseExecutionResult>
```

Same `PhaseExecutionResult` contract as plan 03's `PhaseExecutor.execute` — the caller (plan 06) doesn't need to branch on topology.

### `IterativeRePlanner`

```
replan(opts: {
  turnState: TurnState;
  priorIteration: IterationRecord;
  completionCriteria: CompletionSpec;
}): Promise<{
  kind: 'continue';
  nextDirective: SubAgentDirective;
} | {
  kind: 'exit';
  reason: 'complete' | 'stuck' | 'disambiguation';
  disambiguationQuestion?: string;
}>
```

Calls the router LLM with iteration history + completion hint + last iteration's output.

### `CompletionScorerRunner`

```
runScorers(opts: {
  scorerIds: string[];
  strategy: 'all' | 'any';
  iterationOutput: SubAgentOutput;
  turnState: TurnState;
}): Promise<{
  isComplete: boolean;
  results: ScorerResult[];
}>
```

Scorers resolve via plan 10 `ScorerRegistry`. Registration-time check: scorerIds in CompletionSpec must all be `kind: 'deterministic'`. Violation at router parse → reject plan, re-invoke router with "use only deterministic scorers."

### `IterationCeilingEnforcer`

```
checkBeforeIteration(opts: {
  turnState: TurnState;
  iterationNumber: number;
  completionCriteria: CompletionSpec;
}): {
  allowed: boolean;
  reason?: 'max_iterations' | 'cumulative_cost' | 'cumulative_wallclock';
}
```

Reads `turnState.cumulativeCostUsd`, `cumulativeWallclockMs`, `iterationNumber` vs config limits.

### Extended SSE events (from plan 06, activated here)

`iteration.started`, `iteration.validated`, `iteration.ended` — plan 06 ships the wire format; this plan activates emission.

---

## 5. Control Flow

### Router classification

1. User sends turn; plan 02 router assembles prompt with **topology classification** section.
2. Router emits plan with `topology: 'bounded' | 'iterative'`.
3. Validation (per topology):
   - Bounded: phase1 size ≤3, phase2 size ≤1 (plan 03).
   - Iterative: `completionCriteria.scorerIds` all exist + all `kind: 'deterministic'`; `maxIterations ≤ 10` (interactive) or `≤ 20` (async).
4. **Inline surface guard**: if `topology: 'iterative'` AND `surface === 'inline:*'` → reject plan; force bounded retry.
5. Plan passed to appropriate orchestrator: `PhaseExecutor` (bounded) or `IterativeOrchestrator` (iterative).

### Iterative execution loop

1. `IterativeOrchestrator.execute(...)` receives initial plan.
2. Set `turnState.iterationNumber = 1`.
3. **Loop:**
   a. `IterationCeilingEnforcer.checkBeforeIteration(...)` — if not allowed → exit with `partial` kind.
   b. Emit `iteration.started { n, sub_agent_domain, selection_reason }` SSE event.
   c. Spawn single `SubAgentRunner.run(...)` with current directive + `phase: 1`. Sub-agent's ReAct loop runs per plan 03.
   d. Collect `SubAgentOutput`; record in `iterationHistory`.
   e. Update cumulative cost + wallclock.
   f. Emit `iteration.ended { n, is_complete: TBD, usage }` once sub-agent returns.
   g. `CompletionScorerRunner.runScorers(...)` against iteration output.
   h. Emit `iteration.validated { n, passed, scorer_results, max_iterations_reached }`.
   i. If `isComplete || maxIterationsReached` → break loop.
   j. `IterativeRePlanner.replan(...)`:
   - Returns `continue` with next directive → `iterationNumber += 1`, continue loop.
   - Returns `exit (disambiguation)` → exit loop, emit disambiguation.
   - Returns `exit (stuck)` → exit loop with partial.
4. Post-loop: `Synthesizer.synthesize(...)` with ALL iteration outputs as multi-source input (plan 03's synthesizer shape unchanged; iterative just provides N iteration outputs instead of phase1 + phase2).
5. Return `PhaseExecutionResult`.

### Taint persistence across iterations

1. Iteration 1: no taint.
2. Iteration 1's tool call returns `tenantAuthoredFreeText` field → plan 01 gateway flips `turnState.tainted = true`. Added to `turnState.taintSources`.
3. Iteration 2 starts: `turnState.tainted` already true. Runner records `taint_at_start: true` in `agent_iteration` row.
4. Iteration 2 drafts a write → plan 08 draft classifier sees `turnState.tainted`, bumps tier regardless of which iteration originated the taint.
5. Iteration N drafts: same bump applies.

**Turn-scoped, not iteration-scoped.** Reset to false only at turn end (next turn starts clean).

### Cumulative ceiling enforcement

1. Each iteration's cost added to `turnState.cumulativeCostUsd` at completion.
2. Before starting iteration N: check `cumulativeCostUsd + estimated_next_iteration_cost < per_turn_budget`.
3. Exceeded → `IterationCeilingEnforcer` returns `{ allowed: false, reason: 'cumulative_cost' }`.
4. Orchestrator exits loop with partial; emits `turn.ended.reason: budget`.
5. Partial-answer gate (plan 03 R-03.19) applies: synthesizer runs against iterations so far if no writes drafted.

### Re-plan via router LLM

1. `IterativeRePlanner.replan(...)` calls router LLM with:
   - Original user utterance.
   - Completion criteria hint.
   - `iterationHistory` — sanitized via `project_to_schema` per next sub-agent's scope.
   - Last iteration's sanitized summary.
2. Router responds with new `SubAgentDirective` OR `{ exit: 'disambiguation', question }`.
3. Same structured-output parse + retry semantics as plan 02 (one retry on schema fail → escalate).

### Topology-downgrade signal

1. Bounded turn fires its one bounded re-plan (plan 03 phase-shape mismatch).
2. Plan 07 emits metric `router_rechose_after_replan` + trace attr `topology_downgrade_candidate: true`.
3. Dashboard aggregates: if this signal fires sustained on similar-utterance patterns, it suggests router should be classifying these as iterative.
4. Operator adjusts router classification heuristic / training corpus.

### Inline surface rejection

1. Inline copilot sends turn; surface = `'inline:planner:overview'`.
2. Router misclassifies as iterative.
3. Orchestrator selector checks: `surface.startsWith('inline:') && topology === 'iterative'` → reject.
4. Router re-invoked with explicit system message: "This is an inline surface. Use bounded topology with single sub-agent."
5. Second pass returns bounded plan. Execution proceeds.
6. If router twice attempts iterative on inline → hard refusal with `reason: 'disambiguation'` and UI hint: "This request is too complex for inline; open global chat."

### Replay determinism

1. Iterative turn completes; all iterations + scorer results persisted via 100% capture (iterative turns ALWAYS trigger 100% sample due to `approval_required_draft_submitted` or ceiling hits or taint — OR we explicitly add `topology: 'iterative'` as a sampling trigger).
2. Plan 10 `ReplayHarness.replay(traceId, mode: 'full')` reconstructs:
   - Initial plan.
   - Each iteration's directive.
   - Each iteration's sub-agent output.
   - Each iteration's scorer results.
   - Re-plan LLM calls with full history context.
3. Determinism condition: all scorers deterministic → replay reproduces identical branching. LLM-judge scorer → replay non-deterministic (rejected at plan 10 registration).

---

## 6. Requirements

### Topology activation

| #       | Requirement                                                                                                                                                                                                                  | Design §§     |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| R-12.1  | Router plan shape extended to discriminated union on `topology`                                                                                                                                                              | §3.1, §3      |
| R-12.2  | Iterative plan validation: `completionCriteria.scorerIds` all exist + all `kind: 'deterministic'`                                                                                                                            | §3.1, §14     |
| R-12.3  | Iterative plan rejected at inline surface; router retries with bounded directive                                                                                                                                             | §3.1          |
| R-12.4  | Orchestrator selection by topology: `PhaseExecutor` (bounded) vs `IterativeOrchestrator`                                                                                                                                     | §3.1          |
| R-12.4a | Iterative is Tier 2 of four-tier taxonomy, available at MVP first-production-turn (no dormant phase)                                                                                                                         | §3, §3.1, §16 |
| R-12.4b | Iterative gated on `canDo('agent.iterative')`; absence yields disambiguation fallback (not silent downgrade to bounded)                                                                                                      | §3.1, §16     |
| R-12.4c | Tenant rollout staged: default-off per tenant → admin opt-in via `web-admin` toggle → gradual ramp (see §13)                                                                                                                 | §3.1, §16     |
| R-12.4d | All §3.1 invariants 1-7 (iteration cap, per-iteration cost gate, taint turn-scoped, deterministic-scorers-only, single synthesizer, replay-determinism, topology-downgrade-candidate signal) enforced from first-turn onward | §3.1          |

### Iteration caps

| #      | Requirement                                                                               | Design §§ |
| ------ | ----------------------------------------------------------------------------------------- | --------- |
| R-12.5 | Per-turn iteration cap: 10 interactive, 20 async (configurable; capped at these defaults) | §3.1      |
| R-12.6 | Per-iteration cost + wallclock gates enforced BETWEEN iterations                          | §3.1      |
| R-12.7 | Ceiling breach → `turn.ended.reason: budget`; partial-answer gate applies                 | §3.1, §4  |

### Taint + drafts

| #      | Requirement                                              | Design §§ |
| ------ | -------------------------------------------------------- | --------- |
| R-12.8 | Taint is turn-scoped; persists across iterations         | §3.1, §2  |
| R-12.9 | Drafts from any iteration inherit turn-scoped taint bump | §3.1, §10 |

### Scorers

| #       | Requirement                                                          | Design §§        |
| ------- | -------------------------------------------------------------------- | ---------------- | --- |
| R-12.10 | Only `SetaScorer.kind: 'deterministic'` at MVP                       | §3.1, §14        |
| R-12.11 | LLM-judge completion scorers deferred until plan 10 meta-eval clears | §3.1, §14        |
| R-12.12 | Strategy `'all'                                                      | 'any'` supported | §14 |

### Synthesizer

| #       | Requirement                                                                                  | Design §§ |
| ------- | -------------------------------------------------------------------------------------------- | --------- |
| R-12.13 | Synthesizer runs ONCE after loop exit                                                        | §3.1      |
| R-12.14 | Synthesizer input is iteration outputs (multi-source, same shape as bounded's phase1+phase2) | §9        |
| R-12.15 | Per-iteration synthesis deferred to GA                                                       | §16       |

### Events

| #       | Requirement                                             | Design §§ |
| ------- | ------------------------------------------------------- | --------- |
| R-12.16 | SSE `iteration.started / .validated / .ended` activated | §15, §3.1 |
| R-12.17 | Triplet order enforced by plan 06 state machine         | §15       |

### Replay determinism

| #       | Requirement                                                                                                                                                   | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-12.18 | Iterative turns 100%-captured (added as sampling trigger)                                                                                                     | §12       |
| R-12.19 | Full replay requires all completion scorers deterministic; non-deterministic → replay non-deterministic (acceptable trade if scorer-kind discipline enforced) | §8        |

### Topology-downgrade signal

| #       | Requirement                                                            | Design §§ |
| ------- | ---------------------------------------------------------------------- | --------- |
| R-12.20 | Bounded one-bounded-re-plan emits `router_rechose_after_replan` signal | §3, §12   |
| R-12.21 | Metric aggregates for operator review of router classification quality | §12       |

---

## 7. Failure Modes & Recovery

| Failure                                                                     | Symptom                                                                   | Recovery                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router picks iterative for inline surface                                   | Rejected at validation                                                    | Retry router with bounded directive; second fail → disambiguation.                                                                                                                |
| `completionCriteria.scorerIds` references unknown scorer                    | Validation fail                                                           | Router retries with "only use registered scorers."                                                                                                                                |
| `completionCriteria.scorerIds` includes LLM-judge scorer                    | Registration check rejects                                                | Router retries with deterministic-only directive.                                                                                                                                 |
| Iteration cap reached                                                       | Exit with `partial`; synthesizer against history                          | Normal path; emit `reason: budget`; partial-answer gate.                                                                                                                          |
| Cumulative cost exceeded mid-iteration                                      | `systemAbortController.abort({ reason: 'budget' })` via plan 05           | Standard mid-turn abort; partial-answer gate.                                                                                                                                     |
| Re-planner returns `exit: stuck` (router sees no progress)                  | Loop exits with partial                                                   | Synthesizer against history; user may retry with refined utterance.                                                                                                               |
| Re-planner schema parse fails twice                                         | Disambiguation emitted                                                    | Plan 02 parse retry semantics.                                                                                                                                                    |
| Completion scorer throws                                                    | `scorer_results` includes error entry; strategy evaluation treats as fail | Loop continues if other scorers could pass; escalates after max iterations.                                                                                                       |
| Taint flipped in iteration 1 but missed in iteration 5 draft check          | P1 bug                                                                    | Gateway re-enforces at draft submission (plan 08 R-08.4); integration test covers.                                                                                                |
| Router classification drift (many iterative tasks misclassified as bounded) | Bounded one-re-plan signal spikes                                         | Operator review; adjust classification heuristic.                                                                                                                                 |
| Iteration history context bloats re-plan prompt                             | Re-planner LLM call expensive / truncated                                 | Cap iteration history in re-plan context to last N iterations (default 5) with compressed earlier-iteration summaries.                                                            |
| pg-boss retry on an iterative async turn                                    | Retry must hit same iteration state                                       | Iterations checkpointed; retry resumes from last completed iteration number. (Beta consideration — may ship simpler: retry re-runs from iteration 1 with same cumulative budget.) |

---

## 8. Observability Surface

### Spans

- `TURN` root with attr `plan.topology: 'iterative'` (normative attribute name; dashboards + sampling triggers key off this).
- `ITERATION` span per iteration (entity `SUB_AGENT`); attrs `iteration_count` (1-based current value), `sub_agent_key`, `selection_reason`, `scorer_passed` (boolean, set once `CompletionScorerRunner` returns), `is_complete`, `taint_at_start`, `scorer_results`.
- `REPLAN:llm-call` — child of `TURN` (not of `ITERATION`); emitted when router re-plans between iterations.
- `COMPLETION_SCORER:run` — child of `ITERATION`.

Every iteration MUST emit `iteration_count` and `scorer_passed` on close; the topology-downgrade dashboard and the replay harness both consume these attributes.

### Metrics

- `agent_turn_iterations_total{tenant_id, outcome}` — histogram over iteration count.
- `agent_iteration_count_exceeded_p95{tenant_id}` — gauge (new sampling trigger).
- `agent_topology_downgrade_candidate_total{tenant_id}` — counter.
- `agent_replan_llm_call_total{tenant_id, outcome}` — counter.
- `agent_completion_scorer_fail_total{tenant_id, scorer_id}` — counter.
- `agent_iterative_turn_total{tenant_id, outcome}` — counter.

### Dashboards

- Topology distribution per tenant (bounded vs iterative).
- Iteration count p50/p95/p99.
- Re-plan LLM cost per iterative turn.
- Scorer pass rate per scorer-id.
- Topology-downgrade-candidate rate (router misclassification signal).

---

## 9. Security Considerations

- **Turn-scoped taint persistence** is the key defense across iterations. A tenant-authored injection in iteration 1 bumps every subsequent iteration's drafts. Verified by seeded test.
- **Deterministic-only scorers.** LLM-judge scorers at exit gate opens a prompt-injection vector (scorer LLM sees tool results, could be told "mark complete"). Deterministic rule-based scorers have no such surface.
- **Iteration cap is a DoS defense.** Runaway iterations consume LLM cost; hard cap bounds worst case.
- **Inline surface rejection.** Iterative turns on inline surface would violate single-sub-agent contract + blow up inline UX (no phase stepper to show 10+ iterations).
- **Re-plan context size discipline.** Unbounded iteration-history context to the re-planner is itself a DoS on the re-plan LLM call cost. Capped to last N + compression.
- **Async iterative.** Event-triggered async can iterate; combined with taint seeding, means an event payload can drive a multi-iteration turn. Max-iterations-per-async-turn is 20 (R-12.5); combined with per-delegation cost ceiling (plan 09), attack surface bounded.

---

## 10. Performance Budget

| Operation                                       | p50                              | p95     | p99                                          |
| ----------------------------------------------- | -------------------------------- | ------- | -------------------------------------------- |
| Router classification (bounded-or-iterative)    | <10ms additional vs pure bounded | <25ms   | <60ms                                        |
| Per-iteration overhead (orchestrator loop body) | <30ms                            | <80ms   | <200ms                                       |
| `IterativeRePlanner.replan` LLM call            | <2000ms                          | <5000ms | <8000ms                                      |
| Completion scorer run (deterministic)           | <100ms                           | <300ms  | <800ms                                       |
| Total iterative turn (5 iterations avg)         | <12s                             | <30s    | <60s (async: wallclock not strictly bounded) |

Interactive iterative wallclock ceiling: extend plan 06's default 30s to 60s for iterative turns (surface-dependent; configurable).

---

## 11. Testing Strategy

### Unit

- Router plan parser: `topology: 'iterative'` with invalid `scorerIds` → rejected; valid → accepted.
- `IterationCeilingEnforcer`: cumulative cost exceeded → not allowed; iteration count exceeded → not allowed; within limits → allowed.
- `CompletionScorerRunner`: `strategy: 'all'` + any scorer fails → `isComplete: false`; `strategy: 'any'` + any scorer passes → `isComplete: true`.
- Inline surface guard: surface starts with `inline:` + iterative plan → rejected.

### Integration

- Happy iterative turn: 3-iteration investigation; scorer passes at iteration 3; synthesizer produces narrative with provenance across 3 iterations.
- Max iterations reached: 10 iterations never complete → exit with partial; `turn.ended.reason: budget`; partial answer surfaced.
- Taint persistence: iteration 1 taints; iteration 3 drafts write → draft high_risk + provenance includes tainted source from iteration 1.
- Cumulative cost exhausted: iterations 1-3 consume 80% of turn budget; iteration 4 estimate > remaining → exit before starting iteration 4; partial synthesizer.
- Re-plan schema fail: seeded router returns malformed JSON on iteration 4 re-plan; retry once; second fail → exit with disambiguation.
- Inline rejection: inline surface + router returns iterative plan → router retries; second iterative → hard refusal "open global chat."
- LLM-judge scorer attempt: completion criteria references `kind: 'llm-judge'` → plan rejected at registration check.
- Observability: topology-downgrade signal fires when bounded hits one-re-plan on a real turn.

### Property

- Iteration numbering: iterations strictly monotonic, no gaps.
- Cumulative accumulation: sum of per-iteration usage = turn-end usage.

### E2E

- Real investigation scenario in `web-planner`: user asks "why did my project's KPI regress?" → router picks iterative → 4 iterations pulling from timesheet, insights, project modules → synthesizer produces narrative with per-iteration citations → user sees answer.
- Turn cancel mid-iterative: user cancels at iteration 5 → all in-flight aborts → partial synthesizer (or suppressed if writes drafted) → `turn.ended.reason: cancelled`.

### Fixtures

- `fixtures/plans/iterative-investigation-kpi.ts`
- `fixtures/plans/iterative-cross-domain-planning.ts`
- `fixtures/plans/iterative-with-llm-judge-rejected.ts`
- `fixtures/scorers/kpi-answer-shape-deterministic.ts`
- `fixtures/iterations/max-iterations-reached.ts`
- `fixtures/iterations/taint-persists-across-five.ts`

---

## 12. Acceptance Criteria

- All unit + integration + property + E2E tests pass.
- Iterative topology ships **live as Tier 2** at MVP first-production-turn; permission gate (`canDo('agent.iterative')`) wired + verified in both directions (granted → execute; denied → disambiguation).
- First real production iterative turn (on an admin-opted-in tenant) serves an open-ended query that bounded cannot serve cleanly — verified against the fixture scenario.
- Taint persistence verified end-to-end.
- Iteration cap enforcement verified.
- Inline surface rejection verified.
- LLM-judge scorer rejection at registration verified (cross-check plan 10).
- Topology-downgrade-candidate signal wired + dashboarded.
- Replay determinism verified on a multi-iteration captured trace.

---

## 13. Rollout Plan

Iterative ships **live** at MVP first-production-turn. Rollout is staged **per tenant**, not phased across MVP/Beta/GA.

- **Stage 1 — default-off per tenant.** Ship code; `canDo('agent.iterative')` defaults to denied for every tenant. Router may emit iterative plans internally, but the permission gate converts them to disambiguation before execution. Absorb the first week of production traffic on bounded + direct only.
- **Stage 2 — admin opt-in.** Tenant admin enables iterative via `web-admin` toggle (writes `agent.iterative.enabled` on tenant settings; grants `canDo('agent.iterative')` to the tenant's role graph). Admin UI surfaces the known cost profile + the 17× research finding so opt-in is informed.
- **Stage 3 — gradual ramp per tenant.** Enable for an initial cohort of intent slugs; monitor `agent_iteration_count_exceeded_p95` + `agent_topology_downgrade_candidate_total` + turn-quality canary (plan 10). Expand coverage as signals stay clean.
- **Stage 4 — async iterative.** Plan 09 integration once async draft-to-inbox has cleared §11 incident-free window.
- **Stage 5 — scorer surface expansion.** LLM-judge completion scorers activate when plan 10 meta-eval clears (not before).

**Auto-rollback.** Regression signal (plan 10 canary delta, sustained `agent_iteration_count_exceeded_p95` breach, or error-rate spike on iterative vs bounded baseline) auto-flips the tenant's `agent.iterative.enabled` back to false and raises an operator alert. Rollback is per-tenant, not platform-wide.

**Manual backout.** Platform-wide kill switch: `agent.iterative.enabled = false` at admin-config root forces router to always emit bounded. Cleanly reversible; no data-model dependency on iterative having ever fired.

---

## 14. Dependencies

**Load-bearing for MVP activation:**

- **Plan 01** — gateway pipeline (tool calls per iteration; taint detection at gateway is what makes R-12.8 / R-12.9 enforceable across iterations).
- **Plan 02** — router + registry; router classification must emit `topology: 'iterative'` as a first-class option, not a fallback.
- **Plan 07** — `flow_id` / `intent_slug` stamping on every descendant span; without these the topology-downgrade-candidate signal cannot aggregate per-intent.
- **Plan 10** — deterministic-scorer registration discipline (`SetaScorer.kind` discriminator enforced at registration time — R-12.10; LLM-judge scorers rejected until meta-eval clears — R-12.11).

**Supporting:**

- Plan 03 — sub-agent runner + synthesizer (reused for iteration bodies + post-loop synthesis).
- Plan 04 — memory (conversation state, L1 cache per iteration).
- Plan 05 — cumulative cost enforcement.
- Plan 06 — SSE iteration event triplet; abort propagation.
- Plan 08 — draft taint bump across iterations.
- Plan 09 — async iterative (Stage 4 of §13 rollout).

## 15. Integration Points

- `apps/api/src/modules/agents/application/services/iterative-orchestrator.ts` — new.
- `apps/api/src/modules/agents/application/services/iterative-replanner.ts` — new.
- `apps/api/src/modules/agents/application/services/completion-scorer-runner.ts` — new; consumes plan 10's registry.
- `apps/api/src/modules/agents/application/services/iteration-ceiling-enforcer.ts` — new.
- `apps/api/src/modules/agents/infrastructure/schema/agent-iteration.ts` — Drizzle.
- Plan 02 `RouterPlan` type — extended.
- Plan 06 SSE state machine — extended to handle iteration triplet.
- Plan 07 sampling config — `topology: 'iterative'` added as trigger.

## 16. Activation Gate

**MVP first-production-turn.** Iterative ships live as Tier 2 of the four-tier router taxonomy; permission-gated per-tenant on `canDo('agent.iterative')` with staged rollout per §13 (default-off → admin opt-in → gradual ramp). The gate is a correctness guard against 17× error-amplification on low-value turns — not a timeline deferral.

The permission gate is the only thing between a router-classified iterative plan and execution: absent `canDo('agent.iterative')`, the plan is rejected at orchestrator selection and the turn falls through to disambiguation (never a silent downgrade to bounded — silent downgrade would hide the classifier's signal from observability).

## 17. Out of Scope

- **Per-iteration synthesizer (live narration).** Deferred to Beta per §3.1; UX demand signal from iterative-turn observations gates activation.
- **LLM-judge completion scorers.** Rejected until plan 10 meta-eval clears (R-12.11); opens a prompt-injection vector at the exit gate (see §9 Security).
- DAG / arbitrary graph execution (§16 Out of Scope — iterative is the chosen alternative).
- Mid-turn topology switch (router decides at entry; no switching mid-turn).
- Inline surface iterative (hard contract — inline is bounded-only per §3).
- Tenant-specific iteration cap configuration (default only; add if customer asks).

## 18. Open Questions

- **Router classification heuristic at MVP activation.** Keyword/pattern match? Explicit user toggle? Start with product-tunable allowlist of iterative-apt patterns; layer classification ML at GA if needed.
- **Re-plan context size management.** When iteration history exceeds N, compress older iterations via nano summarizer. Default N = 5 iterations raw, older compressed. Tune.
- **Async iterative checkpoint granularity.** pg-boss retry of an iterative turn — does it resume from last-iteration or restart from iteration 1 with same budget? Simpler at Beta: restart from 1; reconsider if retries become common.
- **Wallclock ceiling for iterative.** 60s default; specific per-surface configurability? Owner: product.
- **Cost-budget for iterative vs bounded.** Iterative naturally costs more; separate ceiling or same? Recommend: same budget, different expected utilization profile; monitor and tune.
- **Topology-downgrade-candidate signal threshold.** What rate triggers operator review? Start at 2% sustained over 24h.
