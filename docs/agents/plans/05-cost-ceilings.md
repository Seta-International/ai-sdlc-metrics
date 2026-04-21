# 05 — Cost + Ceilings + Tier Degradation + Rate Limits

**Design §§:** §13 (Cost Control), §4 (ceiling error classes).

---

## 1. Scope

### In

- Dollar-denominated cost accounting with cache-read / cache-write / reasoning token splits.
- Versioned pricing table with `pricing_id` + `priced_at` stamping on every cost event.
- Per-turn, per-sub-agent, per-tool ceilings (wallclock, iterations, cost, bytes-scanned).
- Per-user daily + per-tenant daily budgets with tiered degradation (80 / 95 / 100%).
- Pre-turn refusal vs mid-turn abort distinction (`refused` vs `budget` turn reasons).
- Adapter validation — error-log + P1 alert when vendor reports cache fields the adapter drops.
- `tier_shift` vs `provider_fallback` distinct trace tags.
- Rate limits: queries/user/min, L3 writes/user/day, schedule-or-delegation creations/user/day.
- Approval inbox throttle thresholds (per-approver + per-initiator-pair).
- Metric-label cardinality guardrail (`DEFAULT_BLOCKED_LABELS`).
- Admin budget top-up path with kernel audit.

### Out

- Per-delegation cost / invocation caps (plan 09 — async agents enforces pre-spawn).
- Quality-canary-triggered degradation (plan 10 — separate trigger source, reuses tier-shift surface).
- Self-hosted model tier (GA activation-gated).
- Usage capture at span level (plan 07 stamps; this plan defines the data).

---

## 2. Design Context

Cost is dollar-denominated, not token-denominated, because cache-read (~0.1× input) and cache-write (~1.25× input) have radically different rates. Token-count approximations drift from real billing by double-digit percentages, especially under high cache-hit sessions. We bill cached tokens at cached rate per §13; cached-write tokens separately at the even-higher rate.

Pricing is **versioned**. Every cost event stamps `pricing_id` (FK into an append-only pricing table) + `priced_at` timestamp. Vendor pricing changes → new `pricing_id` row → historical cost events retain their original rates for audit-safe re-pricing. Without this, any retroactive budget analysis on a day vendor rates change produces wrong numbers silently.

**Adapter validation** is the P1 guardrail. Mastra's AI SDK v4 usage converter silently drops `cachedInputTokens` (spike 09). Under-billing is the class that doesn't surface until someone audits the Langfuse vs Stripe divergence. Our adapter emits `adapter_dropped_cache_fields` kernel audit + monitoring alert on any mismatch between vendor report and captured usage.

**Tier degradation is separate from provider fallback.** `tier_shift` = policy decision (budget crossed → use nano); `provider_fallback` = error recovery (provider 5xx → try alt model). Conflating them hides budget pressure behind provider flakiness. Distinct finish reasons + distinct alert paths.

**Pre-turn refusal ≠ mid-turn abort.** `refused` = "we never started" (distinct UX: no retry button, narrate budget reason). `budget` = "we started and ran out" (partial-answer gate applies). Collapsing them gives users wrong retry semantics.

**Cardinality guardrail** on metrics: rate-limit + cost counters MUST NOT carry `user_id / conversation_id / trace_id` as labels. High-cardinality values live on traces (§12) where retention is bounded; putting them on metrics blows up TSDB cost linearly with user count.

**What this is NOT:** a usage-tracking library. It is the budget + ceiling + refusal enforcement layer. Token capture is a collaboration between this plan (defines data shape) and plan 07 (emits spans).

---

## 3. Data Model

### `agent_pricing` (append-only)

- `id UUID PK` — serves as `pricing_id` stamped on cost events.
- `model_id TEXT` — e.g. `'gpt-5.4'`, `'gpt-5.4-nano'`, `'text-embedding-3-small'`.
- `input_usd_per_mtok NUMERIC(10,4)` — uncached input, per million tokens.
- `input_cached_read_usd_per_mtok NUMERIC(10,4)` — cache-read, per million tokens.
- `input_cached_write_usd_per_mtok NUMERIC(10,4)` — cache-write.
- `output_usd_per_mtok NUMERIC(10,4)`.
- `output_reasoning_usd_per_mtok NUMERIC(10,4)`.
- `effective_from TIMESTAMPTZ`, `effective_until TIMESTAMPTZ?`.
- Unique: `(model_id, effective_from)`.
- Never updated, never deleted — pricing changes add new rows.

### `agent_cost_event` (append-only)

- `id UUID PK`
- `trace_id UUID` (FK-style, no hard FK; Langfuse owns the trace)
- `tenant_id UUID` (RLS)
- `user_id UUID` (for per-user daily; NULL for tenant-wide scheduler)
- `pricing_id UUID FK → agent_pricing`
- `priced_at TIMESTAMPTZ` — when the cost was computed (equals `agent_pricing.effective_from` of the referenced row).
- `model_id TEXT`
- `usage_input_uncached INT`, `usage_input_cached_read INT`, `usage_input_cached_write INT`, `usage_output INT`, `usage_output_reasoning INT`.
- `cost_usd NUMERIC(12,6)` — computed = `sum(usage_i × rate_i / 1_000_000)`.
- `layer TEXT` — `'router' | 'sub_agent:<key>' | 'synthesizer' | 'summarizer'`.
- `created_at TIMESTAMPTZ`.
- Index: `(tenant_id, created_at DESC)`, `(tenant_id, user_id, created_at DESC)`.

### `agent_tenant_budget`

- `tenant_id UUID PK` (RLS)
- `daily_limit_usd NUMERIC(10,2)` — per-tenant ceiling per UTC day.
- `remaining_usd NUMERIC(12,6)` — decremented per cost event.
- `last_refilled_at TIMESTAMPTZ` — midnight-UTC refill.
- `updated_at TIMESTAMPTZ`.

### `agent_user_budget` (optional; falls back to derived from `agent_cost_event` if not pre-aggregated)

- `tenant_id UUID`, `user_id UUID`, `date DATE` (UTC) — PK.
- `daily_limit_usd NUMERIC`, `remaining_usd NUMERIC`.
- `updated_at TIMESTAMPTZ`.

### `agent_rate_limit_counter` (Redis-backed OR Postgres per-minute / per-day buckets)

Implementation choice pinned at rollout. Interface: `(tenant_id, user_id, limit_key, bucket) → count`.

### Metric-exporter blocklist (config)

```
DEFAULT_BLOCKED_LABELS = ['user_id', 'conversation_id', 'trace_id', 'delegation_id', 'schedule_id']
```

Enforced at the Prometheus / TSDB exporter layer. Attempts to emit a metric carrying a blocked label → build-time lint error OR runtime log + drop.

---

## 4. Interface Contracts

### `PricingResolver`

```
resolve(opts: { modelId: string; at?: Date }): Pricing
// `at` defaults to now(); historical queries use the event's priced_at.

type Pricing = {
  pricingId: UUID;
  inputUsdPerMtok: number;
  inputCachedReadUsdPerMtok: number;
  inputCachedWriteUsdPerMtok: number;
  outputUsdPerMtok: number;
  outputReasoningUsdPerMtok: number;
  effectiveFrom: Date;
}
```

### `UsageExtractor` (per provider adapter)

```
extract(providerResponse: unknown): UsageTokens

type UsageTokens = {
  inputUncached: number;
  inputCachedRead: number;
  inputCachedWrite: number;
  output: number;
  outputReasoning: number;
}
```

Adapter MUST extract all fields or emit `adapter_dropped_cache_fields` audit + P1 alert.

### `CostCalculator`

```
compute(opts: { usage: UsageTokens; pricing: Pricing }): {
  costUsd: number;
  breakdown: Record<keyof UsageTokens, number>;   // per-component cost
}
```

### `CostRecorder`

```
record(opts: {
  traceId; tenantId; userId?; layer; modelId; usage; pricing; costUsd;
}): Promise<void>
// Writes agent_cost_event + decrements agent_tenant_budget.remaining_usd + per-user daily.
```

### `BudgetChecker` (pre-turn + mid-turn gate)

```
preTurnCheck(opts: { tenantId; userId }): Promise<{
  allowed: boolean;
  tier: 'full' | 'nano' | 'refused';
  reason?: string;
  tierShift?: boolean;
}>

midTurnCheck(opts: { tenantId; userId; consumedUsd }): Promise<{
  allowed: boolean;
  tier: 'full' | 'nano';
  shouldAbort: boolean;    // true if tenant just crossed 100%
}>
```

### `RateLimiter`

```
check(opts: {
  tenantId; userId; limitKey: 'queries/user/min' | 'l3_writes/user/day' | 'schedule_creations/user/day';
}): Promise<{ allowed: boolean; remaining?: number; resetAt?: Date }>
```

Fail-soft: `allowed=false` returns structured error; caller surfaces user-visible message.

### `ApprovalInboxThrottle`

```
checkEligibility(opts: {
  tenantId; initiatorUserId; approverUserId;
}): Promise<{
  eligible: boolean;
  reason?: 'initiator_pair_threshold' | 'approver_aggregate_threshold';
  pendingCounts: { initiatorPair: number; approverAggregate: number };
}>
```

### `AdminBudgetOps` (tRPC procedures; kernel-audited)

```
topUp(opts: { tenantId; amountUsd; reason: string }): Promise<void>
setDailyLimit(opts: { tenantId; amountUsd }): Promise<void>
```

Both procedures emit `agent.budget_topup` / `agent.budget_limit_changed` kernel audit events with actor.

---

## 5. Control Flow

### Cost capture per LLM call

1. Sub-agent / router / synthesizer completes an LLM call via plan 03's runner.
2. Runner receives provider response with `usage`.
3. Runner calls `UsageExtractor.extract(response)` for the provider adapter in use.
4. If adapter fails to extract a field that the vendor actually reported → emit `adapter_dropped_cache_fields` audit + monitoring alert (P1).
5. Runner calls `PricingResolver.resolve({ modelId })` → returns current `Pricing`.
6. Runner calls `CostCalculator.compute({ usage, pricing })` → returns `costUsd` + per-component breakdown.
7. Runner calls `CostRecorder.record({ traceId, tenantId, userId, layer, modelId, usage, pricing, costUsd })`:
   - Writes `agent_cost_event`.
   - Decrements `agent_tenant_budget.remaining_usd` atomically.
   - Updates `agent_user_budget` for today's bucket.
8. Plan 07 observability stamps usage + cost as span attrs on the enclosing LLM-call span.

### Pre-turn budget check

1. Turn start (plan 06 `POST /agent/turn` handler).
2. Call `BudgetChecker.preTurnCheck({ tenantId, userId })`.
3. Branches:
   - User already at 100% daily → `{ allowed: false, tier: 'refused', reason: 'user_daily_budget' }` → emit `turn.ended.reason: refused` with narrated budget UX. Stream closes before any LLM call.
   - Tenant at 100% → same, `reason: 'tenant_daily_budget'`.
   - Tenant at 95-100% → `{ allowed: true, tier: 'nano', tierShift: true }`. Router + sub-agents use nano.
   - Tenant at 80-95% → `{ allowed: true, tier: 'full', tierShift: false }` for interactive; async pausing handled by plan 09.
   - Remaining < $0.10 minimum → `{ allowed: false, tier: 'refused', reason: 'insufficient_minimum' }`.

### Mid-turn budget check (after each LLM call)

1. After `CostRecorder.record`, compare new `agent_tenant_budget.remaining_usd` against thresholds.
2. If crossed 95% → set `tier_shift: true` on trace; subsequent LLM calls this turn use nano.
3. If crossed 100% → `systemAbortController.abort({ reason: 'budget' })` → plan 06 wire contract ends turn.

### Refusal UX distinction

- `pre_turn_refusal` → `turn.ended.reason: refused` + SSE `refusal.started { reason: 'daily_budget' | 'insufficient_minimum' }`. No retry button in UI.
- `mid_turn_abort` → `turn.ended.reason: budget` + partial-answer gate (plan 03). UI allows retry at next day (user) or next admin top-up (tenant).

### Rate-limit check

1. At turn start (after budget OK): `RateLimiter.check({ tenantId, userId, limitKey: 'queries/user/min' })`.
2. Fail → refused turn with `reason: 'rate_limit'` and user-visible message "Too many requests; retry in N seconds."
3. L3 write path: `l3.set` mutation calls `RateLimiter.check({ limitKey: 'l3_writes/user/day' })` before persisting.
4. Schedule creation path (plan 09): `RateLimiter.check({ limitKey: 'schedule_creations/user/day' })`.

### Approval inbox throttle

1. Plan 08 (drafts) calls `ApprovalInboxThrottle.checkEligibility` before surfacing a draft as an approval card.
2. Either threshold exceeded → draft enters held-queue status; approval card NOT surfaced.
3. Initiator receives notice "Queued behind existing drafts."
4. Admin notified (rate-limited per §13 R-05.36).

### Admin budget top-up

1. Admin user in `web-admin` requests top-up.
2. `AdminBudgetOps.topUp` tRPC mutation → `canDo('admin.budget.topup')`.
3. Updates `agent_tenant_budget.remaining_usd += amount`.
4. Emits `agent.budget_topup` kernel audit with `actor = admin_user_id`.
5. Admin UI reflects new remaining.

### Pricing migration

1. OpenAI changes pricing → ops commits a PR adding a new `agent_pricing` row with new rates + `effective_from`.
2. PR review catches typos.
3. Migration runs. New cost events use new pricing; old events retain original.
4. No historical cost recalculation.

### Adapter validation flow

1. Provider adapter (AI SDK v5, OpenAI native, etc.) receives response.
2. Adapter exposes `UsageExtractor.extract`.
3. Extractor checks: if vendor response contains `cached_tokens` or equivalent field AND the adapter doesn't route it to `inputCachedRead`, emit:
   - `adapter_dropped_cache_fields` kernel audit event.
   - Monitoring metric `agent_adapter_drop_total{adapter, field}` increment.
   - PagerDuty / alert — P1 severity.
4. Capture continues with best-effort values (uncached rate applied to the dropped fraction, which OVER-BILLS rather than under-bills — prefer revenue-safe failure mode).

---

## 6. Requirements

### Cost accounting

| #      | Requirement                                                                                                                                       | Design §§ |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-05.1 | Cost denominated in dollars                                                                                                                       | §13       |
| R-05.2 | Per-call billing splits: `input_uncached`, `input_cached_read` (~0.1×), `input_cached_write` (~1.25×), `output`, `output_reasoning` (output rate) | §13       |
| R-05.3 | Every cost event stamps `pricing_id` + `priced_at`                                                                                                | §13       |
| R-05.4 | `agent_pricing` append-only; new rates → new row, never update                                                                                    | §13       |
| R-05.5 | Adapter-drop alerts P1; `adapter_dropped_cache_fields` fires on any vendor-reported-but-dropped field                                             | §13       |
| R-05.6 | On drop, over-bill (apply uncached rate to dropped fraction) not under-bill                                                                       | §13       |

### Ceilings

| #       | Requirement                                                                               | Design §§ |
| ------- | ----------------------------------------------------------------------------------------- | --------- |
| R-05.7  | Per-turn wallclock: 30s hard abort (chat); per-sub-agent override                         | §13       |
| R-05.8  | Per-sub-agent iterations: 4-5 max (from `config.budgets`)                                 | §13       |
| R-05.9  | Circuit breaker: 2 tool failures → disabled (plan 03)                                     | §13       |
| R-05.10 | Per-turn cost: pre-turn refusal if remaining < minimum (default $0.10)                    | §13       |
| R-05.11 | Per-user daily: soft 80% warning (UI banner NEXT turn only — not email) + hard 100% block | §13       |
| R-05.12 | Per-tenant daily tiered: 80% async pause, 95% nano-only, 100% refuse                      | §13       |
| R-05.13 | Per-tool independent ceilings (bytes-scanned, wallclock) for non-token tools              | §7, §13   |
| R-05.14 | Ceiling breach = gateway tripwire (plan 01); not retry-with-jitter                        | §4, §7    |

### Exit reasons

| #       | Requirement                                                                   | Design §§ |
| ------- | ----------------------------------------------------------------------------- | --------- |
| R-05.15 | Pre-turn refusal: `turn.ended.reason: refused`; distinct UX (no retry button) | §13, §15  |
| R-05.16 | Mid-turn abort on tenant 100%: `turn.ended.reason: budget`                    | §13       |
| R-05.17 | Partial-answer gate applies on `budget` (§4, plan 03)                         | §4        |
| R-05.18 | `cost_ceiling_hit` trace tag distinguishes per-turn vs tenant-wide cause      | §13       |

### tier_shift vs provider_fallback

| #       | Requirement                                                | Design §§ |
| ------- | ---------------------------------------------------------- | --------- |
| R-05.19 | `tier_shift` = policy-driven tier downgrade                | §13       |
| R-05.20 | `provider_fallback` = error-recovery-driven                | §13       |
| R-05.21 | Distinct `finish_reason` values; distinct alert paths      | §13       |
| R-05.22 | `tier_shift` surfaces explicit UI message 100% of the time | §13       |

### Rate limits

| #       | Requirement                                                                               | Design §§     |
| ------- | ----------------------------------------------------------------------------------------- | ------------- |
| R-05.23 | `queries_per_user_per_minute` default 30 (MVP; tune after observed traffic)               | §13           |
| R-05.24 | `l3_writes_per_user_per_day` default ~20                                                  | §13           |
| R-05.25 | `schedule_or_delegation_creations_per_user_per_day` default 5; single counter covers both | §13, §11      |
| R-05.26 | All limits fail soft with explicit user-visible messaging                                 | §13, Tenet #9 |

### Approval throttle

| #       | Requirement                                                                                  | Design §§ |
| ------- | -------------------------------------------------------------------------------------------- | --------- |
| R-05.27 | Fires on `pair_count ≥ 20` OR `approver_aggregate ≥ 50`                                      | §13       |
| R-05.28 | On threshold: new drafts queued (not surfaced as approval cards); admin + initiator notified | §13       |
| R-05.29 | Initiator notice: "Queued behind existing drafts; approver will review in order"             | §13       |

### Cardinality

| #       | Requirement                                                                                   | Design §§ |
| ------- | --------------------------------------------------------------------------------------------- | --------- |
| R-05.30 | `DEFAULT_BLOCKED_LABELS` = `[user_id, conversation_id, trace_id, delegation_id, schedule_id]` | §13       |
| R-05.31 | Enforced at exporter; build-lint or runtime-drop                                              | §13       |
| R-05.32 | High-cardinality values live on traces, not metrics                                           | §13       |

### Admin

| #       | Requirement                                                                    | Design §§ |
| ------- | ------------------------------------------------------------------------------ | --------- |
| R-05.33 | Budget has two mutation sources: midnight refill + admin top-up                | §13       |
| R-05.34 | Both emit kernel audit events                                                  | §13       |
| R-05.35 | Budget state visible in admin UI                                               | §13       |
| R-05.36 | Admin notifications rate-limited: 1 per tenant per threshold crossing per day  | §13       |
| R-05.37 | Every cost refusal generates a trace with budget state at refusal time         | §13       |
| R-05.38 | Refusal traces include expected-cost estimate from history (capacity planning) | §13       |

---

## 7. Failure Modes & Recovery

| Failure                                                                  | Symptom                                                           | Recovery                                                                                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vendor returns response without usage                                    | Adapter returns zero-usage tokens                                 | Over-bill: assume uncached input = message token count (approximation); log warning. Prefer over-billing to under-billing.                       |
| Adapter silently drops `cachedInputTokens`                               | `adapter_dropped_cache_fields` fires                              | P1 alert → immediate runbook: verify adapter version, patch, hotfix.                                                                             |
| Pricing table stale (vendor changed rates, no PR yet)                    | `priced_at` stamps old rate; billing diverges from vendor invoice | Weekly reconciliation job flags divergence > 5%; triggers PR.                                                                                    |
| Tenant budget not refilled at midnight (cron failure)                    | First turn after midnight refused                                 | Alert → manual refill via `AdminBudgetOps.topUp` + incident runbook.                                                                             |
| Race: two concurrent turns both see "budget OK" and combined exceed 100% | Slight over-spend (≤ one turn's cost beyond limit)                | Acceptable — mid-turn abort catches at next check. Optimistic-locking on `remaining_usd` would trade throughput for precision; not worth at MVP. |
| Rate-limit substrate (Redis) unreachable                                 | `RateLimiter.check` fails open (allows) with warning log          | Accepted — availability over rate enforcement for transient substrate failures. Long outage → alert.                                             |
| Adapter drops cache field that is actually zero in response              | False-positive `adapter_dropped_cache_fields`                     | Expected; suppress at adapter layer by comparing vendor field presence, not value.                                                               |
| User hits soft 80% warning mid-conversation                              | UI banner on next turn                                            | No action needed; informational.                                                                                                                 |
| Per-tool ceiling seeded too tight                                        | Tripwire retries fail repeatedly                                  | Adjust `.meta({ agent: { ceilings } })` via tool-author PR; ship hotfix. Meanwhile, circuit breaker disables the tool.                           |

---

## 8. Observability Surface

### Metrics

- `agent_cost_usd_total{tenant_id, layer, model_id, pricing_id}` — counter.
- `agent_usage_tokens_total{tenant_id, model_id, kind}` — counter; kind ∈ `{input_uncached, input_cached_read, input_cached_write, output, output_reasoning}`.
- `agent_budget_remaining_usd{tenant_id}` — gauge.
- `agent_budget_user_remaining_usd{tenant_id}` — gauge (aggregated; no `user_id` label).
- `agent_tier_shift_total{tenant_id, from_tier, to_tier, reason}` — counter. `reason ∈ {budget, quality_canary}`.
- `agent_provider_fallback_total{tenant_id, model_id, error_class}` — counter.
- `agent_rate_limit_rejected_total{tenant_id, limit_key}` — counter.
- `agent_adapter_drop_total{adapter, field}` — counter. P1 alert on any non-zero value.
- `agent_approval_inbox_depth{tenant_id}` — gauge (approver-aggregate; no `user_id`).
- `agent_budget_refill_total{tenant_id, source}` — counter; source ∈ `{midnight, admin_topup}`.

### Trace attributes

- On LLM-call spans: `pricing_id`, `priced_at`, `cost_usd`, `usage.*` per §12 R-07.21-22.
- On `TURN` root: `tier_shift: boolean`, `tier_shift_reason?`, `mid_turn_abort: boolean`, `pre_turn_refusal: boolean`, `refusal_reason?`.

### Dashboards

- Per-tenant daily spend + remaining budget + refill timeline.
- Per-model cost distribution (full vs nano vs reasoning).
- Tier-shift frequency per tenant (alert on sustained tier_shift > 30% of turns).
- Adapter-drop rate (P1 gauge; any positive value pages).
- Rate-limit rejection trends (spike = abuse or misconfigured client).
- Approval inbox depth per tenant top-N approvers.

---

## 9. Security Considerations

- **Pricing table tamper resistance.** Admin role `canDo('admin.pricing.manage')` required; rows never updated or deleted; changes via PR only; emits kernel audit.
- **Over-bill on adapter failure.** Fail-safe direction is over-billing (revenue-safe) not under-billing (cost-hiding). Intentional choice; documented.
- **Rate-limit bypass attempts.** Counters are keyed `(tenant_id, user_id)` — multi-account attacks require distinct tenant grants, which go through admin provisioning.
- **Cost-event write integrity.** Cost event insert + budget decrement are within one transaction to prevent partial recording under crash.
- **Cardinality guardrail.** Violating it doesn't just cost money — it can DoS the TSDB. Build-time lint catches violations in code review; runtime drop prevents escape.
- **Admin top-up audit.** Every top-up in `kernel_audit` — prevents insider abuse via direct DB edit (DB edit would lack the audit trail and surface in reconciliation).

---

## 10. Performance Budget

| Operation                                                            | p50   | p95    | p99    |
| -------------------------------------------------------------------- | ----- | ------ | ------ |
| `PricingResolver.resolve` (cached)                                   | <1ms  | <2ms   | <5ms   |
| `UsageExtractor.extract`                                             | <1ms  | <2ms   | <3ms   |
| `CostCalculator.compute`                                             | <1ms  | <1ms   | <2ms   |
| `CostRecorder.record` (DB write + budget decrement, one transaction) | <10ms | <30ms  | <80ms  |
| `BudgetChecker.preTurnCheck`                                         | <5ms  | <15ms  | <40ms  |
| `RateLimiter.check` (Redis)                                          | <2ms  | <5ms   | <15ms  |
| `ApprovalInboxThrottle.checkEligibility`                             | <10ms | <25ms  | <60ms  |
| Admin top-up tRPC                                                    | <50ms | <150ms | <400ms |

Cost-path overhead per LLM call ≤ 20ms p99. Pre-turn check ≤ 40ms p99 (adds directly to user-visible latency).

---

## 11. Testing Strategy

### Unit

- `CostCalculator.compute`: verify each component multiplies correctly; edge cases with zero tokens per component.
- `PricingResolver.resolve` with `at` in the past returns historical rates.
- `UsageExtractor` per adapter: vendor response with full fields → all extracted; response missing field → correct zeroing; response with cache field that adapter drops → audit event fired.
- Budget threshold crossings: 79% → 80% → tenant async pause flag; 94% → 95% → tier_shift; 99.5% → 100% → refuse.
- Rate-limit bucket rollover at minute/day boundaries.

### Integration

- Full turn with OpenAI response containing `cached_tokens` → cost event split correctly; sum matches hand-calculated value.
- Seed adapter that drops `cached_write_tokens` → `adapter_dropped_cache_fields` audit event fires; monitoring alert verified.
- Pre-turn refusal: user at 100% → `turn.ended.reason: refused`; no LLM call made (trace shows zero spans beyond router entry).
- Mid-turn abort: tenant crosses 100% during turn 2 of a conversation → `turn.ended.reason: budget`; partial-answer gate evaluates.
- Tier shift: tenant at 95% → interactive turn uses nano; `tier_shift: true` trace attr; user sees tier-shift UI message.
- `tier_shift` vs `provider_fallback` distinct: both seeded in same turn → two distinct finish_reason values captured, different alerts.
- Rate limit: send 31 queries in 60s → 31st refused with structured reason; 60s + 1 passes.
- Admin top-up: add $10 → `agent_tenant_budget.remaining_usd += 10`; kernel audit event present.
- Approval throttle: seed approver with 50 pending → 51st draft enters held queue; initiator receives notice.

### Property

- Over-billing invariant: for any combination of adapter drops, computed `cost_usd` ≥ true cost.
- Monotonicity: `agent_tenant_budget.remaining_usd` only decreases or resets (refill / top-up); never increases from a cost event.

### Cardinality

- Metrics linter: PR adding `user_id` label to a rate-limit counter → build fails.

### Fixtures

- `fixtures/pricing/openai-2026-04.sql` — initial pricing.
- `fixtures/pricing/openai-2026-05-update.sql` — simulates a mid-year rate change.
- `fixtures/vendor-responses/gpt-5-4-full-usage.json`
- `fixtures/vendor-responses/gpt-5-4-missing-cached-write.json` (adapter-drop scenario).

---

## 12. Acceptance Criteria

- All unit + integration + property tests pass.
- Cost events sum equals Langfuse-reported totals (reconciliation within rounding).
- Adapter-drop alert verified end-to-end (P1 PagerDuty test).
- Tier-shift UI message surfaces every time; verified manually + monitored.
- Rate-limit rejection produces user-visible message in zone UIs.
- Admin top-up kernel audit row present for every manual change.
- Cardinality audit: zero metrics in production registry carry blocked labels.

---

## 13. Rollout Plan

- **Phase 1** — ship pricing table + cost recorder + LLM-call span attrs. No enforcement yet; observability only.
- **Phase 2** — add per-tenant daily budget enforcement (100% refuse only; no tier shift). Monitor false-positive rate.
- **Phase 3** — add tier shift (80 / 95 / 100); per-user daily; rate limits; approval throttle.
- **Phase 4** — admin top-up UI + full reconciliation dashboard.

**Backout:** enforcement toggleable via feature flag per threshold (e.g. disable 80% async pause if false-positive spam). Observability always on.

---

## 14. Dependencies

- Plan 00 (shipped): kernel audit facade.
- Plan 01: gateway pipeline (tool-ceiling tripwires).
- Plan 03: sub-agent runner (consumes ceilings + calls `CostRecorder`).
- Plan 06: `systemAbortController` for mid-turn budget abort; SSE `refused` vs `budget` reasons.
- Plan 07: span attribute stamping.
- Kernel: audit events, `canDo` for admin procedures.

## 15. Integration Points

- `@future/db` — `agent_pricing`, `agent_cost_event`, `agent_tenant_budget`, `agent_user_budget`.
- `apps/api/src/modules/agents/infrastructure/pricing/` — `PricingResolver` + migrations.
- `apps/api/src/modules/agents/infrastructure/adapters/` — per-provider `UsageExtractor` implementations.
- `apps/api/src/modules/agents/application/services/cost-recorder.ts`.
- `apps/api/src/modules/agents/application/services/budget-checker.ts`.
- `apps/api/src/modules/agents/application/services/rate-limiter.ts`.
- `apps/api/src/modules/agents/application/services/approval-inbox-throttle.ts`.
- `apps/api/src/modules/admin/interface/trpc/budget-ops.ts` — `topUp`, `setDailyLimit`.
- Metric exporter config — `DEFAULT_BLOCKED_LABELS` enforcement.
- Redis (or Postgres unlogged) — rate-limit counters.

## 16. Activation Gate

MVP. Ships with first production turn.

## 17. Out of Scope

- Per-delegation caps (plan 09).
- Quality-canary degradation triggering tier shift (plan 10 reuses this plan's tier-shift surface).
- Self-hosted model tier (GA).
- Historical cost recalculation on pricing change (explicitly rejected — pricing is versioned).

## 18. Open Questions

- **Pricing-table migration cadence + PR owner.** Recommend: ops owns; weekly reconciliation job flags divergence; hotfix PR template documented.
- **Cache-write amortization fairness.** First turn on a hot conversation pays cache-write cost; successive turns pay cache-read. Per-user daily may penalize the first user to open a conversation. Measure after 30 days; consider amortization if signal is strong.
- **Rate-limit substrate decision.** Redis (speed, separate infra) vs Postgres unlogged (one less service). Defer to implementation doc; both compatible with the interface above.
- **Approval-throttle threshold tuning.** 20 / 50 are defaults; make configurable per tenant? Recommend: not at MVP; add config if customer asks.
- **Under-billing audit cadence.** How often do we reconcile `agent_cost_event` sum vs Stripe / vendor invoice? Proposal: weekly; any divergence > 2% triggers adapter audit.
