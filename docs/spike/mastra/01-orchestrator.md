# Key 1 — Multi-agent / Orchestrator

**Mastra area:** `packages/core/src/loop/network/`
**Our design area:** `agent-runtime.md` §3 (Runtime Topology), §2.1 (Runtime Layer), §17 (Open Seams)
**Investigation date:** 2026-04-21

---

## 1. How mastra does it

### Serial re-entry loop, not parallel fan-out

The network orchestrator is a `createWorkflow(...).dountil(iterationWithValidation)` at `loop/network/index.ts:2575-2582`. Each iteration:

1. Routing-agent picks **one** primitive.
2. Primitive executes.
3. Validation scorers run.
4. If not complete and not max-iterations → re-enter with feedback appended to memory.

Exit condition:

```typescript
return (llmComplete && validationOk) || maxReached
```

### Router is itself an `Agent`, not bespoke code

`getRoutingAgent()` at `loop/network/index.ts:132-220` constructs a regular `Agent` whose instructions are generated from live introspection:

```typescript
const agentsToUse = await agent.listAgents({ requestContext })
const workflowsToUse = await agent.listWorkflows({ requestContext })
const toolsToUse = await agent.listTools({ requestContext })
```

Each primitive's input schema is rendered inline as JSON Schema (lines 166, 176). The prompt is generated, not hand-written — drift between registry and router prompt is structurally impossible.

### Unified primitive type: `agent | workflow | tool | none`

`PRIMITIVE_TYPES` (imported from `../types`). Router picks any one per iteration.

### Completion is scorer-gated, not shape-bounded

`loop/network/validation.ts:96-145` defines `CompletionConfig`:

- `scorers: MastraScorer[]` — each returns `{ score: 0 | 1, passed, reason }`.
- `strategy: 'all' | 'any'`.
- `timeout: ms`, `parallel: boolean`.
- `suppressFeedback: boolean` — whether completion-check results persist to memory.

Max-iterations is the only non-scorer exit.

### Routing decisions live in the conversation as JSON

`filterMessagesForSubAgent` at `loop/network/index.ts:95-129` strips them when handing history to a sub-agent:

```typescript
if (parsed.primitiveId && parsed.selectionReason) return false
// and
if (metadata?.mode === 'network' || metadata?.completionResult) return false
```

Filter-on-read pattern depends on content parser. If the parser misses a shape, routing internals leak into sub-agent context.

### Router deliberately strips memory processors

`loop/network/index.ts:151-155`:

> "Memory processors (semantic recall, working memory) can interfere with routing decisions, but user-configured processors like token limiters should be applied."

Implemented via `listConfiguredInputProcessors` (user-set) vs. auto-added memory processors.

### Whole run is suspend/resume-capable

`shouldPersistSnapshot: ({ workflowStatus }) => workflowStatus === 'suspended'` (lines 2538, 2571). Network run can pause mid-iteration and resume from a persisted snapshot.

---

## 2. What this tells us

### Mastra's shape is what our v1 spec rejects — and that rejection needs revisiting

Our §2.1 currently says:

> Supervisor/iterative-loop frameworks are out of scope at this layer because they do not preserve the two-phase bounded invariant (§3), cost predictability, or deterministic replay without significant constraint work.

**This rejection is too broad.** The two-phase bounded shape is an excellent fit for **structured cross-domain Q&A** (the 60–100-tool HRM/KPI/Finance/Timesheet cases our doc centers on). It is a **bad fit** for genuinely open-ended tasks — "investigate why KPI X regressed," "fix this failing data pipeline," "build a report comparing these five projects over time." These need iterative re-entry with real re-planning; forcing them into two-phase either degrades fidelity or pushes them out of the agent runtime entirely (losing observability + taint + permission inheritance).

**Proposed stance shift:** mastra's iterative-loop is **a second supported topology**, not a competitor to two-phase bounded. Surface-selectable at router entry, not a runtime-wide switch. Inline copilots stay bounded (single sub-agent hard contract, §3). Global chat and async agents get an explicit `topology: 'bounded' | 'iterative'` decision produced by the router alongside the plan — the router already classifies intent; this is an additional classification axis, not a new component.

### Tensions that need resolving before iterative-loop can land safely

Including iterative-loop as a second topology creates real design questions that our current spec does not answer:

1. **Cost predictability.** Bounded has a hard cap (≤3+1 sub-agents × 4–5 iterations). Iterative needs per-loop budgets AND hard wallclock AND dollar ceilings enforced _between_ iterations, not just within a sub-agent. §13 cost model needs a `per-iteration-breakeven` gate.
2. **Replay determinism (§8).** Scorer-gated loops make replay only as deterministic as the scorer. Rule-based scorers are fine (LLM output hash compare). LLM-judge scorers are non-deterministic by construction. Need: _iterative topology permits only rule-based or structural scorers as exit gates in v1; LLM-judge defers with §16 LLM-as-judge._
3. **Taint propagation across iterations.** Currently turn-scoped. In an iterative turn, taint must persist across iterations of the same turn, and must re-trigger the approval-tier bump for any writes drafted in later iterations. "Turn-scoped" semantics survive; the iteration count increases.
4. **Synthesizer position.** In bounded, synthesizer runs once at the end. In iterative, either (a) synthesizer runs on each iteration's output (N synthesizer calls, expensive), or (b) synthesizer runs once after the loop exits (current default; cleaner, cheaper). Default (b); (a) is a later opt-in.
5. **Two shapes = two codepaths for the gateway pipeline to guard.** The §7 processor pipeline must behave identically in both topologies. This is achievable (pipeline is per-tool-call, not per-topology) but needs explicit test coverage.
6. **Observability (§12) trigger list expansion.** Add `iteration_count_exceeded_p95` to the 100%-capture trigger set — the tail of iterative turns is where pathology lives.

### One gap mastra's memory-processor-strip comment exposes in our doc

Their explicit "router strips memory processors" choice is the operational manifestation of a design question our doc **does not answer**: what does the router see from memory vs. what does a sub-agent see?

§6 names what the router injects (γ/α windowing). It does **not** say "the router does not invoke L3/L4 read tools." A future maintainer who adds semantic recall or an L4 lookup to the router step opens a routing-time permission-coupling vector (router sees L4 data influencing fan-out, without that data clearing the target sub-agent's scope).

### Router-from-registry pattern is our pattern too, just under-specified

Our `defineSubAgent` registry gives us the data mastra generates from. We can adopt the **same introspection approach for the router prompt** without adopting the re-entry loop.

---

## 3. Proposed edits to agent-runtime.md

### Edit 1 — §6, close the router-read-surface gap

Add after the γ/α windowing description:

> **Router read surface is γ/α only.** The router never invokes L3 / L4 / domain tools. Tool invocation happens exclusively inside sub-agents. This keeps every tool read inside a sub-agent's permission scope, and prevents router-step reads from influencing fan-out in ways that bypass target sub-agent sanitization.

### Edit 2 — §3, "Sub-agent declaration site" subsection

Add a clarifying sentence about router prompt generation:

> The router's available-sub-agents list is generated from the registry at session start (not hand-written). Each entry renders `{ domain, whenToUse, inputSchema as JSON Schema }`. Drift between registry and router prompt is structurally impossible.

### Edit 3 — §2.1 + §3, promote iterative-loop to a supported topology

**Rewrite §2.1 second paragraph.** Current text:

> Primitive-level, not orchestration-level. Router, phase execution, and synthesizer are code-orchestrated. Supervisor/iterative-loop frameworks are out of scope at this layer because they do not preserve the two-phase bounded invariant (§3), cost predictability, or deterministic replay without significant constraint work.

Proposed replacement:

> Primitive-level, not orchestration-level. Router, phase execution, and synthesizer are code-orchestrated. **The runtime supports two topologies, surface-selected at router entry:** (a) **two-phase bounded** (§3) — default for structured cross-domain queries; cost-capped, replay-deterministic, taint well-scoped; (b) **iterative supervisor** (§3.1) — for open-ended investigation / multi-step planning tasks that do not decompose into ≤3 parallel + 1 sequential. Iterative turns carry stricter per-iteration cost gates, scorer-determinism constraints on exit, and explicit taint-persistence-across-iterations. Inline copilots remain bounded-only by hard contract.

**Add §3.1 "Iterative Supervisor Topology"** as a sibling subsection to §3's two-phase description:

> Opt-in per turn via router classification. Execution model: router produces a **plan + topology choice**; if `iterative`, the plan includes initial task + completion criteria (rule-based or structural; LLM-judge deferred to v1.5 per §16). Loop: router picks one sub-agent per iteration, executes, evaluates completion criteria, re-plans or exits.
>
> **Invariants specific to iterative:**
>
> - Per-turn iteration cap (default 10, configurable per surface; async: 20).
> - Per-iteration cost + wallclock gates enforced _between_ iterations; failing gate ends the turn at `budget` with partial answer if applicable (§4 partial-answer gate applies unchanged).
> - Taint is **turn-scoped, not iteration-scoped**: once flipped, persists for the remainder of the turn and bumps any drafted write regardless of which iteration drafted it.
> - Completion criteria in v1: rule-based scorers only (deterministic). LLM-judge as exit gate is an explicit v1.5 item (§16), gated on the same meta-eval that gates LLM-judge for regression evaluation.
> - Synthesizer runs once after loop exits, not per iteration. Per-iteration synthesis deferred.
> - Replay: iterative turns are replay-deterministic iff all scorers are deterministic. Non-deterministic scorers are a compile error at sub-agent declaration time.

**Add to §16 (Deferred to v1.5+):**

> - **LLM-judge as iterative exit gate.** v1 permits rule-based / structural scorers only (§3.1). LLM-judge exit gating is gated on the same meta-eval that governs LLM-judge for regression evaluation (§14).
> - **Per-iteration synthesizer.** v1 synthesizes once after loop exit. Per-iteration synthesis (live narration of the investigation) deferred pending UX demand.

---

## 4. What we are not borrowing

- **Suspend/resume at the workflow layer.** Mastra's `shouldPersistSnapshot` lets mid-turn pause for human input. §10's turn-termination rule ("always ends at draft submitted; never waits for approval mid-turn") already chose the other side of this. Applies to both topologies — iterative turns still end at draft submitted, they do not pause for human approval mid-loop.
- **Unified `agent | workflow | tool` primitives.** Our sub-agents are homogeneous by design; domain workflows are invoked through sub-agent tool calls, not hoisted to router level. Router-level unification makes input schema + permission model heterogeneous.
- **Storing routing decisions in the conversation + filtering on read.** Auditable-by-construction stored summaries (our §6) beat content-parser filters (their `filterMessagesForSubAgent`). Their approach depends on every future contributor remembering the filter exists.
- **LLM-as-scorer for exit gating in v1.** Mastra allows any `MastraScorer`. Our §3.1 restricts to rule-based / structural in v1; LLM-judge is meta-eval-gated (§16). Non-negotiable — replay determinism depends on it.
- **Unbounded iterations.** Mastra's default is effectively whatever the caller passes. Our iterative topology enforces a hard per-turn cap (default 10 interactive, 20 async).

---

## 5. Open questions

- **Router classification — how does it pick topology?** Options: (a) intent keywords ("investigate", "find out why", "fix") bias iterative; (b) structured-vs-open-ended schema check on the utterance; (c) explicit user toggle in UI. (c) is the cheapest v1 answer — a small "investigate mode" toggle — with (a)/(b) as v1.5 automation. Needs decision before §3.1 lands in the design doc.
- **Can bounded + iterative coexist in a single turn?** E.g., iterative investigation that drafts writes at the end, where the draft-provenance (§10) references iteration-level tainted sources. Tentative answer: yes, because §10 provenance is already tool-call-indexed, not phase-indexed. Verify when implementing.
- **Do iterative turns need a separate streaming event taxonomy (§15)?** `phase.started` doesn't map cleanly — there are no phases. Proposal: emit `iteration.started { n, sub_agent_domain }` for iterative, keep `phase.started` for bounded. Additive to the event schema.
- **Inline copilots stay bounded — but what about async?** Async (§11) is currently "read-only + notify + draft-to-inbox" in v1. Scheduled investigation jobs ("check KPI regressions every Monday morning, draft a report") are a compelling iterative async use case. Open: does async iterative land in v1 or v1.5?
- **How does the router know it picked the wrong topology?** If a bounded turn 3x-re-plans (§3 re-plan-or-escalate rule), is that a signal we should have started iterative? Add to §12 router-accuracy signals. Pattern: `topology_downgrade_needed` when re-plan fires.
- **Can we reuse mastra's `createScorer` shape** for the iterative exit gate? Signature is clean (`{ score, passed, reason }`). Introduces library dependency if we import `@mastra/core/evals`; preferable to define our own `ExitScorer` type with the same shape. Defer until §3.1 implementation.

---

## Status

- **Applied to agent-runtime.md:** partial. §7 gateway-pipeline vocabulary + §17 prior-art paragraph landed in commit touching agent-runtime.md earlier in this spike. The three edits above are **pending** — not yet in the design doc.
