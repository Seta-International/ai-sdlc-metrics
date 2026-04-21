# 03 — Two-phase Bounded Execution + Synthesizer

**Design §§:** §3 (Runtime Topology), §4 (Execution Loop), §9 (Synthesizer).

## Revision 2026-04-22

Production-ready-comprehensive revision reflecting the 2026-04-22 runtime-design update (architecture §3: Topology tier selection + Phase-2 fan-out + sanitization contract). Items previously deferred are promoted to MVP; scope now spans the 3-module integration surface against the 12-module core (EI-1..EI-10).

Changes in this revision:

- **Tier 0 (direct execution) promoted to MVP.** Router may emit a `direct` topology that skips sub-agent + synthesizer entirely; gateway executes a single opt-in tool and a deterministic formatter renders the result.
- **Phase-2 fan-out.** Phase 2 is now a list of up to 3 sub-agent calls (was: at most one). Phase-2 sub-agents run in parallel.
- **Per-Phase-2-sub-agent sanitization.** `project_to_schema` runs once per Phase-2 sub-agent against that sub-agent's own `inputSchema`, not once globally across a merged payload.
- **Router plan shape.** `RouterPlan` discriminates on `topology: 'direct' | 'bounded' | 'iterative'`; the bounded shape carries `phase1` and `phase2` as lists.
- **New requirements, observability, and safety rails** for Tier 0 allowlist, confidence floor, auto-downgrade emission, Phase-2 length cap, and the turn-level cost-ceiling worst-case accounting.

---

## 1. Scope

### In

- Phase-execution orchestrator consuming the router plan from plan 02.
- **Tier 0 direct execution branch.** When the router emits `{ topology: 'direct', toolName, args, confidence }`, the gateway executes a single tool call; a lightweight deterministic formatter renders the result; no sub-agent is instantiated and no synthesizer call is made. Opt-in per tool via a `directExecutable: true` tool-meta flag.
- Phase 1 parallel fan-out to ≤3 sub-agents with independent inputs from the router directive.
- **Phase 2 parallel fan-out to 0..3 sub-agents** (was: one optional sub-agent). Each Phase-2 sub-agent receives input built from sanitized Phase-1 outputs.
- Sub-agent ReAct loop (bounded 4-5 iterations) wrapped around Vercel AI SDK `ToolLoopAgent` with `maxRetries: 0`.
- Phase-handoff sanitization via `project_to_schema` (field-drop projection only). **Sanitizer runs once per Phase-2 sub-agent** against that sub-agent's own `inputSchema` — never once globally.
- Plan-shape-mismatch detection with one bounded re-plan, then escalate to disambiguation.
- Circuit breaker state (per-tool, per-sub-agent) propagated across phase boundary via sanitized summary.
- Partial-answer gate (ceiling hit + zero writes drafted → surface partial labeled).
- Synthesizer: structured multi-source input → typed output shape + citations + confidence.
- Rule-based confidence derivation (not LLM self-assessed).
- Contradiction rendering as definitional clarity.
- Directive `quote` sanitization: `project_to_schema(utterance, target_sub_agent_scope)` at directive construction time.

### Out

- Router LLM call itself (plan 02).
- Tool invocation mechanics (plan 01).
- Memory injection / L1 cache (plan 04).
- Streaming event emission (plan 06; this plan _emits_ logical events, 06 owns the wire contract).
- Cost enforcement mechanics (plan 05; this plan defines the ceiling consumption point).
- Cancellation signal propagation (plan 06; this plan _respects_ the threaded signal).
- Iterative supervisor topology (plan 12).

---

## 2. Design Context

Our runtime is **not** a supervisor loop. The router produces a plan up-front and phase-execution code executes it deterministically (§3 architectural invariant). Sub-agents are homogeneous, do not re-plan, and cannot call other sub-agents. This invariant is load-bearing for cost predictability (every turn has a known maximum LLM call count), replay determinism (no runtime-decision divergence), and turn-scoped taint (taint persists within a single turn; iterative re-entry would blur the boundary).

Two-phase bounded execution fits the vast majority of HR / Time / Projects / Finance / KPI queries — retrieve from up to 3 domains in parallel, optionally aggregate in one additional sub-agent, synthesize. Queries that don't fit escalate to disambiguation, NOT to a wider plan. This is a taste call that makes cost + correctness predictable at the expense of some UX flexibility.

Inside a sub-agent we use pure ReAct with 4-5 iteration max, wrapped around Vercel AI SDK `ToolLoopAgent`. The AI SDK's own retry is disabled (`maxRetries: 0`) so retries live at exactly one layer — the gateway (plan 01). Stacked retries silently inflate cost (§4).

Phase 2 is deliberately optional and capped at 3 sub-agents in parallel (the 2026-04-22 revision generalized the earlier single-sub-agent cap): it's there for aggregation / cross-cutting follow-ups across phase-1 results (e.g. "compare these three", "synthesize KPIs against these team rosters"), not for pipeline depth. Phase 2 is still a single fan-out step — there is no phase 3. Anything requiring deeper chaining escalates.

Synthesizer input is **structured multi-source** (summary + semantics + confidence + provenance per source), not concatenated text. This is what makes definitional-clarity rendering cheap — the synthesizer can say "5 projects by measure A; 6 projects by measure B" because each sub-agent declared its semantics. Confidence is rule-derived (§9) from observable properties of the sub-agent's execution, not LLM self-assessed, because LLM-reported confidence is noisy and under-reports on wrong answers.

**Rejected alternatives:**

- Supervisor / iterative loops (what mastra ships, spike 01) — chosen for plan 12 (Beta activation-gated) specifically for open-ended tasks; not the bounded default.
- DAG / phase 3+ execution — §16 Out of Scope. Iterative topology covers the "complex plan" case better.
- Pre-aggregating per-iteration synthesis — §16 GA gate. MVP synthesizes once.

**Prior-art review — what was adopted and what was rejected.** Claude Code's execution loop (`query.ts`, `QueryEngine.ts`, `services/tools/StreamingToolExecutor.ts`, `services/compact/autoCompact.ts`) was reviewed as prior art. Two patterns are confirmed aligned: (a) fine-grained loop-termination taxonomy with distinct reasons (we mirror in `SubAgentOutput.kind`); (b) circuit-breaking consecutive failures (we adopt for re-plan via `router_replan_count ≤ 1`). Four patterns were explicitly **rejected** because they fit an interactive developer CLI, not a stateless business-AaaS turn: (i) **Mid-turn user input / REPL-style yield-and-resume** — our turns are atomic; any "ask for clarification" path is disambiguation (R-03.5), not mid-sub-agent pause. (ii) **Tool-result-then-synthesis interleaving** — synthesis is a strict phase boundary after all phase-1 (and optional phase-2) outputs; no per-sub-agent incremental synthesis. (iii) **Filesystem / cross-turn state restoration on restart** — turn state is request-scoped and discarded at turn end; restart = new turn = fresh L1 (plan 04). (iv) **Fuzzy confidence thresholds for partial answers** — the gate is rule-based (ceiling hit + zero writes), not a magnitude threshold, to keep operator semantics unambiguous.

---

## 3. Data Model

### Turn state (in-memory, request-scoped)

Not a DB table; lives in the request handler. Threaded as a parameter to every component.

Key fields:

- `trace_id`, `tenant_id`, `user_id`, `conversation_id`, `surface`.
- `session_id` (points to `agent_session` row from plan 02).
- `tainted: boolean` — starts `false`; flips when a tenant-authored free-text field enters any tool result (plan 01 gateway).
- `circuit_breaker: Map<tool_name, { failed_count: number, permission_denied: boolean }>` per sub-agent.
- `l1_read_cache: Map<sub_agent_key, Map<(tool, args_hash), result>>` (plan 04 owns implementation).
- `phase_1_results: Map<sub_agent_key, SubAgentOutput>`.
- `phase_2_results: Map<sub_agent_key, SubAgentOutput>` — up to 3 entries (Phase-2 is now a fan-out list).
- `router_replan_count: 0 | 1`.
- `plan_topology: 'direct' | 'bounded' | 'iterative'` — captured from `RouterPlan.topology` at turn entry; governs which control-flow branch runs. Tier 0 (`direct`) turns carry no `phase_1_results` / `phase_2_results`.
- `ceiling_consumed: { wallclockMs, costUsd, iterationsPerSubAgent, bytesScannedPerTool }`.

Turn state is discarded at turn end — no persistence. L2/L3 writes happen through plan 04 interfaces.

### No new tables

Plan 00-02 cover persistence; this plan is orchestration only.

---

## 4. Interface Contracts

### `RouterPlan` (produced by plan 02)

`RouterPlan` is a discriminated union over `topology`. Three variants:

- **`DirectExecutionPlan`** — `{ topology: 'direct', toolName, args, confidence, intent_slug, flow_id }`. Single tool, zero sub-agents, zero synthesizer call. Subject to Tier-0 allowlist + confidence-floor rails (§5).
- **`BoundedPlan`** — `{ topology: 'bounded', phase1: SubAgentCall[] (length 1..3), phase2: SubAgentCall[] (length 0..3), intent_slug, flow_id }`. Phase 1 and Phase 2 are BOTH lists; Phase 2 may be empty. Sanitizer runs once per Phase-2 entry.
- **`IterativePlan`** — shape unchanged from plan 02; handled by plan 12 (Tier 2 MVP, activation-gated).

`SubAgentCall` is the existing `SubAgentDirective` shape (`{ subAgentKey, goal, constraints, expectedOutputShape, quote }`) — renamed for symmetry with the three-topology vocabulary; `quote` remains router-controlled and scope-projected.

A `disambiguation` escape is still modeled as a sibling discriminator (`{ topology: 'disambiguation', question }`) mutually exclusive with the execution variants.

### `PhaseExecutor` (module boundary)

```
execute(opts: {
  plan: RouterPlan;
  turnState: TurnState;
  abortSignal: AbortSignal;
  streamEmitter: StreamEmitter;        // plan 06 logical-event emitter
}): Promise<PhaseExecutionResult>

type PhaseExecutionResult =
  | { kind: 'synthesized'; answer: SynthesizerOutput; drafts: DraftProposal[] }
  | { kind: 'disambiguation'; question: string }
  | { kind: 'partial'; answer: SynthesizerOutput; reason: 'limit_reached' }
  | { kind: 'aborted'; reason: CancellationReason }
```

### `SubAgentRunner` (module boundary; one instance per sub-agent invocation)

```
run(opts: {
  directive: SubAgentDirective;
  config: ValidatedSubAgentConfig;
  turnState: TurnState;
  abortSignal: AbortSignal;
  phase: 1 | 2;
  phase1SanitizedSummary?: SanitizedPhase1;   // only present at phase 2
  streamEmitter: StreamEmitter;
}): Promise<SubAgentOutput>

type SubAgentOutput = {
  kind: 'completed' | 'ceiling_hit' | 'all_tools_disabled' | 'errored' | 'aborted';
  abortReason?: CancellationReason;    // populated iff kind === 'aborted'
  summary: string;
  semantics: string;          // what was measured
  confidence: 'high' | 'med' | 'low';
  sourceToolProvenance: ToolCall[];
  structured: unknown;        // validated against config.outputSchema
  drafts?: DraftProposal[];
  circuitBreakerState: Record<ToolName, { disabled: boolean; reason: string }>;
  usageTotals: { inputTokens; outputTokens; inputCachedRead; inputCachedWrite; outputReasoning; costUsd };
}

type DraftProposal = {
  // ... (plan 08 owns full shape; this plan contributes provenance)
  taintSource?: {
    subAgentKey: string;       // which sub-agent's sibling tool call caused the taint flip
    toolName: string;          // the tool whose result contained tenant-authored free text
    fieldName: string;         // the declared `tenantAuthoredFreeText` field that tripped taint
    flippedAtIteration: number;
  };
  // Remainder of DraftProposal owned by plan 08 (R-08.x).
}
```

### `Sanitizer` (shipped in plan 00; reused)

```
project_to_schema<T>(source: unknown, schema: ZodType<T>): T
```

Pure; errors on shape mismatch.

### `Synthesizer` (module boundary)

```
synthesize(opts: {
  directive: RouterPlan;
  phase1Outputs: Map<SubAgentKey, SubAgentOutput>;
  phase2Outputs: Map<SubAgentKey, SubAgentOutput>; // 0..3 entries (Phase-2 fan-out)
  turnState: TurnState;
  userUtterance: string;   // used for tone, never directly templated into output
  abortSignal: AbortSignal;
  streamEmitter: StreamEmitter;
}): Promise<SynthesizerOutput>

type SynthesizerOutput = {
  shape: AnswerShape;
  content: unknown;         // shape-specific: string | Array | TableData | ChartData | Narrative
  citations: Citation[];
  confidence: 'high' | 'med' | 'low';  // min of sub-agent confidences + contradiction demotion
  turnEndedReason: 'completed' | 'partial';
}

type Citation = {
  claim: string;             // paragraph or sentence this cites
  sources: ToolCall[];       // one or more source tool invocations
  subAgentKey: string;       // which sub-agent's chain produced this claim (paragraph can have siblings w/ different keys)
}
```

### `RouterReplanner` (consulted once per turn)

```
requestReplan(opts: {
  originalPlan: RouterPlan;
  phase1Outputs: Map<SubAgentKey, SubAgentOutput>;
  mismatch: { phase2Required: string[]; phase1Missing: string[] };
  turnState: TurnState;
}): Promise<RouterPlan | { escalate: 'disambiguation'; reason: string }>
```

Only invoked when phase-1 output can't satisfy phase-2 input schema; increments `turn_state.router_replan_count`.

---

## 5. Control Flow

### Tier 0 — direct execution (first match at phase-execution entry)

1. Receive `RouterPlan` from plan 02. If `plan.topology === 'direct'`, branch here and SKIP sub-agent instantiation + synthesizer call entirely.
2. Validate against the Tier-0 allowlist: the tool referenced by `plan.toolName` must declare `directExecutable: true` in tool meta (§ Safety rails).
3. Invoke `ToolGateway.invoke({ toolName, args, ... })` (plan 01) exactly once.
4. Pass the gateway result through the lightweight deterministic formatter bound to the tool's `directExecutable` contract (pure projection; no LLM call).
5. Emit SSE tokens from the formatter output and close the turn. Emit `turn.ended.reason: 'completed'`.
6. On gateway error, confidence-floor breach, or tripwire: emit `router_tier0_declined_confidence` (plan 07) and end the turn. The router is NOT auto-retried from phase execution — a downgrade to `bounded` requires a fresh router emission on the next turn (see Safety rails).

### Control-flow safety rails (Tier 0)

- **`directExecutable` allowlist — build-time drift test.** A test at plan-build time asserts that every tool carrying `directExecutable: true` is a pure read (`.query()`) AND declares zero `tenantAuthoredFreeText` fields in its output schema. Any tool violating this is rejected at build time (see R-03.x below).
- **`directExecutable` allowlist — runtime guard.** At the top of the Tier-0 branch, phase-executor re-checks the referenced tool against the allowlist before calling the gateway. A mismatch (router hallucinated a non-allowlisted tool) emits `router_tier0_declined_confidence` and ends the turn.
- **Confidence floor.** If `plan.confidence` < the per-surface floor, abandon Tier 0, emit `router_tier0_declined_confidence`, and end the turn. No automatic downgrade to `bounded`: the router must re-emit a fresh plan on a subsequent turn. This prevents infinite downgrade loops where Tier-0 failure triggers a bounded fallback which loops back into Tier-0 on re-plan.

### Happy path — bounded, phase 1 + phase 2 fan-out

1. Receive `RouterPlan` from plan 02. Validate topology `bounded`, `phase1.length ∈ [1,3]`, `phase2.length ∈ [0,3]`.
2. Emit `phase.started` logical event for phase 1 with sub-agent domains.
3. For each phase-1 directive in parallel:
   a. Instantiate `SubAgentRunner` bound to the sub-agent's config.
   b. Call `run({ directive, phase: 1, ... })`. ReAct loop bounded by `config.budgets.maxIterations`.
   c. Each iteration: model picks tool, calls `ToolGateway.invoke(...)` (plan 01) via Vercel AI SDK `ToolLoopAgent`, receives result, may iterate. On completion, sub-agent produces `SubAgentOutput` validated against `config.outputSchema`.
4. All phase-1 sub-agents complete OR tripwire. Collect `phase1Outputs`.
5. **Phase-shape check:** if `plan.phase2` is non-empty, verify for EACH phase-2 directive independently that its own `inputSchema` is satisfied by the union of `phase1Outputs.structured`.
   - If any phase-2 directive's input schema is unsatisfied → invoke `RouterReplanner.requestReplan(...)`. If it returns a new plan, re-enter phase 1 with new directives. If it returns `escalate`, end turn with `disambiguation`.
6. If `plan.phase2` is non-empty: **fan out** — spawn all phase-2 sub-agents in parallel. For each phase-2 directive, build its input via `project_to_schema(phase1Outputs_merged, thisSubAgent.inputSchema)` — the sanitizer runs ONCE PER PHASE-2 SUB-AGENT against its own schema (never once globally against a shared merged payload). Run each phase-2 sub-agent through `SubAgentRunner.run(..., phase: 2)`.
7. Emit `phase.started` for phase 2 (with the phase-2 sub-agent domains) if phase 2 ran.
8. All phase-2 sub-agents complete OR tripwire. Collect `phase2Outputs`.
9. Invoke `Synthesizer.synthesize({ phase1Outputs, phase2Outputs, ... })` — synthesizer receives the FULL set of phase-1 + phase-2 outputs as structured multi-source input.
10. Synthesizer emits `answer.shape_declared` (if non-narrative), streams `answer.token`, emits `answer.complete`, and returns.
11. Return `{ kind: 'synthesized', answer, drafts }`.

### Plan-shape mismatch (one bounded re-plan)

1. Phase 1 completes; phase-2 input can't be satisfied.
2. `turn_state.router_replan_count === 0` → call `RouterReplanner.requestReplan(...)` with the observed shape mismatch.
3. Replanner re-invokes the router LLM with the mismatch context. Returns a new plan (different phase-1 selections or no phase-2) OR `escalate`.
4. `turn_state.router_replan_count = 1`.
5. Emit observability signal `router_rechose_after_replan` (plan 07).
6. If replanner returned a new plan, re-enter phase execution from step 1.
7. If second mismatch → emit disambiguation event, end turn with `kind: 'disambiguation'`.

### Circuit breaker propagation to phase 2

1. In phase 1, sub-agent A hits a second failure of tool X → tool X disabled for remainder of A (plan 01 owns this).
2. A's `SubAgentOutput.circuitBreakerState['X'] = { disabled: true, reason: 'failure_threshold' }`.
3. When building phase-2 directive, phase-executor includes context note: "Tool X unavailable this turn."
4. Phase-2 sub-agent sees this as part of its directive / context — its own circuit-breaker starts fresh but the narrative warning is present.

### Ceiling hit + partial-answer gate

1. Sub-agent exceeds wallclock / iteration / cost during ReAct.
2. `ToolLoopAgent` receives tripwire; `SubAgentRunner` captures `kind: 'ceiling_hit'` with whatever `SubAgentOutput.structured` was built.
3. Other phase-1 sub-agents continue running. Phase executor decides post-completion:
   - Zero writes drafted across any sub-agent → invoke synthesizer against whatever outputs exist; return `{ kind: 'partial', answer, reason: 'limit_reached' }`. Synthesizer output labeled "partial — limit reached."
   - One or more writes drafted → return `{ kind: 'partial', ... }` but SUPPRESS the partial answer (writes-only guard; drafts still proposed).
4. Emit `turn.ended.reason: 'budget'` (if cost ceiling) or `'timeout'` (if wallclock).

### Abort mid-turn

1. `abortSignal.aborted` becomes `true`.
2. Propagates through `AbortSignal.any` composition (plan 06) to every `ToolLoopAgent` + pending `generateObject` call.
3. In-flight sub-agents receive abort at next tool-call boundary or LLM-call boundary. Each such sub-agent's runner returns `SubAgentOutput` with `kind: 'aborted'` and `abortReason` copied from the signal; the partial `structured` payload (if any) is retained for audit but not surfaced.
4. Drafted-not-submitted writes discarded.
5. Synthesizer NOT invoked.
6. Phase executor returns `{ kind: 'aborted', reason }`.

### Contradiction rendering in synthesizer

1. Phase-1 has sub-agent A return `summary: "5 projects"` with `semantics: "has logged hours this month"`.
2. Phase-1 has sub-agent B return `summary: "6 projects"` with `semantics: "status != closed"`.
3. Synthesizer detects numeric mismatch + semantic difference.
4. Output prose uses definitional-clarity pattern: _"5 projects with logged hours this month (timesheet); 6 projects currently in active state (project registry)."_
5. Citations attribute each claim to its sub-agent's tool calls.
6. Confidence demoted one tier: if both were `high`, final confidence is `med`.

### Confidence derivation (rule-based)

Per sub-agent, computed by the runner from trace signals (NOT from the LLM):

- `high` iff: answer directly corroborated by ≥1 tool result, zero retries, zero tool failures, no taint flip during this sub-agent's iterations.
- `med` iff: single source (no corroboration), or retries/circuit-breaker events occurred, or partial tool results returned.
- `low` iff: taint flipped during sub-agent run, or a ceiling was hit, or declared semantics differ from a sibling sub-agent's output.

Synthesizer takes MIN across contributing sub-agents, then applies one-step demotion on detected contradiction.

### Directive `quote` sanitization

When the router constructs each phase-1 directive's `quote` field:

1. Take the user utterance slice the router selected.
2. Apply `project_to_schema(slice, target_sub_agent_readable_scope)` — uses the sub-agent's `memoryScope.reads` + permission context to drop fields the sub-agent couldn't read directly.
3. The projected `quote` is what appears in the directive. Phase-2's directive applies the same projection per its own scope.

This prevents the cross-sub-agent leak class where sub-agent A's `quote` contains B-only-readable utterance context.

---

## 6. Requirements

### Router plan + phase execution

| #       | Requirement                                                                                                     | Design §§                  |
| ------- | --------------------------------------------------------------------------------------------------------------- | -------------------------- |
| R-03.1  | Router plan validates: `topology=bounded`, `phase1.length ∈ [1,3]`, `phase2` optional with single entry         | §3                         |
| R-03.2  | `SubAgentDirective = { subAgentKey, goal, constraints, expectedOutputShape, quote }`                            | §3, §8                     |
| R-03.3  | Sub-agents receive directive, NEVER raw user utterance                                                          | §8                         |
| R-03.4  | Router exits after plan; code executes; sub-agents do not re-plan                                               | §3 architectural invariant |
| R-03.5  | Escalation to disambiguation emitted when intent does not fit 3+1; no wider plan invented                       | §3                         |
| R-03.6  | Phase 1 sub-agents fan out in parallel; each sub-agent's internal DB queries remain sequential (CLAUDE.md rule) | §3                         |
| R-03.7  | Phase 2 starts after all phase-1 complete (success or tripwire)                                                 | §3                         |
| R-03.8  | Phase-2 input built via `project_to_schema(phase1_merged, phase2_inputSchema)`                                  | §3                         |
| R-03.9  | Sanitization is field-drop only — no value transformation / computed fields / coercion                          | §3                         |
| R-03.10 | Plan-shape mismatch → one bounded re-plan → escalate to disambiguation if second mismatch                       | §3                         |
| R-03.11 | One bounded re-plan emits `router_rechose_after_replan` observability signal                                    | §3.1, §12                  |

### Sub-agent loop

| #       | Requirement                                                                           | Design §§ |
| ------- | ------------------------------------------------------------------------------------- | --------- |
| R-03.12 | Sub-agent internal loop = pure ReAct; no nested planning                              | §4        |
| R-03.13 | Max 4-5 iterations per sub-agent (tuned per `config.budgets`)                         | §4        |
| R-03.14 | Wallclock ceiling per sub-agent (default 15s, tunable)                                | §4        |
| R-03.15 | Cost ceiling per sub-agent (plan 05 owns enforcement; this plan defines the hook)     | §4, §13   |
| R-03.16 | Vercel AI SDK `maxRetries: 0` — retries live at gateway only                          | §4        |
| R-03.17 | `SubAgentOutput.structured` validated against `config.outputSchema` at sub-agent exit | §3        |

### Circuit breaker + ceilings + partial

| #       | Requirement                                                                                       | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------- | --------- |
| R-03.18 | Circuit-breaker state from plan 01 propagates to phase 2 via sanitized summary context note       | §4        |
| R-03.19 | Partial-answer gate: ceiling hit + zero writes → partial answer labeled "partial — limit reached" | §4        |
| R-03.20 | Partial-answer suppressed if any write was drafted this turn (writes-only guard)                  | §4        |

### Synthesizer

| #       | Requirement                                                                                                     | Design §§ |
| ------- | --------------------------------------------------------------------------------------------------------------- | --------- | ----- | --------- | -------------------------------------------------------------------- | --- |
| R-03.21 | Synthesizer input is structured multi-source: `[{ summary, semantics, confidence, sourceToolProvenance }, ...]` | §9        |
| R-03.22 | Confidence rule-derived; NOT LLM self-assessed                                                                  | §9        |
| R-03.23 | Contradiction rendered as definitional clarity, not disagreement framing                                        | §9        |
| R-03.24 | Output shapes enumerated: `short-answer                                                                         | list      | table | narrative | chart`. Table declares columns; chart returns series+axes, not prose | §9  |
| R-03.25 | Global chat: synthesizer picks shape based on query nature                                                      | §9        |
| R-03.26 | Inline copilot: router declares `expectedOutputShape` in directive; synthesizer constrained to it               | §9        |
| R-03.27 | Citations paragraph-level default; claim-level when multiple sources contribute to same paragraph               | §9        |
| R-03.28 | Global chat synthesizer uses full reasoning model; inline uses nano                                             | §9        |
| R-03.29 | For non-narrative shapes, `answer.shape_declared` fires BEFORE first `answer.token`                             | §9, §15   |

### Quote sanitization

| #       | Requirement                                                                                               | Design §§                                      |
| ------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| R-03.30 | Directive `quote` is projected per target sub-agent's readable scope before being passed to the sub-agent | §3 (added in plan 03 open question resolution) |

### Permission-denied + errored sub-agent disclosure

| #       | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Design §§              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| R-03.31 | When any phase-1 sub-agent returns `kind: 'all_tools_disabled'` or `kind: 'errored'`, the synthesizer MUST include an explicit per-sub-agent status disclosure in its output (e.g. narrative: _"Timesheet data not retrieved — your role lacks the required permission."_; table/list: a dedicated status row). Silently omitting the failed sub-agent is forbidden. Rationale: transparency over coherence (§9); a permission gap is actionable information the user can follow up on with an admin. | §9, transparency tenet |
| R-03.32 | `DraftProposal.taintSource` is populated by the sub-agent runner whenever the draft is produced under a tainted turn state. Fields: `{ subAgentKey, toolName, fieldName, flippedAtIteration }`. Consumed by plan 08 for approval-tier bump rationale + UI presentation.                                                                                                                                                                                                                               | §9, plan 08            |
| R-03.33 | `Citation.subAgentKey` is populated on every citation. Synthesizer MUST NOT merge citations from different sub-agents into a single record that loses the per-key attribution.                                                                                                                                                                                                                                                                                                                        | §9 transparency        |

### Topology tier selection + fan-out + sanitization (2026-04-22 revision)

| #       | Requirement                                                                                                                                                                                                                                       | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-03.34 | Router emits exactly one of three plan topologies: `direct`, `bounded`, or `iterative`. Phase executor dispatches on `plan.topology`; unknown values are rejected at plan-entry.                                                                  | §3        |
| R-03.35 | A tool declaring `directExecutable: true` is rejected at build time if it is a `.mutation()` OR declares any field as `tenantAuthoredFreeText`. Enforced by a plan-build drift test (see §11). Phase executor re-checks the allowlist at runtime. | §3        |
| R-03.36 | Tier 0 auto-downgrade on confidence-floor breach, allowlist-mismatch, or gateway error: emit `router_tier0_declined_confidence` (plan 07) and end the turn. The router is NOT auto-retried from phase execution — re-plan requires a fresh turn.  | §3        |
| R-03.37 | `plan.phase2.length ≤ 3`. Enforced at the router output-schema level (plan 02) AND re-validated at phase-executor entry. A plan with `phase2.length > 3` is rejected as a shape violation.                                                        | §3        |
| R-03.38 | Sanitizer runs ONCE PER PHASE-2 SUB-AGENT against that sub-agent's own `inputSchema`, not once globally against a shared merged payload. Each Phase-2 sub-agent sees only the fields its own input schema declares.                               | §3        |
| R-03.39 | Turn-level cost ceiling (§13) must be sized against the worst-case sub-agent count: up to 3 Phase-1 + 3 Phase-2 = 6 × per-sub-agent budget, plus one synthesizer call. Plan 05 enforces; this plan declares the accounting assumption.            | §13       |

---

## 7. Failure Modes & Recovery

| Failure                                                              | Symptom                                                                                                                                        | Recovery                                                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Router plan violates shape                                           | Immediate error in phase executor entry                                                                                                        | Treat as parse failure; escalate to disambiguation.                                                                                      |
| Phase-1 sub-agent's `SubAgentOutput` fails `outputSchema` validation | Runner captures `kind: 'errored'`; synthesizer still invoked with whatever valid outputs exist and discloses the failure narratively (R-03.31) | If all phase-1 fail, end turn `kind: 'partial'` with reason = outputs-invalid; log as P2.                                                |
| Phase-shape mismatch                                                 | Replanner invoked once                                                                                                                         | Second mismatch → disambiguation.                                                                                                        |
| Sub-agent ReAct exceeds iteration ceiling                            | `SubAgentOutput.kind = 'ceiling_hit'`; partial content captured                                                                                | Partial-answer gate evaluates at phase-executor level.                                                                                   |
| All tools disabled mid-sub-agent (permission denials)                | `kind: 'all_tools_disabled'`; sub-agent's best-effort summary                                                                                  | Synthesizer receives as `low` confidence source AND emits explicit per-sub-agent status disclosure per R-03.31 (never silently dropped). |
| Synthesizer LLM call fails                                           | Retry-with-jitter per §4 LLM-provider class                                                                                                    | Two failures → `turn.ended.reason: error`.                                                                                               |
| Abort mid-sub-agent                                                  | `ToolLoopAgent` abort at next await                                                                                                            | Turn ends `kind: 'aborted'`. Drafted writes discarded.                                                                                   |
| Contradiction in semantics that synthesizer can't render             | Fallback: list each sub-agent's result as separate paragraphs with explicit header                                                             | Never merge-by-average; transparency over coherence.                                                                                     |
| Phase-2 sub-agent input schema requires fields phase-1 didn't return | Phase-shape mismatch → replan path                                                                                                             | One re-plan, then escalate.                                                                                                              |

---

## 8. Observability Surface

### Spans

- `TURN` (root, entity `ROUTER` at start, with `trace_id`, `tenant_id` auto-stamped).
- `PHASE_1` — parent of parallel sub-agent spans.
- `SUB_AGENT_PLAN` — router → sub-agent-runner setup.
- `SUB_AGENT_TOOL_CALL` × N — tool calls within ReAct.
- `SUB_AGENT_SYNTHESIS` — per-sub-agent output-schema validation + confidence derivation.
- `PHASE_2` (if phase 2 ran) — parent of phase-2 sub-agent tree.
- `SYNTHESIZER` — multi-source merge + shape-specific rendering.
- `FINAL`.

### Span attributes

- On `TURN`: `plan.topology` (`direct | bounded | iterative`), `router_replan_count`, `partial_answer_surfaced`, `contradiction_detected`, `sub_agent_count_phase1`, `sub_agent_count_phase2` (0..3 under the Phase-2 fan-out model; replaces the old boolean `phase2_present`).
- On Tier 0 (`direct`) turns: `tier0.toolName` is stamped on the `TURN` span so traces filterable by directly-executed tool; the `PHASE_1` / `PHASE_2` / `SYNTHESIZER` spans are absent.
- Phase-2 fan-out emits ONE span per Phase-2 sub-agent (mirroring the Phase-1 parallel span pattern), each carrying its own `sub_agent_key` + schema hashes + derived confidence.
- On each `SUB_AGENT_PLAN`: `sub_agent_key`, `sub_agent_version`, `input_schema_hash`, `output_schema_hash`, confidence_derived tier, `ceiling_hit: boolean`.
- On `SYNTHESIZER`: `answer_shape`, `citation_count`, `contradiction_rendered: boolean`, `confidence_final`.

### Metrics

- `agent_phase_execution_duration_ms{phase}` — histogram.
- `agent_sub_agent_outcome_total{outcome}` — outcome: `completed | ceiling_hit | all_tools_disabled | errored | aborted`.
- `agent_synthesizer_shape_total{shape}` — shape distribution.
- `agent_contradiction_detected_total{tenant_id}` — counter.
- `agent_partial_answer_surfaced_total{reason}` — counter.

### Dashboards

- Phase-1 parallelism utilization (are we actually running in parallel, or serializing due to a bug?).
- Re-plan fire rate (alert if >2% sustained — router taste regression).
- Contradiction detection rate per tenant pair (high rate may indicate genuine data inconsistency worth a product conversation).

---

## 9. Security Considerations

- **Taint propagation:** when phase-1 sub-agent A's tool returns tenant-authored free text, plan 01 flips `turnState.tainted = true`. Phase-2 sub-agent B inherits this — any writes B drafts are approval-tier-bumped regardless of whether B itself touched tainted data.
- **Sanitization projection:** `project_to_schema` is pure field-drop. It cannot transform values (cannot bucket, aggregate, or coerce). Complex aggregation is the producer sub-agent's responsibility, not the sanitizer's. This prevents a class of silent-data-leak bugs where a "privacy-preserving" bucketing function produces wrong numbers.
- **Directive `quote` scope projection:** resolves the cross-sub-agent leak class where router-selected utterance content survives into a sub-agent whose scope couldn't read it directly.
- **ReAct sub-agents cannot call sub-agents:** enforced by `toolScope` — no sub-agent's scope includes another sub-agent as a tool. Prevents sub-agent-chain escalation.
- **Synthesizer user-utterance handling:** `userUtterance` passed as tone-only input; never templated directly into the output. The synthesizer LLM has the utterance in context for tonal alignment but should not echo it verbatim. Tested via seed: an utterance containing `<script>` tags should not appear in the output payload.

---

## 10. Performance Budget

| Operation                                            | p50     | p95     | p99                 |
| ---------------------------------------------------- | ------- | ------- | ------------------- |
| Phase-1 startup (3 sub-agents in parallel)           | <50ms   | <150ms  | <400ms              |
| Sub-agent ReAct (4 iterations, avg 2 tool calls)     | <3000ms | <8000ms | <12000ms            |
| Phase-2 input projection                             | <5ms    | <15ms   | <30ms               |
| Synthesizer LLM call (global chat)                   | <2000ms | <6000ms | <10000ms            |
| Synthesizer LLM call (inline, nano)                  | <500ms  | <1500ms | <3000ms             |
| Total turn wallclock (3-sub-agent + phase-2 + synth) | <8s     | <20s    | <30s (hard ceiling) |

30s wallclock = hard abort (plan 06). Budget assumes healthy LLM provider; degraded mode (plan 10) relaxes via tier fallback.

---

## 11. Testing Strategy

### Unit

- Phase-executor validates plan shape (rejects phase1 size 4).
- Confidence derivation: each rule table entry has a test case.
- `project_to_schema` reused from plan 00 — smoke-test phase-2 projection here.
- Partial-answer gate: ceiling+zero-writes → surfaces; ceiling+drafts → suppresses.
- Circuit-breaker propagation: phase-2 directive context includes "Tool X unavailable."

### Integration

- Happy path: router plan with 3 phase-1 + 1 phase-2 → all complete → synthesizer produces `answer.complete` with expected shape.
- Parallel phase-1: seed 3 sub-agents each taking ~2s → phase-1 completes in <3s (not 6s).
- Phase-shape mismatch: seed a phase-1 output missing a required phase-2 field → replan fires once → seed second mismatch → disambiguation emitted with `router_rechose_after_replan` signal.
- Contradiction: seed two sub-agents with numerically different answers + different `semantics` → synthesizer output contains both numbers with definitional-clarity prose; confidence demoted.
- Partial-answer: seed a ceiling hit mid-phase-1 with zero writes → partial surface with label; with writes drafted → partial suppressed, drafts still proposed.
- Abort: seed abort during phase 1 → abort propagates to all in-flight sub-agents → each returns `kind: 'aborted'` with `abortReason` populated → phase executor returns `kind: 'aborted'`; `turn.ended.reason: cancelled`.
- Permission-denied disclosure: seed one of three phase-1 sub-agents to return `kind: 'all_tools_disabled'`, others `kind: 'completed'` → synthesizer output contains an explicit per-sub-agent status line naming the denied sub-agent; failed sub-agent is NOT silently dropped.
- Taint lineage on draft: seed phase-1 sub-agent A tool returning tainted field, sub-agent B drafting a write after taint flips → draft's `taintSource` populated with `{ subAgentKey: 'A', toolName, fieldName, flippedAtIteration }`.
- Citation attribution: two sub-agents contribute to same synthesizer paragraph → citations for that paragraph include both `subAgentKey` values; merging citations across keys is rejected by a property test.
- `outputSchema` validation: seed a sub-agent returning wrong shape → runner captures `kind: 'errored'`; synthesizer still invoked with remaining outputs.

### Property

- Plan validation: for random `topology, phase1.length, phase2.length` tuples, executor accepts / rejects per §3 rules.
- Confidence MIN: for random sub-agent confidence combinations, synthesizer final confidence ≤ MIN of inputs.

### E2E

- One full turn in a test tenant: "what's overdue across my projects and timesheet?" → phase 1 fan-out → synthesizer → stream closes with `turn.ended.reason: completed`.
- Cross-tenant: same query in tenants A and B return tenant-scoped data with no cross-tenant leak.

### Fixtures

- `fixtures/plans/simple-single-sub-agent.json`
- `fixtures/plans/fan-out-3.json`
- `fixtures/plans/phase1-plus-phase2.json`
- `fixtures/plans/shape-mismatch-then-valid.json`
- `fixtures/sub-agent-outputs/happy-planner.json`
- `fixtures/sub-agent-outputs/ceiling-hit-partial.json`
- `fixtures/sub-agent-outputs/contradicts-sibling.json`

---

## 12. Acceptance Criteria

- All unit + integration + property + E2E tests pass.
- Exported trace span hierarchy matches §8 structure for each test scenario.
- Permission-denied disclosure present on every seeded `all_tools_disabled` scenario (R-03.31).
- `DraftProposal.taintSource` populated on every draft produced under a tainted turn (R-03.32).
- `Citation.subAgentKey` present on every citation; cross-key merging rejected (R-03.33).
- Phase-1 runs measurably in parallel (duration < sum of per-sub-agent durations).
- Replan fires at most once per turn (verified by trace attr `router_replan_count ≤ 1`).
- Cross-tenant seed test passes.
- Disambiguation fires on unfittable intents without executing any sub-agent.
- Contradiction output uses definitional-clarity prose (literal string pattern match on seeded scenarios).

---

## 13. Rollout Plan

- **Phase 1** — ship phase-executor + sub-agent-runner with one sub-agent (planner read-only). Synthesizer emits `narrative` shape only.
- **Phase 2** — add a second sub-agent; verify phase-1 parallelism.
- **Phase 3** — enable phase 2 (one sub-agent cross-domain aggregation); verify sanitization projection.
- **Phase 4** — full synthesizer shape set (`table`, `chart`, etc.) once plan 06 stream contract ships.
- **Phase 5** — canary 5% → 25% → 100%.

**Backout:** a regression in phase execution is a P1 — back out the PR; sub-agents can't run without the phase executor. A regression in synthesizer shape rendering can degrade to `narrative` via a feature flag.

---

## 14. Dependencies

- Plan 00: sanitizer + prompt/narrative stores.
- Plan 01: tool gateway pipeline — specifically the Tier-0 direct-execution invocation path + the `directExecutable` tool-meta flag propagation.
- Plan 02: router plan + sub-agent registry + permission narrative — specifically the three-topology `RouterPlan` discriminator (`direct | bounded | iterative`) and Phase-2 list output-schema validation.
- Plan 04: L1 cache + memory injection.
- Plan 05: cost ceiling enforcement hook (accounts for worst-case 3 + 3 fan-out per R-03.39).
- Plan 06: streaming event emitter + abort signal threading.
- Plan 07: trace correlation + span attrs — specifically `flow_id` correlation, the `plan.topology` / `tier0.toolName` span attributes, and the `router_tier0_declined_confidence` observability signal.
- Plan 08: draft proposals from sub-agent runner (this plan defines the shape; 08 consumes).

## 15. Integration Points

- `apps/api/src/modules/agents/application/services/phase-executor.ts` — new.
- `apps/api/src/modules/agents/application/services/sub-agent-runner.ts` — new; wraps Vercel AI SDK `ToolLoopAgent`.
- `apps/api/src/modules/agents/application/services/synthesizer.ts` — new.
- `apps/api/src/modules/agents/application/services/router-replanner.ts` — new; re-invokes router from plan 02 with mismatch context.
- `apps/api/src/modules/agents/domain/services/sanitizer.ts` (plan 00) — reused.
- `packages/ai-sdk` — `ToolLoopAgent`, `streamText`, `generateObject`.
- `ToolGateway` from plan 01.
- `SubAgentRegistry` from plan 02.
- Plan 06 `StreamEmitter` for logical events.
- Plan 07 observability context.

## 16. Activation Gate

MVP. Ships with the first production turn for ALL three tiers: Tier 0 (`direct`), Tier 1 (`bounded` with Phase-2 fan-out), and Tier 2 (`iterative`, coordinated with plan 12's supervisor topology).

Tier-0 allowlist at MVP is approximately 15-20 tools spanning the `planner`, `people`, and `projects` modules — the high-volume read-only "look this up" surface where a deterministic formatter is demonstrably better UX than a synthesizer paragraph. Tools earn `directExecutable: true` by meeting R-03.35 (pure read + zero `tenantAuthoredFreeText`). The allowlist is reviewed each quarter; additions ship behind the same activation gate.

## 17. Out of Scope

- Iterative topology (plan 12).
- Draft/approval workflow mechanics (plan 08; this plan surfaces drafts but doesn't handle the approval path).
- Memory layer implementations (plan 04).
- Streaming wire contract (plan 06).
- Cost-ceiling mechanics (plan 05 owns enforcement).

## 18. Open Questions

- **Synthesizer behavior on both `low` + `low` confidence.** Merge with disclosure or refuse? Tentative: merge with explicit narrative disclosure; refuse only on total tool failure. Revisit after first canary.
- **Replan context size.** What does the replanner send to the router to re-plan — just the mismatch, or the full phase-1 outputs? Risk: too much context balloons cost. Recommend: structured diff (what was requested vs. returned), not the full outputs.
- **Directive `quote` projection pinned in design doc.** Captured as R-03.30 here. Proposed a single-sentence addition to §3 design doc; owner to land that edit.
- **Synthesizer streaming + shape change mid-stream.** What if the synthesizer decides mid-generation that `table` was wrong and `narrative` is right? Proposal: once `answer.shape_declared`, shape is locked — mid-stream shape change = bug; emit `error` event and end turn. Verify.
- **Replan emit as new router LLM call or re-invocation with context injection.** Both work; cost difference is negligible. Recommend: full re-invocation with mismatch context appended to the developer message. Simpler to reason about.
