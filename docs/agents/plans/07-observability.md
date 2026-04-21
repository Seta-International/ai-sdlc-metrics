# 07 — Observability + Sampling + `trace_id` Correlation

**Design §§:** §12 (Observability), §8 (content-hash attributes), §18 (observability readiness criteria).

---

## 1. Scope

### In

- Langfuse self-hosted collector; OTel wiring at `apps/api` bootstrap (plan 00 shipped base; this plan completes it).
- Two-dimensional span taxonomy: `span_type` × `entity_type`.
- Typed `SamplingConfig` discriminated union with trace-level atomicity invariant.
- Stratified sampling: 1% baseline + 100% on 5 MVP triggers.
- `trace_id` (UUIDv7) stamped on `agent_message`, every kernel audit event, Langfuse trace, pg-boss job row, outbox events, approval_request rows.
- Tool-output audit trail (kernel-owned, separate from Langfuse).
- Pre-capture PII / tenant-authored redaction at write time.
- Per-span attributes: content hashes, version strings, TTFT, cache-token breakdown, `request_context_keys` auto-stamp, cancellation reason.
- Leaf-only usage accumulation (no pre-aggregation on turn root).
- Router-accuracy regression signals.
- Per-turn anomaly signals.
- Approval inbox depth observability.
- Confidence calibration dashboard.
- Retention: traces ≥30d, audit ≥90d, configurable per tenant.

### Out

- Quality canary scheduling + fixture-tenant management (plan 10 — this plan provides the signal surface).
- LLM-judge scorers (GA).
- Full-fleet prompt capture beyond stratified (GA).
- Self-hosted Langfuse deployment / ops (infra concern — documented in implementation doc).

---

## 2. Design Context

Observability is **tenet #6** — version-tagged, trace-correlated, tenant-partitioned. Retrofitting observability onto a live system is measurably more expensive than building with it. Every code path in every plan stamps spans; we take the cost up-front.

**Two-dimensional span taxonomy** borrows mastra's `SpanType × EntityType` pattern (spike 08) but with a much smaller enum set because our topology is fixed. Dimension separation lets operators filter "all router spans regardless of shape" OR "all synthesis spans regardless of origin" without string-prefix hacks.

**Trace-level sampling atomicity** is load-bearing for replay correctness. The decision to sample or not is made ONCE at the trace root and inherited by every child span via `NoOpSpan` propagation. Mastra shipped a fix for this exact bug (issue #11504) when they realized per-child sampling creates half-captured trees that can't be replayed. We bake the invariant in from day one.

**Single `trace_id` end-to-end** is our strongest observability advantage over mastra. Their `traceId` appears only on observability-owned tables (`scores`, `feedback`, `metrics`) — application DB rows carry no trace ID. Ours stamps `agent_message`, `kernel_audit`, `tool_invocation`, pg-boss jobs, outbox events, approval_requests. One ID to grep gives end-to-end correlation for any incident.

**Leaf-only usage accumulation** prevents double-count when exporters flatten the span tree. Mastra enforces this explicitly (`observability/types/tracing.ts:444-447`); we adopt directly.

**`request_context_keys` auto-stamp** removes hundreds of manual `span.setAttr('tenant_id', ...)` call sites that inevitably drift. `RequestContext` knows the identity keys (plan 06); the auto-stamper hooks into span creation to copy them.

**PII redaction at capture, not query.** Retrospective scrubbing after a GDPR request is a nightmare; we redact `tenantAuthoredFreeText` fields pre-capture. User's own utterance requires a separate purge-by-user-id operation (plan 04 owns the erasure pipeline; this plan wires the Langfuse side).

**What this is NOT:** a general-purpose tracing library. It is a configured Langfuse-backed pipeline with specific sampling rules, specific attribute conventions, and specific dashboards.

---

## 3. Data Model

### Span (Langfuse + OTel shape; not a Postgres table)

All spans carry:

- `trace_id: UUIDv7`
- `span_id: UUID`
- `parent_span_id: UUID?`
- `span_type: SpanType`
- `entity_type: EntityType`
- `tenant_id: UUID` (always — auto-stamped from request context)
- `name: string` (e.g. `gateway:resolve`, `router-prompt:build`)
- `start_time, end_time`
- Attributes (see §4 interface).

### `kernel_audit_event` (kernel-owned; relevant columns)

Consumed here; schema owned by kernel module:

- `trace_id UUID` (added as a tag on all agent-emitted audit events).
- `event_type TEXT` (`'agent.tool_called'`, `'agent.prompt_stored'`, `'agent.narrative_stored'`, `'agent.draft_proposed'`, `'agent.draft_executed'`, `'agent.budget_topup'`, `'user_erased_start/complete/partial'`, etc.).
- `actor_user_id UUID?`
- `on_behalf_of UUID?`
- `via_delegation UUID?`
- `via_schedule UUID?`
- `approved_by UUID?`
- `tenant_id UUID` (RLS).
- `payload JSONB`
- `created_at TIMESTAMPTZ`.
- Index: `(trace_id)`, `(tenant_id, created_at DESC)`.

### `agent_tool_invocation` (tool-output audit trail, separate from Langfuse)

- `id UUID PK`
- `trace_id UUID` (RLS via tenant_id).
- `tenant_id UUID`.
- `tool_name TEXT`.
- `args JSONB` — canonicalized.
- `result_preview BYTEA` — first 16KB of serialized result, pre-redaction not applied (raw; full-capture class — the audit is the source of truth for "what did the agent see").
- `result_hash TEXT` — SHA-256 canonicalized full result.
- `byte_count INT`.
- `result_status TEXT` — from plan 01 gateway.
- `sub_agent_key TEXT`.
- `phase INT` — 1 or 2.
- `iteration INT?` — populated for iterative topology (plan 12).
- `created_at TIMESTAMPTZ`.
- Index: `(trace_id)`, `(tenant_id, tool_name, created_at)`.

### `agent_session` (from plan 02)

Referenced here for hash attributes on trace root.

---

## 4. Interface Contracts

### Span taxonomy enums

```
enum SpanType {
  TURN = 'TURN',
  ROUTER_PLAN = 'ROUTER_PLAN',
  SUB_AGENT_PLAN = 'SUB_AGENT_PLAN',
  SUB_AGENT_TOOL_CALL = 'SUB_AGENT_TOOL_CALL',
  SUB_AGENT_SYNTHESIS = 'SUB_AGENT_SYNTHESIS',
  PHASE_2 = 'PHASE_2',
  SYNTHESIZER = 'SYNTHESIZER',
  GATEWAY_STEP = 'GATEWAY_STEP',
  ITERATION = 'ITERATION',    // plan 12
  MEMORY = 'MEMORY',
  FINAL = 'FINAL',
}

enum EntityType {
  ROUTER = 'ROUTER',
  SUB_AGENT = 'SUB_AGENT',
  TOOL = 'TOOL',
  SYNTHESIZER = 'SYNTHESIZER',
  GATEWAY = 'GATEWAY',
  PROCESSOR = 'PROCESSOR',
  MEMORY = 'MEMORY',
  DELEGATION = 'DELEGATION',
}
```

### `SamplingConfig`

```
type SamplingConfig =
  | { type: 'always' }
  | { type: 'never' }
  | { type: 'ratio'; probability: number }
  | { type: 'triggered'; triggers: TriggerPredicate[]; baselineProbability: number }
  | { type: 'composite'; configs: SamplingConfig[]; strategy: 'any' | 'all' }

type TriggerPredicate = (ctx: {
  turnEndedReason?: TurnEndReason;
  taintFlipped: boolean;
  approvalRequiredDraftSubmitted: boolean;
  compositionAmplification: boolean;
  iterationCeilingHit: boolean;
  wallclockCeilingHit: boolean;
  costCeilingHit: boolean;
  iterationCountExceededP95?: boolean;     // Beta
  routerRechoseAfterReplan?: boolean;      // Beta
  topologyDowngradeCandidate?: boolean;    // Beta
}) => boolean
```

### `ObservabilityContextFactory`

```
create(opts: {
  requestContext: RequestContext;
  parentSpan?: Span;
}): ObservabilityContext

type ObservabilityContext = {
  currentSpan: Span;
  logger: Logger;      // derived from span; includes trace_id as field
  metrics: MetricsRecorder;
  createChildSpan(opts: {
    type: SpanType;
    entity: EntityType;
    name: string;
    attrs?: Record<string, unknown>;
  }): Span;
}
```

### `Span` API

```
type Span = {
  spanId: UUID;
  traceId: UUID;
  setAttribute(key: string, value: unknown): void;    // MUST NOT accept identity-key keys from this API — those auto-stamp
  setAttributes(attrs: Record<string, unknown>): void;
  recordUsage(usage: UsageSnapshot): void;            // leaf-only; warns on non-leaf
  end(opts?: { status?: 'ok' | 'error'; error?: Error }): void;
}
```

### `SamplingDecider`

```
decide(opts: {
  rootTriggers: TriggerPredicate[];
  config: SamplingConfig;
  ctx: SamplingContext;
}): boolean   // true = capture full; false = NoOp spans all the way down
```

Called ONCE at trace root; result propagates to every child via in-memory turn state.

### `PreCaptureRedactor`

```
redact(span: Span, attrs: Record<string, unknown>): Record<string, unknown>
// Strips fields declared in any active tool's `tenantAuthoredFreeText` metadata;
// replaces with '<redacted:tenant_authored>'.
```

### `ToolInvocationAuditRecorder`

```
record(opts: {
  traceId; tenantId;
  toolName; args; result;
  subAgentKey; phase; iteration?;
  resultStatus: string;
}): Promise<void>
// Writes agent_tool_invocation row; called by plan 01 gateway step 6 alongside kernel audit.
```

---

## 5. Control Flow

### Trace start (turn start)

1. Plan 06 controller receives `POST /agent/turn` → middleware sets identity keys (`tenant_id, user_id, trace_id` = UUIDv7, `surface`).
2. `ObservabilityContextFactory.create({ requestContext })` creates the root `TURN` span.
3. `TURN` span auto-stamps identity keys: `tenant_id`, `user_id`, `trace_id`, `surface`, `delegation_id?`.
4. `SamplingDecider.decide(...)` evaluates the configured `SamplingConfig`. For the default stratified config:
   a. Evaluate triggers (most false at trace start; `taint_flipped` is false, `turn.ended.reason` not yet known).
   b. If any trigger true → return `capture = true`.
   c. Else → sample at baseline probability (1%).
5. `capture` stored on turn state. If `false`, all `createChildSpan` calls return `NoOpSpan` (zero-overhead).
6. Proceed to plan 02 (router) + plan 03 (execution).

### Trace end (turn end)

1. Plan 06 closes stream.
2. Turn-state triggers re-evaluated — any that flipped true during execution (e.g. `taint_flipped`, `approval_required_draft_submitted`) retroactively escalate sampling to 100%.
3. For escalation: if `capture` was `false` (sampled out), the already-NoOp'd spans are lost — but the **trigger-detection metadata** is persisted on the `TURN` span summary so operators know the turn matched a trigger. Retrospective span reconstruction is not possible from NoOp; this is the accepted tradeoff.
4. For captured traces: all spans flushed to Langfuse.
5. Tool-output audit trail (plan 01 step 6) persists regardless of sampling — kernel-owned, separate persistence, not tied to sampling decision.

**Sampling decision is made at root + re-evaluated at turn-end for trigger-match reporting only.** No span-level override.

### Child span creation

1. Component (router, sub-agent, gateway step, synthesizer) calls `obsContext.createChildSpan({ type, entity, name, attrs })`.
2. If parent trace is sampled (`capture: true`), creates real span with auto-stamped identity keys + passed attrs.
3. If sampled out, returns `NoOpSpan` — `setAttribute`, `recordUsage`, `end` are all no-ops.
4. Caller doesn't care — API is identical.

### Span attribute stamping (on every span creation)

Auto-stamped attrs (from `request_context_keys`):

- `tenant_id`, `user_id`, `trace_id`, `surface`, `delegation_id?`, `schedule_id?`.

Auto-stamped on `TURN` root specifically:

- `router_prompt_hash`, `sub_agent_prompt_hash`, `system_prompt_hash`, `permission_narrative_hash`, `tool_catalog_hash`, `directive_schema_hash`, `canonicalizer_version_hash` (from plan 02 session pin).
- `router_version`, `sub_agent_version`, `tool_meta_version`, `model_id`.

Auto-stamped on `SUB_AGENT_TOOL_CALL`:

- `tool_name`, `sub_agent_key`, `phase`, `iteration?`, `retry_count`, `cached: boolean`.

Component-specific attrs added explicitly (e.g. `gateway:ceiling-check` adds `bytes_remaining`).

### Usage recording (leaf-only)

1. Plan 03 sub-agent LLM call completes.
2. Sub-agent's SUB_AGENT_TOOL_CALL or ROUTER_PLAN or SYNTHESIZER span (whichever wraps the LLM call) calls `span.recordUsage({ input_tokens, ... })`.
3. If span is NOT a leaf (has children), emit warning metric `agent_usage_recorded_on_non_leaf_total` + skip recording (prevents double-count).
4. Turn totals computed at query time by summing leaves.

### PII redaction at capture

1. Plan 01 gateway wraps tool result fields declared in `tenantAuthoredFreeText`.
2. When the tool-result is stamped on `SUB_AGENT_TOOL_CALL.result` attr for Langfuse, `PreCaptureRedactor` strips the tenant-authored fields and replaces with `'<redacted:tenant_authored>'`.
3. The un-redacted result goes to `agent_tool_invocation.result_preview` — kernel-owned, RLS-protected, retained under documented legitimate-interest.
4. Langfuse trace shows redacted; audit table has raw for incident reconstruction.

### Tool-output audit write

1. Plan 01 gateway step 6 emits kernel audit event `agent.tool_called`.
2. In parallel, `ToolInvocationAuditRecorder.record(...)` writes `agent_tool_invocation` row.
3. Both share `trace_id` — join works across both via the single ID.

### Dashboard signal emission

For each of the following, plan 07 emits metric + trace attr:

**Router accuracy:**

- `user-corrects-mid-conversation` — plan 04 post-turn summarizer scans for correction patterns in the next user turn's summary; emits on match.
- `sub-agent-returns-empty-handoff` — plan 03 sub-agent runner emits when `SubAgentOutput.kind = 'all_tools_disabled'` or zero-content summary.
- `initiator-thumbs-down-within-N-turns-of-router-fan` — plan 08 feedback hook emits when thumbs-down arrives within 3 turns of a router-fan that included ≥2 sub-agents.

**Per-turn anomaly:**

- `validation-error-rate-spike` — plan 01 gateway emits `tool_validation_error_total`; dashboard alerts on spike.
- `iteration-count-distribution-anomaly` — plan 03 emits iteration count per sub-agent; dashboard alerts on p99 shift.

**Approval inbox depth** — plan 08 emits per-approver pending count.

**Confidence calibration** — plan 03 stamps `confidence` on synthesizer output; plan 08 feedback (thumbs, initiator-approval) correlates.

### GDPR Langfuse purge (plan 04 integration)

1. Plan 04 GDPR pipeline calls Langfuse `purgeByUserId({ userId, tenantId })`.
2. Langfuse API call; we log result.
3. On partial failure, plan 04's pipeline captures as compliance incident.

---

## 6. Requirements

### Span taxonomy

| #      | Requirement                                                                  | Design §§ |
| ------ | ---------------------------------------------------------------------------- | --------- |
| R-07.1 | `SpanType` enum per §4 (11 values at MVP; `ITERATION` dormant until plan 12) | §12       |
| R-07.2 | `EntityType` enum per §4 (8 values)                                          | §12       |
| R-07.3 | Every span stamps both dimensions                                            | §12       |
| R-07.4 | Root span is `TURN`; everything nests under it                               | §12       |

### Trace correlation

| #      | Requirement                                                                                                                                                 | Design §§ |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-07.5 | `trace_id` = UUIDv7; chronologically sortable                                                                                                               | §12       |
| R-07.6 | `trace_id` stamped on: `agent_message`, kernel audit events, Langfuse trace, pg-boss job row, outbox events, approval_request rows, `agent_tool_invocation` | §12       |
| R-07.7 | `tenant_id` required on every span; auto-stamped at root, inherited                                                                                         | §12       |
| R-07.8 | `trace_id` UUIDv7 format — if Langfuse requires OTel 32-hex, adapt at exporter boundary (never generate OTel-format at source)                              | §12       |

### Sampling

| #       | Requirement                                                                 | Design §§ |
| ------- | --------------------------------------------------------------------------- | --------- |
| R-07.9  | `SamplingConfig` typed discriminated union per §4 interface                 | §12       |
| R-07.10 | Trace-level atomicity: decision made once at root; inherited via `NoOpSpan` | §12       |
| R-07.11 | Non-sampled trace records zero spans (not partial tree)                     | §12       |

### MVP sampling triggers (100% on any match)

| #       | Requirement                                                                              | Design §§ |
| ------- | ---------------------------------------------------------------------------------------- | --------- | --------------------- | --- | ----------------- | --- |
| R-07.12 | `turn.ended.reason !== 'completed'`                                                      | §12       |
| R-07.13 | `iteration_ceiling_hit                                                                   |           | wallclock_ceiling_hit |     | cost_ceiling_hit` | §12 |
| R-07.14 | `taint_flipped`                                                                          | §12       |
| R-07.15 | `approval_required_draft_submitted`                                                      | §12       |
| R-07.16 | `composition_amplification` (≥2 `compositionSensitive` tools across distinct aggregates) | §12       |
| R-07.17 | Baseline sampling rate for completed turns: 1%                                           | §12       |

### Per-span attributes

| #       | Requirement                                                                                                                                                                                         | Design §§  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| R-07.18 | Content hashes per §8: `router_prompt_hash`, `sub_agent_prompt_hash`, `system_prompt_hash`, `permission_narrative_hash`, `tool_catalog_hash`, `directive_schema_hash`, `canonicalizer_version_hash` | §8, §12    |
| R-07.19 | Version strings: `router_version`, `sub_agent_version`, `tool_meta_version`, `model_id`                                                                                                             | §12        |
| R-07.20 | `time_to_first_token_ms` (TTFT) captured from provider streaming metadata                                                                                                                           | §12        |
| R-07.21 | Usage breakdown: `input_uncached`, `input_cached_read`, `input_cached_write`, `output`, `output_reasoning`                                                                                          | §12, §13   |
| R-07.22 | `cost_usd`, `pricing_id`, `priced_at`                                                                                                                                                               | §13        |
| R-07.23 | `entity_version_id` opaque version pin                                                                                                                                                              | §12        |
| R-07.24 | `request_context_keys` auto-stamped — never manually set                                                                                                                                            | §12        |
| R-07.25 | `cancellation_reason?` populated on abort                                                                                                                                                           | §12, §15.2 |

### Leaf-only usage

| #       | Requirement                                                    | Design §§ |
| ------- | -------------------------------------------------------------- | --------- |
| R-07.26 | Usage stamped on leaf spans; NEVER pre-aggregated on turn root | §12       |
| R-07.27 | Turn totals computed at query time by summing leaves           | §12       |
| R-07.28 | Warning metric on non-leaf `recordUsage` calls                 | §12       |

### PII / redaction

| #       | Requirement                                                                     | Design §§ |
| ------- | ------------------------------------------------------------------------------- | --------- |
| R-07.29 | `PreCaptureRedactor` strips `tenantAuthoredFreeText` fields from Langfuse attrs | §2, §12   |
| R-07.30 | User's own utterance purge-by-user-id wired to plan 04 GDPR pipeline            | §6, §12   |
| R-07.31 | Retrospective scrubbing is fallback only — default is redact at write           | §12       |

### Tool-output audit (kernel-owned)

| #       | Requirement                                                                                                                                                 | Design §§ |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-07.32 | `agent_tool_invocation` row per tool call: `{ name, args, result_preview, result_hash, byte_count, trace_id, tenant_id, sub_agent_key, phase, iteration? }` | §12       |
| R-07.33 | Tenant-partitioned via RLS                                                                                                                                  | §12       |
| R-07.34 | Correlation to Langfuse via shared `trace_id`                                                                                                               | §12       |
| R-07.35 | Audit persists regardless of sampling decision — it IS the source of truth for "what did the agent see"                                                     | §12       |

### Retention

| #       | Requirement                                   | Design §§ |
| ------- | --------------------------------------------- | --------- |
| R-07.36 | Traces ≥30 days (per-tenant configurable)     | §12       |
| R-07.37 | Audit ≥90 days (per-tenant configurable)      | §12       |
| R-07.38 | Retained under documented legitimate-interest | §12       |

### Dashboards + signals

| #       | Requirement                                                                                                                          | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| R-07.39 | Router-accuracy signals: `user-corrects-mid-conversation`, `sub-agent-returns-empty-handoff`, `initiator-thumbs-down-within-N-turns` | §12       |
| R-07.40 | Per-turn anomaly: validation-error-rate spike, iteration-count distribution anomaly                                                  | §12       |
| R-07.41 | Approval inbox depth per-approver first-class metric                                                                                 | §12       |
| R-07.42 | Confidence calibration dashboard: thumbs-down rate per tier + initiator-approval rate per tier                                       | §12       |

---

## 7. Failure Modes & Recovery

| Failure                                                                    | Symptom                                  | Recovery                                                                                                                                                                              |
| -------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Langfuse collector unreachable                                             | Span flushes fail                        | Local buffer retries with exponential backoff; drop after 5 min retention (bounded memory); alert on sustained outage. Kernel audit + `agent_tool_invocation` unaffected (DB-backed). |
| Sampling-decider race (two spans created in parallel before root decision) | Rare — root span is always created first | Defensive: `SamplingDecider.decide` is synchronous at root creation; child spans block until root decision committed.                                                                 |
| Identity-key auto-stamp missing                                            | Span has blank `tenant_id`               | Hard fail — `TURN` span creation asserts all identity keys present; missing = `turn.ended.reason: error`.                                                                             |
| `request_context_keys` auto-stamp accidentally set via manual API          | Potential spoofing surface               | `Span.setAttribute(key, value)` rejects identity-key names via typed denylist; manual override requires a separate system API used only by middleware.                                |
| Usage recorded on non-leaf span                                            | Double-count risk                        | Warn metric + skip record. Bug in the caller; fix in PR.                                                                                                                              |
| Tool-output audit write fails                                              | Partial audit trail                      | Retry via outbox pattern (plan 11 owns outbox if relevant); if persistent failure, P1 — tool call trace exists but audit doesn't.                                                     |
| PreCaptureRedactor misses a declared field (coding error)                  | Tenant-authored text leaks into Langfuse | Scheduled audit scan over Langfuse traces for `<tenant_authored>` markers matches against redaction coverage; any miss is a P1 data-handling incident.                                |
| Trace-ID UUIDv7 collision                                                  | Astronomically unlikely but non-zero     | Second turn with colliding `trace_id` gets rejected at insert (unique constraint); request retries with new UUID.                                                                     |
| `purgeByUserId` against Langfuse fails                                     | Partial GDPR compliance                  | Plan 04 captures as compliance incident; retry + escalate.                                                                                                                            |
| Metric label cardinality explosion (despite guardrail)                     | TSDB memory blow-up                      | Plan 05 guardrail catches at exporter; this plan's metrics are audited for compliance.                                                                                                |

---

## 8. Observability Surface

_This plan ships the observability surface; its self-observation is narrower._

### Meta-metrics

- `agent_span_flush_total{status: 'ok' | 'error'}` — Langfuse send outcomes.
- `agent_span_buffer_depth` — gauge; alert if sustained high (collector unreachable).
- `agent_sampling_decision_total{capture: 'true' | 'false', reason}` — counter.
- `agent_pii_redaction_total{tool_name}` — counter of redacted-field occurrences.
- `agent_usage_recorded_on_non_leaf_total` — counter; should always be 0.
- `agent_trace_audit_join_miss_total` — counter; any non-zero is P1 (tool-call span without audit row).

### Dashboards (meta)

- Langfuse collector health (span-flush success rate; alert if <99% for 10 min).
- Sampling distribution (expected: 99% sampled-out, 1% baseline sample, N% trigger-match).
- Cross-system `trace_id` join coverage (audit vs traces — should be 100% modulo sampling).

---

## 9. Security Considerations

- **`trace_id` is not sensitive** — it's a correlation token, not an authz credential. Exposing it in UI deep-links is fine for dev users.
- **`agent_tool_invocation.result_preview` holds unredacted tool results** including `tenantAuthoredFreeText`. RLS protects; 90-day retention; accessed for incident reconstruction only. Access is audited.
- **Langfuse holds redacted + user utterances**. User utterances are covered by plan 04 GDPR pipeline. Tenant-authored text is redacted pre-capture; if miss, treat as incident.
- **Identity-key auto-stamp prevents manual spoofing**. `Span.setAttribute('tenant_id', 'other')` from a sub-agent would be blocked at the API; middleware is the only writer.
- **Sampling decision cannot be overridden mid-flight by untrusted input.** The `SamplingConfig` is server-config, not per-request.
- **Dashboard PII avoidance.** Meta-metrics don't carry `user_id`; dashboards aggregate by tenant + tier only.

---

## 10. Performance Budget

| Operation                                | p50    | p95    | p99    |
| ---------------------------------------- | ------ | ------ | ------ |
| `ObservabilityContextFactory.create`     | <2ms   | <5ms   | <10ms  |
| `Span` creation (captured)               | <1ms   | <3ms   | <8ms   |
| `Span` creation (NoOp)                   | <0.1ms | <0.3ms | <1ms   |
| `Span.setAttribute`                      | <0.1ms | <0.2ms | <0.5ms |
| `PreCaptureRedactor.redact`              | <2ms   | <5ms   | <15ms  |
| `ToolInvocationAuditRecorder.record`     | <5ms   | <15ms  | <40ms  |
| Langfuse batch flush (async, background) | —      | —      | —      |

Total observability overhead per turn: <50ms p99 (on sampled turns). NoOp path: <5ms total (essentially free on 99% of turns).

---

## 11. Testing Strategy

### Unit

- `SamplingDecider`: every config variant returns expected boolean; composite `any` vs `all` logic correct.
- Trace-level atomicity: root decides → children inherit via `NoOpSpan`; sampling cannot change mid-trace.
- `PreCaptureRedactor`: fields in `tenantAuthoredFreeText` list → replaced; other fields untouched.
- Identity-key auto-stamp: every new span has correct `tenant_id, user_id, trace_id`.
- `Span.setAttribute` rejects identity-key names.
- Non-leaf `recordUsage` → warn metric + skip.

### Integration

- Happy turn: Langfuse trace has full span tree; `tenant_id` on every span; content hashes populated on root; leaf spans have usage.
- 1% baseline sampling: seed 100 turns; ~1 has full capture; others NoOp.
- Trigger-match: seed a ceiling-hit turn → 100% capture regardless of baseline.
- Trace-audit join: for every `SUB_AGENT_TOOL_CALL` span, find matching `agent_tool_invocation` row by `trace_id`. 100% coverage.
- PII redaction: seed a tool result with a declared free-text field → Langfuse shows `<redacted>`, audit shows raw.
- GDPR: delete user X → Langfuse `purgeByUserId` called → subsequent Langfuse query for user X returns empty.
- Cross-tenant: tenant A's Langfuse project does not return tenant B traces.
- UUIDv7 format: `trace_id` chronologically sortable verified by insert order vs lexicographic sort.

### Property

- Span tree invariant: every span has `parent_span_id` pointing to an actual parent or is the `TURN` root.
- Usage sum equality: sum of leaf `recordUsage` calls = `turn.ended.usage` = `agent_cost_event` row sum for that trace.

### E2E

- Incident reconstruction drill: given a `trace_id`, grep returns rows from `agent_message`, `kernel_audit`, `agent_tool_invocation`, pg-boss; Langfuse trace loads. All consistent.

### Fixtures

- `fixtures/sampling-configs/stratified-mvp.ts`
- `fixtures/sampling-configs/always-capture-dev.ts`
- `fixtures/tenant-authored-redaction.ts` — test vectors.

---

## 12. Acceptance Criteria

- All unit + integration + property + E2E tests pass.
- §18.4 observability thresholds met:
  - `trace_id` correlation end-to-end: sample 100 random traces; 100% have matching rows in all expected tables.
  - Stratified sampling triggers: all 5 MVP triggers fire 100% capture in the last 30 days with count ≥1 each.
  - PII redaction: zero `tenantAuthoredFreeText` leakage in Langfuse scans.
- Cross-tenant seed test passes.
- `agent_trace_audit_join_miss_total` = 0 in production for any 30-day window.
- Langfuse UI shows auto-stamped identity keys on every span.
- UUIDv7 round-trip: server generates → Langfuse stores → adapter round-trips without collision or format loss.

---

## 13. Rollout Plan

- **Phase 1** — ship observability context + span taxonomy + auto-stamping; default `SamplingConfig: { type: 'always' }` for internal-tenant dev.
- **Phase 2** — enable stratified sampling + 5 triggers.
- **Phase 3** — wire `agent_tool_invocation` audit table + trace-audit join dashboards.
- **Phase 4** — wire GDPR Langfuse purge to plan 04 pipeline.
- **Phase 5** — dashboards + alerts (router accuracy, anomaly, calibration).

**Backout:** observability faults fail-open (turn completes with no trace rather than fail). Langfuse outage doesn't block user-visible flow. Any regression is fixed forward; no feature flag because observability is tenet-level.

---

## 14. Dependencies

- Plan 00 (shipped): Langfuse OTel wiring + prompt/narrative stores.
- Plan 01: tool-output audit emitted from gateway step 6.
- Plan 02: session hash attributes (router_prompt_hash etc.).
- Plan 03: sub-agent + synthesizer span emission.
- Plan 04: GDPR purge integration; post-turn summarizer emits router-accuracy signal.
- Plan 05: cost + usage attributes.
- Plan 06: identity-key discipline on `RequestContext`.
- Plan 08: approval-inbox depth metric.
- Plan 10: canary signal ingestion point.

## 15. Integration Points

- `apps/api/src/modules/agents/application/services/observability-context.ts` — factory + auto-stamper.
- `apps/api/src/modules/agents/application/services/sampling-decider.ts`.
- `apps/api/src/modules/agents/infrastructure/exporters/langfuse-exporter.ts` — attribute remapping if Langfuse requires.
- `apps/api/src/modules/agents/infrastructure/redaction/pre-capture-redactor.ts`.
- `apps/api/src/modules/agents/infrastructure/schema/agent-tool-invocation.ts` — Drizzle.
- `apps/api/src/modules/agents/infrastructure/repositories/tool-invocation-audit-repository.ts`.
- Kernel module — audit event write.
- Langfuse SDK — trace + span + purge-by-user-id.
- OTel — span export.

## 16. Activation Gate

MVP. Ships with first production turn.

## 17. Out of Scope

- Quality canary scheduling / fixture-tenant data (plan 10).
- LLM-judge scorers (GA).
- Full-fleet prompt capture (GA).
- Langfuse self-hosted deployment ops (infra / implementation-doc).
- Per-tenant retention config UI (product concern).

## 18. Open Questions

- **`trace_id` format coercion at Langfuse boundary.** If Langfuse requires OTel 32-hex, we convert UUIDv7 to hex representation at export. Verify at bootstrap smoke test. Owner: platform eng.
- **Async trace-joining for pg-boss reminders.** New trace with `parent_trace_id` link attribute vs joining an open trace. Recommend: new trace with link; avoids multi-day unclosed traces. Owner: plan 09 integration.
- **`entity_version_id` vs content hash duplication.** Both on every trace. Redundancy confirms replay. Keep both at MVP; revisit if storage cost is meaningful.
- **Langfuse retention vs kernel audit retention.** 30d vs 90d. Document explicitly: audit is authoritative post-30-day; Langfuse is query/replay convenience. Owner: legal + ops.
- **Meta-eval corpus for LLM-judge promotion (plan 10 dep).** This plan's `agent_tool_invocation` retention supports corpus mining; verify we don't prematurely delete incident-class traces before meta-eval gate clears. Owner: plan 10 author.
