# Cluster 3 Production-Readiness Audit

## Plans 05 (Cost + Ceilings), 06 (Streaming + SSE + Cancellation), 07 (Observability + Sampling)

**Date:** 2026-04-26  
**Auditor:** Claude Sonnet 4.6 (read-only, no changes made)  
**Method:** Plan spec top-to-bottom → locate implementation → verify each §6 requirement, §3 data model, §4 interface contracts, §8 observability emits, §11 test layers, §12 acceptance criteria

---

## Summary Table

| Plan                          | Status (README) | P0    | P1     | P2    | Gate        |
| ----------------------------- | --------------- | ----- | ------ | ----- | ----------- |
| 05 — Cost + Ceilings          | Shipped         | 2     | 5      | 1     | **BLOCKED** |
| 06 — Streaming + Cancellation | In Progress     | 2     | 5      | 0     | **BLOCKED** |
| 07 — Observability            | Shipped         | 3     | 5      | 2     | **BLOCKED** |
| **Total**                     |                 | **7** | **15** | **3** |             |

All three plans are blocked from shipping. Plans 05 and 07 are marked "Shipped" in the README but have P0 gaps that prevent production use.

---

## Plan 05 — Cost + Ceilings + Tier Degradation + Rate Limits

### §3 Data Model

Schema implementation in `agents.schema.ts` is correct:

- `agentPricing` — intentionally no tenant_id (global pricing table, matches spec)
- `agentCostEvents` — has retryCount, attemptDurationMs, totalDurationMs
- `agentTenantBudget`, `agentUserBudget`, `agentRateLimitCounter` — all present
- Cache-read/cache-write token split columns present on `agentCostEvents`

**No findings on the data model itself.**

### §4 Interface Contracts

- `BudgetChecker` — implemented correctly (preTurnCheck, midTurnCheck, sequential DB queries per no-Promise.all rule)
- `CostRecorder` — implemented but with atomicity gap (see P1 below)
- `GracefulDegradationLadder` — 7-step ladder with invariant enforcement at step boundaries
- `QualityCanarySubscription` — implemented, spec-compliant unit tests exist
- `RateLimiter`, `ApprovalInboxThrottle`, `PricingResolver` — not audited for internal correctness; wiring into turn pipeline is the gap

### §6 Requirements

**P0 — BudgetChecker not wired into turn controller**  
`agent-turn-controller.ts` does not import or call `BudgetChecker.preTurnCheck()`. Every turn starts without any budget gate. R-05.1 (turn must be refused when budget is exhausted) is completely unmet in the live path.

**P0 — Plan 05 §8 OTel instruments missing**  
None of: `agent_cost_usd_total`, `agent_tier_shift_total`, `agent_provider_fallback_total`, `agent_budget_remaining_usd`, `agent_llm_call_attempt_duration_ms`, `agent_rate_limit_rejection_total`, `agent_budget_ceiling_hit_total`, `agent_degradation_step_total` exist as OTel Counter or Histogram instruments. They are referenced only in the production-readiness criterion evaluators (which check for their presence) but never created as actual instruments.

**P1 — CostRecorder atomicity gap**  
`cost-recorder.ts` Steps 2–4 (insert cost event → decrement tenant budget → upsert user budget) are three sequential awaits with no surrounding transaction. A crash between any two leaves the DB in an inconsistent state. Plan 05 §9 explicitly requires a single transaction.

**P1 — GracefulDegradationLadder not wired into turn pipeline**  
The ladder is implemented and tested in isolation. Canary-driven steps 4–6 (tier_shift × 2, canary_collapse_refuse) are never triggered because nothing connects QualityCanarySubscription events to active turns' systemAbortController. The ladder is dead code in production.

**P1 — MetricLabelGuard defined but never called**  
`metric-label-guard.ts` defines `DEFAULT_BLOCKED_LABELS` and `assertNoBlockedLabels()`. Zero metric emit sites call the guard. R-05.30 (blocked label cardinality enforcement) and R-05.31 are unenforced at runtime.

### §11 Test Layers

**P1 — Property tests absent**  
Required: retry-cost invariant, retry-after fidelity, fallback stickiness, over-billing guard. None found.

**P1 — Integration tests absent**  
Required: full turn cost split (cache-read vs cache-write tokens), adapter-drop audit trail, mid-turn abort partial cost record, tier-shift integration. None found.

### §12 Acceptance Criteria

The plan's acceptance criteria cannot pass:

- Budget enforcement: unmet (no wiring)
- Cost metrics dashboard: unmet (no instruments)
- Graceful degradation observable: unmet (ladder not wired)
- Transaction integrity: unmet (no DB transaction)

---

## Plan 06 — Streaming + SSE + Cancellation

### §3 Data Model

- `agentActiveTurns` — present with `abortPending` boolean column (correct per spec)
- In-memory state machine + AbortCoordinator — implemented in `stream-gateway.ts` and `abort-coordinator.ts`
- `AbortSignal.any([userCancel, timeout, systemAbort])` composition — implemented in `composeTurnAbortSignal()`

**Schema is correct. Wiring gaps exist in the application layer.**

### §4 Interface Contracts

- `SseEvent` taxonomy (12 event types) — defined and correct
- `TurnEndReason` enum — defined
- `AbortCoordinator` / `composeTurnAbortSignal` — implemented
- `StreamGateway` — state machine implemented with `nextState()` validation
- `RequestContextDiscipline` — implemented (see P1 below re: metric)

### §6 Requirements

**P0 — abort_pending never read by heartbeat (dead-letter cross-pod cancel)**  
`ActiveTurnRegistry` heartbeat only updates `lastHeartbeatAt`. It never queries `abort_pending`. When `CrossPodCancelService` writes `abortPending=true` (on forward failure), the owning pod never sees it. R-06.40 (owning pod detects `abort_pending` on next heartbeat tick) is unimplemented. Cross-pod eventual cancel silently fails.

**P0 — Plan 06 §8 OTel instruments missing**  
None of: `agent_turn_total`, `agent_abort_total`, `agent_ordering_violation_total`, `agent_identity_key_write_attempted_total`, `agent_sse_backpressure_total`, `agent_turn_force_stopped_total`, `agent_draft_persist_failure_total`, `agent_progress_event_total` exist as OTel instruments. The streaming observability layer is structurally absent.

**P1 — stream-gateway.ts close() bypasses state machine**  
`close()` directly writes `turn.ended` to the wire without calling `nextState('turn.ended')`. This means `turn.ended` can be emitted from any state (including `shape-declared`, `tokens-streaming`) that is not in the `TURN_ENDED_ALLOWED` set, violating the SSE ordering contract. The ordering violation counter can never fire from `close()`.

**P1 — draft.proposed persist-then-emit atomicity not implemented (R-06.14a)**  
The current turn controller emits SSE events without any DB draft persistence. There is no code path that writes a draft row before the SSE event, so the "DB write failure suppresses SSE event" guarantee is structurally absent.

**P1 — Fallback visibility (R-06.35a) not triggered**  
`answer.shape_declared` is hardcoded to `format: 'markdown'`. No provider-outage detection or fallback format (`fallback_markdown`) selection exists.

**P1 — Force-stop cancelledBy not propagated**  
`AgentCancelController` calls `activeTurnRegistry.cancel(traceId)` without the actor's userId. The `turn.ended` SSE payload cannot include `cancelled_by`, breaking the audit trail visibility on the client side.

**P1 — Integration tests absent**  
Required: persist-then-emit atomicity (DB write failure suppresses SSE), fallback visibility end-to-end, provider outage complete path. None found.

### §11 / §12

The plan is "In Progress" per README, so the missing implementations are expected. The blocking concerns are the P0 gaps: `abort_pending` dead letter makes the cross-pod cancel architecture non-functional even once the rest of the turn pipeline is integrated, and the missing metric instruments mean the streaming health dashboard will never have data.

---

## Plan 07 — Observability + Sampling + flow_id + Composition-Attack Monitor

### §3 Data Model

- `agentToolInvocations` — present, correct columns
- `agentTurnSamplingDecisions` — present
- **P0 — kernel `audit_event` missing flow_id + intent_slug**  
  `audit-event.schema.ts` columns: id, tenantId, actorId, eventType, module, subjectId, payload, createdAt. No `flow_id`, no `intent_slug`. Plan 07 §3 explicitly states these must be first-class indexed columns before the plan ships. Every `KernelAuditFacade.recordEvent()` call from the agents module cannot attach trace correlation.
- `trace_retention_days`, `audit_retention_days` absent from admin tenant config schema (P2)

### §4 Interface Contracts

- `ObservabilityContextFactory` — implemented, correct auto-stamp logic
- `FlowIdPropagation.mint()` — UUIDv7 generation, implemented
- `SamplingConfig`, `NoOpSpan` — implemented
- `IDENTITY_KEY_DENYLIST` + `assertNotDenylistKey` — implemented in `OtelSpan.setAttribute`
- `TurnSamplingDecisionRecorder` — registered in module

### §6 Requirements

**P0 — ObservabilityContextFactory never called from production turn path**  
`agent-turn-controller.ts` imports neither `ObservabilityContextFactory` nor `FlowIdPropagation`. No TURN root span is ever created. R-07.43 (flow_id + intent_slug on every span, hard fail if missing) is vacuously satisfied — there are zero spans. R-07.44 (zero-dangle), R-07.45 (mint exactly once) cannot be verified because there are no spans to inspect.

**P0 — Leak canary always returns 'clean' (false assurance)**  
`leak-canary.scheduler.ts` always calls `recordLeakCanary('clean')` without any scan. Plan 07 §6 R-07.38a marks this as MVP-active. The stub provides a falsely clean daily signal. Real cross-tenant trace leaks would be invisible.

**P1 — Composition monitor never fires (DEFAULT_COMPOSITION_SENSITIVE_TOOLS empty)**  
`composition-monitor.worker.ts` has `DEFAULT_COMPOSITION_SENSITIVE_TOOLS = new Set()`. `sensitiveInvocations` is always empty; the pg-boss post-turn job runs but never emits `agent.composition_pattern_observed`. R-07.46 is structurally wired but functionally unmet.

**P1 — OtelSpan.recordUsage uses console.warn instead of metric counter**  
When `recordUsage()` is called on a non-leaf span, it logs to console but does not increment `agent_usage_recorded_on_non_leaf_total` (which exists in `observability-metrics.ts` but is never referenced from `span.ts`). R-07.28 metric is never emitted.

**P1 — TurnSamplingDecisionRecorder never called from turn lifecycle**  
The recorder is registered in the module but not called. `agentTurnSamplingDecisions` accumulates no rows. The sampling audit trail (R-07.6) is absent.

**P1 — agent_identity_key_write_attempted_total counter not incremented**  
`request-context-discipline.ts` emits a kernel audit event on violations but does not increment the OTel counter `agent_identity_key_write_attempted_total`. The cardinality dashboard metric is silent.

**P2 — trace_retention_days / audit_retention_days columns absent from admin tenant config**

**P2 — R-07.48 unclassified intent ceiling (≤2%) has no automated enforcement test**

### §8 Observability

Plan 07 meta-metrics (`agent_sampling_decision_total`, `agent_pii_redaction_total`, `agent_usage_recorded_on_non_leaf_total`, `agent_trace_audit_join_miss_total`, `agent_cross_tenant_leak_canary_total`) are defined in `observability-metrics.ts`. However:

- `agent_usage_recorded_on_non_leaf_total` — not incremented at emission site (P1)
- `agent_cross_tenant_leak_canary_total` — incremented but always with value='clean' (P0 false assurance)
- `agent_sampling_decision_total` — defined but only called if TurnSamplingDecisionRecorder is invoked (not wired)

### §12 Acceptance Criteria

Cannot pass:

- Every span carries flow_id + intent_slug: unmet (no spans created)
- Composition monitor fires on sensitive tool combinations: unmet (empty tool set)
- Leak canary provides real signal: unmet (always-clean stub)
- Kernel audit events carry flow_id correlation: unmet (columns absent)

---

## Intra-Cluster Cross-Plan Observations

### 1. The turn controller is a placeholder for all three plans

`agent-turn-controller.ts` emits five hardcoded SSE events with no agent execution, no budget check, no rate limit, no flow_id, no span. All three plans (05, 06, 07) have critical P0 gaps traceable to this single file. When the real agent execution is integrated, all three plans' wiring tasks will converge here.

### 2. Metrics layer is split: instruments defined in evaluators, not in emit paths

Plans 05 and 06 metrics appear only as strings in the production-readiness criterion evaluator files. The actual OTel Counter and Histogram objects needed to emit them do not exist. Plan 07 meta-metrics are defined but partially unincremented. A single `create-instruments` pass across all three plans is needed before any plan's §8 dashboards can be built.

### 3. Cross-pod cancel architecture is broken end-to-end

Plan 06's cross-pod cancel depends on a three-step chain: (a) `CrossPodCancelService` writes `abortPending=true`, (b) owning pod heartbeat reads it and calls `userCancelController.abort()`, (c) stream-gateway closes with reason='cancelled'. Step (b) is missing. Steps (a) and (c) are implemented. Without (b), the 202 "eventual cancel" response is a lie — the turn never actually cancels.

### 4. Plan 07's kernel schema dependency is unresolved

Plan 07 §3 explicitly conditions its own shipping on the kernel migration adding `flow_id` + `intent_slug` to `audit_event`. That migration has not happened. This is a cross-module blocker: the agents module cannot complete its observability integration until the kernel module's schema is extended. This should be tracked as a cross-module dependency ticket, not an agents-only fix.

### 5. Atomicity discipline is inconsistently applied

`BudgetChecker` correctly uses sequential awaits (per CLAUDE.md no-Promise.all rule). `CostRecorder` also uses sequential awaits — but for a different reason: it _needs_ a DB transaction, not just sequential execution. The sequential execution pattern satisfies the pool-client rule but does not provide the atomicity guarantee the plan requires. These are two distinct constraints and both must be satisfied.

---

## Files Examined

- `docs/agents/plans/05-cost-ceilings.md`
- `docs/agents/plans/06-streaming-cancellation.md`
- `docs/agents/plans/07-observability.md`
- `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts`
- `apps/api/src/modules/agents/application/services/graceful-degradation-ladder.ts`
- `apps/api/src/modules/agents/application/services/budget-checker.ts`
- `apps/api/src/modules/agents/application/services/cost-recorder.ts`
- `apps/api/src/modules/agents/application/services/active-turn-registry.ts`
- `apps/api/src/modules/agents/application/services/stream-gateway.ts`
- `apps/api/src/modules/agents/application/services/flow-id-propagation.ts`
- `apps/api/src/modules/agents/application/services/observability-context.ts`
- `apps/api/src/modules/agents/application/services/request-context-discipline.ts`
- `apps/api/src/modules/agents/application/services/quality-canary-subscription.spec.ts`
- `apps/api/src/modules/agents/interface/http/agent-turn-controller.ts`
- `apps/api/src/modules/agents/interface/http/agent-cancel-controller.ts`
- `apps/api/src/modules/agents/infrastructure/cross-pod-cancel.ts`
- `apps/api/src/modules/agents/infrastructure/jobs/composition-monitor.worker.ts`
- `apps/api/src/modules/agents/infrastructure/jobs/leak-canary.scheduler.ts`
- `apps/api/src/modules/agents/infrastructure/observability/observability-metrics.ts`
- `apps/api/src/modules/agents/infrastructure/observability/gateway-metrics.ts`
- `apps/api/src/modules/agents/infrastructure/metrics/metric-label-guard.ts`
- `apps/api/src/modules/agents/domain/observability/span.ts`
- `apps/api/src/modules/kernel/infrastructure/schema/audit-event.schema.ts`
