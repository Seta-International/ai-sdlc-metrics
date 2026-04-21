# Key 13 — Workflows / Execution Engine

**Mastra area:** `packages/core/src/workflows/` (+ `evented/`, `handlers/`)
**Our design area:** `agent-runtime.md` Tenet #3, §3 (Topology), §7 (Gateway pipeline), §10 (Approval handoff), §11 (Async agents), §17 (Prior art)
**Investigation date:** 2026-04-21

---

## 1. How mastra does it

### A general-purpose, DAG-style workflow engine — not agent-specific

`createWorkflow` at `packages/core/src/workflows/workflow.ts:1483-1492` builds a typed graph with chainable composition methods. Every control-flow primitive is a method on the `Workflow` class:

- `then(step)` — sequential (`workflow.ts:1668-1682`)
- `parallel(steps[])` — concurrent fan-out (`workflow.ts:1972-2019`)
- `branch([cond, step][])` — conditional routing (`workflow.ts:2023-2077`)
- `dowhile(step, cond)` / `dountil(step, cond)` — bounded loops (`workflow.ts:2079-2151`)
- `foreach(step, { concurrency })` — array map (`workflow.ts:2153-2192`)
- `waitForEvent(...)` — external-event gate (`workflow.ts:1788`)
- `sleep(duration)` / `sleepUntil(date)` — timed pauses (`workflow.ts:1713-1752`)
- `map(...)` — in-graph data transform step (`workflow.ts:1803`)

The graph is serialized at compile time (`StepFlowEntry` in `types.ts:475-502`, `SerializedStepFlowEntry` in `types.ts:514-558`) so it can be hydrated from storage and replayed.

### A step is a schema-typed execution unit, not agent-specific

`Step` interface (`step.ts:148-175`):

```typescript
interface Step<TStepId, TState, TInput, TOutput, TResume, TSuspend, TEngineType, TRequestContext> {
  id: TStepId;
  inputSchema: StandardSchemaWithJSON<TInput>;
  outputSchema: StandardSchemaWithJSON<TOutput>;
  resumeSchema?: StandardSchemaWithJSON<TResume>;
  suspendSchema?: StandardSchemaWithJSON<TSuspend>;
  stateSchema?: StandardSchemaWithJSON<TState>;
  requestContextSchema?: StandardSchemaWithJSON<TRequestContext>;
  execute: ExecuteFunction<...>;
  scorers?: DynamicArgument<MastraScorers>;
  retries?: number;
  component?: string;
  metadata?: StepMetadata;
}
```

Every step is input/output/suspend/resume-schema-typed. The same shape is used for agent steps, tool steps, processor steps, and workflow-nested-in-workflow steps — `createStep` polymorphically builds any of them (`workflow.ts:330-349`). An agent becomes a step via `createStepFromAgent` at `workflow.ts:403-578` — input `{ prompt: string }`, output = the agent's structuredOutput schema or `{ text: string }`.

### Two execution engines behind one graph

`ExecutionEngine` is abstract (`execution-engine.ts:51-184`) — it takes a graph + input, emits `StepResult<P,R,S,T>` via pubsub, and invokes `onFinish`/`onError` lifecycle callbacks.

- **`DefaultExecutionEngine`** (`default.ts:53-1049`) — in-process, single-node. Iterates the `StepFlowEntry[]` array, calls `executeEntry` / `executeStep` / `executeParallel` / `executeLoop` / `executeConditional` / `executeForeach` / `executeSleep` handlers from `handlers/*.ts`.
- **`EventedExecutionEngine`** (`evented/execution-engine.ts:19-333`) — pubsub-driven. Publishes `workflow.start` / `workflow.resume` / `workflow.step.run` / `workflow.step.end` / `workflow.suspend` / `workflow.end` / `workflow.fail` / `workflow.cancel` events (enumerated in `evented/workflow-event-processor/index.ts:1928-1985`). Each step becomes its own event; a `WorkflowEventProcessor` consumes them, which allows cross-node resumption and plugging in platform-specific durability (e.g. the Inngest adapter overrides `wrapDurableOperation` at `default.ts:132-134`).

### Suspend/resume is first-class, with a full persistence schema

The `WorkflowRunState` (`types.ts:330-368`) is the serialized form. Notable fields:

- `value: Record<string, string>` — state machine label per path
- `context: { input? } & Record<string, SerializedStepResult>` — per-step input/output history
- `serializedStepGraph: SerializedStepFlowEntry[]` — the full graph, re-persisted every snapshot (for versioning-proof resumption against the _current_ code, not necessarily the code that started the run)
- `activePaths: number[]` / `activeStepsPath: Record<string, number[]>` — which node indices are currently executing
- `suspendedPaths: Record<string, number[]>` — which steps are suspended (path = index trail into nested arrays)
- `resumeLabels: Record<string, { stepId; foreachIndex? }>` — named resume points, settable from inside `execute` via `suspend(payload, { resumeLabel })`
- `tracingContext: { traceId?; spanId?; parentSpanId? }` — persisted at suspend for span continuity on resume
- `requestContext` — the full DI context (serialized via `engine.serializeRequestContext`)

`shouldPersistSnapshot` is configurable per-workflow (`types.ts:437-440`, default `() => true` at `workflow.ts:1607`). The network orchestrator sets it to `workflowStatus === 'suspended'` to avoid writing on every step (`loop/network/index.ts:2538, 2571`).

`suspend()` inside a step's `execute` (`handlers/step.ts:341-372`) is implemented as:

1. Validate the suspend payload against `step.suspendSchema`.
2. Write `executionContext.suspendedPaths[step.id] = executionContext.executionPath`.
3. Record optional `resumeLabel`(s) — named handles so external callers can resume without knowing the step ID.
4. Capture the payload; step result becomes `{ status: 'suspended', suspendPayload, suspendedAt }` (`handlers/step.ts:472-478`).

On resume, `DefaultExecutionEngine` reads `resume.resumePath` (an `number[]` index trail), restarts from that index, and passes `resume.resumePayload` into the step (`handlers/step.ts:379-390`). Loop resumption preserves iteration count across suspend boundaries (`handlers/control-flow.ts:602-603`).

### Agent network is itself a workflow

The network orchestrator is not bespoke code — it is a `dountil` loop over `iterationWithValidation`, another workflow (`loop/network/index.ts:2533-2584`):

```
mainWorkflow.dountil(iterationWithValidation, exitCondition).then(finalStep)
```

So every agent turn in mastra's network topology runs through the workflow engine. Routing, sub-agent execution, validation, completion-check — all steps in a graph. `iterationWithValidation` itself is `createWorkflow().then(networkWorkflow).then(validationStep)`.

### Tripwires: processors can abort the workflow from inside a step

A step throws `TripWire` (e.g. when input processors reject a message — `workflow.ts:552-559`); the engine catches it and marks the run `status: 'tripwire'` with `StepTripwireInfo { reason, retry?, metadata?, processorId? }` (`types.ts:83-104`). Same terminal surface as `failed`, but semantically distinct — used for moderation/policy rejections vs. bugs.

### Time-travel and restart

Beyond suspend/resume, the engine supports:

- `timeTravel` — rerun from an arbitrary prior step with modified input (`types.ts:55-64`, threaded through `handlers/step.ts:394-402`).
- `restart` — resume a failed run from `activeStepsPath` without replaying earlier successful steps (`types.ts:47-53`).
- `bail(result)` — early exit from inside a step with a final result, skipping remaining graph (`step.ts:53-55`, `handlers/step.ts:373-375`).

---

## 2. What this tells us

### Mastra's workflow engine is a real workflow engine — and that is exactly what our spec rejects at the runtime layer

The shape mastra ships is temporal-lite: serialized graph, schema-typed steps, suspend/resume with named labels, parallel/branch/loop/foreach control flow, tripwires, time-travel, restart, pluggable execution backends. It is general-purpose — same primitives drive the agent network, processor pipelines, and any user-defined multi-step flow.

Our v1 spec (Tenet #3, §10, §11) deliberately splits this in two:

- **Orchestration inside a turn** — router → sub-agents → synthesizer — is code-orchestrated (§3). No graph, no persistence, no resume. A single request, a single process, terminates with a draft or an answer.
- **Anything that outlives the turn** — approval handoff, scheduled jobs, reminders — is a pg-boss job row plus whatever state machine the _domain_ module already owns (§10 approval_request, finance invoice lifecycle, etc.).

The rejection in `agent-runtime.md:932` holds up against everything in this investigation: **our approval handoff works exactly because the agent runtime refuses to carry workflow state.** The agent emits a draft; the notifications module owns the inbox; the domain owns the downstream state; pg-boss is the durable hop. There is no "turn that is suspended pending approval" — the turn _ends_, and the draft is a new object in a different module.

### The iterative topology (§3.1, from 01-orchestrator.md) does not change this

`01-orchestrator.md` proposed promoting iterative-loop to a second topology. That did not — and should not — come with mastra's workflow engine. Iterative in our design is still:

- A bounded loop (max 10 interactive / 20 async iterations), in-process, single turn.
- Terminates with a draft or an answer. Never suspends waiting on external input.
- Taint is turn-scoped — persists across iterations, does not persist across turns or across the pg-boss hop.

Mastra's `.dountil(iterationWithValidation, ...)` at `loop/network/index.ts:2575-2582` happens to be structurally identical to what our iterative topology needs — a loop-until-condition over a re-entrant step. But we implement it as a JS `while` loop in the router, not as a persisted workflow graph. **The operational semantics that matter for us (bounded iterations, cost gates between iterations, deterministic scorer exit) are invariants of the router code; they do not need workflow-engine substrate.**

### Where mastra's step model does usefully inform us: the gateway pipeline shape

§7 of our doc already borrows mastra's "ordered processors + tripwires + child spans" vocabulary. The deeper lesson from reading `step.ts:148-175` is the **schema discipline**: every step has `inputSchema` / `outputSchema`, and the engine validates transitions (`utils.ts validateStepInput`). Our gateway pipeline (§7) already does this for tool calls — input schema, output schema, sanitization between. No edit to §7 needed; this is a confirmation, not a new insight.

### Where mastra's step model does NOT help: the runtime pipeline

Our processor pipeline (§7) is per-tool-call and strictly linear. It does not need `branch`, `parallel`, or `foreach`. Promoting the gateway to a "workflow" would add serialization overhead + persistence complexity for a pipeline that completes in single-digit milliseconds and has no resumption semantics. Keep it as ordered function composition.

### Mastra's two-engine design (default + evented) is a useful pattern we do not need

The `ExecutionEngine` abstract class + `DefaultExecutionEngine` / `EventedExecutionEngine` split (`execution-engine.ts:51-184`, `evented/execution-engine.ts:19-333`) lets a workflow run the same graph in-process or event-sourced across nodes. This is the right shape _if_ you have a workflow engine. We do not — our "across nodes" equivalent is the pg-boss job, and its state is the job row + domain tables, not a serialized execution graph.

### Conflict with Tenet #3 is not close — it's categorical

Every way mastra couples agent network to workflow engine (network is a workflow, validation is a step, routing is a step, completion is a scorer on a step) bakes the agent-to-workflow coupling structurally into the framework. Our design keeps them cleanly separate:

| Concern                           | Mastra                                                       | Future                                                         |
| --------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| Intra-turn control flow           | Workflow graph (`dountil`, `then`, `parallel`)               | JS code (§3)                                                   |
| Approval handoff                  | Workflow suspend/resume with labels                          | pg-boss `execute-approved-draft` (§10)                         |
| Scheduled / recurring agent       | Workflow with `sleep` / `sleepUntil`                         | pg-boss cron + agent session (§11)                             |
| Turn state during execution       | `ExecutionContext` in-memory + `WorkflowRunState` on suspend | Request-scoped context; no persistence                         |
| Cross-domain multi-step operation | User-defined workflow calling multiple agent steps           | Domain workflow (in the owning module) calling agent as a tool |

**Our split is right for a domain-owning-workflows architecture.** Mastra's coupling is right for a framework that ships without domain modules — every multi-step operation is _by definition_ a workflow because there is no domain to own one.

---

## 3. Proposed edits to agent-runtime.md

None. This investigation reinforces Tenet #3 and the existing §17 rejection of "resumable workflow execution engine with serialized graph state." No edits needed.

One optional clarification we considered and rejected: tightening the §17 rejection language to name specific mastra primitives (`suspend`/`resume`/`resumeLabel`/`dountil`/`serializedStepGraph`) as the non-adopted set. The current language is sharp enough; naming specific primitives would invite future "but what about just `dountil`?" re-litigation, which is exactly what §17 is designed to prevent. Leave it as-is.

---

## 4. What we are not borrowing — with reasoning

### 4.1 — The workflow engine itself

**What:** `createWorkflow` + `Step` + `ExecutionEngine` + persisted `WorkflowRunState`.

**Why not:** Violates Tenet #3. Domain modules own their workflows; the runtime does not host a parallel engine. An agent runtime with a workflow engine inside it starts absorbing domain state machines by gravity — every "why not just add one workflow for X?" compounds until the runtime owns state it has no business owning.

**What we do instead:** Router/sub-agent/synthesizer are code in `apps/api` (§3). Approval lifecycle is in the notifications + domain modules (§10). Async agents are pg-boss rows (§11). No graph, no serialized state, no resume.

### 4.2 — Suspend/resume with persisted execution state

**What:** `suspend()` inside a step → `WorkflowRunState.suspendedPaths` + `resumeLabels` persisted to storage; external caller calls `run.resume({ resumePayload })` later.

**Why not:** Our turn-termination rule (§10) says a turn always ends at draft submitted; never waits for approval mid-turn. Once the draft lands in the inbox, the turn is _over_ — there is no agent execution waiting to resume. Approval is a new operation that runs through pg-boss → domain command with revalidation. "Resumption" is the wrong mental model for how our approval handoff works.

Additional cost: `resumeLabels` + per-step payload validation + graph-version-on-resume all need migration stories that our pg-boss approach gets for free. A pg-boss job is a row with a payload; upgrading the consumer upgrades the job. A resumed workflow state has to validate against a potentially-newer serialized graph (`WorkflowRunState.serializedStepGraph` is persisted per-snapshot precisely because mastra re-reads it on resume rather than re-reading code — graceful, but nontrivial to get right).

### 4.3 — Control-flow primitives as workflow methods (`.parallel()`, `.branch()`, `.dountil()`, `.foreach()`)

**What:** Declarative chainable API for parallel fan-out, conditional routing, bounded loops, array mapping.

**Why not:** These are better expressed as code inside the router/sub-agent layer. Our bounded topology's "≤3 parallel + 1 sequential" is a `Promise.all` over phase-1 sub-agents followed by one phase-2 call — writing that as `.parallel([...]).then(phase2)` adds ceremony without buying anything. Our iterative topology is a `while` loop with cost + iteration guards — writing it as `.dountil(step, exitCondition)` moves the guards from code to a closure passed to a framework, making them less auditable.

**When we would want them:** If we ever wanted domain-workflow authors to compose agents with non-agent steps in a typed DAG. That is a _domain-module_ concern (e.g. hiring module's offer workflow might fan out to agent-drafted email + agent-drafted contract + human-approval), not a runtime-module concern. If that need arises, the domain module adopts a workflow library — but picks one with an ecosystem fit (Temporal, Inngest, or pg-boss composition), not by pulling in mastra's runtime-coupled engine.

### 4.4 — Time-travel and restart

**What:** `timeTravel` reruns from an arbitrary prior step with modified input; `restart` resumes a failed run from `activeStepsPath` without replaying earlier successful steps.

**Why not:** Replay in our design (§8) is about deterministic re-execution for debugging / audit, not about in-place editing of a historical run. Time-travel-with-modified-input is a _framework feature_ for interactive workflow-dev UX; it has no user-facing analog in a draft-producing agent runtime. Our equivalent is running the agent again on the same input — same prompt, same tools, same output (modulo LLM sampling variance captured in §8 replay semantics).

### 4.5 — `bail()` (early exit from a step)

**What:** A step returns a final result and skips remaining graph nodes.

**Why not:** No graph, no remaining nodes. Our synthesizer is called conditionally based on router decision (answer-now vs. re-plan-or-escalate); that's an `if`, not a `bail`.

### 4.6 — Tripwires as a workflow-level status

**What:** Processor rejection throws `TripWire`, the workflow terminates with `status: 'tripwire'` carrying `StepTripwireInfo`.

**Why not — but close:** Our §7 pipeline already has tripwire semantics (processor can reject a tool call; sanitizer can reject an LLM output). We just don't need the _workflow-level status_ because there is no workflow wrapping the turn. In our surface, a tripwire surfaces as a partial-answer gate (§4) with a reason code, emitted through the streaming event taxonomy (§15). Same concept, no workflow substrate required.

### 4.7 — Evented execution engine

**What:** Pubsub-driven workflow runner (`workflow.start` / `workflow.step.run` / `workflow.suspend` / `workflow.end`) enabling cross-node resumption and Inngest-style durability adapters.

**Why not:** Our cross-node equivalent is pg-boss. Our "durability adapter" is Postgres outbox + polling relay. Adding a pubsub-based step-level event taxonomy creates a second event plane parallel to our existing one (domain events) with overlapping semantics — not a gap our infra has.

---

## 5. Open questions

### 5.1 — Domain-workflow composition with agents (the real integration seam)

Our Tenet #3 says "domain owns workflows." But some domain workflows _call_ the agent (e.g. hiring.create-offer workflow wants agent-drafted congratulations email + agent-drafted onboarding checklist, with human approval between). Today's spec doesn't enumerate what that integration looks like:

- Does the domain workflow invoke the agent via a tRPC call to `agents.runTurn` (sync, in-process)? Or via an enqueued pg-boss job (async)?
- If sync: the domain workflow's RLS / delegation / cost accounting need to flow through. Mechanically this is §11's delegation token threading, but §11 only covers agent-initiated async. Needs symmetric "domain-initiated sync invocation" treatment.
- If async: the domain workflow must park until the agent's draft lands. That's a legitimate "workflow waits for external event" case — which existing domain workflow engines (if we adopt one per module) handle natively. pg-boss alone does not.

Mastra's answer is "agent is a step" — trivial because everything is in one engine. Our answer needs a crisper contract. **Candidate for a follow-up spike file:** "agent-as-step in domain workflows" — what the call signature, permission envelope, and failure-mode contract look like.

### 5.2 — Partial-answer streaming + long-running tool calls

If a sub-agent calls a tool that legitimately takes 30 seconds (e.g. complex analytics query), the turn stays live. Mastra's `sleep`/`sleepUntil`/`waitForEvent` primitives would let the workflow suspend during the wait and resume on event arrival — useful for very long domain operations. Our design implicitly caps tool-call duration at "whatever fits in a live HTTP request" (§2). Open: is there a class of legitimate agent use cases (e.g. wait-for-external-API-callback) we're foreclosing by not having suspend? If so, the answer may be "those are domain workflows with agent-drafted inputs, not agent turns" — which pushes us back toward 5.1.

### 5.3 — Should `execute-approved-draft` share anything with a workflow primitive?

Today `execute-approved-draft` (§10) is a single pg-boss job that carries the delegation token + pinned versions and runs one domain command. What if the drafted operation is _itself_ multi-step (create-employee = create person + assign role + grant access)? Currently that's the domain command's problem — it composes sub-calls inside its transaction. Mastra would model this as a persisted workflow. **Tentative answer:** domain multi-step operations are domain-module problems; the notifications → pg-boss → domain-command handoff remains one-hop; if a domain needs multi-step durability, it adopts its own tooling. **This is a decision to re-examine if we ever get the first domain with a genuinely multi-step approved-draft operation that pg-boss-alone can't handle.**

### 5.4 — Tripwire as a first-class turn outcome

§4 has "partial answer" and "answer" and "draft." There's an implicit fourth — "refused" (input-processor tripwire: prompt-injection detected, moderation hit, etc.). Mastra's `'tripwire'` status is explicit. Do we want an explicit `turn_outcome: 'refused'` in §4's taxonomy, or does it collapse into partial-answer with a reason code? Minor clarification; worth a pass when revising §4.

### 5.5 — Graph versioning under suspend/resume (a problem we avoid, not a lesson)

Mastra re-persists `serializedStepGraph` on every snapshot precisely because they want resumption against the _current_ code — they rebuild the execution graph from the graph stored in the snapshot, not from the module they were just loaded from. That is their answer to "what happens when the workflow definition changes while a run is suspended?"

We avoid this problem entirely because we don't suspend. **Mention in §17 as a design-cost we specifically avoided by not hosting a workflow engine?** Candidate one-line addition: _"Avoided by design: cross-version suspend/resume invalidation — our turns are single-process, so graph/schema evolution affects only the next turn, never an in-flight one."_ Low-priority edit; the rejection in §17 already implies it. Defer unless we write a follow-up on versioning.

---

## Status

- **Applied to agent-runtime.md:** none. This spike confirms Tenet #3 against a strong counterexample. No edits proposed.
- **Follow-ups surfaced:**
  - 5.1 deserves its own spike file — "agent-as-step in domain workflows" — before any domain module needs to compose an agent with non-agent steps.
  - 5.4 is a minor §4 clarification, worth a one-line sweep on the next §4 revision.
