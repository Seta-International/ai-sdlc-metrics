# 07 — Observability + Sampling + `trace_id` Correlation

**Design §§:** §12 (Observability), §8 (content-hash attributes), §18 (observability readiness criteria).

## Revision 2026-04-22

Aligns with the 2026-04-22 production-ready-comprehensive revision of `docs/architecture/agent-runtime.md` §12. Changes:

- **`flow_id` + `intent_slug` promoted to first-class span/trace attributes** (required on every span; propagated to kernel audit events, drafts, approvals, executions, and the trace-backend `metadata`/`tags` plane).
- **Composition-attack runtime monitor** added as an MVP feature: post-turn job over tool-call sequences + cross-turn rate aggregation per `(tenant_id, user_id)`; emits `agent.composition_pattern_observed` kernel audit event; never blocks (Tenet #9).
- **Declared-intent drift scorer** (plan 10 owner) hooks added to this plan's signal surface — drift scorer consumes `flow_id` / `intent_slug` / `tool_name` / `sub_agent_key` dimensions persisted here.
- **Per-intent and per-flow dashboards** — new dashboard class derived from the new dimensions (no post-hoc tool-sequence inference).
- **§18.5 evidence hooks** — `intent_slug: 'unclassified'` rate ≤ 2% and `flow_id` zero-dangle correlation surfaced as explicit requirements.

Additions are surgical and stay under the 30% envelope. Structure of §§1–18 unchanged.

---

## 1. Scope

### In

- OpenTelemetry SDK wiring at `apps/api` bootstrap (plan 00 shipped OTel base; this plan completes the agent-layer spans).
- **Trace backend is vendor-agnostic at this plan's contract layer.** Span emission uses OTel SDK with stable attribute names; an adapter at the exporter boundary maps to the chosen backend (Langfuse, self-hosted OTel→ClickHouse/Tempo, or equivalent). Backend selection is **deferred** per CLAUDE.md roadmap; this plan does not name one.
- Two-dimensional span taxonomy: `span_type` × `entity_type`.
- Typed `SamplingConfig` discriminated union with trace-level atomicity invariant.
- Stratified sampling: 1% baseline + 100% on 5 MVP triggers.
- `trace_id` (UUIDv7) stamped on `agent_message`, every kernel audit event, every exported OTel span, pg-boss job row, outbox events, approval_request rows.
- `flow_id` (per-user-intent UUID) minted at router entry, propagated to every child span, every kernel audit event for the turn, every draft / approval / execution event downstream in the same flow, and the trace-backend `metadata.flow_id` + `tags=[intent:<slug>]` facet. A multi-turn flow (draft → approval → execute) shares one `flow_id` across multiple `trace_id`s.
- `intent_slug` (module-declared controlled vocabulary per §2.2 EI-3) stamped alongside `flow_id` on the same surfaces. New slugs only via `modules/<X>/agent/intents/*.ts` PR review.
- **Composition-attack runtime monitor**: post-turn job scans each trace's tool-call sequence for `compositionSensitive` patterns (turn-level), plus cross-turn rate aggregation per `(tenant_id, user_id)`; emits kernel audit event `agent.composition_pattern_observed` + feeds a dashboard. **Never blocks** (Tenet #9).
- Per-intent dashboards (cost, latency, thumbs-down rate by `intent_slug`) and per-flow correlation dashboards.
- Tool-output audit trail (kernel-owned, separate from trace-backend storage).
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
- Trace backend selection, deployment, and ops (infra concern; vendor choice deferred per CLAUDE.md).

---

## 2. Design Context

Observability is **tenet #6** — version-tagged, trace-correlated, tenant-partitioned. Retrofitting observability onto a live system is measurably more expensive than building with it. Every code path in every plan stamps spans; we take the cost up-front.

**Two-dimensional span taxonomy** borrows mastra's `SpanType × EntityType` pattern (spike 08) but with a much smaller enum set because our topology is fixed. Dimension separation lets operators filter "all router spans regardless of shape" OR "all synthesis spans regardless of origin" without string-prefix hacks.

**Trace-level sampling atomicity** is load-bearing for replay correctness. The decision to sample or not is made ONCE at the trace root and inherited by every child span via `NoOpSpan` propagation. Mastra shipped a fix for this exact bug (issue #11504) when they realized per-child sampling creates half-captured trees that can't be replayed. We bake the invariant in from day one.

**Single `trace_id` end-to-end** is our strongest observability advantage over mastra. Their `traceId` appears only on observability-owned tables (`scores`, `feedback`, `metrics`) — application DB rows carry no trace ID. Ours stamps `agent_message`, `kernel_audit`, `tool_invocation`, pg-boss jobs, outbox events, approval_requests. One ID to grep gives end-to-end correlation for any incident without relying on a specific trace backend.

**Leaf-only usage accumulation** prevents double-count when exporters flatten the span tree. Mastra enforces this explicitly (`observability/types/tracing.ts:444-447`); we adopt directly.

**`request_context_keys` auto-stamp** removes hundreds of manual `span.setAttr('tenant_id', ...)` call sites that inevitably drift. `RequestContext` knows the identity keys (plan 06); the auto-stamper hooks into span creation to copy them.

**PII redaction at capture, not query.** Retrospective scrubbing after a GDPR request is a nightmare; we redact `tenantAuthoredFreeText` fields pre-capture. User's own utterance requires a separate purge-by-user-id operation (plan 04 owns the erasure pipeline; this plan exposes the exporter-adapter hook that invokes whichever backend is wired).

**Vendor-agnostic span emission.** Source code emits OTel spans with **stable, source-owned attribute names** (e.g. `tenant_id`, `span_type`, `tool_name`). A thin **exporter adapter** at the boundary maps these names to whichever backend (Langfuse, ClickHouse/OTel, Tempo, etc.) is ultimately selected. This is the §2.5 vendor-neutrality invariant: backend selection or replacement never requires touching span-emission code.

**What this is NOT:** a general-purpose tracing library. It is a configured, backend-agnostic observability pipeline with specific sampling rules, specific attribute conventions, and specific dashboards.

**Prior-art review — what was adopted and what was rejected.** Claude Code's OTel instrumentation (`utils/telemetry/sessionTracing.ts`, `utils/telemetry/instrumentation.ts`, `services/analytics/sink.ts`) was reviewed as prior art. Three patterns are adopted: (a) vendor-agnostic exporter boundary — Claude Code parameterizes protocol/endpoint via `OTEL_*_EXPORTER` config and never hard-codes a vendor into emission code (we do the same via our adapter seam). (b) Identity-key auto-stamp via request-scoped context — removes drift across hundreds of call sites (R-07.24). (c) Redaction markers applied pre-capture so sinks can route sensitive fields safely (R-07.29). Three patterns were explicitly **rejected** because they fit a single-user developer CLI, not multi-tenant SaaS: (i) per-developer telemetry tagging (session/host IDs at the OTel layer) — our unit of aggregation is tenant, not developer. (ii) Offline telemetry spooling to disk — breaks multi-tenant isolation and would require per-tenant retention policies on local disk; we drop on sustained exporter outage after bounded backoff. (iii) Datadog analytics sink coupling — we do not port a vendor-specific analytics plane; OTel spans with stable attribute names are the single emission surface.

---

## 3. Data Model

### Span (OTel shape; not a Postgres table)

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
- `flow_id UUID` (per-user-intent correlation — shared across multiple `trace_id`s within a multi-turn flow). **Schema note:** kernel `agent_audit_event` must expose `flow_id` and `intent_slug` columns; if the existing kernel migration does not yet include them, a follow-up kernel-owned migration is required before this plan ships. Indexed `(tenant_id, flow_id)`.
- `intent_slug TEXT` (module-declared controlled vocabulary).
- `event_type TEXT` (`'agent.tool_called'`, `'agent.prompt_stored'`, `'agent.narrative_stored'`, `'agent.draft_proposed'`, `'agent.draft_executed'`, `'agent.composition_pattern_observed'`, `'agent.budget_topup'`, `'user_erased_start/complete/partial'`, etc.).
- `actor_user_id UUID?`
- `on_behalf_of UUID?`
- `via_delegation UUID?`
- `via_schedule UUID?`
- `approved_by UUID?`
- `tenant_id UUID` (RLS).
- `payload JSONB`
- `created_at TIMESTAMPTZ`.
- Index: `(trace_id)`, `(tenant_id, created_at DESC)`.

### `agent_tool_invocation` (tool-output audit trail, separate from trace-backend storage)

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

### Required span attributes (extended schema)

Every span — regardless of `span_type` / `entity_type` — MUST carry:

- `tenant_id`, `user_id`, `trace_id`, `surface` (identity keys; auto-stamped from `RequestContext`).
- `flow_id` (auto-stamped; minted at router entry of the first turn in a flow, inherited across descendant spans and subsequent turns).
- `intent_slug` (auto-stamped; from the per-flow pin established at router entry; controlled vocabulary).
- `sub_agent_key` (populated on any span whose `entity_type ∈ { SUB_AGENT, TOOL, SYNTHESIZER }`; `null` on `ROUTER` / `GATEWAY` / `MEMORY` roots).
- `tool_name` (populated on `span_type = SUB_AGENT_TOOL_CALL` and any `GATEWAY_STEP` child of a tool call; `null` elsewhere).

Missing any of these on a non-null-applicable span is a hard fail at span creation (identity-key invariant extended to the four dimensions).

### `FlowIdPropagation` contract

```
type FlowIdPropagation = {
  // Minted once per user intent at router entry of the first turn.
  mint(opts: { requestContext: RequestContext; intentSlug: IntentSlug }): FlowId;

  // Subsequent turns in the same flow (draft resume, approval decision, scheduled execute)
  // inherit via explicit correlation — never re-minted.
  inheritFrom(opts: {
    priorFlowId: FlowId;        // read from the source draft / approval / schedule row
    requestContext: RequestContext;
  }): FlowId;
}
```

**Invariants:**

- One UUID per flow. Multiple `trace_id`s within a flow share the same `flow_id`.
- The first `trace_id` in a flow emits `flow_id` on its `TURN` root via `mint`.
- Subsequent turns (draft → approval → execute) inherit via correlation join: the source row (draft / approval_request / pg-boss job) stamps `flow_id`; the downstream turn's router reads it and calls `inheritFrom`.
- Never derived from `trace_id`. Never synthesized late. Absence on a span that expects it is a bug.

---

## 5. Control Flow

### Trace start (turn start)

1. Plan 06 controller receives `POST /agent/turn` → middleware sets identity keys (`tenant_id, user_id, trace_id` = UUIDv7, `surface`).
2. Plan 02 router resolves `intent_slug` (controlled vocabulary) + `flow_id`:
   a. **First turn of a flow** — `FlowIdPropagation.mint({ requestContext, intentSlug })` produces a new UUID.
   b. **Subsequent turn** (resume draft / approval decision / scheduled execute) — source row (draft, `approval_request`, pg-boss job) carries `flow_id`; router calls `FlowIdPropagation.inheritFrom(...)`.
   c. If `intent_slug` resolution fails (ambiguous / unknown), stamp `intent_slug: 'unclassified'`; the `§18.5 ≤ 2%` threshold monitors this.
3. `ObservabilityContextFactory.create({ requestContext })` creates the root `TURN` span.
4. `TURN` span auto-stamps identity keys + flow dimensions: `tenant_id`, `user_id`, `trace_id`, `flow_id`, `intent_slug`, `surface`, `delegation_id?`.
5. `SamplingDecider.decide(...)` evaluates the configured `SamplingConfig`. For the default stratified config:
   a. Evaluate triggers (most false at trace start; `taint_flipped` is false, `turn.ended.reason` not yet known).
   b. If any trigger true → return `capture = true`.
   c. Else → sample at baseline probability (1%).
6. `capture` stored on turn state. If `false`, all `createChildSpan` calls return `NoOpSpan` (zero-overhead).
7. Proceed to plan 02 (router) + plan 03 (execution). `flow_id` + `intent_slug` propagate via `ObservabilityContext` so every child span auto-stamps them.

### Trace end (turn end)

1. Plan 06 closes stream.
2. Turn-state triggers re-evaluated — any that flipped true during execution (e.g. `taint_flipped`, `approval_required_draft_submitted`) retroactively escalate sampling to 100%.
3. For escalation: if `capture` was `false` (sampled out), the already-NoOp'd spans are lost — but the **trigger-detection metadata** is persisted on the `TURN` span summary so operators know the turn matched a trigger (even for sampled-out turns, the sampling-decision outcome and would-have-matched triggers are stamped as attributes on a minimal TURN stub row in the audit table — see R-07.17a). Retrospective span reconstruction is not possible from NoOp; this is the accepted tradeoff.
4. For captured traces: all spans flushed to the configured trace backend via the exporter adapter.
5. Tool-output audit trail (plan 01 step 6) persists regardless of sampling — kernel-owned, separate persistence, not tied to sampling decision.

**Sampling decision is made at root + re-evaluated at turn-end for trigger-match reporting only.** No span-level override.

### Child span creation

1. Component (router, sub-agent, gateway step, synthesizer) calls `obsContext.createChildSpan({ type, entity, name, attrs })`.
2. If parent trace is sampled (`capture: true`), creates real span with auto-stamped identity keys + passed attrs.
3. If sampled out, returns `NoOpSpan` — `setAttribute`, `recordUsage`, `end` are all no-ops.
4. Caller doesn't care — API is identical.

### Span attribute stamping (on every span creation)

Auto-stamped attrs (from `request_context_keys` + flow pin):

- `tenant_id`, `user_id`, `trace_id`, `flow_id`, `intent_slug`, `surface`, `delegation_id?`, `schedule_id?`.
- `sub_agent_key`, `tool_name` — auto-stamped where applicable per the extended schema in §4.

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
2. When the tool-result is stamped on the `SUB_AGENT_TOOL_CALL.result` span attribute for export, `PreCaptureRedactor` strips the tenant-authored fields and replaces with `'<redacted:tenant_authored>'` **before** the span leaves the process.
3. The un-redacted result goes to `agent_tool_invocation.result_preview` — kernel-owned, RLS-protected, retained under documented legitimate-interest.
4. Exported trace shows redacted; audit table has raw for incident reconstruction. The redactor runs pre-capture so no backend ever receives raw tenant-authored content via the trace plane.

### Tool-output audit write

1. Plan 01 gateway step 6 emits kernel audit event `agent.tool_called`.
2. In parallel, `ToolInvocationAuditRecorder.record(...)` writes `agent_tool_invocation` row.
3. Both share `trace_id` + `flow_id` — join works across both via either ID.

### Composition-attack runtime monitor (post-turn)

1. Turn end: a pg-boss job `observability-composition-monitor` is enqueued with `{ trace_id, tenant_id, user_id, flow_id }`.
2. The job reads the trace's `agent_tool_invocation` sequence and evaluates two signals:
   a. **Turn-level.** ≥2 tools declaring `compositionSensitive` (§7 tool metadata) invoked across **distinct aggregate dimensions** within the same trace. (Also triggers the `composition_amplification` 100%-capture sampler at turn end; the runtime monitor is the audit-team-facing complement.)
   b. **Cross-turn rate.** Sliding window per `(tenant_id, user_id)` — composition-sensitive invocations above a tuned threshold within a short window.
3. On either match, emits a kernel audit event `agent.composition_pattern_observed` with `{ tenant_id, user_id, flow_id, trace_id, tool_names[], aggregate_dimensions[], signal: 'turn_level' | 'cross_turn_rate' }`.
4. **Never blocks** a tool call (Tenet #9). Feeds the kernel audit team's investigation queue + composition-pattern dashboard (§8).

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

### GDPR trace-backend purge (plan 04 integration)

1. Plan 04 GDPR pipeline calls the trace-backend exporter adapter's `purgeByUserId({ userId, tenantId })` — a vendor-neutral interface that every exporter adapter must implement.
2. Adapter invokes whichever backend-specific API is wired (or a no-op if the backend has no trace user data, e.g. spans flushed to a self-hosted store scrubbed separately). Result (`'ok' | 'partial' | 'failed'`) returned.
3. On failure, plan 04 retries 3× per R-04.29 and opens a `compliance_ticket_required: true` kernel audit row on exhaustion; DB + L3 scrub commit regardless.

### Cross-tenant leak canary (scheduled)

1. A daily pg-boss job `observability-leak-canary` runs under a fixture-tenant context. It emits a synthetic turn with a well-known `trace_id` shape (stamped `canary_marker: true`) and known `tenant_id = fixture_tenant_id`.
2. A second phase queries the trace backend across all other tenants' trace-read surfaces (RLS-filtered) for any span carrying `canary_marker` or the fixture `tenant_id`.
3. Any match ⇒ P0 cross-tenant leak incident; pages on-call, triggers runbook, and temporarily disables the exporter adapter's read plane for investigation.
4. No match ⇒ green signal recorded on the observability health dashboard.

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

| #       | Requirement                                                                                                                                                                                                                                                                                                                                                                                                       | Design §§ |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-07.5  | `trace_id` = UUIDv7; chronologically sortable                                                                                                                                                                                                                                                                                                                                                                     | §12       |
| R-07.6  | `trace_id` stamped on: `agent_message`, kernel audit events, trace-backend span, pg-boss job row, outbox events, approval_request rows, `agent_tool_invocation`                                                                                                                                                                                                                                                   | §12       |
| R-07.7  | `tenant_id` required on every span; auto-stamped at root, inherited                                                                                                                                                                                                                                                                                                                                               | §12       |
| R-07.8  | `trace_id` is UUIDv7 at source. If the chosen trace backend requires a different format (e.g. OTel 32-hex), the mapping happens in the exporter adapter — **never** generate backend-specific formats in emission code.                                                                                                                                                                                           | §12       |
| R-07.8a | **Vendor-neutrality invariant.** Span emission code uses stable source-owned attribute names (`tenant_id`, `span_type`, `entity_type`, `tool_name`, `cost_usd`, etc.). Any mapping to backend-specific field names lives exclusively in the exporter adapter (`trace-backend-exporter.ts` et al.). Backend swap requires zero changes to emission code — a non-negotiable invariant for vendor-lock-in avoidance. | §12       |

### Sampling

| #       | Requirement                                                                 | Design §§ |
| ------- | --------------------------------------------------------------------------- | --------- |
| R-07.9  | `SamplingConfig` typed discriminated union per §4 interface                 | §12       |
| R-07.10 | Trace-level atomicity: decision made once at root; inherited via `NoOpSpan` | §12       |
| R-07.11 | Non-sampled trace records zero spans (not partial tree)                     | §12       |

### MVP sampling triggers (100% on any match)

| #        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Design §§ |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------- | --- | ----------------- | --- |
| R-07.12  | `turn.ended.reason !== 'completed'`                                                                                                                                                                                                                                                                                                                                                                                                                                                               | §12       |
| R-07.13  | `iteration_ceiling_hit                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |           | wallclock_ceiling_hit |     | cost_ceiling_hit` | §12 |
| R-07.14  | `taint_flipped`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | §12       |
| R-07.15  | `approval_required_draft_submitted`                                                                                                                                                                                                                                                                                                                                                                                                                                                               | §12       |
| R-07.16  | `composition_amplification` (≥2 `compositionSensitive` tools across distinct aggregates)                                                                                                                                                                                                                                                                                                                                                                                                          | §12       |
| R-07.17  | Baseline sampling rate for completed turns: 1%                                                                                                                                                                                                                                                                                                                                                                                                                                                    | §12       |
| R-07.17a | **Sampling-decision diagnostic stamp.** Every turn — sampled or not — produces a minimal TURN-stub row in `agent_tool_invocation`'s sibling table `agent_turn_sampling_decision` carrying `{ trace_id, tenant_id, user_id, capture: bool, root_decision_reason, triggers_matched_at_root: string[], triggers_matched_retroactively: string[] }`. Lets operators detect "would-have-been-captured-if-sampled-differently" patterns without full capture. Cardinality-bounded by turn count; cheap. | §12       |
| R-07.17b | **Per-tenant trace-emission quota.** Each tenant has `max_sampled_turns_per_day INT` (default 10_000) in `admin_tenant_config`. When crossed, new turns are **force-sampled-out** (capture=false) regardless of triggers; a signal `tenant_quota_exhausted_at` is stamped on the diagnostic row (R-07.17a); P2 alert fires at 80% and 100%. Protects trace backend from single-tenant storms. Quota can be raised via admin runbook.                                                              | §12       |

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

| #       | Requirement                                                                                                                                                                                       | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-07.29 | `PreCaptureRedactor` strips `tenantAuthoredFreeText` fields from span attributes **before** the span leaves the process; no backend ever receives raw tenant-authored content via the trace plane | §2, §12   |
| R-07.30 | User's own utterance purge-by-user-id flows through the exporter adapter's `purgeByUserId` interface, called by plan 04's GDPR pipeline                                                           | §6, §12   |
| R-07.31 | Retrospective scrubbing is fallback only — default is redact at write                                                                                                                             | §12       |

### Tool-output audit (kernel-owned)

| #       | Requirement                                                                                                                                                 | Design §§ |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-07.32 | `agent_tool_invocation` row per tool call: `{ name, args, result_preview, result_hash, byte_count, trace_id, tenant_id, sub_agent_key, phase, iteration? }` | §12       |
| R-07.33 | Tenant-partitioned via RLS                                                                                                                                  | §12       |
| R-07.34 | Correlation to exported trace spans via shared `trace_id`                                                                                                   | §12       |
| R-07.35 | Audit persists regardless of sampling decision — it IS the source of truth for "what did the agent see"                                                     | §12       |

### Retention

| #        | Requirement                                                                                                                                                                                                                                                                                                                               | Design §§ |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-07.36  | Traces ≥30 days (per-tenant configurable). **Config location:** `admin_tenant_config.trace_retention_days` (default 30, min 7, max 365). Consumed by whichever backend adapter is wired; backend-specific retention job enforces.                                                                                                         | §12       |
| R-07.37  | Audit ≥90 days (per-tenant configurable). **Config location:** `admin_tenant_config.audit_retention_days` (default 90, min 90 for compliance, max 2555 = 7 years). Owned by plan 04 alignment.                                                                                                                                            | §12       |
| R-07.38  | Retained under documented legitimate-interest                                                                                                                                                                                                                                                                                             | §12       |
| R-07.38a | **Cross-tenant leak canary.** A daily `observability-leak-canary` pg-boss job emits a synthetic fixture-tenant turn with `canary_marker: true` and scans every other tenant's trace-read surface for any match. Non-zero match = P0 security incident; exporter read plane disabled for investigation. Runs regardless of backend choice. | §12, §18  |

### Dashboards + signals

| #       | Requirement                                                                                                                          | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| R-07.39 | Router-accuracy signals: `user-corrects-mid-conversation`, `sub-agent-returns-empty-handoff`, `initiator-thumbs-down-within-N-turns` | §12       |
| R-07.40 | Per-turn anomaly: validation-error-rate spike, iteration-count distribution anomaly                                                  | §12       |
| R-07.41 | Approval inbox depth per-approver first-class metric                                                                                 | §12       |
| R-07.42 | Confidence calibration dashboard: thumbs-down rate per tier + initiator-approval rate per tier                                       | §12       |

### Flow / intent dimensions + composition monitor

| #       | Requirement                                                                                                                                                                                                                                                                         | Design §§      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| R-07.43 | Every span carries `flow_id`, `intent_slug`, `sub_agent_key`, `tool_name` per §4 extended schema (EI-7). Missing-dimension on a non-null-applicable span is a hard fail at span creation.                                                                                           | §12, EI-7      |
| R-07.44 | **Zero dangle.** Every flow's spans, kernel audit events, drafts, and approvals carry the same `flow_id`. Monthly audit per §18.5: sample 100 random multi-turn flows; all downstream artifacts must correlate. Any dangle = P1.                                                    | §12, §18.5     |
| R-07.45 | `FlowIdPropagation.mint` is called exactly once per flow at router entry; subsequent turns (draft → approval → execute) use `inheritFrom` and never re-mint.                                                                                                                        | §12            |
| R-07.46 | Composition-attack runtime monitor runs as a post-turn pg-boss job; on match emits kernel audit event `agent.composition_pattern_observed` with `{ tenant_id, user_id, flow_id, trace_id, tool_names[], aggregate_dimensions[], signal }`. **Never blocks a tool call** (Tenet #9). | §12 (§Monitor) |
| R-07.47 | Per-intent dashboards (cost, latency, thumbs-down rate by `intent_slug`) and per-flow correlation dashboards are direct queries over stamped dimensions — **no post-hoc inference** from tool-call sequences.                                                                       | §12            |
| R-07.48 | `intent_slug: 'unclassified'` rate ≤ 2% on 30-day rolling traffic (§18.5 threshold). Exceedance triggers intent-registry review.                                                                                                                                                    | §12, §18.5     |

---

## 7. Failure Modes & Recovery

| Failure                                                                                    | Symptom                                       | Recovery                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trace backend unreachable                                                                  | Span flushes fail                             | Local buffer retries with exponential backoff; drop after 5 min retention (bounded memory); alert on sustained outage. Kernel audit + `agent_tool_invocation` unaffected (DB-backed). No disk-spooling fallback (multi-tenant isolation). |
| Sampling-decider race (two spans created in parallel before root decision)                 | Rare — root span is always created first      | Defensive: `SamplingDecider.decide` is synchronous at root creation; child spans block until root decision committed.                                                                                                                     |
| Identity-key auto-stamp missing                                                            | Span has blank `tenant_id`                    | Hard fail — `TURN` span creation asserts all identity keys present; missing = `turn.ended.reason: error`.                                                                                                                                 |
| `request_context_keys` auto-stamp accidentally set via manual API                          | Potential spoofing surface                    | `Span.setAttribute(key, value)` rejects identity-key names via typed denylist; manual override requires a separate system API used only by middleware.                                                                                    |
| Usage recorded on non-leaf span                                                            | Double-count risk                             | Warn metric + skip record. Bug in the caller; fix in PR.                                                                                                                                                                                  |
| Tool-output audit write fails                                                              | Partial audit trail                           | Retry via outbox pattern (plan 11 owns outbox if relevant); if persistent failure, P1 — tool call trace exists but audit doesn't.                                                                                                         |
| PreCaptureRedactor misses a declared field (coding error)                                  | Tenant-authored text leaks into trace backend | Scheduled audit scan over exported trace spans for `<tenant_authored>` markers matches against redaction coverage; any miss is a P1 data-handling incident.                                                                               |
| Trace-ID UUIDv7 collision                                                                  | Astronomically unlikely but non-zero          | Second turn with colliding `trace_id` gets rejected at insert (unique constraint); request retries with new UUID.                                                                                                                         |
| Exporter adapter's `purgeByUserId` fails                                                   | Partial GDPR compliance                       | Plan 04 retries 3× (1s/4s/16s); on exhaustion opens `compliance_ticket_required: true` kernel audit row; DB + L3 scrub committed regardless.                                                                                              |
| Tenant exceeds daily trace-emission quota                                                  | Capture forced off for that tenant            | Sampled-out turns still produce `agent_turn_sampling_decision` diagnostic rows. P2 alert at 80%/100%. Admin runbook raises quota if legitimate traffic.                                                                                   |
| Cross-tenant leak canary job finds fixture-tenant span in another tenant's trace-read view | P0 security incident                          | Pages on-call; temporarily disables exporter read plane; runbook inspects RLS on trace-read adapter; backend filter config reviewed. Blocks further reads until cleared.                                                                  |
| Metric label cardinality explosion (despite guardrail)                                     | TSDB memory blow-up                           | Plan 05 guardrail catches at exporter; this plan's metrics are audited for compliance.                                                                                                                                                    |

---

## 8. Observability Surface

_This plan ships the observability surface; its self-observation is narrower._

### Meta-metrics

- `agent_span_flush_total{status: 'ok' | 'error'}` — trace-backend export outcomes.
- `agent_span_buffer_depth` — gauge; alert if sustained high (backend unreachable).
- `agent_sampling_decision_total{capture: 'true' | 'false', reason}` — counter.
- `agent_pii_redaction_total{tool_name}` — counter of redacted-field occurrences.
- `agent_usage_recorded_on_non_leaf_total` — counter; should always be 0.
- `agent_trace_audit_join_miss_total` — counter; any non-zero is P1 (tool-call span without audit row).
- `agent_tenant_trace_quota_used{tenant_id}` — gauge (fraction of daily quota consumed); P2 at 0.8, P1 at 1.0.
- `agent_cross_tenant_leak_canary_total{result: 'clean' | 'leak_detected'}` — counter; any `leak_detected` is P0.

### Dashboards (meta)

- Trace-backend collector health (span-flush success rate; alert if <99% for 10 min).
- Sampling distribution (expected: 99% sampled-out, 1% baseline sample, N% trigger-match, force-sampled-out-by-quota broken out separately).
- Cross-system `trace_id` join coverage (audit vs traces — should be 100% modulo sampling).
- Per-tenant trace-quota consumption + leader board (who's nearing cap).
- Cross-tenant leak canary status (daily green/red timeline).

### Dashboards (flow / intent)

- **Per-intent regression dashboard** — cost, latency p50/p95/p99, thumbs-down rate, refusal rate, and `intent_slug: 'unclassified'` share — bucketed by `intent_slug`. Primary surface for router-accuracy + quality regression by user intent. Breach of §18.5 `'unclassified' ≤ 2%` fires an alert.
- **Per-flow correlation dashboard** — given a `flow_id`, shows all `trace_id`s, all kernel audit events, all drafts, all `approval_request` rows, all pg-boss jobs, and all execution events linked to the flow. Primary incident-reconstruction surface for multi-turn flows (R-07.44 zero-dangle proof).
- **Composition-pattern heatmap** — tool-pair frequency per tenant derived from `agent.composition_pattern_observed` events; week-over-week delta; top invokers per tenant. Drives PR-time review of aggregate-tool `minGroupSize` discipline.

---

## 9. Security Considerations

- **`trace_id` is not sensitive** — it's a correlation token, not an authz credential. Exposing it in UI deep-links is fine for dev users.
- **`flow_id` is not a secret** — same correlation-token posture as `trace_id`. However, `flow_id` **must not leak cross-tenant** via any dashboard, export, or support tool. Filtering inherits from the existing `tenant_id` discipline: any query surface that returns `flow_id` values MUST filter by `tenant_id` from `RequestContext` (same rule the cross-tenant leak canary verifies for trace spans). A second tenant ever seeing another tenant's `flow_id` is a P0 on the same incident class as a span leak.
- **`intent_slug` is a controlled vocabulary**, not user input — no free-text exfiltration risk. New slugs only ship via PR-reviewed `modules/<X>/agent/intents/*.ts` declarations (§2.2 EI-3).
- **`agent_tool_invocation.result_preview` holds unredacted tool results** including `tenantAuthoredFreeText`. RLS protects; 90-day retention; accessed for incident reconstruction only. Access is audited.
- **Trace backend holds redacted spans + user utterances**. User utterances are covered by plan 04 GDPR pipeline. Tenant-authored text is redacted pre-capture; if miss, treat as incident.
- **Identity-key auto-stamp prevents manual spoofing**. `Span.setAttribute('tenant_id', 'other')` from a sub-agent would be blocked at the API; middleware is the only writer.
- **Sampling decision cannot be overridden mid-flight by untrusted input.** The `SamplingConfig` is server-config, not per-request.
- **Dashboard PII avoidance.** Meta-metrics don't carry `user_id`; dashboards aggregate by tenant + tier only.
- **Cross-tenant trace isolation.** The exporter adapter's read plane MUST filter by `tenant_id` from `RequestContext`. The leak canary (R-07.38a) is the continuous proof that isolation holds — without it, we have no observable assurance that the backend honors tenant filters.
- **Vendor-neutral emission surface** (R-07.8a). If the chosen backend is replaced, spans continue emitting with the same attribute names; only the adapter changes. No risk of attribute-naming drift smuggling PII across a migration.

---

## 10. Performance Budget

| Operation                                     | p50    | p95    | p99    |
| --------------------------------------------- | ------ | ------ | ------ |
| `ObservabilityContextFactory.create`          | <2ms   | <5ms   | <10ms  |
| `Span` creation (captured)                    | <1ms   | <3ms   | <8ms   |
| `Span` creation (NoOp)                        | <0.1ms | <0.3ms | <1ms   |
| `Span.setAttribute`                           | <0.1ms | <0.2ms | <0.5ms |
| `PreCaptureRedactor.redact`                   | <2ms   | <5ms   | <15ms  |
| `ToolInvocationAuditRecorder.record`          | <5ms   | <15ms  | <40ms  |
| Trace-backend batch flush (async, background) | —      | —      | —      |

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

- Happy turn: exported trace has full span tree; `tenant_id` on every span; content hashes populated on root; leaf spans have usage.
- 1% baseline sampling: seed 100 turns; ~1 has full capture; others NoOp; all 100 produce `agent_turn_sampling_decision` diagnostic rows.
- Trigger-match: seed a ceiling-hit turn → 100% capture regardless of baseline.
- Trace-audit join: for every `SUB_AGENT_TOOL_CALL` span, find matching `agent_tool_invocation` row by `trace_id`. 100% coverage.
- PII redaction: seed a tool result with a declared free-text field → exported span shows `<redacted>`, audit shows raw.
- GDPR: delete user X → exporter adapter `purgeByUserId` called → subsequent backend query for user X returns empty.
- Cross-tenant: tenant A's trace-read surface does not return tenant B spans.
- UUIDv7 format: `trace_id` chronologically sortable verified by insert order vs lexicographic sort.
- Tenant quota: seed tenant emitting > `max_sampled_turns_per_day` → subsequent turns are force-sampled-out; `tenant_quota_exhausted_at` stamped on diagnostic rows; P2 alert fires.
- Cross-tenant leak canary: inject fixture-tenant canary trace → daily job scans across tenants → no match found → `agent_cross_tenant_leak_canary_total{result: 'clean'}` increments. Seeded-leak test (deliberately broken filter) triggers `leak_detected` + P0 path.
- Vendor-neutrality: seed a second dummy exporter adapter in test → same span emission produces correctly-mapped output for both adapters with zero changes to emission code (R-07.8a invariant).

### Property

- Span tree invariant: every span has `parent_span_id` pointing to an actual parent or is the `TURN` root.
- Usage sum equality: sum of leaf `recordUsage` calls = `turn.ended.usage` = `agent_cost_event` row sum for that trace.

### E2E

- Incident reconstruction drill: given a `trace_id`, grep returns rows from `agent_message`, `kernel_audit`, `agent_tool_invocation`, pg-boss; trace-backend view loads. All consistent.

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
  - PII redaction: zero `tenantAuthoredFreeText` leakage in exported trace scans.
- Cross-tenant seed test passes.
- `agent_trace_audit_join_miss_total` = 0 in production for any 30-day window.
- Exported trace view shows auto-stamped identity keys on every span.
- UUIDv7 round-trip: server generates → backend stores → adapter round-trips without collision or format loss.
- Daily cross-tenant leak canary runs green for 30 consecutive days before MVP ship gate.
- Per-tenant quota enforcement verified: tenant over quota cannot force higher sampling via any surface.
- Vendor-neutrality test: a second dummy exporter adapter compiled into tests proves emission is backend-agnostic.

---

## 13. Rollout Plan

- **Phase 1** — ship observability context + span taxonomy + auto-stamping; default `SamplingConfig: { type: 'always' }` for internal-tenant dev.
- **Phase 2** — enable stratified sampling + 5 triggers.
- **Phase 3** — wire `agent_tool_invocation` audit table + trace-audit join dashboards.
- **Phase 4** — wire GDPR purge from plan 04 pipeline through exporter adapter.
- **Phase 5** — dashboards + alerts (router accuracy, anomaly, calibration, quota, leak canary).
- **Phase 6** — daily cross-tenant leak canary live in production, 30-day green window before MVP gate.

**Backout:** observability faults fail-open (turn completes with no trace rather than fail). Trace-backend outage doesn't block user-visible flow. Any regression is fixed forward; no feature flag because observability is tenet-level.

---

## 14. Dependencies

- Plan 00 (shipped): OTel wiring + prompt/narrative stores. (Trace backend selection is deferred per CLAUDE.md roadmap; this plan is backend-agnostic.)
- Admin module: `admin_tenant_config` fields `max_sampled_turns_per_day`, `trace_retention_days`, `audit_retention_days` (R-07.17b, R-07.36, R-07.37).
- Plan 01: tool-output audit emitted from gateway step 6.
- Plan 02: session hash attributes (router_prompt_hash etc.); **router emits `flow_id` + `intent_slug` on turn entry** (mint or inheritFrom) — this plan auto-stamps them onto every descendant span.
- Plan 03: sub-agent + synthesizer span emission.
- Plan 04: GDPR purge integration; post-turn summarizer emits router-accuracy signal.
- Plan 05: cost + usage attributes.
- Plan 06: identity-key discipline on `RequestContext`.
- Plan 08: approval-inbox depth metric; **drafts, `approval_request` rows, and approval / execution events stamp `flow_id`** so downstream turns inherit via `FlowIdPropagation.inheritFrom`.
- Plan 10: canary signal ingestion point; **declared-intent drift scorer** consumes `flow_id` / `intent_slug` / `tool_name` / `sub_agent_key` dimensions persisted here (golden-trace replay queries these attributes directly — no post-hoc inference).

## 15. Integration Points

- `apps/api/src/modules/agents/application/services/observability-context.ts` — factory + auto-stamper.
- `apps/api/src/modules/agents/application/services/sampling-decider.ts`.
- `apps/api/src/modules/agents/infrastructure/exporters/trace-backend-exporter.ts` — adapter interface; attribute remapping + `purgeByUserId` implementation per chosen backend. Backend selection is swappable; emission code never imports this directly.
- `apps/api/src/modules/agents/infrastructure/redaction/pre-capture-redactor.ts`.
- `apps/api/src/modules/agents/infrastructure/schema/agent-tool-invocation.ts` — Drizzle.
- `apps/api/src/modules/agents/infrastructure/schema/agent-turn-sampling-decision.ts` — Drizzle (R-07.17a diagnostic rows).
- `apps/api/src/modules/agents/infrastructure/repositories/tool-invocation-audit-repository.ts`.
- `apps/api/src/modules/agents/application/services/leak-canary-scheduler.ts` — daily pg-boss job (R-07.38a).
- Kernel module — audit event write.
- OTel SDK — span emission (vendor-neutral).

## 16. Activation Gate

MVP. Ships with first production turn. The new 2026-04-22 dimensions — `flow_id`, `intent_slug`, required `sub_agent_key` / `tool_name` on every applicable span, composition-attack runtime monitor — are **all MVP** and active on the first production turn. No feature-flag gradual rollout: observability-tenet-level invariants ship turned on, fail-open on fault (per §13 backout), fix-forward on regression.

## 17. Out of Scope

- Quality canary scheduling / fixture-tenant data (plan 10).
- LLM-judge scorers (GA).
- Full-fleet prompt capture (GA).
- Trace-backend deployment, ops, and vendor selection (infra / implementation-doc — deferred per CLAUDE.md).
- Per-tenant retention config UI (product concern).

## 18. Open Questions

- **`trace_id` format coercion at backend boundary.** If the chosen backend requires a different format (e.g. OTel 32-hex), the adapter converts UUIDv7 → required representation at export. Verify at bootstrap smoke test once backend is selected. Owner: platform eng.
- **Async trace-joining for pg-boss reminders.** New trace with `parent_trace_id` link attribute vs joining an open trace. Recommend: new trace with link; avoids multi-day unclosed traces. Owner: plan 09 integration.
- **`entity_version_id` vs content hash duplication.** Both on every trace. Redundancy confirms replay. Keep both at MVP; revisit if storage cost is meaningful.
- **Trace retention vs kernel audit retention.** 30d vs 90d. Document explicitly: audit is authoritative post-30-day; trace backend is query/replay convenience. Owner: legal + ops.
- **Trace-backend selection.** Deferred per CLAUDE.md. Candidates include Langfuse (self-hosted or cloud), self-hosted OTel collector → ClickHouse/Tempo, etc. Decision criteria: RLS-compatible tenant filtering, `purgeByUserId` semantics, retention configurability, cost at tenant scale. Owner: ops + platform eng; deadline TBD before Phase 4.
- **Single vs multi-exporter adapter registry.** Should we support multiple backends simultaneously (e.g. cheap ClickHouse bulk + expensive Langfuse high-fidelity) via a composite exporter? Defer until single-backend pattern is operating smoothly; adds ops surface area. Recommend: single backend at MVP; composite deferred.
- **Meta-eval corpus for LLM-judge promotion (plan 10 dep).** This plan's `agent_tool_invocation` retention supports corpus mining; verify we don't prematurely delete incident-class traces before meta-eval gate clears. Owner: plan 10 author.
