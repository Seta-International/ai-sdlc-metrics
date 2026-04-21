# Key 11 — Cancellation / Abort Signals

**Mastra area:** `packages/core/src/loop/network/index.ts`, `packages/core/src/loop/workflows/agentic-execution/{llm-execution-step,tool-call-step}.ts`, `packages/core/src/agent/workflows/prepare-stream/map-results-step.ts`
**Our design area:** `agent-runtime.md` §7 (gateway pipeline tripwires), §15.2 (Cancellation + cancel-race contract), §4 (turn-end reasons), §14 (budgets)
**Investigation date:** 2026-04-21

---

## 1. How mastra does it

### Native `AbortSignal` threaded through every layer as an option

Two paired parameters are passed side-by-side everywhere:

- `abortSignal?: AbortSignal` — the standard DOM/web primitive.
- `onAbort?: (event) => Promise<void> | void` — callback fired on abort.

`packages/core/src/loop/types.ts:98-99`:

```typescript
onAbort?: (event: any) => Promise<void> | void;
abortSignal?: AbortSignal;
```

No AsyncLocalStorage, no context-stored signal, no wrapper class. The signal is a parameter on the `execute`/`stream` option bag, and every step that wants to be cancellable re-reads `options?.abortSignal?.aborted`.

### Propagation = explicit forwarding, not inheritance

Network loop (`packages/core/src/loop/network/index.ts:686-687, 886-887, 901-902, 2297-2298, 2311-2312, 2342-2343, 2367-2368`) hand-threads `abortSignal` and `onAbort` into every sub-step: routing agent, sub-agent `stream()`, sub-agent `resumeStream()`, workflow step, tool step, validation step. When the network loop is called, the caller's signal is forwarded unchanged into each child. There is no wrapping, no child AbortController, no linked signal — the same `AbortSignal` instance reaches the innermost LLM call and tool invocation.

Agent-level entry points (`packages/core/src/agent/agent.ts:5295-5296, 5371-5372`) accept `onAbort` and `abortSignal` from the caller and forward them identically to `networkLoop`.

### Shared `handleAbort` helper — one abort shape, one path

`packages/core/src/loop/network/index.ts:507-537`:

```typescript
async function handleAbort(opts: {
  writer?: { write: (chunk: any) => Promise<void> } | null
  eventType: string
  primitiveType: string
  primitiveId: string
  iteration: number
  task: string
}) {
  await onAbort?.({
    primitiveType: opts.primitiveType,
    primitiveId: opts.primitiveId,
    iteration: opts.iteration,
  })
  await opts.writer?.write({
    type: opts.eventType,
    runId,
    from: ChunkFrom.NETWORK,
    payload: {
      primitiveType: opts.primitiveType,
      primitiveId: opts.primitiveId,
    },
  })
  return {
    task: opts.task,
    primitiveId: opts.primitiveId,
    primitiveType: opts.primitiveType as z.infer<typeof PRIMITIVE_TYPES>,
    result: 'Aborted' as const,
    isComplete: true as const,
    iteration: opts.iteration,
  }
}
```

A closure over `onAbort` and `runId`, so every check-site just calls `handleAbort({...})`. This is mastra's equivalent of a single abort path: every step routes its abort through the same function, which fires `onAbort`, writes one abort chunk, and returns a consistently-shaped `result: 'Aborted'`.

### Tripwire sites — abort is checked at many gates, not just one

Inside the network loop, `abortSignal?.aborted` is checked at **every stage entry and after every long-running call**:

- Routing step: `index.ts:579` (before execute), `:696` (inside catch if LLM throws), `:718` (after LLM returns).
- Agent sub-step: `:807` (before execute), then again as `agentCallAborted` is inspected on stream chunks (`:960-962`) — if any chunk is `type: 'abort'`, memory persistence is skipped (`:976-985`).
- Workflow sub-step: `:1123` (before execute), `:1301` (after stream completes — checks `workflowCancelled && abortSignal?.aborted` to skip result persistence).
- Tool sub-step: `:1438` (before execute), `:1548` (before approval metadata write), `:1696` (before `tool.execute`), `:1807` (after `tool.execute` returns — skips memory save).

This is not defensive duplication. It is a **pattern of pre-commit checks at every side-effecting boundary**: before writing approval metadata, before persisting tool results, before persisting sub-agent messages. Each such check protects a distinct side-effect — the signal could flip at any point during an `await`, so the check must sit immediately before the write.

### Tool-call abort — passed down to `tool.execute`, not intercepted

`packages/core/src/loop/workflows/agentic-execution/tool-call-step.ts:381-382`:

```typescript
const toolOptions: MastraToolInvocationOptions = {
  abortSignal: options?.abortSignal,
  ...
};
```

Same signal instance is handed to the tool's `execute(args, toolOptions)`. The tool itself decides how to respond — typically by passing `abortSignal` into `fetch()` or any SDK that accepts it. Mastra does not wrap the tool call; it only forwards the signal and checks `.aborted` before and after. If a tool ignores the signal, the tool runs to completion, then mastra checks `.aborted` after return (`:1807`) and throws the result away (does not save to memory, returns `handleAbort` result instead). **The tool's result is discarded but the tool still ran.**

### LLM-level abort — two complementary checks

The LLM execution step (`llm-execution-step.ts`) handles the fact that providers may continue streaming after the caller disconnects:

1. **Error-path abort** — `:1207-1215`: if the LLM call throws and it's an `isAbortError(error) && options?.abortSignal?.aborted`, fire `onAbort({ steps })`, enqueue `{ type: 'abort' }` chunk, return `callBail: true`.
2. **Signal-fired-but-no-throw abort** — `:1298-1305`: same behaviour for the case where `processOutputStream` saw the signal and broke the loop but the model did not throw. Comment at `:1295-1297`:

   > _"Handle abort detected via signal check in processOutputStream (loop broke early). The model may not have thrown an AbortError (e.g. it continued streaming despite abort), so this handles the case where processOutputStream completed normally via `break`."_

3. **In-flight stream cut-off** — `llm-execution-step.ts:136-142`:

   ```typescript
   for await (const chunk of outputStream._getBaseStream()) {
     // Stop processing chunks if the abort signal has fired.
     // Some LLM providers continue streaming data after abort (e.g. due to buffering),
     // so we must check the signal on each iteration to avoid accumulating the full
     // response into the messageList after the caller has disconnected.
     if (options?.abortSignal?.aborted) {
       break;
     }
     ...
   }
   ```

This is the **closest analogue to our "gateway checks abort immediately before write"**: the consumer of an LLM stream re-checks on every chunk to avoid persisting post-disconnect data.

### Persistence-on-abort suppression — mastra's pre-commit check analogue

`packages/core/src/agent/workflows/prepare-stream/map-results-step.ts:279-330`:

```typescript
// Skip memory persistence when the abort signal has fired.
// The LLM response may have continued after the caller disconnected,
// and we should not persist a partial or full response for an aborted request.
const aborted = options.abortSignal?.aborted;

if (!aborted) {
  try {
    const outputText = messageList.get.all.core().map(m => m.content).join('\n');
    await capabilities.executeOnFinish({ ... });
  } catch (e) { ... }
} else {
  agentSpan?.end();
}
```

Before the final `executeOnFinish` (which persists messages to memory), check `aborted` one last time. If aborted: skip the write entirely, just close the span. This is textbook pre-commit-check: even though the LLM stream may have completed, the memory write is skipped on post-completion abort.

### Workflow cancellation — the one place mastra actively cancels work

For sub-workflows, mastra registers an abort listener that forwards cancellation:

`packages/core/src/loop/network/index.ts:1182-1193`:

```typescript
const networkAbortCb = async () => {
  await run.cancel()
  await onAbort?.({
    primitiveType: 'workflow',
    primitiveId: inputData.primitiveId,
    iteration: inputData.iteration,
  })
}
if (abortSignal) {
  abortSignal.addEventListener('abort', networkAbortCb)
}
```

Then at stream consumption time, `workflowCancelled` is set when a `workflow-canceled` chunk is seen (`:1242-1244`), and memory persistence is skipped iff `workflowCancelled && abortSignal?.aborted` (`:1301`).

This is the **only place** mastra actively calls cancel on a downstream resource. Everywhere else, mastra is passive: it forwards the signal and checks `.aborted` at commit points.

### Abort event payload shape

The `onAbort` callback at network level carries `{ primitiveType, primitiveId, iteration }` (`:515-519`). At LLM level it carries `{ steps }` (`:1208-1210, 1299-1301`). No `reason` field, no classification — mastra does not distinguish user-cancel from timeout from budget from provider-outage. One `AbortSignal`, one `onAbort` callback, one shape. The stream chunk is `{ type: 'abort', payload: {} }` (test evidence `test-utils/options.ts:8100-8104`).

### No timeout primitive — timeout is "just use `AbortSignal.timeout`"

A grep for `AbortSignal.timeout|setTimeout.*abort` in `packages/core/src/loop/` turns up only unrelated matches (test delays, background-task timeouts, scorer race timeouts at `validation.ts:246-252`). The core loop does **not** ship an internal turn-level wallclock. Mastra trusts the caller to construct `AbortSignal.timeout(30_000)` (or any signal source) and hand it in. No `turn_timeout_ms` option exists.

### No billing-on-abort accounting

Mastra's `onAbort` payloads do not include `usage`. After abort, `totalUsage` is emitted as zeros (`test-utils/options.ts:8068-8075` — `onAbortCalls` = `[{ steps: [] }]`, no usage). There is no explicit "charge the tenant for tokens consumed up to the abort" logic. The assumption is that the provider-side usage response is lost when the call is cancelled mid-stream.

---

## 2. What this tells us

### Our cancel-race contract is _exactly_ what mastra does — but mastra has many more commit points

Our §15.2 specifies one pre-commit check ("gateway checks abort signal immediately before issuing the write"). Mastra has a pattern of them: before approval metadata write, before sub-agent memory save, before tool-result memory save, before `executeOnFinish`, on every stream chunk consumption. This validates the shape of our design — **pre-commit checks are a class, not a single gate**. We have one narrow example (mutation writes); mastra shows the broader pattern: every side-effecting boundary inside a cancellable region wants its own check.

### Signal-as-parameter beats context-stored signal

Mastra chose explicit forwarding over AsyncLocalStorage / context-stored signals. Upside: the dependency is visible in every function signature, you cannot forget to propagate. Downside: boilerplate — 8+ forwarding sites in `network/index.ts` alone. Given our hexagonal + DDD boundaries (§7 gateway owns the pipeline, sub-agents are isolated), parameter-passing is a better fit than a context-stored signal that cuts across module boundaries. Our `RequestContext` should **not** carry `abortSignal`.

### Mastra does NOT distinguish cancellation reasons — we should

Mastra's `onAbort` payload has no `reason`. Our §15.2 mandates `cancellation_reason ∈ { user, timeout, budget, provider_outage, quality_canary }` because our alerting, retry semantics, and UX diverge by cause (see §14: `budget` mid-turn vs pre-turn `refused` must not collapse). Mastra's choice is defensible in a library context; in a multi-tenant platform context, it is under-specified. We retain our explicit reasons.

### Mastra's abort shape `{ primitiveType, primitiveId, iteration }` is a trace-annotation shape, not ours

Their shape tells an observer _which_ inner primitive was interrupted. Our shape `{ trace_id, cancellation_reason }` tells _why_ and _which whole turn_. The two shapes answer different questions. Borrowing the per-primitive annotation as additional trace metadata would let us pinpoint the sub-agent / tool / workflow that was in-flight at abort time, without touching the outer `cancellation_reason`. Useful for observability §12.

### In-flight tool calls: mastra forwards the signal, then **discards** the result

Key finding on our open question _"What happens to in-flight tool calls when the outer turn is cancelled?"_ Mastra's answer is twofold:

1. **Pass `abortSignal` into the tool** (`tool-call-step.ts:381-382`). The tool may or may not use it — mastra cannot force a downstream `fetch` to abort.
2. **If the tool ignores the signal and returns normally**, mastra checks `.aborted` after (`network/index.ts:1807`) and routes the result through `handleAbort` → discarded. The tool ran, its side effects (if any, e.g. an HTTP mutation) happened, but the result is not persisted and not returned to the LLM.

This is the _right_ answer for our design: a well-behaved tool respects the signal and bails; a misbehaving tool's work is thrown away from the runtime's perspective but we cannot unwind it on the external service. This aligns with our honest UX: _"Timesheet draft saved at 10:23:45.102 before cancellation at 10:23:45.401."_

### No built-in timeout — force the caller to construct the timeout signal

Mastra's decision to not own the timeout primitive means every caller has to decide. For us, the 30s chat timeout is a platform-wide invariant (§14 Per-turn wallclock). We should construct the timeout signal at the gateway entry point, combine it with the user-cancel signal (via `AbortSignal.any([userCancel, AbortSignal.timeout(30_000)])`), and thread that composed signal inward. This is **strictly better** than the mastra model because our timeout is a platform contract, not a per-call choice.

### Workflow cancellation pattern: register listener + active cancel

Mastra's only active cancel is `run.cancel()` for sub-workflows (`network/index.ts:1183-1193`). The pattern — subscribe to the outer abort signal and invoke the child resource's native cancel API — is directly applicable to any of our downstream resources that expose native cancel (pg-boss job cancellation, external HTTP request cancellation via `fetch` + `signal`). For everything else, the mastra pattern is: pass the signal down, trust the implementor, check on return. We can adopt the same split.

### Billing-on-abort: mastra punts; we must not

Mastra does not charge for tokens consumed during aborted turns. Our §15.2 explicitly says _"Cost for tokens already consumed is billed."_ Mastra's silence is a gap, not an answer. We need to wire up partial-usage accounting at every abort check-site: when `onAbort` fires, pull whatever `result.usage` the stream has accumulated so far and bill it. The LLM-level `onAbort` payload at `llm-execution-step.ts:1208-1210` carries `{ steps }` — steps have usage — so the raw data is there, we just need to aggregate it. **Action:** our `onAbort` payload must include `{ usage: { inputTokens, outputTokens } }` so §14 billing can tally it.

---

## 3. Proposed edits to `agent-runtime.md`

### §7 gateway pipeline — reframe step 4 as an instance of a pattern

Current (paraphrased): _"Pre-write abort-signal check. Fires only on `.mutation()` procedures."_

Proposed addition: note that this is one instance of a broader **pre-commit check pattern** — any step that produces durable state (mutation write, memory persistence, approval-metadata emit, usage billing) re-reads the signal immediately before committing. Cite mastra's pattern (commit-points at `network/index.ts:579, 807, 1123, 1438, 1548, 1696, 1807`, `map-results-step.ts:282-330`) as prior art in §17.

### §15.2 — add "signal-as-parameter" invariant

Explicit: `abortSignal` is an option-bag parameter threaded down through every sub-agent / tool / workflow call. It is never stored in `RequestContext` or AsyncLocalStorage. Rationale: visibility in signatures + DDD module boundary hygiene. Cite mastra as prior art.

### §15.2 — add "compose timeout at gateway entry" invariant

Specify that the 30s turn timeout is constructed at gateway entry via `AbortSignal.any([userCancelSignal, AbortSignal.timeout(TURN_WALLCLOCK_MS)])`, and the composed signal is what propagates inward. Separate internal signals keyed to `cancellation_reason`:

- `user` → caller's cancel signal
- `timeout` → `AbortSignal.timeout(30_000)`
- `budget` → signal tripped by budget check in §14
- `provider_outage`, `quality_canary` → system-triggered cancel handles

All merge via `AbortSignal.any`. The composed signal carries `cancellation_reason` via a side-channel (a WeakMap keyed by the signal, or a wrapping helper) so the onAbort handler can report which source fired.

### §15.2 — specify abort payload shape

Our `onAbort` event payload:

```typescript
type AbortEvent = {
  trace_id: string
  cancellation_reason: 'user' | 'timeout' | 'budget' | 'provider_outage' | 'quality_canary'
  usage: { input_tokens: number; output_tokens: number } // for billing
  in_flight: {
    primitive_type: 'routing' | 'sub_agent' | 'workflow' | 'tool'
    primitive_id: string
    iteration: number
  } | null // borrowed from mastra's shape for pinpointing the interrupted primitive
}
```

`usage` is non-optional — closes the "Cost for tokens already consumed is billed" contract.

### §17 prior art — add entry

New row:

> **Mastra network abort pattern** (`packages/core/src/loop/network/index.ts:485-537, 1182-1193`, `packages/core/src/loop/workflows/agentic-execution/llm-execution-step.ts:136-142, 1207-1215, 1295-1306`, `packages/core/src/agent/workflows/prepare-stream/map-results-step.ts:279-330`) — validates: single `AbortSignal` threaded as an option-bag parameter, shared `handleAbort` helper, pre-commit abort checks at every side-effecting boundary, `abortSignal.addEventListener('abort', cb)` pattern for actively cancelling downstream resources (sub-workflows). Adapted with: explicit `cancellation_reason` classification (mastra has none), usage in abort payload (mastra has none), `AbortSignal.any` composition for timeout at gateway entry (mastra does not own timeout).

---

## 4. What we are not borrowing

- **No-classification abort event.** Mastra's `onAbort({ primitiveType, primitiveId, iteration })` has no `reason`. We need `cancellation_reason` for §14 alerting, §4 turn-end reasons, and divergent retry/UX semantics. Keep our explicit reasons.
- **No-timeout-primitive posture.** Mastra trusts callers to construct timeout signals. For us the 30s turn wallclock is a platform invariant; the gateway composes it, not the caller.
- **Usage-less abort payload.** Mastra drops usage at abort boundaries. We must carry partial usage through `onAbort` to bill correctly.
- **The `onAbort` per-primitive shape _alone_.** Useful as an extra field (`in_flight`), but not as the primary event shape. Our primary shape is keyed on `trace_id` + `cancellation_reason`, not on the interrupted primitive.
- **AsyncLocalStorage / context-stored signal.** Already rejected by mastra, re-rejected here on DDD grounds.

---

## 5. Open questions

1. **Signal composition with reason reporting.** `AbortSignal.any` merges signals but loses the reason of the one that fired. Options: (a) a `WeakMap<AbortSignal, 'user' | 'timeout' | ...>` at the gateway; (b) a thin wrapper class `AbortHandle { signal; reason() }`; (c) use the signal's `reason` property (set via `AbortController.abort(reason)`) with a typed reason object. Option (c) is the cleanest — browser/Node native, no wrapper. Needs a spike to confirm `AbortSignal.any` preserves the first-fired signal's `reason`.

2. **Active cancel for in-flight tRPC `.mutation()` calls.** Mastra's sub-workflow cancel pattern (`run.cancel()` registered on the abort event) is directly applicable — but our `.mutation()` calls are plain tRPC invocations, not long-running runs. Does cancelling a mutation at the gateway (via the signal passed to the tool/procedure) reach the Drizzle query layer? Drizzle does not natively support `AbortSignal`. We may need to check-and-bail before calling Drizzle, with no true mid-query abort. Needs investigation.

3. **Where to put the `usage` accumulator.** Mastra's LLM step already has the usage in `result.usage`, and the abort path at `llm-execution-step.ts:1207-1215` fires `onAbort({ steps })` where steps carry usage. We need a running accumulator at the `ModelGateway` / turn boundary that the abort handler can read. Does our current §10 `ModelGateway` maintain a per-turn usage accumulator that survives abort? If not, adding one is a prerequisite for the billing contract.

4. **Approval metadata on abort.** Mastra has a check before writing approval metadata (`index.ts:1548`). Our approval-inbox flow (draft-written, suspended for approval) has a similar commit boundary — if an abort fires between "tool wants approval" and "approval row written", we should discard. Current §15.2 says _"Drafted writes NOT yet submitted are discarded; NOT persisted to approval inbox."_ Confirm our gateway step 4 (§7) covers this or add a separate pre-commit check on the approval-inbox write path.

5. **Do we ever retry an aborted turn?** Mastra does not. Our `cancellation_reason = 'provider_outage'` arguably should retry silently, whereas `user` never should. Current §15.2 does not explicitly address. Needs decision recorded.
