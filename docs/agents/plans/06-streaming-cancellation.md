# 06 — Streaming + SSE Contract + Cancellation

**Design §§:** §15 (Streaming, Cancellation & Interface Contracts), §4 (error classes).

---

## 1. Scope

### In

- HTTP endpoints: `POST /agent/turn` (SSE), `POST /agent/turn/:trace_id/cancel`, `GET/DELETE /agent/conversations*`, `GET/POST/DELETE /agent/memory` (L3).
- SSE event schema versioned via `event_schema_version` header.
- Runtime-asserted ordering at outer stream gateway (not prose-only).
- Every event carries optional `metadata?: Record<string, unknown>` bag.
- Cancellation via `AbortSignal.any([userCancel, timeout, systemAbort])` composition.
- Typed `cancellation_reason ∈ { user | timeout | budget | provider_outage | quality_canary }`.
- Abort payload carries `usage` for billing honesty.
- Active-cancel downstream (pg-boss `.cancel()`, external fetch abort).
- Iteration event triplet (`iteration.started / .validated / .ended`) for plan 12 iterative topology — ships dormant at MVP.
- Client SDK event-schema mirror in `packages/agent`.
- Identity-key write discipline: `tenant_id`, `user_id`, `trace_id`, `delegation_id`, `surface` are set by middleware only; tool handlers and sub-agent code CANNOT write them.

### Out

- Synthesizer token production (plan 03 emits logical `answer.token` events; this plan defines the wire contract + runtime assertion).
- Budget threshold detection (plan 05 triggers `systemAbortController.abort({ reason: 'budget' })`).
- Quality-canary trigger (plan 10).
- Draft presenter rendering (plan 08 owns `<AgentDraftCard>`).
- Disambiguation UX flow (plan 03 emits; product owns UI).

---

## 2. Design Context

The SSE contract is a **public, versioned interface** consumed by 11 Next.js zones + any future external embedding. Unlike mastra's 65-variant internal chunk taxonomy (spike 10-streaming-events), ours is deliberately coarser (~12 events) because we have many consumers with independent release cycles. Freezing the schema shape while permitting non-load-bearing experimentation requires a dual discipline: versioned schema header + non-versioned `metadata` bag on every event.

**Ordering is load-bearing and enforced at runtime**, not just prose. Mastra's ordering is writer-discipline only — their producers just await sequentially. We add a gateway that validates every emitted event against a state machine; out-of-order emission closes the stream with `error`. This survives refactors that prose invariants don't.

**Single abort path.** User cancel, wallclock timeout, budget exhaustion mid-flight, provider outage, and quality-canary degradation all traverse the same code path, differing only by `cancellation_reason`. Typed enum — "unknown" is not a valid value. `AbortSignal.any` composes the three root signals into one that flows as a parameter through every layer. This is the §15.2 contract made real.

**Pre-commit check pattern.** The gateway's pre-write abort check (plan 01 step 4) is one instance of a broader pattern: every side-effecting boundary re-reads `abortSignal.aborted` before the commit. Mastra ships this pattern across 8+ sites (spike 11); our version is enforced and audited.

**Cost honesty in abort payload.** Mastra drops usage on abort. We honor the §15.2 "cost for tokens already consumed is billed" by carrying a usage snapshot drawn from the running accumulator into the abort event. Wire-level honesty, not just prose.

**Identity-key write discipline.** `RequestContext` identity keys are set exclusively by middleware (RlsMiddleware / JWT verifier / pg-boss worker bootstrap). Tool handlers + sub-agent code can READ but never WRITE these keys. Prior art: mastra's `MASTRA_RESOURCE_ID_KEY` precedence convention (spike 02), upgraded from precedence-ordered to write-forbidden.

**What this is NOT:** a general streaming framework. It is a constrained SSE contract with a specific state machine, a specific abort model, and a specific set of consumers.

**Prior-art review — what was adopted and what was rejected.** Claude Code's streaming/cancellation substrate (`query.ts`, `StreamingToolExecutor.ts`, `utils/abortController.ts`, `services/api/claude.ts`) was reviewed as prior art. Two patterns were confirmed aligned: (a) abort-signal parameter threading (never via ambient/AsyncLocalStorage) — R-06.25; (b) `AbortSignal.any` composition — R-06.24. Four patterns were **rejected** because they are terminal-CLI-shaped: (i) ANSI terminal escape codes / raw stdout streaming — our consumers are React components in Next.js zones, not a TTY; event payloads are structured data, not rendered bytes. (ii) Process-global session tokens (Claude Code reads `CLAUDE_CODE_SESSION_ACCESS_TOKEN` from env) — multi-tenant SaaS has 10+ concurrent turns per pod; identity flows exclusively through `RequestContext` (R-06.36). (iii) Silent streaming→non-streaming fallback — invisible retries are anti-UX for HR managers watching a progress indicator; any retry adding ≥500ms of perceived silence emits a `progress` event (R-06.35a). (iv) Concurrent tool execution interleaved with synthesizer token emission — our phase boundary is strict (R-06.14), not overlapped; Claude Code's REPL can overlap because there's no approval-card atomicity to preserve.

---

## 3. Data Model

### `agent_active_turn` (ephemeral, heartbeat-expired)

One row per in-flight turn. Used for cross-pod cancel discovery when an admin force-stops a turn running on a different ECS task than the one handling the cancel HTTP call.

- `trace_id UUID PK` — equal to `turnId`.
- `tenant_id UUID` (RLS).
- `user_id UUID` — owner of the turn.
- `conversation_id UUID` (nullable for async jobs).
- `pod_id TEXT` — ECS task identifier; target for `POST /agent/turn/:trace_id/cancel` forwarding.
- `surface TEXT`.
- `started_at TIMESTAMPTZ`.
- `last_heartbeat_at TIMESTAMPTZ` — refreshed every 5s by the owning pod.
- Index: `(tenant_id, started_at DESC)`; `(last_heartbeat_at)` for sweep.
- TTL: rows with `last_heartbeat_at` older than 30s are considered dead. Plan 09's sweep job deletes them and invokes compensating cleanup (release drafts in `proposed` state, close orphaned Langfuse spans). Crash + pod-loss recovery leans on this.

### Event sequence numbers

Every emitted SSE event carries a monotonic `seq: number` (turn-scoped, starts at 1, increments once per `emit()` call). Sequence is **not** load-bearing for ordering (the state machine owns ordering) — it exists to make future reattach/resume semantics non-breaking. Clients may ignore `seq` at MVP. See §18 open question on multi-zone reattach.

### In-memory per-turn controller state

- `turnId: UUID` — equal to `trace_id`.
- `userCancelController: AbortController` — one per turn; triggered by `POST /agent/turn/:trace_id/cancel`.
- `systemAbortController: AbortController` — one per turn; triggered by plan 05 / plan 10.
- `timeoutSignal: AbortSignal` — `AbortSignal.timeout(WALLCLOCK_MS)`, created at turn start.
- `turnAbortSignal: AbortSignal` — composed via `AbortSignal.any([userCancelController.signal, systemAbortController.signal, timeoutSignal])`.
- `usageAccumulator: { inputTokens, outputTokens, inputCachedRead, inputCachedWrite, outputReasoning }` — mutated by plan 03 as LLM calls complete; read on abort.

### In-memory stream state machine

```
type StreamStateMachine =
  | 'turn-not-started'
  | 'turn-started-no-content'
  | 'phase-active'
  | 'iteration-pending-validation'
  | 'iteration-validated'
  | 'refusal-sent'
  | 'shape-declared'
  | 'tokens-streaming'
  | 'answer-complete'
  | 'draft-phase'
  | 'turn-ended'
  | 'stream-errored'
```

Transitions per §15 ordering contract.

### `event_schema_version` (config constant)

- Semver-like: `"1.0.0"` at MVP ship.
- Bumped on shape change (not on `metadata` additions).
- Shipped as HTTP response header on every SSE response: `event_schema_version: 1.0.0`.

---

## 4. Interface Contracts

### HTTP request shapes

```
// POST /agent/turn
type TurnRequestBody = {
  surface: 'global-chat' | `inline:${string}:${string}` | 'async';
  conversation_id?: string;
  user_utterance: string;
  context: {
    current_screen: string;
    selection?: unknown;
  };
}

// POST /agent/turn/:trace_id/cancel
// No body. Path param identifies the running turn.

// GET /agent/conversations?cursor=&limit=&surface=
// GET /agent/conversations/:id
// DELETE /agent/conversations/:id
// GET/POST/DELETE /agent/memory (L3, user-initiated only)
```

### SSE event types

```
// Every event carries a turn-scoped monotonic `seq` starting at 1; see §3 Event sequence numbers.
type SseEvent =
  | { seq: number; type: 'turn.started'; payload: { trace_id, conversation_id, topology: 'bounded' | 'iterative' }; metadata?: Record<string, unknown> }
  | { seq: number; type: 'phase.started'; payload: { phase: 1 | 2; sub_agents: Array<{ domain: string }> }; metadata? }
  | { seq: number; type: 'iteration.started'; payload: { n: number; sub_agent_domain: string; selection_reason: string }; metadata? }
  | { seq: number; type: 'iteration.validated'; payload: { n: number; passed: boolean; scorer_results: ScorerResult[]; max_iterations_reached: boolean }; metadata? }
  | { seq: number; type: 'iteration.ended'; payload: { n: number; is_complete: boolean; usage: UsageSnapshot }; metadata? }
  | { seq: number; type: 'progress'; payload: { message: string; cause?: 'vendor_retry' | 'fallback' | 'long_tool' }; metadata? }   // human-readable, i18n-resolved; `cause` indicates internal origin for debugging
  | { seq: number; type: 'refusal.started'; payload: { reason: RefusalReason; processor_id?: string; retry_allowed: boolean; metadata?: Record<string, unknown> }; metadata? }
  | { seq: number; type: 'answer.shape_declared'; payload: { shape: AnswerShape; skeleton?: unknown }; metadata? }
  | { seq: number; type: 'answer.token'; payload: { text: string }; metadata? }
  | { seq: number; type: 'answer.complete'; payload: { shape: AnswerShape; content: unknown; citations: Citation[] }; metadata? }
  | { seq: number; type: 'draft.proposed'; payload: { action_id: string; summary: string; tier: 'low' | 'high'; requires_approval: boolean; provenance: DraftProvenance }; metadata? }
  | { seq: number; type: 'turn.ended'; payload: { reason: TurnEndReason; usage: UsageSnapshot; cancelled_by?: UUID }; metadata? }

type TurnEndReason = 'completed' | 'cancelled' | 'timeout' | 'refused' | 'error' | 'budget' | 'provider_outage' | 'quality_canary'
type RefusalReason = 'daily_budget' | 'insufficient_minimum' | 'rate_limit' | 'disambiguation' | 'model_policy' | 'internal'
type UsageSnapshot = { input_tokens; output_tokens; input_cached_read; input_cached_write; output_reasoning }
```

### `StreamEmitter` (consumed by plans 03, 05, 10)

```
emit(event: SseEvent): void   // validates against state machine; throws on violation
close(reason: TurnEndReason, usage: UsageSnapshot): void
error(cause: string): void    // forces stream into 'stream-errored' state
```

Emit is synchronous validation + async write. Violating the state machine raises a runtime error that is caught by the outermost handler and converted to `turn.ended.reason: error`.

### `AbortCoordinator` (new; module boundary)

```
composeTurnAbortSignal(opts: {
  wallclockMs: number;
}): {
  signal: AbortSignal;
  userCancelController: AbortController;
  systemAbortController: AbortController;
  captureReason(): CancellationReason | undefined;
}
```

`captureReason()` inspects which of the three root signals fired first by attaching listeners at compose time; `undefined` if none fired yet.

### `AbortPayloadBuilder`

```
buildPayload(opts: {
  reason: CancellationReason;
  usageAccumulator: UsageSnapshot;
}): SseEvent  // returns the `turn.ended` event with correct reason + usage
```

### `RequestContext` identity-key discipline (types)

```
// Middleware-set keys (write-forbidden downstream):
const IDENTITY_KEYS = ['tenant_id', 'user_id', 'trace_id', 'delegation_id', 'surface'] as const;

// Type-level branded key that blocks writes:
type RequestContextWrite<K extends string, V> = K extends typeof IDENTITY_KEYS[number]
  ? never                     // compile-forbid identity writes from non-middleware callers
  : [K, V]

// Runtime: attempts to set an identity key from non-middleware code throw in dev, drop + log in prod.
```

### Client SDK event-schema mirror (`packages/agent`)

```
type AgentEventConsumer = {
  on<T extends SseEvent['type']>(type: T, handler: (event: Extract<SseEvent, { type: T }>) => void): void;
  close(): void;
}
```

Shared TypeScript type defs between server + client; no duplication.

---

## 5. Control Flow

### Turn lifecycle (happy path)

1. `POST /agent/turn` arrives. Fastify controller authenticates via existing session middleware.
2. **Middleware sets identity keys** on `RequestContext`: `tenant_id`, `user_id`, `trace_id` (generated UUIDv7), `surface`.
3. Controller invokes `AbortCoordinator.composeTurnAbortSignal({ wallclockMs: 30000 })` → returns composed signal + two controllers.
4. Controller opens SSE response with `event_schema_version: 1.0.0` header and `content-type: text/event-stream`.
5. `StreamEmitter.emit({ type: 'turn.started', payload: { trace_id, conversation_id, topology: 'bounded' } })`.
6. Plan 02 router + plan 03 phase executor take over. They receive `turnAbortSignal` + `streamEmitter` as parameters.
7. Phase execution produces `phase.started`, `progress*`, `answer.shape_declared?`, `answer.token*`, `answer.complete`, `draft.proposed*` events in sequence.
8. `StreamEmitter.close('completed', usageAccumulator)` → emits `turn.ended` with reason + usage.
9. SSE response closes.

### User cancel

1. `POST /agent/turn/:trace_id/cancel` arrives.
2. Handler looks up `trace_id` in the active-turn registry → finds `userCancelController`.
3. Calls `userCancelController.abort()`.
4. Composed signal fires. In-flight `ToolLoopAgent` + `generateObject` calls propagate abort to provider SDK; pg-boss active-cancel listeners fire `run.cancel()`.
5. Plan 03 phase-executor returns `{ kind: 'aborted', reason: 'user' }`.
6. `AbortPayloadBuilder.buildPayload({ reason: 'user', usageAccumulator })` constructs the `turn.ended` event.
7. Drafted-not-submitted writes discarded. Synthesizer NOT invoked if aborted before phase completion.
8. `StreamEmitter.close('cancelled', usage)` — `cancellation_reason: 'user'` stamped on trace root.

### Timeout

1. `AbortSignal.timeout(30_000)` fires after 30s wallclock.
2. Composed signal fires → same path as user cancel.
3. `AbortCoordinator.captureReason()` returns `'timeout'`.
4. `turn.ended.reason: 'timeout'`.

### Budget mid-turn

1. Plan 05 `BudgetChecker.midTurnCheck` detects tenant crossed 100%.
2. `systemAbortController.abort()` with reason captured as `'budget'`.
3. Same path; `turn.ended.reason: 'budget'`.

### Provider outage

1. Plan 03 LLM call returns provider 5xx after retries.
2. Plan 05 distinguishes `provider_fallback` (tried alt model, succeeded) vs `provider_outage` (all alternatives failed).
3. On `provider_outage`: `systemAbortController.abort({ reason: 'provider_outage' })`.
4. `turn.ended.reason: 'provider_outage'`.

### Quality canary degradation (plan 10 trigger)

1. Plan 10's rolling canary detects degraded-flag for both model tiers.
2. Mid-flight turns: `systemAbortController.abort({ reason: 'quality_canary' })`.
3. `turn.ended.reason: 'quality_canary'`.

### Pre-commit check pattern (used by plans 01, 04, 08)

At every side-effecting boundary (gateway step 4, memory save, draft persist, workflow result save, `executeOnFinish`, every LLM stream chunk):

```
if (abortSignal.aborted) {
  emit tripwire / return early without side effect.
  the caller surfaces the abort through the normal path.
}
// commit side effect.
```

Plan 01 gateway step 4 is one instance. Plan 04 save-queue flush checks before persist. Plan 08 `draft.proposed` emit checks before inserting into approval inbox.

### Active-cancel-via-listener (external resources)

For any downstream resource with a native cancel API:

```
turnAbortSignal.addEventListener('abort', () => externalHandle.cancel(), { once: true });
```

Applied to:

- pg-boss `run.cancel()` for async tool calls.
- `fetch(url, { signal: turnAbortSignal })` for external HTTP tool calls.
- Any long-poll / WebSocket reused by tools.

### Ordering violation handling

1. Plan 03 bug: synthesizer emits `answer.token` before `answer.shape_declared` (where shape is non-narrative).
2. `StreamEmitter.emit` validates against state machine → invalid transition.
3. Emitter logs warning + calls `error('out_of_order_event')`.
4. Stream state → `stream-errored`. `turn.ended.reason: 'error'` emitted.
5. Post-incident: span attribute `ordering_violation: 'answer.token-before-shape-declared'` points at the offending producer.

### Identity-key write attempt (should never happen)

1. Adversarial or buggy tool handler tries `requestContext.set('tenant_id', 'other-tenant')`.
2. Typed branded key blocks at compile where possible.
3. Runtime: dev mode throws; prod mode logs monitoring alert `identity_key_write_attempted` + drops the write.
4. Audit row captures the attempt for security review (§18.2 cross-tenant-leak test suite catches any that slip through).

### Event `metadata` bag

Any plan can add `metadata: { foo: 'bar' }` to its emitted events without bumping `event_schema_version`. Clients receive and may log; must not act on contents.

Experimental usage: plan 10 attaches `metadata: { canary_iteration: N }` during A/B experiments; removed when experiment closes.

---

## 6. Requirements

### HTTP surface

| #      | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Design §§    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| R-06.1 | `POST /agent/turn` body per §4 interface; returns SSE stream                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | §15.3        |
| R-06.2 | `POST /agent/turn/:trace_id/cancel` triggers `userCancelController.abort()` for the live turn. **Authorization:** (a) `user_id` matching the turn's owner → always allowed (self-cancel). (b) Different `user_id`, same tenant → requires `canDo('agent.force_stop_turn')` (e.g. line-manager/admin force-stop). (c) `platform_admin` scope → requires `canDo('admin.turn.force_stop')` (SETA operator). Cross-user/admin cancels stamp `cancelled_by: UUID` on the `turn.ended` payload and emit `agent.turn_force_stopped` kernel audit event with actor + reason. Unauthorized → 403. **Cross-pod discovery:** handler looks up `trace_id` in `agent_active_turn`; if `pod_id` ≠ current pod, forwards the cancel via internal RPC to the owning pod. | §15.2, §15.3 |
| R-06.3 | `GET /agent/conversations` returns GLOBAL conversations only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | §15.3        |
| R-06.4 | `GET /agent/conversations?surface=...` queries inline by surface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | §15.3        |
| R-06.5 | `GET /agent/conversations/:id`, `DELETE /agent/conversations/:id` standard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | §15.3        |
| R-06.6 | `GET/POST/DELETE /agent/memory` — L3; underlying mutations omit `.meta({ agent })` as enforcement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | §15.3, §5    |
| R-06.7 | Every SSE response includes `event_schema_version` HTTP header                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | §15          |

### SSE events

| #        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                     | Design §§      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----- |
| R-06.8   | 12 events per §4 interface                                                                                                                                                                                                                                                                                                                                                                                                                      | §15.3          |
| R-06.9   | `turn.started.payload.topology: 'bounded'                                                                                                                                                                                                                                                                                                                                                                                                       | 'iterative'`   | §15.3 |
| R-06.10  | `phase.started.payload.sub_agents[]` — domain only in prod; sub-agent name in dev mode                                                                                                                                                                                                                                                                                                                                                          | §15.1          |
| R-06.11  | `refusal.started.payload = { reason, processor_id?, retry_allowed, metadata? }`                                                                                                                                                                                                                                                                                                                                                                 | §15.3          |
| R-06.12  | `answer.shape_declared` fires BEFORE first `answer.token` for non-narrative shapes                                                                                                                                                                                                                                                                                                                                                              | §15.1, §9      |
| R-06.13  | `answer.complete.payload = { shape, content, citations }`                                                                                                                                                                                                                                                                                                                                                                                       | §15.3          |
| R-06.14  | `draft.proposed` fires AFTER `answer.complete`, NEVER interleaved with tokens                                                                                                                                                                                                                                                                                                                                                                   | §15.1          |
| R-06.14a | **Persist-then-emit atomicity:** `draft.proposed` SSE event is emitted ONLY after the approval-inbox row (plan 08) is durably persisted. Ordering is: persist row → emit event. If persist fails, emit is replaced by a `progress` event with `cause: 'draft_persist_failed'` and the turn proceeds without the draft (error logged P2). Guarantees the UI's source of truth: any card seen in SSE is also recoverable via `GET /agent/drafts`. | §15.1, plan 08 |
| R-06.15  | `turn.ended.payload.usage` populated from accumulator at close time                                                                                                                                                                                                                                                                                                                                                                             | §15.3          |
| R-06.16  | `turn.ended.reason` enum per §4                                                                                                                                                                                                                                                                                                                                                                                                                 | §15.3          |
| R-06.17  | Every event carries optional `metadata?` — non-versioned, never load-bearing                                                                                                                                                                                                                                                                                                                                                                    | §15.3          |
| R-06.17a | Every event carries a turn-scoped monotonic `seq: number` starting at 1. Not load-bearing for ordering (state machine owns that); reserved for future reattach/resume semantics. Clients MUST tolerate but MAY ignore at MVP.                                                                                                                                                                                                                   | §15.3          |

### Ordering

| #       | Requirement                                                                      | Design §§ |
| ------- | -------------------------------------------------------------------------------- | --------- |
| R-06.18 | `turn.started` first, `turn.ended` last; exactly one of each                     | §15.3     |
| R-06.19 | Bounded: `phase.started` / `progress` interleaved zero or more                   | §15.3     |
| R-06.20 | Iterative: `iteration.{started,validated,ended}` triplet in order per iteration  | §15.3     |
| R-06.21 | Either `refusal.started` → terminal OR `answer.*` → `draft.proposed*` → terminal | §15.3     |
| R-06.22 | Runtime state-machine validation at outer gateway; out-of-order → `error`        | §15.3     |
| R-06.23 | `error` vs `refused` distinct (retry semantics differ)                           | §15.3     |

### Cancellation

| #       | Requirement                                                                  | Design §§ |
| ------- | ---------------------------------------------------------------------------- | --------- |
| R-06.24 | `turnAbortSignal = AbortSignal.any([userCancel, timeout, systemAbort])`      | §15.2     |
| R-06.25 | Composed signal parameter-threaded; never stored on ALS, never reconstructed | §15.2     |
| R-06.26 | `cancellation_reason` typed enum; "unknown" not valid                        | §15.2     |
| R-06.27 | Pre-commit check pattern at every side-effecting boundary                    | §15.2, §7 |
| R-06.28 | Drafted-not-submitted writes discarded on abort; synthesizer not invoked     | §15.2     |
| R-06.29 | Abort payload carries `usage` from running accumulator                       | §15.2     |
| R-06.30 | Active-cancel-via-listener for pg-boss, external fetch, WebSocket            | §15.2     |

### Streaming discipline

| #        | Requirement                                                                                                                                                                                                                                                                                                                                                                              | Design §§ |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-06.31  | Synthesizer output tokens stream                                                                                                                                                                                                                                                                                                                                                         | §15.1     |
| R-06.32  | Sub-agent ReAct traces DO NOT stream — Langfuse only                                                                                                                                                                                                                                                                                                                                     | §15.1     |
| R-06.33  | Drafted writes DO NOT stream — atomic card after synthesizer                                                                                                                                                                                                                                                                                                                             | §15.1     |
| R-06.34  | Inline copilots: no phase stepper, simple spinner                                                                                                                                                                                                                                                                                                                                        | §15.1     |
| R-06.35  | Phase-event granularity: prod = domain only; dev = sub-agent + tool                                                                                                                                                                                                                                                                                                                      | §15.1     |
| R-06.35a | **Fallback visibility.** Any internal retry or provider fallback (per plan 05 R-05.20b/c) that adds ≥500ms of perceived silence MUST emit a `progress` event with `cause: 'vendor_retry' \| 'fallback' \| 'long_tool'` before the retry fires. Silent retries are rejected — users must see activity. Exception: retries completing under the 500ms threshold may be silent (low-noise). | §15.1     |

### Identity-key discipline

| #       | Requirement                                                                                                  | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| R-06.36 | `tenant_id`, `user_id`, `trace_id`, `delegation_id`, `surface` are middleware-write-only on `RequestContext` | §15.4     |
| R-06.37 | Tool handlers / sub-agent code attempting to write identity keys: throw in dev, drop + log in prod           | §15.4     |
| R-06.38 | Write attempt emits `identity_key_write_attempted` security audit event                                      | §15.4     |

### Active-turn registry

| #       | Requirement                                                                                                                                                                                                                                                                                  | Design §§      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| R-06.39 | Every in-flight turn owns one `agent_active_turn` row with `pod_id` + 5s heartbeat. Row cleared on terminal event (any `turn.ended`). Plan 09 sweep deletes rows whose `last_heartbeat_at` exceeds 30s, releases any `proposed`-state drafts from that turn, and closes open Langfuse spans. | §15.2, plan 09 |
| R-06.40 | Cross-pod cancel: `POST /agent/turn/:trace_id/cancel` reaching a pod that does not own the turn reads `pod_id` from `agent_active_turn` and forwards via internal RPC; if no row found (already ended or swept) returns 404 idempotently.                                                    | §15.2          |

---

## 7. Failure Modes & Recovery

| Failure                                                         | Symptom                                                                    | Recovery                                                                                                                                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client disconnects mid-stream                                   | SSE write fails with EPIPE                                                 | Runtime catches; calls `userCancelController.abort({ reason: 'user' })`; treated as user cancel.                                                                              |
| Producer emits out-of-order event                               | Runtime state-machine throws                                               | `StreamEmitter.error` → `turn.ended.reason: 'error'`; span attr identifies offending producer.                                                                                |
| `POST /cancel` arrives after turn already ended                 | No active-turn registry entry                                              | 404 returned; idempotent; no error.                                                                                                                                           |
| Timeout fires after `turn.ended` already sent                   | Second `turn.ended` attempt → state-machine error                          | Guard: state-machine rejects repeat terminal; first terminal wins.                                                                                                            |
| Multiple abort reasons fire near-simultaneously                 | Composed signal captures whichever attached listener fired first           | First-fired reason wins; others ignored. Deterministic at listener-registration time.                                                                                         |
| pg-boss `cancel()` fails                                        | Resource cleanup incomplete                                                | Log P2; trigger cleanup sweep job. Turn still ends.                                                                                                                           |
| `fetch` abort on upstream tool with slow disconnect             | Tool call lingers; socket close                                            | Acceptable for short lingers; escalate if >5s after abort.                                                                                                                    |
| Backpressure — slow client cannot drain SSE                     | Fastify write queue saturates                                              | Bounded queue; overflow → `turn.ended.reason: 'error'` with cause = `client_backpressure`.                                                                                    |
| Event-schema mismatch (client on old schema receives new field) | `metadata` bag ignored; new event type → client logs unknown-event warning | Client MUST tolerate unknown event types + unknown metadata keys (forward compat). Verified in SDK tests.                                                                     |
| Identity-key write attempt in prod                              | Drop + alert                                                               | Alert investigates; never acts as user-identity override.                                                                                                                     |
| Cross-user cancel without required permission                   | `canDo` denial                                                             | 403 to caller; no abort; audit event `agent.turn_force_stopped_attempt_denied` with actor + target turn.                                                                      |
| Owning pod crashes mid-turn                                     | `agent_active_turn` heartbeat stops; after 30s sweep deletes row           | Plan 09 sweep releases drafts + closes spans + (optionally) writes a synthetic `turn.ended.reason: error` for downstream accounting. Client SSE already dead on EPIPE.        |
| Cross-pod cancel RPC fails (network blip to owning pod)         | Forward RPC timeout                                                        | Retry forward once; if still failing, set `agent_active_turn.abort_pending: true` + let owning pod detect on next heartbeat. Caller receives 202 accepted + `eventual: true`. |
| Draft persist fails between synthesizer and `draft.proposed`    | DB error on approval-inbox insert                                          | Per R-06.14a: no `draft.proposed` emitted; a `progress` event with `cause: 'draft_persist_failed'` is emitted; turn continues. P2 log. UI never shows a phantom card.         |

---

## 8. Observability Surface

### Spans

- `TURN` root (owned by plan 07; this plan's events stamp on it).
- `SSE:stream-gateway` — child of `TURN`; wraps the state-machine lifecycle.
- `ABORT:signal-fired` — child; fires when any abort source triggers; attrs `{ source: 'user' | 'timeout' | 'system', reason: CancellationReason }`.

### Span attributes (on `TURN` root; stamped as turn closes)

- `turn.ended.reason: TurnEndReason`
- `cancellation_reason?: CancellationReason`
- `ordering_violation?: string` — producer identifier on failures
- `event_count: number`
- `usage_at_close: UsageSnapshot`
- `client_disconnect: boolean`

### Metrics

- `agent_turn_total{tenant_id, topology, reason}` — counter.
- `agent_turn_duration_ms{tenant_id, reason}` — histogram.
- `agent_abort_total{tenant_id, source, reason}` — counter.
- `agent_ordering_violation_total{producer}` — counter (P2 alert on any positive).
- `agent_identity_key_write_attempted_total` — counter (P1 alert on any positive).
- `agent_sse_backpressure_total{tenant_id}` — counter.
- `agent_turn_force_stopped_total{tenant_id, actor_role}` — counter. `actor_role ∈ {admin, platform_admin}`; self-cancel excluded. Trends inform force-stop-UX tuning.
- `agent_active_turn_sweep_total{tenant_id, cause}` — counter. `cause ∈ {heartbeat_expired, pod_crash_detected}`. P2 alert on sustained positive rate (indicates pod instability).
- `agent_draft_persist_failure_total{tenant_id}` — counter. Non-zero ⇒ R-06.14a fired; P2 alert.
- `agent_progress_event_total{tenant_id, cause}` — counter. `cause ∈ {vendor_retry, fallback, long_tool}`; lets us quantify perceived-latency events driven by R-06.35a.

### Dashboards

- Turn completion rate by reason (MVP target: `completed` ≥ 99%).
- Abort source distribution (user cancels, timeouts, budgets).
- Ordering-violation occurrences (should be 0 in steady state; spike → producer regression).
- Identity-key-write-attempted count (should be 0 always; P1 if nonzero).

---

## 9. Security Considerations

- **SSE exposure surface.** Endpoint requires authenticated session; RLS applies to downstream reads. No PII in SSE events beyond what the user's own session already reveals.
- **Cancel-race honesty.** Writes committed before pre-commit check fire — UX communicates this ("saved before cancel"). Never fabricate a rollback that didn't happen.
- **Active-cancel-via-listener side effects.** pg-boss `cancel()` may itself fail; we log but don't block turn termination. A lingering background task with no owner is a leak; cleanup sweep job (plan 09) catches.
- **Identity-key write discipline.** The P1 invariant preventing cross-tenant impersonation via subtle framework misuse. Tested via seeded attempts in integration suite.
- **`metadata` bag injection.** Clients MUST treat it as non-load-bearing. A server-side bug leaking sensitive data into `metadata` is a separate concern; `metadata` should be scrubbed of PII by convention (and pre-capture redaction catches free-text fields).
- **Event-schema upgrade.** Bump triggers coordinated client+server rollout. Breaking schema without bump is a P1 incident.
- **Backpressure DoS.** Bounded queue prevents a slow client from pinning server memory; overflow ends turn with error. Documented as expected behavior for slow clients.

---

## 10. Performance Budget

| Operation                                                | p50                                    | p95    | p99                                |
| -------------------------------------------------------- | -------------------------------------- | ------ | ---------------------------------- |
| `POST /agent/turn` request-to-first-byte (stream opened) | <80ms                                  | <200ms | <400ms                             |
| SSE event emit + write                                   | <2ms                                   | <5ms   | <15ms                              |
| `POST /cancel` → `turn.ended` observed                   | <100ms                                 | <300ms | <800ms (in-flight work winds down) |
| State-machine validation per event                       | <0.1ms                                 | <0.3ms | <1ms                               |
| Abort composition (`AbortSignal.any` setup)              | <1ms                                   | <2ms   | <5ms                               |
| Event-schema mirror parse (client)                       | <0.5ms                                 | <1ms   | <3ms                               |
| SSE stream total duration                                | matches turn duration (plan 03 budget) |

---

## 11. Testing Strategy

### Unit

- State-machine: valid transition sequences pass; every invalid transition throws.
- `AbortCoordinator.composeTurnAbortSignal`: abort via each source fires composed signal; `captureReason` returns correct string.
- `AbortPayloadBuilder.buildPayload`: usage accumulator propagates into payload.
- Identity-key write: `requestContext.set('tenant_id', 'x')` throws in dev mode; returns dropped in prod mode.

### Integration

- Happy-path turn: full event sequence validated; ordering passes; `turn.ended.usage` matches `agent_cost_event` row sum.
- User cancel mid-synthesizer: `POST /cancel` during token stream → `turn.ended.reason: cancelled` within <800ms; drafted writes discarded.
- Timeout: seed a sub-agent that hangs 35s → `AbortSignal.timeout` fires at 30s → `turn.ended.reason: timeout`.
- Budget mid-turn: seed tenant budget to cross 100% on second LLM call → `systemAbortController.abort({ reason: 'budget' })` → `turn.ended.reason: budget`.
- Provider outage: seed LLM 5xx on all retries + no fallback → `turn.ended.reason: provider_outage`.
- Quality canary: seed plan 10 degraded-flag → `turn.ended.reason: quality_canary`.
- Ordering violation: seed a producer to emit `answer.token` before `turn.started` → stream errors; span attr captured.
- Pre-commit check: seed abort exactly between gateway step 4 and invoke → write NOT committed; turn ends cancelled.
- pg-boss active-cancel: tool wraps pg-boss run; abort fires → `run.cancel()` called within 100ms.
- Client disconnect: close SSE socket mid-stream → `userCancelController.abort({ reason: 'user' })` triggers via write-error detection.
- Identity-key write: seed a tool handler attempting `requestContext.set('tenant_id', ...)` → in dev throws with clear message; in prod alert fires + attempt dropped.
- Cross-user cancel: user-A with `canDo('agent.force_stop_turn')` cancels user-B's turn → succeeds; `turn.ended.payload.cancelled_by = user_A_id`; `agent.turn_force_stopped` kernel audit row present.
- Cross-user cancel denied: user-A without permission cancels user-B's turn → 403; no abort fires; `agent.turn_force_stopped_attempt_denied` audit row present.
- Cross-pod cancel: pod-1 owns a turn, cancel POST hits pod-2 → pod-2 reads `agent_active_turn`, forwards RPC to pod-1, turn ends; observed latency under R-06.2 budget.
- Active-turn heartbeat leak: simulate pod crash (kill heartbeat) → 35s later plan 09 sweep deletes row + releases `proposed` drafts tied to that turn.
- Persist-then-emit atomicity: seed approval-inbox insert to fail → `draft.proposed` NOT emitted; `progress` event with `cause: 'draft_persist_failed'` emitted instead; no phantom card visible to client.
- Fallback visibility: seed plan 05 vendor_overload retry adding 2s latency → `progress` event with `cause: 'vendor_retry'` observed before retry fires; user-visible latency never exceeds 500ms of silence.
- Sequence numbers: assert every emitted event has monotonic `seq` starting at 1 with no gaps.

### Property

- Abort idempotence: multiple aborts → turn ends exactly once; first reason wins.
- Event metadata tolerance: client receives event with extra `metadata.foo` → parses and ignores; no error.
- State-machine transitions: for all valid sequences, no state reached has unreachable successor.

### E2E

- Full browser test: `web-planner` user opens agent, sends query, clicks cancel mid-stream → UI shows cancelled state + any already-saved drafts.
- Forward compat: client SDK v1.0.0 consuming server events with `metadata: { experimental_foo: true }` → parses cleanly.

### Fixtures

- `fixtures/sse-sequences/happy-bounded-table.jsonl`
- `fixtures/sse-sequences/refusal-budget.jsonl`
- `fixtures/sse-sequences/cancel-mid-stream.jsonl`
- `fixtures/sse-sequences/ordering-violation-seeded.jsonl`
- `fixtures/sse-sequences/iteration-triplet.jsonl` (for plan 12 dormancy verification).

---

## 12. Acceptance Criteria

- All unit + integration + property + E2E tests pass.
- Ordering violations fire `error` turn end and are captured in trace attr.
- `turn.ended.usage` reconciles with `agent_cost_event` row sums for every turn.
- Client disconnect → stream closes cleanly within 500ms; no orphan tasks.
- Identity-key write attempts in prod produce alert; never succeed.
- SDK forward-compat: old client reading new server (with `metadata` additions) works without errors.
- `event_schema_version: 1.0.0` header present on every SSE response at MVP.
- Cross-user force-stop audit trail: every non-self cancel produces exactly one `agent.turn_force_stopped` kernel audit row with actor, target user, reason.
- Persist-then-emit atomicity verified: zero phantom `draft.proposed` events observed in integration suite across seeded persist-failure cases.
- Active-turn registry heartbeat observed at 5s cadence; sweep deletes rows within 30s of crash.
- Every emitted event carries `seq ≥ 1`; monotonic within a turn; no gaps.

---

## 13. Rollout Plan

- **Phase 1** — ship SSE endpoint + state machine + abort composition with a static canned-response turn (no real agent). Verifies wire contract.
- **Phase 2** — wire to plan 02+03 for real turns; enable cancel endpoint.
- **Phase 3** — add timeout + system abort wiring (plan 05 integration).
- **Phase 4** — client SDK mirror in `packages/agent`; all zones consume.

**Backout:** SSE contract is public; changes must be schema-version-compatible. A regression that produces invalid events fails ordering validation and surfaces as `error` turn end — bad but visible. Rollback is PR revert; no feature flag since the endpoint is the whole surface.

---

## 14. Dependencies

- Plan 01: gateway pipeline (consumes threaded `abortSignal`).
- Plan 03: phase executor (emits logical events).
- Plan 04: memory save-queue (pre-commit check).
- Plan 05: `systemAbortController` for budget.
- Plan 07: trace + span correlation.
- Plan 08: `draft.proposed` event shape + persist-then-emit atomicity (R-06.14a).
- Plan 09: `agent_active_turn` sweep job (R-06.39) + compensating cleanup on pod crash.
- Plan 10: `systemAbortController` for quality canary.

## 15. Integration Points

- `apps/api/src/modules/agents/interface/http/agent-turn-controller.ts` — Fastify SSE endpoint.
- `apps/api/src/modules/agents/interface/http/agent-cancel-controller.ts`.
- `apps/api/src/modules/agents/application/services/stream-gateway.ts` — state machine + emit/close/error.
- `apps/api/src/modules/agents/application/services/abort-coordinator.ts`.
- `apps/api/src/modules/agents/application/services/active-turn-registry.ts` — cancel lookup by `trace_id`; in-memory per-pod + `agent_active_turn` row mirror with 5s heartbeat.
- `@future/db` — `agent_active_turn` table (R-06.39).
- `apps/api/src/modules/agents/infrastructure/cross-pod-cancel.ts` — internal RPC forwarding for cross-pod cancel (R-06.40).
- `packages/agent/src/runtime/sse-event-schema.ts` — shared type defs.
- `packages/agent/src/runtime/event-consumer.ts` — client SDK.
- Zone apps — `/api/agent/turn` Next.js rewrite per zone.
- Existing session middleware — `RlsMiddleware` + JWT verifier.
- pg-boss — `.cancel()` consumed.

## 16. Activation Gate

MVP. Ships with first production turn.

**Iteration event triplet** ships MVP but only fires when plan 12 (iterative topology) activates at Beta.

## 17. Out of Scope

- Draft presenter rendering (plan 08).
- Disambiguation UX flow (plan 03 emits; product owns UI).
- Iterative topology activation (plan 12).
- WebSocket transport (SSE only at MVP; WebSocket is a separate design if needed).
- HTTP/2 multiplexing optimizations.

## 18. Open Questions

- **Bump policy for `event_schema_version`.** Shape change = major; new event type = minor; new `metadata` keys = no bump. Finalize naming convention + client SDK version alignment. Owner: SDK maintainer.
- **Backpressure bounded-queue size.** How many events can buffer before overflow? Proposal: 1000; tune after observed traffic.
- **Client SDK `metadata` handling.** Log but never act — document explicitly in README. Owner: SDK maintainer.
- **Cancel idempotence at HTTP layer.** Multiple `POST /cancel` → single abort; second/third 404 or 200? Recommend: 200 always (idempotent), body indicates if it was a no-op.
- **`/agent/memory` L3 mutation shape.** Does UI call tRPC directly or goes through REST proxy? Recommend: direct tRPC (consistent with other L3 admin); this endpoint exists for consistency with GET only.
- **Multi-zone / multi-tab reattach.** A user may open a conversation in a second tab (same zone) or navigate across zones (hard reload per CLAUDE.md) while a turn is mid-stream. MVP behavior: original stream dies on navigation/tab-close via EPIPE → user cancel fires. Second tab/zone can poll `GET /agent/conversations/:id` after the turn ends. Future: a `GET /agent/turn/:trace_id/stream?from_seq=N` reattach endpoint replays buffered events from `seq = N+1`. `seq` field (R-06.17a) and `agent_active_turn` (R-06.39) are the forward-compat primitives that make this a non-breaking addition later. Owner: decide at Beta based on real user multi-tab telemetry. Do NOT add reattach at MVP.
- **Cancel idempotency + eventual-consistency surface.** When cross-pod cancel RPC fails and we set `abort_pending: true` on the registry row, the HTTP response to the canceller is 202 + `eventual: true`. Is that acceptable UX, or should we block until the owning pod confirms? Recommend 202 — unblocks the admin UI; audit trail captures eventual completion.
