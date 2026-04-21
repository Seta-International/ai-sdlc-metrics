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

---

## 3. Data Model

### No new tables at MVP

Cancellation is ephemeral; streaming is ephemeral; events reference the existing `trace_id` from plan 07. All persistence is through plan 04 (messages) + plan 07 (spans) + plan 08 (drafts).

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
type SseEvent =
  | { type: 'turn.started'; payload: { trace_id, conversation_id, topology: 'bounded' | 'iterative' }; metadata?: Record<string, unknown> }
  | { type: 'phase.started'; payload: { phase: 1 | 2; sub_agents: Array<{ domain: string }> }; metadata? }
  | { type: 'iteration.started'; payload: { n: number; sub_agent_domain: string; selection_reason: string }; metadata? }
  | { type: 'iteration.validated'; payload: { n: number; passed: boolean; scorer_results: ScorerResult[]; max_iterations_reached: boolean }; metadata? }
  | { type: 'iteration.ended'; payload: { n: number; is_complete: boolean; usage: UsageSnapshot }; metadata? }
  | { type: 'progress'; payload: { message: string }; metadata? }   // human-readable, i18n-resolved
  | { type: 'refusal.started'; payload: { reason: RefusalReason; processor_id?: string; retry_allowed: boolean; metadata?: Record<string, unknown> }; metadata? }
  | { type: 'answer.shape_declared'; payload: { shape: AnswerShape; skeleton?: unknown }; metadata? }
  | { type: 'answer.token'; payload: { text: string }; metadata? }
  | { type: 'answer.complete'; payload: { shape: AnswerShape; content: unknown; citations: Citation[] }; metadata? }
  | { type: 'draft.proposed'; payload: { action_id: string; summary: string; tier: 'low' | 'high'; requires_approval: boolean; provenance: DraftProvenance }; metadata? }
  | { type: 'turn.ended'; payload: { reason: TurnEndReason; usage: UsageSnapshot }; metadata? }

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

| #      | Requirement                                                                                       | Design §§    |
| ------ | ------------------------------------------------------------------------------------------------- | ------------ |
| R-06.1 | `POST /agent/turn` body per §4 interface; returns SSE stream                                      | §15.3        |
| R-06.2 | `POST /agent/turn/:trace_id/cancel` triggers `userCancelController.abort()` for the live turn     | §15.2, §15.3 |
| R-06.3 | `GET /agent/conversations` returns GLOBAL conversations only                                      | §15.3        |
| R-06.4 | `GET /agent/conversations?surface=...` queries inline by surface                                  | §15.3        |
| R-06.5 | `GET /agent/conversations/:id`, `DELETE /agent/conversations/:id` standard                        | §15.3        |
| R-06.6 | `GET/POST/DELETE /agent/memory` — L3; underlying mutations omit `.meta({ agent })` as enforcement | §15.3, §5    |
| R-06.7 | Every SSE response includes `event_schema_version` HTTP header                                    | §15          |

### SSE events

| #       | Requirement                                                                            | Design §§    |
| ------- | -------------------------------------------------------------------------------------- | ------------ | ----- |
| R-06.8  | 12 events per §4 interface                                                             | §15.3        |
| R-06.9  | `turn.started.payload.topology: 'bounded'                                              | 'iterative'` | §15.3 |
| R-06.10 | `phase.started.payload.sub_agents[]` — domain only in prod; sub-agent name in dev mode | §15.1        |
| R-06.11 | `refusal.started.payload = { reason, processor_id?, retry_allowed, metadata? }`        | §15.3        |
| R-06.12 | `answer.shape_declared` fires BEFORE first `answer.token` for non-narrative shapes     | §15.1, §9    |
| R-06.13 | `answer.complete.payload = { shape, content, citations }`                              | §15.3        |
| R-06.14 | `draft.proposed` fires AFTER `answer.complete`, NEVER interleaved with tokens          | §15.1        |
| R-06.15 | `turn.ended.payload.usage` populated from accumulator at close time                    | §15.3        |
| R-06.16 | `turn.ended.reason` enum per §4                                                        | §15.3        |
| R-06.17 | Every event carries optional `metadata?` — non-versioned, never load-bearing           | §15.3        |

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

| #       | Requirement                                                         | Design §§ |
| ------- | ------------------------------------------------------------------- | --------- |
| R-06.31 | Synthesizer output tokens stream                                    | §15.1     |
| R-06.32 | Sub-agent ReAct traces DO NOT stream — Langfuse only                | §15.1     |
| R-06.33 | Drafted writes DO NOT stream — atomic card after synthesizer        | §15.1     |
| R-06.34 | Inline copilots: no phase stepper, simple spinner                   | §15.1     |
| R-06.35 | Phase-event granularity: prod = domain only; dev = sub-agent + tool | §15.1     |

### Identity-key discipline

| #       | Requirement                                                                                                  | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| R-06.36 | `tenant_id`, `user_id`, `trace_id`, `delegation_id`, `surface` are middleware-write-only on `RequestContext` | §15.4     |
| R-06.37 | Tool handlers / sub-agent code attempting to write identity keys: throw in dev, drop + log in prod           | §15.4     |
| R-06.38 | Write attempt emits `identity_key_write_attempted` security audit event                                      | §15.4     |

---

## 7. Failure Modes & Recovery

| Failure                                                         | Symptom                                                                    | Recovery                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Client disconnects mid-stream                                   | SSE write fails with EPIPE                                                 | Runtime catches; calls `userCancelController.abort({ reason: 'user' })`; treated as user cancel.          |
| Producer emits out-of-order event                               | Runtime state-machine throws                                               | `StreamEmitter.error` → `turn.ended.reason: 'error'`; span attr identifies offending producer.            |
| `POST /cancel` arrives after turn already ended                 | No active-turn registry entry                                              | 404 returned; idempotent; no error.                                                                       |
| Timeout fires after `turn.ended` already sent                   | Second `turn.ended` attempt → state-machine error                          | Guard: state-machine rejects repeat terminal; first terminal wins.                                        |
| Multiple abort reasons fire near-simultaneously                 | Composed signal captures whichever attached listener fired first           | First-fired reason wins; others ignored. Deterministic at listener-registration time.                     |
| pg-boss `cancel()` fails                                        | Resource cleanup incomplete                                                | Log P2; trigger cleanup sweep job. Turn still ends.                                                       |
| `fetch` abort on upstream tool with slow disconnect             | Tool call lingers; socket close                                            | Acceptable for short lingers; escalate if >5s after abort.                                                |
| Backpressure — slow client cannot drain SSE                     | Fastify write queue saturates                                              | Bounded queue; overflow → `turn.ended.reason: 'error'` with cause = `client_backpressure`.                |
| Event-schema mismatch (client on old schema receives new field) | `metadata` bag ignored; new event type → client logs unknown-event warning | Client MUST tolerate unknown event types + unknown metadata keys (forward compat). Verified in SDK tests. |
| Identity-key write attempt in prod                              | Drop + alert                                                               | Alert investigates; never acts as user-identity override.                                                 |

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
- Plan 08: `draft.proposed` event shape.
- Plan 10: `systemAbortController` for quality canary.

## 15. Integration Points

- `apps/api/src/modules/agents/interface/http/agent-turn-controller.ts` — Fastify SSE endpoint.
- `apps/api/src/modules/agents/interface/http/agent-cancel-controller.ts`.
- `apps/api/src/modules/agents/application/services/stream-gateway.ts` — state machine + emit/close/error.
- `apps/api/src/modules/agents/application/services/abort-coordinator.ts`.
- `apps/api/src/modules/agents/application/services/active-turn-registry.ts` — cancel lookup by `trace_id`.
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
