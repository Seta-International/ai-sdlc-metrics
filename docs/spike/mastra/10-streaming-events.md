# 10 — Streaming / Events

**Scope:** Chunk taxonomy, ordering guarantees, versioning, tool-call streaming, error events, network-specific events, stream composition, and abort propagation.
**Sources read:** `packages/core/src/stream/types.ts` (full), `packages/core/src/stream/MastraAgentNetworkStream.ts`, `packages/core/src/stream/base/output.ts` (relevant regions), `packages/core/src/stream/base/input.ts`, `packages/core/src/stream/RunOutput.ts`, `packages/core/src/stream/aisdk/v5/compat/ui-message.ts`, `packages/core/src/stream/aisdk/v5/execute.ts`, `packages/core/src/loop/network/index.ts` (validation / execution-finish emit sites).

---

## 1. How mastra does it

### 1.1 Chunk taxonomy — one discriminated union, three "from" domains

The central type is `TypedChunkType<OUTPUT>` composed from `AgentChunkType | WorkflowStreamEvent | NetworkChunkType | DataChunkType` (`packages/core/src/stream/types.ts:835-842`). Every chunk carries a `BaseChunkType` envelope with `runId: string`, `from: ChunkFrom`, and optional `metadata` (`types.ts:67-71`). `ChunkFrom` is a single enum: `AGENT | USER | SYSTEM | WORKFLOW | NETWORK` (`types.ts:26-32`).

**Agent chunks (`AgentChunkType`, `types.ts:673-731`, 32 variants).** Grouped by concern:

- **Text:** `text-start`, `text-delta`, `text-end` (payloads at `types.ts:78-93`). Each has an `id` that correlates start→delta\*→end. Mastra buffers deltas by `payload.id` into `bufferedTextChunks` (`base/output.ts:445-449`).
- **Reasoning:** `reasoning-start`, `reasoning-delta`, `reasoning-end`, plus `reasoning-signature`, `redacted-reasoning` (`types.ts:95-112`, `303-313`). Same start/delta/end triad keyed by id.
- **Tool lifecycle (4 forms in parallel):**
  1. Final form — `tool-call` / `tool-result` / `tool-error` (`types.ts:159-180`, `289-297`).
  2. Streaming args form — `tool-call-input-streaming-start` → `tool-call-delta` (`argsTextDelta`) → `tool-call-input-streaming-end` (`types.ts:185-203`). Mastra synthesises a final `tool-call` chunk from accumulated deltas at `input-streaming-end` (`base/output.ts:460-499`).
  3. Human-in-the-loop — `tool-call-approval`, `tool-call-suspended` (`types.ts:620-633`).
  4. Nested tool output — `tool-output` carries arbitrary nested `ChunkType | NestedWorkflowOutput` (`types.ts:315-322`, discussed in §1.6).
- **Step framing:** `start`, `step-start`, `step-finish`, `finish` (`types.ts:242-287`). `finish` carries `stepResult.reason: LanguageModelV2FinishReason | 'tripwire' | 'retry'` (`types.ts:38`, `205-212`).
- **Structured output:** `object` (partial), `object-result` (final validated) (`types.ts:700-710`).
- **Control/diagnostic:** `error`, `abort`, `raw`, `watch`, `response-metadata`, `step-output`, `tripwire`, `is-task-complete` (`types.ts:693-715`).
- **Background tasks:** `background-task-started | -completed | -failed | -progress` (`types.ts:378-404`, `716-731`) — long-running tool execution progress.
- **Source/file:** `source` (url or document), `file` (`types.ts:113-128`, `683-684`).

**Workflow chunks (`WorkflowStreamEvent`, `types.ts:733-832`, 10 variants).** `workflow-start`, `-finish`, `-canceled`, `-paused`, `-step-start`, `-step-finish`, `-step-suspended`, `-step-waiting`, `-step-output`, `-step-progress`, `-step-result`. `workflow-step-progress` carries `completedCount / totalCount / currentIndex / iterationStatus` for parallel-foreach steps (`types.ts:803-818`).

**Network chunks (`NetworkChunkType`, `types.ts:643-670`, 23 variants).** Three primitive families times four lifecycle stages:

- `routing-agent-{start,text-start,text-delta,end,abort}` — the router deciding which primitive to invoke next.
- `agent-execution-{start,approval,suspended,end,abort}` — a selected sub-agent running.
- `workflow-execution-{start,end,suspended,abort}` — a selected workflow running.
- `tool-execution-{start,end,approval,suspended,abort}` — a selected tool running.
- `network-execution-event-step-finish` — per-iteration wrap-up (`NetworkStepFinishPayload` at `types.ts:557-563`).
- `network-execution-event-finish` — final turn wrap-up with `completionReason`, `iteration`, `usage`, optional `object` (`NetworkFinishPayload` at `types.ts:565-580`). Emitted at `loop/network/index.ts:2521-2526`.
- `network-validation-start` / `network-validation-end` — iteration-scorer gate (`NetworkValidationStartPayload` at `types.ts:582-598`, emitted at `loop/network/index.ts:2251-2260` and `2392-2399`).
- `network-object` / `network-object-result` — partial and final structured output (`types.ts:669-670`).
- Generic tunnels: `agent-execution-event-${string}` wrapping an inner `AgentChunkType`, and `workflow-execution-event-${string}` wrapping a `WorkflowStreamEvent` (`types.ts:667-668`). Used for nested sub-agent streams inside a network turn.

**Data chunks (`DataChunkType`, `types.ts:635-641`).** Escape hatch: `type: \`data-${string}\``, `data: any`, optional `id`, `transient?: boolean` (streamed but not persisted). This is mastra's versioning/extension hook (see §1.3).

### 1.2 Ordering — enforced by the writer, not the schema

Ordering is **emergent from the emission code path**, not validated by any schema. There are three mechanisms:

1. **Sequential `await writer.write(chunk)`** at emit sites. The network loop writes `network-validation-start`, runs validation, writes `network-validation-end`, writes `network-execution-event-finish` in strict sequential order (`loop/network/index.ts:2251 → 2392 → 2521`). Producers `await` each write.

2. **Reducer state in the consumer** (`MastraModelOutput.#baseStream` transform, `base/output.ts:416-900`+). The transform holds buffers keyed by chunk id (`#bufferedTextChunks`, `#toolCallArgsDeltas`, `#toolCallStreamingMeta`) and detects "out of order" conditions defensively: at `tool-call-input-streaming-end` it manufactures the final `tool-call` chunk if the provider hasn't sent one, and at `tool-call` it merges with any already-synthesized instance (`base/output.ts:460-582`). The comment at `base/output.ts:492` is telling: _"Emit streaming-end then synthetic so studio receives tool-input-end then tool-input-available before tool-output-available"_ — ordering is asserted by the writer, not the type system.

3. **Terminal `finish` / `tripwire`** acts as a single exit. `tripwire` case at `base/output.ts:696-743` resolves every `DelayedPromise`, emits a final `finish` event on the EventEmitter, then `controller.terminate()`s the stream — guaranteeing no further chunks after a processor block.

No chunk carries a sequence number. No bookend invariant is asserted in `types.ts`. If a producer emits `text-delta` without a preceding `text-start`, the consumer silently coalesces.

### 1.3 Versioning — none in the envelope; discriminated union does the work

There is **no `protocolVersion` / `schemaVersion` / `event_schema_version` header anywhere in `packages/core/src/stream`**. Evolution is handled three ways:

1. **Adding a new `type` literal to the discriminated union** — callers `switch` on `chunk.type` and ignore unknown variants (most consumers fall through or `throw` on exhaustive check, e.g. `compat/ui-message.ts:239-242` — which will throw on an unknown type; but this is only for the aisdk-v5 UI transform, not the fullStream).
2. **`data-${string}` custom chunks** (`types.ts:635-641`) with `transient` flag for extension without touching the core union.
3. **`metadata?: Record<string, any>` on every chunk** (`types.ts:70`) — open-ended bag for forward-compatible fields.

The only "version" field is `partialModel.version` (`types.ts:889-893`), which is the model identifier, not the stream protocol.

The aisdk UI-message transform (`aisdk/v5/compat/ui-message.ts:25-244`) is a **lossy projection** of the full-fidelity stream to the AI SDK v5 UI protocol — renaming `text-delta` → `text-delta` with `delta` field, `tool-call-input-streaming-start` → `tool-input-start`, `source` → `source-url`/`source-document` based on `sourceType`. This is where mastra's rich internal taxonomy is collapsed to what the client SDK actually speaks.

### 1.4 Tool-call streaming — they DO stream tool args, and why

Mastra streams tool-call **arguments** as JSON-text deltas (`tool-call-delta.payload.argsTextDelta`, `types.ts:193-198`) between `tool-call-input-streaming-start` and `tool-call-input-streaming-end`. The reasoning, visible from the buffer logic:

- Providers like OpenAI function-calling stream tool arguments token-by-token inside the model response stream. Mastra forwards those deltas so that clients (like Mastra Studio) can show "the model is typing its tool call" in real time.
- At `tool-call-input-streaming-end` mastra attempts `JSON.parse(merged)` of accumulated deltas (`base/output.ts:460-499`). On parse failure it falls back to `args = {}` — the final `tool-call` chunk from the provider (if one arrives) then merges real arguments in (`base/output.ts:556-570`).
- Result: clients see three possible views of the same tool call — `tool-input-start` (toolName known) → `tool-input-delta*` (args being typed) → `tool-input-available` / `tool-output-available` (final args + result). See the aisdk-v5 UI mapping at `compat/ui-message.ts:133-171`.

This is the opposite of our v1 `§15.1` stance ("Does NOT stream: sub-agent ReAct traces"). Mastra treats tool-argument streaming as a **UX affordance for the top-level agent**, not as ReAct-trace noise. They still **don't stream sub-agent internals** — the `agent-execution-event-${string}` wrapper does forward inner chunks but only within `NetworkChunkType`, and clients choose whether to surface it.

### 1.5 Error / refusal / cancellation shapes

- **`error`** — generic `{ error: unknown }` (`types.ts:233-236`). Stream continues or finishes; consumer decides. In aisdk-v5 transform, it becomes `{ type: 'error', errorText: onError(part.error) }` (`compat/ui-message.ts:189-194`).
- **`tripwire`** — structured refusal from the output-processor pipeline: `{ reason, retry?, metadata?, processorId? }` (`TripwirePayload` at `types.ts:345-354`). Terminal: the transform resolves every `DelayedPromise` and calls `controller.terminate()` (`base/output.ts:696-743`). **This is mastra's analogue of our `refusal.started`.**
- **`abort`** — `{}`-ish payload (`types.ts:299-301`), passed through verbatim in aisdk v5 transform (`compat/ui-message.ts:225-227`). Fires when the `abortSignal` passed into `execute.ts` fires (`aisdk/v5/execute.ts:143-171`).
- **`finish.stepResult.reason`** — extended enum `LanguageModelV2FinishReason | 'tripwire' | 'retry'` (`types.ts:38`, `205-212`). So refusal is also reflected in the terminal finish reason.
- **Network-specific aborts** — each primitive family has its own abort chunk: `routing-agent-abort`, `agent-execution-abort`, `workflow-execution-abort`, `tool-execution-abort`, each with `primitiveType` and `primitiveId` (`types.ts:600-618`). Partial cancellation is expressible.

### 1.6 Network / iterative-topology events — the critical insight

For a network (iterative) turn the emitted sequence is — from `loop/network/index.ts:2251-2526` and the chunk union at `types.ts:643-670`:

```
routing-agent-start                            // per iteration
  routing-agent-text-start
  routing-agent-text-delta*
  routing-agent-end { selectionReason, primitiveType, primitiveId }
{ agent-execution-start | workflow-execution-start | tool-execution-start }
  agent-execution-event-<text-start | text-delta | ... >*   // inner stream, tunnelled
{ agent-execution-end | workflow-execution-end | tool-execution-end }
network-validation-start { iteration, checksCount }
network-validation-end { iteration, passed, results, duration, timedOut, maxIterationReached }
network-execution-event-step-finish { iteration, isComplete }
... loop repeats if !isComplete && !maxIterationReached ...
network-execution-event-finish { completionReason, iteration, usage, object? }
```

So one turn is a sequence of (routing → selected-primitive execution → validation → step-finish) blocks, terminated by a single `network-execution-event-finish`. `iteration: number` appears on nearly every network payload (`types.ts:420, 456, 480, 510, 561, 579, 584, 591` etc.), making progress observable without a separate counter.

### 1.7 Stream composition — `MastraAgentNetworkStream` as an outer adapter

`MastraAgentNetworkStream` (`MastraAgentNetworkStream.ts:5-229`) is a `ReadableStream<ChunkType>` subclass. Its `createStream` factory receives a `WritableStream<ChunkType>` that the inner workflow writes into. The outer stream then:

1. Iterates the inner (workflow) stream (`MastraAgentNetworkStream.ts:123-163`).
2. **Unwraps `workflow-step-output`** whose `payload.output` is itself a `ChunkType` — recursively via `getInnerChunk` (`MastraAgentNetworkStream.ts:114-119`). So network-emitted chunks nested inside workflow step envelopes get flattened to the outer consumer.
3. **Accumulates usage** by sniffing `routing-agent-end / agent-execution-end / workflow-execution-end` payloads (`MastraAgentNetworkStream.ts:131-134`). The final `network-execution-event-finish` has its `usage` overwritten with the accumulated total (`MastraAgentNetworkStream.ts:153-158`) — individual steps under-report; the outer stream is the source of truth.
4. **Multiplexes `network-object`** into a separate `objectStream` ReadableStream and resolves a `deferred` `object` Promise on `network-object-result` (`MastraAgentNetworkStream.ts:136-171`).

Pattern: **the outer stream flattens, augments, and de-multiplexes; the inner stream is the raw source of truth.** Consumer exposure is `.fullStream` (raw), `.textStream` (filtered to text-delta), `.objectStream` (partial objects), plus ~15 `DelayedPromise` accessors (text, usage, steps, toolCalls, finishReason, ...) (`base/output.ts:55-77`, `1438-1460`).

### 1.8 Backpressure / abort propagation

- **Backpressure:** `safeEnqueue` (`base/input.ts:13-20`) explicitly **does not** consult `desiredSize` — it just tries `controller.enqueue` and catches. Comment at `input.ts:7-12`: _"Guarding on desiredSize would silently drop chunks under normal backpressure."_ If the downstream cancels, enqueue throws; mastra treats that as "stop."
- **Cancel propagation:** the evented stream's `cancel()` handler removes all emitter listeners (`base/output.ts:1587-1590`). There is no broadcast back to the producer — the producer continues, but its writes into the now-closed controller no-op via `safeEnqueue`.
- **AbortSignal** flows the other direction (from caller into provider) via `options.abortSignal` → the model's `doStream` call (`aisdk/v5/execute.ts:143-171`). `p-retry` honours it. When the signal fires, the provider stream rejects or emits an `abort` chunk.
- **Tripwire** is the only case that explicitly `controller.terminate()`s the downstream (`base/output.ts:742`). `finish` does not terminate — it closes via the EventEmitter `finish` event (`base/output.ts:1570-1574`).

---

## 2. What this tells us

### 2.1 Our §15 taxonomy is too coarse for the iterative topology

Our spec (`§15.3`) defines nine event types. Mastra's network path emits **~25 distinct chunk types per iteration** (routing sub-stream + primitive sub-stream + validation + step-finish), and wraps them in `from: NETWORK | AGENT | WORKFLOW` so consumers can filter. For the iterative topology introduced in `01-orchestrator.md §3.1`, our current schema collapses to a stream of `progress { message }` chunks — which is **prose, not structured data**. Operators cannot programmatically track "which iteration, which sub-agent, did the scorer pass." We need structured iteration events.

### 2.2 Versioning via header is acceptable; versioning via envelope is better

Mastra gets away with no versioning because they control both producer and consumer and `switch` statements fail loudly on unknown variants (`compat/ui-message.ts:239-242`). Our situation is different: **browser clients across 11 multi-zone frontends** consume the SSE stream, and they upgrade asynchronously. Two implications:

- Our `event_schema_version` header is the right call — clients gate their parser on it.
- But we should also adopt mastra's `metadata?: Record<string, unknown>` escape hatch on every event so new fields can ride in without bumping the version.
- A `data-${string}` extension type for experimentation (behind a feature flag) is a good pattern to steal.

### 2.3 The refusal event should be modelled like `tripwire` + terminal finish

Mastra's refusal flow: emit `tripwire` with `{ reason, retry?, metadata?, processorId }`, resolve all delayed promises, `controller.terminate()`. Our `refusal.started` / `turn.ended reason:refused` split is cleaner for SSE (two events, clear terminator), but we should lift three details:

- `metadata: Record<string, unknown>` on `refusal.started` (processor-specific detail, e.g. PII regex match).
- `processor_id: string` (which gate triggered it) — maps to our `§7` gateway pipeline.
- `retry?: boolean` hint so the client can surface "try rephrasing" UX without a second round-trip.

### 2.4 Tool-call streaming decision needs revisiting, but not reversing

Mastra's tool-arg streaming exists because the **top-level** agent's tool-calls are user-observable (e.g. "Searching for reviews by Amy..."). In our architecture the planner is the top-level agent and its "tool calls" _are_ sub-agent invocations — which we explicitly hide (`§15.1`). So we stand by "does NOT stream sub-agent traces."

**But**: our synthesizer may itself issue tool calls (e.g. to fetch a chart dataset post-classification). Those are user-observable work. Our spec does not currently contemplate synthesizer-side tools. If we add them, we should emit a structured `tool.started { tool_name, args_summary }` / `tool.completed { result_summary }` pair (not token-by-token args — that's noise at our UX level). This is a §15.1 omission worth flagging.

### 2.5 Ordering by writer discipline is fragile — we should codify invariants

Mastra's ordering is code-review-enforced. For us, with more downstream consumers (web-shell, module zones, eval harness), we should write the ordering contract as **assertions in a gateway layer** (§7) that validates emitted events before forwarding to SSE. E.g. reject `answer.token` before `answer.shape_declared`; reject any event after `turn.ended`. Mastra's `safeEnqueue` pattern is fine for the transport, but we need a protocol-level linter at the producer.

### 2.6 Stream composition — `MastraAgentNetworkStream` is the pattern for iterative topology

The outer-stream-as-aggregator pattern (flatten nested chunks, accumulate usage, de-multiplex structured output into separate sub-streams) is exactly what we need for §3.1 iterative turns. The orchestrator's outer stream should:

- Flatten sub-agent chunks into the top-level stream (tagged with `sub_agent_domain`, not raw inner events).
- Accumulate tokens and cost across iterations — per-iteration totals are noisy; the turn-final `turn.ended.usage` should be the source of truth.
- Expose partial-object / shape events separately from token events (we already have `answer.shape_declared` / `answer.token` — this is the same idea).

---

## 3. Proposed edits to `agent-runtime.md §15`

### 3.1 Add `metadata` envelope to every event

```
Every SSE event carries:
  event_schema_version: 1          (HTTP header, once per stream)
  trace_id, conversation_id         (on `turn.started` only; inferred thereafter)
  metadata?: Record<string, unknown>    // open-ended forward-compat bag
```

### 3.2 Add iterative-topology events (NEW — depends on §3.1 from 01-orchestrator.md)

Insert after `phase.started`:

- **`iteration.started`** — `{ n: number, sub_agent_domain: string, selection_reason: string }` — fires when the orchestrator dispatches iteration n to a sub-agent. `selection_reason` is domain-only in prod (redacted per §2.1).
- **`iteration.validated`** — `{ n: number, passed: boolean, scorer_results: Array<{ name, score, passed, reason? }>, max_iterations_reached: boolean }` — fires when the iteration's completion-scorer gate runs. Maps to mastra's `network-validation-end` (`types.ts:588-598`, `loop/network/index.ts:2392-2399`).
- **`iteration.ended`** — `{ n: number, is_complete: boolean, usage: { input_tokens, output_tokens, reasoning_tokens } }` — fires when iteration n finishes, regardless of validation outcome. Maps to `network-execution-event-step-finish` (`types.ts:557-563`).

Ordering contract extension:

- Inside a single iterative turn, iterations emit strictly sequentially: `iteration.started n=1` → `iteration.validated n=1` → `iteration.ended n=1` → `iteration.started n=2` → ...
- `answer.shape_declared` fires after the **final** `iteration.ended` where `is_complete: true`, before the first `answer.token`.
- `iteration.*` events never interleave with `answer.token` chunks.

### 3.3 Enrich `refusal.started` payload

Current: `{ reason }`. Replace with:

```
refusal.started {
  reason: string,               // short code: "pii_detected", "policy_block", "budget_exceeded"
  processor_id: string,         // which §7 gateway stage triggered ("gateway.pii", "gateway.scope")
  retry_hint?: boolean,         // true if the client should encourage user to rephrase
  metadata?: Record<string, unknown>   // processor-specific diagnostic (redacted in prod)
}
```

Grounded in mastra's `TripwirePayload` shape (`types.ts:345-354`).

### 3.4 Strengthen `turn.ended.reason` enum

Current: `completed | cancelled | timeout | refused | error | budget`. Add:

- `max_iterations` — iterative topology hit `§3.1` iteration ceiling without `is_complete: true`. Maps to mastra's `maxIterationReached: true` (`types.ts:596`).
- `upstream_error` — distinguish provider/model failure from our own error (helps operations pages).

### 3.5 Add ordering-invariant enforcement point (§15.4, new)

> The orchestrator's outer stream (§3.1) MUST validate every emitted event against this ordering contract before forwarding to SSE transport. Invariants (fail closed):
>
> 1. `turn.started` emitted exactly once, first.
> 2. No event after `turn.ended`.
> 3. `answer.token` requires a prior `answer.shape_declared` in the same turn.
> 4. `iteration.*` events monotonically increasing in `n`, never interleaved with `answer.token`.
> 5. `refusal.started` and `answer.*` are mutually exclusive within a turn.
>
> Violations raise a runtime assertion and are recorded as a trace-level error (span attribute `agent.stream.ordering_violation=true`). They do not abort the stream — the bad event is dropped, the stream continues.

### 3.6 Add `event.extension` for experimentation (§15.3, new final entry)

```
event.extension {
  kind: string,               // `domain.feature-name` namespace
  transient?: boolean,        // if true, do not persist to audit log
  data: Record<string, unknown>
}
```

Purpose: feature-flag new event types without a schema bump. Clients ignore unknown `kind`s. Based on mastra's `DataChunkType` (`types.ts:635-641`).

### 3.7 Clarify tool-call streaming omission (§15.1)

Current: "Does NOT stream: sub-agent ReAct traces." Add a bullet for completeness:

> - **Synthesizer-side tool calls** (if present in a given shape): emit `tool.started { tool_name, purpose }` and `tool.completed { ok, summary }` **between** `answer.shape_declared` and first `answer.token`. Do NOT stream tool-argument deltas (we follow mastra's top-level-only rationale but at our boundary this is never user-observable work worth surfacing at token granularity).

---

## 4. What we are not borrowing

- **Mastra's raw chunk union as our SSE payload.** 32+23+10 = 65 chunk types is correct for an in-process stream consumed by one first-party UI. It is wrong for a versioned public SSE contract consumed by 11 zones + mobile + eval harness. We keep our ~12-event schema and lean on `metadata` + `event.extension` for extensibility.
- **Tool-argument token streaming (`tool-call-delta` with `argsTextDelta`).** Our planner's "tools" are sub-agents (hidden by design, §15.1) and the synthesizer's tools (if any) are coarse-grained. Token-level arg streaming adds noise without UX payoff.
- **The `raw` chunk type** (`types.ts:238-240`, `693-694`). Passing provider-native deltas through for "developer use" is a debug-mode feature; we get the same via Langfuse without polluting the SSE schema.
- **`background-task-progress` polling chunks.** Mastra uses them for tools that spawn long-running sandbox processes (e2b, docker). Our drafted-write model (§15.1 "atomic pending action card after synthesizer") doesn't need mid-task progress — the draft _is_ the progress signal.
- **`primitive-start` as a typed dispatch primitive.** Mastra has a concept of `PRIMITIVE_TYPES = routing | agent | workflow | tool` baked into payloads (`loop/network/index.ts:2500-2509`). Our §3.1 only has "sub-agent" (domain) and "synthesizer" — a single `iteration.started.sub_agent_domain` string suffices.
- **Per-primitive abort events** (`routing-agent-abort`, `agent-execution-abort`, etc.). Partial abort of a sub-agent within a turn is out of scope for v1 — if the user cancels, the whole turn ends with `turn.ended reason:cancelled`. We can add these later if we introduce concurrent sub-agents.
- **`object-result` vs `object` split.** Mastra emits both partial and final structured output. Our `answer.complete { shape, content, citations }` event is the final; partial objects for streaming tables/charts are a v2 feature — document in §15.1 "Future" note.

---

## 5. Open questions

1. **Iteration streaming granularity.** Do we emit a narrative `progress { message: "Reviewing iteration 2 with HR sub-agent..." }` in addition to the structured `iteration.started`? Mastra emits both (structured + the tunnelled `routing-agent-text-delta*` inside `routing-agent-start/end`). Two events doubles the SSE volume but gives clients a choice. Proposal: **yes, both** — the i18n-resolved `progress` is the default UI rendering, the structured event is for power users / ops dashboards.

2. **Where does the ordering validator live?** Per §3.5 above, I propose the orchestrator's outer stream. Alternative: a dedicated `SseGateway` module between orchestrator and HTTP transport (cleaner separation, adds one hop). Needs a call with whoever owns §7.

3. **Usage accumulation strategy.** Mastra's `MastraAgentNetworkStream` (`MastraAgentNetworkStream.ts:67-79, 153-158`) accumulates token counts across all nested events and overwrites the final `network-execution-event-finish.usage` with the rollup. Should our `turn.ended` do the same, or do we trust the synthesizer's terminal `finish.stepResult.usage`? For iterative topology with 3+ sub-agent calls, I believe mastra's rollup approach is correct — cost tracking needs the sum, not the last step.

4. **Is `is-task-complete` worth borrowing as a discrete event?** Mastra emits `is-task-complete { iteration, passed, results, duration, timedOut, maxIterationReached }` (`types.ts:356-376`, `AgentChunkType` variant at `types.ts:715`). It's strictly a subset of `network-validation-end`. Our `iteration.validated` proposal above merges them. Sanity-check with whoever owns §3.1.

5. **Abort semantics when the HTTP connection drops mid-iteration.** Mastra propagates `AbortSignal` into the model provider (`execute.ts:143-171`); if the client disconnects, our `AbortController` fires, the sub-agent's provider call aborts, and we should emit `turn.ended reason:cancelled`. Confirm this wiring exists end-to-end in our current implementation — if not, it's a P1 gap.

6. **Draft events in iterative turns.** Our spec says `draft.proposed` fires post `answer.complete`. In an iterative turn where iteration 2 drafts a write but iteration 3 corrects it, do we emit both drafts? Proposal: **only after the final iteration**, i.e. after `iteration.ended { is_complete: true }`. Intermediate draft intents are trace-only.
