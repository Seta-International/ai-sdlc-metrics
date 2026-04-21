# Processors — Mastra Spike Finding

**Topic:** Input / output / tool-pipeline processors, tripwires, span children.
**Investigated:** `packages/core/src/processors/*`, `packages/core/src/processor-provider/*`, `packages/core/src/tool-loop-agent/tool-loop-processor.ts`, `packages/core/src/agent/trip-wire.ts`.
**Our reference section:** `agent-runtime.md` §7 — the fixed gateway processor pipeline (Resolve → Taint-wrap → Ceiling → Abort-check → Invoke → Audit).

---

## 1. How mastra does it

### 1.1 The five-phase processor interface

`Processor` is an interface with **five optional lifecycle methods**, each corresponding to a distinct phase of an agent turn (`packages/core/src/processor-provider/types.ts:7-23`, `packages/core/src/processors/index.ts:300-385`):

| Phase                 | Runs when                                                            | Typical use                                      |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| `processInput`        | Once at turn start, before step 0 LLM call                           | Moderation, PII, unicode norm, semantic recall   |
| `processInputStep`    | **Every** step of the agentic loop (including tool-call continues)   | Per-step message transform, model switching      |
| `processOutputStream` | Per stream chunk                                                     | Batch parts, token-limit abort, stream scrubbing |
| `processOutputStep`   | After each LLM response, **before tool execution**                   | Guardrails with retry, policy-enforce, self-fix  |
| `processOutputResult` | Once at turn end, after all steps complete                           | Final redaction, audit-shape shaping             |
| `processAPIError`     | (Bonus 6th hook) when LLM provider rejects call with non-retry error | Prefill-rejection recovery, request rewrite      |

A single processor can implement any subset; the runner calls only the methods that are defined (e.g. `runOutputProcessors` at `runner.ts:414` "Skip processors that don't implement processOutputResult").

### 1.2 Ordering — explicit arrays

Order is **explicit and static**: `inputProcessors: ProcessorOrWorkflow[]` and `outputProcessors: ProcessorOrWorkflow[]` are config arrays on the agent (`packages/core/src/agent/agent.ts:192-193`, `337-342`). The runner iterates them index-by-index (`runner.ts:381`, `runner.ts:782`, `runner.ts:1287`). There is no implicit resolver, no dependency graph, no topological sort. Order is load-bearing and the responsibility of whoever built the agent.

One dynamic insertion exists: `TrailingAssistantGuard` is auto-appended to the input-step list if the current model looks like Claude 4.6 (`runner.ts:1033-1036`). That is the only behavior where the runner decides order, and it's a single well-commented if-branch.

### 1.3 Tripwire = thrown exception with structured metadata

The tripwire primitive (`packages/core/src/agent/trip-wire.ts`):

```ts
export class TripWire<TMetadata = unknown> extends Error {
  public readonly options: TripWireOptions<TMetadata>;
  public readonly processorId?: string;
  constructor(reason: string, options: TripWireOptions<TMetadata> = {}, processorId?: string) { ... }
}
```

Each processor invocation is handed an `abort(reason, options?)` function that simply throws `TripWire` (`runner.ts:407-409`, `runner.ts:636-638`, `runner.ts:807-809`, `runner.ts:1082-1084`, `runner.ts:1326-1328`, `runner.ts:1502-1504`). The processor never returns a tripwire as a value — it _throws_, and the runner catches it at each phase with `catch (error) { if (error instanceof TripWire) { ... } }`.

Three things the tripwire carries that matter:

- **`reason: string`** — human-readable.
- **`options.retry: boolean`** — lets a processor say "abort _this_ attempt but feed the reason back to the model as a correction" (used by `processOutputStep` guardrails for self-correction loops).
- **`options.metadata: TMetadata`** — strongly typed generic payload; processors declare their own metadata type.

Tripwires **do not all behave the same**. The runner has two reactions:

1. **Input / output-result / step processors** (`runner.ts:513-526`, `975-988`, `1200-1212`, `1436-1448`): re-throw upward. The exception bubbles out of the agent loop.
2. **Stream processors** (`runner.ts:600-608`, `651-671`): do **not** re-throw. They convert to a structured return: `{ part: null, blocked: true, reason, tripwireOptions, processorId }`. The caller (`runOutputProcessorsForStream`, `runner.ts:743-762`) then emits a `tripwire` chunk into the stream and closes it cleanly.

Workflows-as-processors (see §1.6) throw `TripWire` from a different path: they complete with `status === 'tripwire'` and the runner re-wraps that as a `TripWire` instance (`runner.ts:314-327`).

### 1.4 Every step is a child span — explicit, not emergent

Each of the six phases has a `createChildSpan` call at the top of its processor loop, every time:

- `runner.ts:430` — `name: 'output processor: ${processor.id}', type: PROCESSOR_RUN, entityType: OUTPUT_PROCESSOR`.
- `runner.ts:824` — `name: 'input processor: ${processor.id}', entityType: INPUT_PROCESSOR`.
- `runner.ts:1107` — `name: 'input step processor: ${processor.id}', entityType: INPUT_STEP_PROCESSOR`.
- `runner.ts:1338` — `name: 'output step processor: ${processor.id}', entityType: OUTPUT_STEP_PROCESSOR`.
- `runner.ts:1512` — `name: 'request error processor: ${processor.id}'` (re-uses `OUTPUT_STEP_PROCESSOR` entity).
- `runner.ts:69-82` — stream-processor span `'output stream processor: ${processor.id}'`, opened per-processor and **ended on the finish chunk** (`runner.ts:682-688`), so one span per processor, not per chunk.

Tripwires close the span via `processorSpan?.error({ error, endSpan: true, attributes: { tripwireAbort: { reason, retry, metadata } } })` (e.g. `runner.ts:514-524`, `runner.ts:652-664`). This is how a tripwire shows up as an ERROR in traces.

Span attributes also record `messageListMutations` — every `.add/.removeByIds/.clear/.addSystem` call made inside a processor is captured via `messageList.startRecording()` / `stopRecording()` (`runner.ts:447-448`, `466-468`, `840-841`, `878-880`) and written to the span attribute on completion. Traces show exactly what each processor mutated.

### 1.5 Memory as first-class processors

Mastra's memory implementation is **a set of processors**, not a separate subsystem (`packages/core/src/processors/memory/`):

- `MessageHistory` (`message-history.ts:26-80`) — `processInput` retrieves history from `MemoryStorage`, `processOutputResult` persists new messages. One class, two phase methods, hybrid retrieval + persistence.
- `WorkingMemory` (`working-memory.ts:47-98`) — pure `processInput`: loads thread/resource-scoped working-memory blob, injects as a system message. Updates happen via a separately registered `updateWorkingMemory` tool, not via the processor.
- `SemanticRecall` (`semantic-recall.ts:90-100`) — `processInput` does a vector search + injects context, `processOutputResult` creates embeddings for future recall.

All three pull `threadId` / `resourceId` from `RequestContext` at execution time via `parseMemoryRequestContext(requestContext)` (`message-history.ts:45`, `working-memory.ts:91`). They create memory-typed child spans (`SpanType.MEMORY_OPERATION`, `message-history.ts:73-80`) that parent under the processor span.

The significance: there is no separate "memory pipeline" in mastra. The processor pipeline _is_ the memory pipeline. L1/L2/L3 are just which `processInput` processor you choose to wire.

### 1.6 Workflows-as-processors

Instead of a processor class, you can plug in a full Mastra `Workflow` as a pipeline step (`runner.ts:287-370`, `388-403`, `788-802`). The workflow executes with the processor input as `inputData`, and its `result.status === 'tripwire'` is re-thrown as a `TripWire` instance. This is mastra's answer to "I need a complex multi-step transform" — drop in a workflow; it still participates in the same pipeline contract.

### 1.7 Extension points — declarative providers

The `processor-provider/` directory adds a second layer (`packages/core/src/processor-provider/types.ts:57-83`):

```ts
interface ProcessorProvider {
  readonly info: ProcessorProviderInfo // id, name, description
  readonly configSchema: ZodSchema // UI form schema
  readonly availablePhases: ProcessorPhase[] // which hooks it implements
  createProcessor(config: Record<string, unknown>): Processor
}
```

Nine built-in providers are registered in `BUILT_IN_PROCESSOR_PROVIDERS` (`packages/core/src/processor-provider/providers/index.ts:237-247`): unicode-normalizer, token-limiter, tool-call-filter, batch-parts, moderation, prompt-injection-detector, pii-detector, language-detector, system-prompt-scrubber. Each declares its `availablePhases` so a UI can let tenants opt processors in/out per-phase.

`PhaseFilteredProcessor` (`phase-filtered-processor.ts:9-67`) is a wrapper that takes an existing processor and _narrows_ which phases it exposes — e.g. a moderation processor that supports `['processInput', 'processOutputResult', 'processOutputStream']` can be filtered to input-only by binding only `processInput`. The filtered-out phase methods are `undefined`, so the runner's "skip if not defined" check naturally excludes them.

This gives end-users **three extension points**:

1. Write a `Processor` class directly — full control.
2. Register a `ProcessorProvider` — declarative, UI-configurable, tenant-toggleable.
3. Drop in a Mastra `Workflow` as a processor — arbitrary multi-step logic.

### 1.8 The tool-loop-agent processor pattern

`ToolLoopAgentProcessor` (`packages/core/src/tool-loop-agent/tool-loop-processor.ts:39-349`) is how mastra adapts the AI SDK v6 `ToolLoopAgent` into its processor pipeline. It's a single processor that implements `processInputStep` (`tool-loop-processor.ts:320-349`) and bridges AI SDK's `prepareCall` (once per turn) and `prepareStep` (every step) hooks into the step-level processor contract — returning `{ model, tools, activeTools, systemMessages, modelSettings, messages, ... }` overrides that the runner then applies to `stepInput`.

The pattern here is telling: **the tool-loop itself participates via the same interface as any other processor**. There is no special pipeline branch for "tool loop stuff." The loop-level concerns (switch model on retry, swap active-tools mid-run, modify messages per step) are expressed as a processor that returns overrides.

---

## 2. What this tells us

### 2.1 Mastra's pipeline and ours are **architecturally different** — on purpose

Mastra's pipeline is **message-centric**: each phase transforms `MessageList` (add/remove/modify messages) and optionally mutates side state (model, tools, system messages, structured-output schema). It is a composable middleware over the LLM conversation.

Our §7 gateway pipeline is **tool-invocation-centric**: each step gates a single tool call (resolve, taint-wrap, ceiling-check, abort-check, invoke, audit). It is a security/policy filter wrapping _one_ cross-module tRPC call.

These are **not the same layer**. Mastra's input/output processors sit around the whole agent turn; our gateway pipeline sits around each individual tool invocation inside a turn. The equivalent of our gateway pipeline in mastra would be the `execute` function of a tool — which is not pluggable or staged at all in mastra (`tools` just have an `execute()` method; authorization is the tool author's problem).

This means: our §7 pipeline has **no direct mastra analog**, and mastra's processor pipeline has **no direct agent-runtime.md §7 analog** — it would be a different section entirely (closer to "what we do with messages between turn start and step 0"). Recognizing this divergence is the first finding.

### 2.2 Tripwire shape — they throw, we discriminate

Our §7 invariant: "Tripwire is structured (discriminated error variants matching §4 error classes), not thrown."

Mastra throws. The reasons it works for them:

- They own the full call stack — the thrown `TripWire` cannot leak into untrusted callers; the runner catches it at each phase boundary.
- `TripWire extends Error` so it flows through any `async` code path without the caller having to know about it.
- The metadata generic (`TripWire<TMetadata>`) gives type-safety at the _processor author_ level without forcing a discriminated union at the runner level.

Our reason for rejecting `throw`: we want single-abort-path enforcement (§15.2) and we want tripwires to be _inspectable return values_ so that the gateway can emit a structured audit event regardless of where in the pipeline the abort happened, without relying on catch-blocks being correctly written at every call-site.

**The two approaches are both defensible.** Mastra's approach is more idiomatic JS (throw = stop), but it relies on every phase's catch block being present and correct — we can see they have 6+ near-identical catch blocks (`runner.ts:509-529`, `650-678`, `971-991`, `1196-1216`, `1432-1452`, `1591-1616`). Each one has to remember to end the span with `error({ attributes: { tripwireAbort: ... } })`. Ours avoids that duplication by making abort a return-value contract.

**Worth stealing:** the `TripWire.options.retry` field. A processor that fails can say "retry this step with my reason fed back as correction." Our current §7 has binary success/fail; we don't have a "retry with correction" variant. This is useful for the tool-pipeline case when a validator rejects tool args — instead of just aborting, the gateway could feed the reason back to the model and let it retry. See §3.1.

**Worth stealing:** typed `metadata`. Our discriminated-variant approach names the error classes (bytes-cap, wallclock-cap, not-allowed-sub-agent, etc.) but doesn't specify the shape of accompanying data. Mastra's `TripWireOptions<TMetadata>` generic shows the pattern — each error variant should carry a typed payload, not just a string reason.

### 2.3 Span children — we already said every step is a child span. They confirm it works.

Our §7 invariant: "Every step is a child span." Mastra does exactly this, with a naming convention: `"<phase> processor: <processor.id>"`. This is a clean, machine-parseable pattern. We should adopt a similar convention in §7: `"gateway step: <step-name>"` or similar.

**Worth stealing:** span attributes that capture mutations. Mastra's `messageList.startRecording()` / `stopRecording()` writes a `messageListMutations` attribute on the processor span. Our gateway pipeline has analogous mutations — the taint-wrap step transforms fields, the invoke step produces output. We should record per-step input→output diffs as span attributes for debuggability, not just as audit events.

**Worth stealing:** the tripwire→span mapping. `processorSpan.error({ attributes: { tripwireAbort: { reason, retry, metadata } } })` — when our gateway tripwires, we should end the current child span with an `error` that carries the discriminated variant as an attribute. This gives traces a single source-of-truth for why a step aborted.

### 2.4 Memory-as-processors — architecturally elegant; not applicable at our v1 layer

The elegance: one interface, no separate "memory subsystem". Whether a pipeline stage is "retrieve history from storage" or "redact PII" is indistinguishable to the runner. New memory strategies (L2, L3) are just new processors.

**Why this doesn't map cleanly to us:** Our memory spec (agent-runtime.md §6, prior spike topic) talks about prompt store / narrative store / sanitizer as kernel-internal concerns that happen _before_ the agent turn is even framed. They are not composable middleware over tRPC calls. They are bookkeeping for the agent runtime itself, keyed by `sub_agent_id` and `tenant_id`.

But there is a partial lesson: **the sanitizer step** (the one that turns untrusted model outputs into safe strings for next-turn prompt inclusion) is structurally a `processOutputResult` — it runs once at turn end, transforms the payload, and mutates storage. We could model the sanitizer as a fixed "post-turn processor" and get uniformity with §7's pipeline abstraction. Whether that's an improvement or gratuitous unification depends on whether we ever want more than one post-turn step. Right now we don't, so keep them separate.

### 2.5 Tool-loop participation via the same interface — a real insight

`ToolLoopAgentProcessor` showed us that mastra treats "the tool-calling loop itself" as _one processor in the pipeline_. This is unusual and interesting. It means the loop's per-step concerns (which model, which tools, what system prompt) are expressed as **a processor that returns step overrides**, not as a separate configuration surface.

Translated to our world: the **gateway pipeline step order** could itself be expressed as a composable thing rather than hard-coded at six slots. But — and this is key — mastra pays a price for this: the pipeline is fully composable _at the cost_ of requiring authors to correctly order Resolve before Invoke, Validate before Execute, etc. Mastra trusts its authors.

We do not trust processor authors at v1 (there are no v1 processor authors outside the platform team). Our §7 is fixed order because the security guarantees depend on that order. Don't adopt mastra's full composability here.

### 2.6 Extension points — mastra's three-tier model, and our v1 stance

Mastra has: (1) raw processor class, (2) declarative provider with zod config, (3) full workflow as processor. All three are user-facing.

Our §7: "No plugin seam in v1." Hard invariant.

The reasoning in §7 holds: at v1, every gateway step is a security primitive. Letting tenants inject steps means letting tenants _circumvent_ steps. The Taint-wrap step in particular cannot be opt-in.

**However**, mastra's `ProcessorProvider` pattern (declarative config + zod schema + UI form) is a good model for _when we do open a plugin seam_ — probably v2+, when we want tenant-configurable **output** post-processors (e.g. "redact PII from agent responses before they leave our perimeter"). The pattern is: provider declares its phase capabilities, tenant admin selects phase, config is validated by zod at registration, processor is instantiated at turn start. That is the right shape for the eventual seam. Not an action item for v1, but worth citing in the §7 "future work" note.

### 2.7 Workflows-as-processors — not a fit for us

Mastra lets any workflow plug in as a processor. That requires their workflow engine and their processor interface to use the same data-types (`ProcessorStepOutput`). Our gateway pipeline is not a workflow engine; it is a fixed six-step filter. This is intentional and correct for the security-critical layer. Skip.

---

## 3. Proposed edits to agent-runtime.md

All edits are additive. §7's structural invariants (fixed order, no plugin seam, single-abort-path) remain intact.

### 3.1 §7.4 — Extend tripwire discriminated union with `retry` variant

Current: tripwires abort the turn. Add a third disposition:

```ts
type GatewayStepResult =
  | { ok: true; value: T }
  | { ok: false; kind: 'abort'; variant: GatewayErrorVariant }
  | { ok: false; kind: 'retry'; reason: string; feedToModelAs: 'tool-correction' }
```

Use case: the Ceiling pre-check sees a per-tool cap breach. Instead of aborting the turn, the gateway can return `retry` with `reason: "tool X has exceeded its 10MB bytes-scanned cap for this turn; pick a narrower query"`. The orchestrator feeds that back to the model as a tool-level error and lets the model re-plan.

This is stolen directly from mastra's `TripWireOptions.retry` (`trip-wire.ts:18-19`). Without this, every cap breach terminates the turn — a surprisingly bad UX for what's often a recoverable situation.

### 3.2 §7.4 — Typed metadata on each error variant

Current §7 references §4 error classes as a flat list. Upgrade to:

```ts
type GatewayErrorVariant =
  | { kind: 'procedure-not-found'; attemptedName: string }
  | { kind: 'out-of-sub-agent-scope'; sub_agent_id: string; attempted: string; allowed: string[] }
  | { kind: 'ceiling-bytes'; tool: string; cap: number; projected: number }
  | { kind: 'ceiling-wallclock'; tool: string; cap_ms: number; projected_ms: number }
  | { kind: 'pre-write-aborted'; signal: 'user' | 'system' | 'timeout' }
  | { kind: 'invoke-failed'; trpcCode: string; message: string }
```

Each variant carries exactly the fields the audit event and the retry logic need. This is stolen from `TripWire<TMetadata>` generic (`trip-wire.ts:35`). Replaces our current §7's vague "discriminated error variants matching §4."

### 3.3 §7.5 — Span naming convention

Add as a §7 invariant:

> Every gateway step opens a child span named `gateway: <step-name>` (e.g. `gateway: resolve`, `gateway: taint-wrap`, `gateway: invoke`). On tripwire, the span ends with `error({ attributes: { gateway_abort: <variant> } })`. Span attributes include the step's input and output payload summaries.

Cite: mastra naming pattern at `runner.ts:430`, `runner.ts:824`, `runner.ts:1107`, `runner.ts:1338`.

### 3.4 §7.6 — Record per-step mutations as span attributes

Add:

> Each gateway step records its input-to-output transformation as a `gateway_mutations` span attribute (e.g. taint-wrap records the wrapped-field count and character delta; invoke records tRPC response size). This complements the kernel audit event (which is a single per-tool-call record) by giving per-step visibility in traces.

Cite: `messageList.startRecording/stopRecording` pattern at `runner.ts:447-448`.

### 3.5 §7 — Clarify: not a plugin seam, but leave a door open for output post-processors

Add a §7 closing note:

> **Future extension (non-v1).** The gateway pipeline is fixed and non-pluggable in v1 because every step is a security primitive and authors cannot re-order them without risk. If v2+ introduces a plugin seam, it will be for **output post-processors only** (e.g. tenant-configurable PII redaction on agent responses), and it will follow a `ProcessorProvider`-style pattern: each provider declares its capabilities via a zod config schema, the admin UI renders a form, and the runtime instantiates the processor at turn start. Mastra's `packages/core/src/processor-provider/types.ts:57-83` is the reference shape.

This preserves the v1 invariant while documenting the eventual path. Without this note, the next person who looks at §7 will re-litigate "why not pluggable?" and re-propose mastra's model. Better to answer preemptively.

### 3.6 Do **not** adopt (explicit rejections — see §4)

---

## 4. What we are not borrowing

- **Throwing `TripWire extends Error` for abort.** We keep the discriminated-return contract from §15.2. Reason: single-abort-path enforcement is a first-class invariant and we don't want 6+ duplicate catch blocks (as mastra has at `runner.ts:509-529`, `650-678`, `971-991`, `1196-1216`, `1432-1452`, `1591-1616`) as the single source of truth for tripwire handling.
- **Five-phase processor interface.** Our gateway pipeline has six fixed steps per tool invocation, not five hooks at different points in an agent turn. The semantic layer is different; do not try to unify them.
- **Memory-as-processors.** Our memory spec (prompt store / narrative store / sanitizer) is a turn-level concern, not a tool-invocation concern. Adopting this pattern would require restructuring the memory module around a middleware interface — large refactor, no clear win.
- **Workflows-as-processors.** We do not have a workflow engine at this layer, and we do not want the gateway pipeline to accept arbitrary user code. Hard rejection.
- **`ProcessorProvider` declarative seam in v1.** Kept explicitly out; referenced in §3.5 as a v2+ future-work note only.
- **`PhaseFilteredProcessor`.** Only meaningful when phases are composable opt-ins. Our pipeline is fixed; no need for phase-filtering.
- **`processAPIError` sixth hook.** Our equivalent is the tRPC error propagation at the Invoke step — handled by the kernel error codes, not by a dedicated processor. Keep it out.

---

## 5. Open questions

1. **Retry semantics for ceiling breaches.** §3.1 proposes a `retry` disposition for cap breaches, feeding the reason to the model. Is that actually a recoverable situation for every ceiling type? Bytes-scanned cap, probably yes (model re-plans with a narrower query). Wallclock cap, probably no (the model can't make the tool faster). Need to enumerate per-variant whether `retry` or `abort` is the correct default, and whether the processor can choose.
2. **Taint-wrap correctness under retry.** If the gateway returns `retry` and the orchestrator re-invokes the same tool, does the taint-wrap re-apply (correct) or is the wrapped input cached (bug waiting to happen)? Need to specify: retry always re-enters at step 1 (Resolve), never mid-pipeline.
3. **Span cardinality under retry.** If a single tool call retries three times, does that emit one parent gateway span with three child attempt-spans, or three separate gateway spans? Mastra doesn't have this problem because `retry` on their side means re-running the whole agent step, not a single processor. Need to decide for our model.
4. **`ProcessorProvider`-style seam: when and where?** §3.5 defers to v2+. But we should probably draft the interface now (tenant-facing UI for PII redaction is a common request) so that when we're ready, we're not reinventing. Track as a separate spike topic or as part of the admin module's roadmap.
5. **Does the sanitizer belong inside the gateway pipeline?** §2.4 suggests the post-turn sanitizer _could_ be modeled as a processor but argued not to do so at v1. Revisit when the sanitizer spec is being refined — if we find ourselves adding more post-turn steps (e.g. a hallucination-detector, a cost-computation step), the processor abstraction may earn its keep.
