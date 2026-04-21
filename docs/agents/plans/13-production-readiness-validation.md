# 13 — Production Readiness Validation Harness

**Design §§:** §18 (Production Readiness Criteria).

**Activation gate:** Runs continuously from Beta onward. **GA is achieved** when this harness reports all §18 thresholds met for two consecutive 30-day windows + runbook dry-runs complete + zero P1 security incidents + ≥3 live tenants.

---

## 1. Scope

### In

- Continuous validation harness that evaluates all §18 criteria on rolling 30-day windows.
- Automated reporting dashboard (GA readiness scorecard).
- Incident playbook coverage tracking (each §18.6 runbook dry-run logged + linked).
- Cross-tenant leak regression suite (expanded from plans 01 + 04 seeded tests; this is the productionized version).
- Cost-stability reconciliation job (weekly; compares `agent_cost_event` sum vs vendor invoice).
- Quarterly red-team drill: plant degraded prompt into fixture-tenant; verify plan 10 canary flags within 30 min.
- Audit-chain integrity scanner: every tool-call span has matching audit row, every `draft_executed` has prior `draft_approved` (except auto), etc.
- GA gate evaluator: machine-readable "are we GA?" state with explicit pass/fail per criterion.
- Runbook dry-run scheduler + log.

### Out

- The individual criteria implementations (owned by plans 01-12; this plan VALIDATES they work, not implements them).
- User-facing GA announcement (product concern).
- Contract with legal on retention policy (separate legal / ops deliverable).
- New observability infrastructure (plan 07 owns; this plan consumes).

---

## 2. Design Context

§18 is a contract: **"we are production-ready when these observable thresholds hold."** Without a validator, the criteria drift to prose nobody verifies. This plan builds the harness that turns §18 from documentation into an always-on check.

The harness is **observational + drill-based**:

- Observational: queries existing metrics/traces/audit tables; computes thresholds; emits pass/fail signals per criterion.
- Drill-based: quarterly or incident-driven dry-runs of each runbook; timestamp + outcome logged.

**GA is a state, not a decision.** The harness computes `isGaReady: boolean` based on:

1. All §18.1-5 observable thresholds met for TWO consecutive 30-day windows.
2. All §18.6 runbooks dry-run at least once with post-mortem.
3. Zero P1 security incidents in last 90 days.
4. ≥3 live tenants with combined ≥1000 interactive turns/day.

When `isGaReady` flips from false to true, the harness emits a notification; humans make the release decision but the data is indisputable.

**The harness is boring by design.** No clever logic, no LLM judgment — just counts, ratios, joins, and booleans. Aggressively reviewable: a P1 regression in any §18 criterion must surface here, and an operator must be able to reproduce the failure locally.

**The reconciliation job is tenet-level.** Cost events vs vendor invoice divergence catches adapter bugs (plan 05) that would otherwise silently under- or over-bill for months. Weekly cadence + hard threshold.

**What this is NOT:** an SLO dashboard. SLOs are user-facing commitments; §18 criteria are architectural-invariant-preservation checks. Overlap exists (reliability metrics) but the framing is different.

---

## 3. Data Model

### `agent_readiness_check`

Persisted result of each criterion evaluation.

- `id UUID PK`.
- `criterion_id TEXT` — e.g. `18.1.turn_completed_rate`, `18.2.cross_tenant_leak_seed_test`, `18.3.cache_hit_rate_hot_sessions`.
- `window_start TIMESTAMPTZ`, `window_end TIMESTAMPTZ`.
- `observed_value NUMERIC | TEXT`.
- `threshold NUMERIC | TEXT`.
- `passed BOOLEAN`.
- `notes TEXT?` — operator annotation if overridden.
- `computed_at TIMESTAMPTZ`.
- Index: `(criterion_id, window_end DESC)`.

### `agent_runbook_dry_run`

- `id UUID PK`.
- `runbook_id TEXT` — one of §18.6 enumerated set.
- `executed_at TIMESTAMPTZ`.
- `executed_by UUID` — operator.
- `outcome TEXT` — `'pass' | 'pass_with_notes' | 'fail'`.
- `post_mortem_url TEXT?` — link to write-up.
- `time_to_recovery_minutes INT?`.
- Index: `(runbook_id, executed_at DESC)`.

### `agent_ga_readiness_state` (single-row, updated continuously)

- `is_ga_ready BOOLEAN`.
- `computed_at TIMESTAMPTZ`.
- `missing_criteria JSONB` — array of `{ criterion_id, reason }`.
- `consecutive_windows_met INT` — 0, 1, or 2.
- `tenant_count INT`, `interactive_turns_per_day INT`.
- `p1_security_incidents_last_90d INT`.

### `agent_p1_incident_log`

- `id UUID PK`.
- `opened_at TIMESTAMPTZ`.
- `closed_at TIMESTAMPTZ?`.
- `severity TEXT` — `'P1' | 'P2'`.
- `category TEXT` — `'security' | 'reliability' | 'cost' | 'observability'`.
- `summary TEXT`.
- `post_mortem_url TEXT?`.
- Index: `(severity, opened_at DESC)`.

### `agent_cost_reconciliation`

- `id UUID PK`.
- `week_start DATE`.
- `agent_cost_event_sum_usd NUMERIC`.
- `vendor_invoice_sum_usd NUMERIC`.
- `divergence_pct NUMERIC`.
- `divergence_over_threshold BOOLEAN`.
- `computed_at TIMESTAMPTZ`.
- Index: `(week_start)`.

---

## 4. Interface Contracts

### `ReadinessValidator`

```
evaluateAll(): Promise<ReadinessReport>

type ReadinessReport = {
  evaluatedAt: Date;
  byCriterion: ReadonlyArray<{
    criterionId: string;
    passed: boolean;
    observedValue: number | string;
    threshold: number | string;
    window: { start: Date; end: Date };
  }>;
  allPassed: boolean;
  missingCriteria: ReadonlyArray<{ criterionId: string; reason: string }>;
}
```

Runs hourly (scheduled). Persists results to `agent_readiness_check`.

### `CriterionEvaluator` (one per criterion)

Each §18 criterion has a dedicated evaluator implementing:

```
type CriterionEvaluator = {
  id: string;
  section: '18.1' | '18.2' | '18.3' | '18.4' | '18.5' | '18.6';
  description: string;
  evaluate(window: { start: Date; end: Date }): Promise<CriterionResult>;
}

type CriterionResult = {
  observedValue: number | string;
  threshold: number | string;
  passed: boolean;
  details?: Record<string, unknown>;
}
```

Specific evaluators (at least one per §18 row):

- **§18.1 Reliability**
  - `turn_completed_rate_30d`: ratio from `agent_turn_total{reason='completed'}` vs all.
  - `uncaught_error_rate_30d`: `agent_turn_total{reason='error'}` / total.
  - `provider_fallback_success_rate`: joint on `agent_provider_fallback_total`.
  - `single_abort_path_compliance`: audit of traces with `cancellation_reason` set → all routed through plan 06 `AbortCoordinator` (verified by span presence).
  - `drafts_discarded_on_abort`: zero `draft_persisted` where trace has `cancellation_reason`.

- **§18.2 Security**
  - `cross_tenant_leak_suite`: CI job green + daily scheduled run green.
  - `rls_unbypassable_at_domain_boundary`: lint rule still present + build succeeded in last 30d.
  - `identity_key_write_discipline_enforced`: `agent_identity_key_write_attempted_total` = 0 in last 30d.
  - `taint_propagates_across_approval`: end-to-end test in plan 08 test suite green.
  - `kernel_audit_per_tool_call`: `agent_trace_audit_join_miss_total` = 0 in last 30d.

- **§18.3 Cost stability**
  - `per_turn_cost_p95_variance_week_over_week`: derived from `agent_turn_duration_ms` + `agent_cost_usd_total`.
  - `cache_hit_rate_hot_sessions`: conversations ≥5 turns, cache-read / total ≥ 60%.
  - `budget_refusal_precision`: seeded test + real-data audit ≥ 99%.
  - `adapter_dropped_cache_fields_count`: `agent_adapter_drop_total` = 0 sustained.
  - `tier_shift_user_notice_rate`: verify 100% tier_shift events have UI notice in response body.

- **§18.4 Observability**
  - `trace_correlation_end_to_end`: monthly sample of 100 random traces with joins intact.
  - `stratified_sampling_trigger_coverage`: all 5 MVP triggers fired ≥1× in last 30d.
  - `canary_detects_planted_degradation`: quarterly red-team drill outcome.
  - `pii_redaction_at_capture`: scheduled scan over exported trace spans for `<tenant_authored>` leakage = 0.
  - `replay_coverage_on_100_sampled`: 100% replay success rate.

- **§18.5 Rollout safety**
  - `golden_trace_ci_gate_enabled`: config check.
  - `canary_1_5_25_100_automated`: derived from recent rollouts.
  - `shadow_mode_interface_exercised`: at least one model-swap in shadow for ≥7d.
  - `version_pinning_across_retries_compliance`: audit pg-boss retries vs pinned_versions.

- **§18.6 Incident playbooks** — tracked separately in `agent_runbook_dry_run`.

- **GA gate**
  - `consecutive_windows_met`: count of consecutive 30d windows where §18.1-5 all pass.
  - `tenant_count ≥ 3 && interactive_turns_per_day ≥ 1000`.
  - `p1_security_incidents_last_90d = 0`.
  - `runbooks_dry_run_coverage`: every §18.6 runbook has ≥1 `pass` in last 180d.

### `GaReadinessComputer`

```
compute(): Promise<AgentGaReadinessState>
```

Runs hourly. Persists to `agent_ga_readiness_state`. State-transition from `false → true` emits ops notification.

### `RunbookDryRunScheduler`

```
schedule(opts: { runbookId; scheduledAt; assignedTo }): Promise<void>
logRun(opts: { runbookId; outcome; timeToRecoveryMinutes?; postMortemUrl? }): Promise<void>
getCoverage(opts: { lookbackDays }): Record<runbookId, RunbookStatus>
```

Defaults: 180-day lookback for GA gate coverage.

### `CostReconciliationJob`

```
runWeekly(): Promise<AgentCostReconciliation>
```

Reads `agent_cost_event` sum for the week, compares to vendor-reported invoice (manual upload OR API-scraped), computes divergence. Alerts if > 2%.

### `QuarterlyRedTeamDrill`

```
execute(opts: {
  quarter: string;
  plantedDegradation: PlantedDegradationSpec;
}): Promise<DrillResult>

type PlantedDegradationSpec = {
  kind: 'broken_prompt' | 'poisoned_tool_output' | 'regressed_sub_agent';
  duration: Duration;
}

type DrillResult = {
  detectedAt?: Date;
  detectionLatencyMinutes?: number;
  rolledBack: boolean;
  outcome: 'passed' | 'failed';
}
```

Target: canary detects within 30 min of planting.

---

## 5. Control Flow

### Hourly evaluation cycle

1. Scheduled job fires `ReadinessValidator.evaluateAll()`.
2. Validator iterates over all registered `CriterionEvaluator`s.
3. Each evaluator queries its data source (metrics, traces, audit tables, CI state), computes `observedValue`, compares to `threshold`.
4. Results persist to `agent_readiness_check`.
5. `GaReadinessComputer.compute()` joins across criteria + additional GA conditions.
6. Updates `agent_ga_readiness_state`.
7. If state transitions `is_ga_ready: false → true` → ops notification.
8. Dashboard reflects real-time status.

### GA gate evaluation

1. `GaReadinessComputer.compute()`:
   a. Load latest `agent_readiness_check` per criterion; all passed?
   b. Load last 60 days of criterion evaluations; two consecutive 30d windows all-pass?
   c. Count active tenants (from plan 05 tenant table).
   d. Sum `agent_turn_total` last 30d → divide by 30 → compare to 1000/day.
   e. Query `agent_p1_incident_log` last 90d, severity='P1', category='security' → count.
   f. Load `RunbookDryRunScheduler.getCoverage({ lookbackDays: 180 })` → verify every runbook has ≥1 pass.
2. `is_ga_ready = all conditions true`.
3. Persist + emit notification on transition.

### Runbook dry-run drill

1. Operator schedules a drill via `RunbookDryRunScheduler.schedule({ runbookId: 'provider_outage', scheduledAt, assignedTo })`.
2. Drill runs: seeded failure + operator responds per runbook.
3. Operator writes post-mortem.
4. `logRun({ runbookId, outcome: 'pass', timeToRecoveryMinutes, postMortemUrl })` records completion.
5. Coverage gauge updates.

### Quarterly red-team drill

1. Schedule drill for quarter start.
2. Plant degradation in fixture tenant (broken prompt pushed via a drill-only config flag).
3. Start timer.
4. Canary (plan 10) runs hourly; eventually detects degraded quality.
5. Log detection latency + whether the rollback fired automatically.
6. Rollback (manual or auto) → tear down planted degradation.
7. Post-mortem captures timing + any detection gaps.
8. `DrillResult` persisted; feeds §18.4 `canary_detects_planted_degradation` criterion.

### Cost reconciliation weekly

1. Every Monday, scheduled job fetches last week's vendor invoice (OpenAI API or manual upload).
2. Sums `agent_cost_event.cost_usd` for the same period per model.
3. Computes per-model divergence + overall.
4. If > 2% divergence → alert + triggers adapter validation review (plan 05).
5. Persists `agent_cost_reconciliation` row.
6. Dashboard visualizes divergence trend.

### Cross-tenant leak suite (continuous)

1. CI runs on every PR (inherited from plan 04).
2. Scheduled nightly run in production env.
3. For every turn-shape in the test corpus: run in tenant A, then tenant B; compare RLS-filtered rows.
4. Any leak → P1 incident logged + alert.

### Criterion threshold governance

1. Thresholds defined in config file committed to repo.
2. Threshold changes require PR review (no silent tightening or loosening).
3. PR description must include reasoning + impact analysis (which §18 section).
4. Audit event on threshold change.

---

## 6. Requirements

### Harness shape

| #      | Requirement                                                       | Design §§ |
| ------ | ----------------------------------------------------------------- | --------- |
| R-13.1 | Every §18 criterion has a dedicated `CriterionEvaluator`          | §18       |
| R-13.2 | Evaluators run hourly; persist results to `agent_readiness_check` | §18       |
| R-13.3 | GA readiness state computed + persisted continuously              | §18       |
| R-13.4 | State transition `false → true` emits notification                | §18       |

### GA gate conditions

| #      | Requirement                                                 | Design §§    |
| ------ | ----------------------------------------------------------- | ------------ |
| R-13.5 | All §18.1-5 criteria pass in two consecutive 30-day windows | §18.7        |
| R-13.6 | All §18.6 runbooks have ≥1 `pass` in last 180 days          | §18.6, §18.7 |
| R-13.7 | Zero P1 security incidents in last 90 days                  | §18.7        |
| R-13.8 | ≥3 live tenants with combined ≥1000 interactive turns/day   | §18.7        |

### Incident playbook coverage

| #       | Requirement                                                                                                                                                                                                                                                             | Design §§ |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-13.9  | Dry-run logged for each of §18.6 runbooks: `provider_outage`, `budget_exhaustion_midflight`, `quality_canary_degradation`, `cross_tenant_leak_alert`, `content_hash_store_miss`, `adapter_dropped_cache_fields`, `approval_inbox_flood`, `gdpr_erasure_partial_success` | §18.6     |
| R-13.10 | Each dry-run captures post-mortem URL + time-to-recovery                                                                                                                                                                                                                | §18.6     |

### Cost reconciliation

| #       | Requirement                                                                 | Design §§ |
| ------- | --------------------------------------------------------------------------- | --------- |
| R-13.11 | Weekly reconciliation job compares `agent_cost_event` sum vs vendor invoice | §18.3     |
| R-13.12 | > 2% divergence → alert + adapter audit trigger                             | §18.3     |

### Red-team drill

| #       | Requirement                                                        | Design §§ |
| ------- | ------------------------------------------------------------------ | --------- |
| R-13.13 | Quarterly drill: plant degradation; canary detects within 30 min   | §18.4     |
| R-13.14 | Drill outcome feeds `canary_detects_planted_degradation` criterion | §18.4     |

### Threshold governance

| #       | Requirement                                      | Design §§ |
| ------- | ------------------------------------------------ | --------- |
| R-13.15 | Thresholds in code/config, PR-reviewed on change | §18       |
| R-13.16 | Threshold change emits kernel audit event        | §18       |

### Dashboard

| #       | Requirement                                                     | Design §§ |
| ------- | --------------------------------------------------------------- | --------- |
| R-13.17 | GA readiness dashboard shows each criterion + pass/fail + trend | §18       |
| R-13.18 | `is_ga_ready` state visible to operators + stakeholders         | §18       |

---

## 7. Failure Modes & Recovery

| Failure                                                | Symptom                                       | Recovery                                                                                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evaluator query fails (DB unavailable)                 | Criterion result = error, not `passed: false` | Distinguish "unable to evaluate" from "did not pass"; alert ops; do NOT trigger regression signal from evaluator failure.                                                                 |
| Metric data source returns stale                       | Criterion reads old data                      | Evaluator validates data freshness (e.g. `computed_at > now - 5min`); if stale, mark as `unable to evaluate` + alert.                                                                     |
| GA gate flips to true prematurely (bug in computer)    | Ops notification fires                        | Manual review required before any announcement; computer is advisory, not authoritative. A threshold-unmet condition caught post-notification = harness bug, not an actual GA regression. |
| Runbook dry-run never scheduled                        | Coverage gauge stale                          | Quarterly reminder scheduled task + alert if any runbook's last-dry-run > 180d.                                                                                                           |
| Red-team drill false-negative (canary fails to detect) | Drill `outcome: 'failed'`                     | P1 — indicates a canary gap. Incident review + canary rule update.                                                                                                                        |
| Cost reconciliation divergence > 2%                    | Alert                                         | Trigger adapter validation (plan 05); if adapter clean, investigate pricing table lag or unexpected usage.                                                                                |
| Cross-tenant leak fires in suite                       | P1 security incident                          | Immediate incident response; halt rollouts; investigate + patch + re-verify suite.                                                                                                        |
| Threshold changed without review                       | Silent GA drift                               | PR-gate enforced by Git + GitHub branch protection; audit logs catch after-the-fact.                                                                                                      |
| P1 incident logged incorrectly                         | Readiness state drifts                        | Incident log is truth source; fixing the log fixes the state on next hourly eval.                                                                                                         |

---

## 8. Observability Surface

### Spans

- `READINESS:evaluate-all` — parent per hourly tick; attrs `criterion_count`, `all_passed`.
- `CRITERION:<id>` — child per evaluator; attrs `observed`, `threshold`, `passed`.
- `RUNBOOK_DRY_RUN:*` — per drill execution.

### Metrics

- `agent_readiness_criterion_passed{criterion_id}` — gauge (0/1).
- `agent_readiness_criterion_observed{criterion_id}` — gauge (numeric criteria only).
- `agent_readiness_ga_ready` — gauge (0/1).
- `agent_readiness_consecutive_windows_met` — gauge.
- `agent_runbook_dry_run_coverage{runbook_id}` — gauge (days since last pass).
- `agent_cost_reconciliation_divergence_pct` — gauge.
- `agent_p1_security_incident_count_90d` — gauge.

### Dashboards

- **GA Readiness Scorecard** — top-level view: `is_ga_ready`, missing criteria list, consecutive-windows progress.
- Per-section breakdown: Reliability, Security, Cost, Observability, Rollout, Incidents — each criterion with trend.
- Cost reconciliation timeline.
- Runbook coverage heatmap (runbooks × months).
- Incident log timeline.

---

## 9. Security Considerations

- **Readiness state access.** `canDo('agent.readiness.read')` for operators + stakeholders. State data reveals operational posture; not sensitive-per-se but prefer gated access.
- **Threshold governance.** Unauthorized threshold changes can falsely claim GA readiness. PR review + kernel audit catches.
- **Cross-tenant leak suite is itself a security test.** Its own data is fixture; real-tenant data never flows through the seed tests.
- **Red-team drills.** Planted degradations are isolated to fixture tenants; drill-only config flag gated by `canDo('agent.drill.execute')`; auto-cleanup at drill end.
- **Cost reconciliation** reads vendor invoice data — ensure invoice data storage is appropriately permissioned.
- **Incident log** contains summaries of security incidents; retention policy balances compliance defensibility with minimizing exposure of attack-detail knowledge.

---

## 10. Performance Budget

| Operation                                                  | p50              | p95     | p99     |
| ---------------------------------------------------------- | ---------------- | ------- | ------- |
| `ReadinessValidator.evaluateAll` (full sweep ~20 criteria) | <5s              | <15s    | <30s    |
| Per-evaluator query                                        | <500ms           | <2s     | <5s     |
| `GaReadinessComputer.compute`                              | <500ms           | <1500ms | <4000ms |
| Dashboard page load                                        | <1s              | <3s     | <6s     |
| Weekly cost reconciliation                                 | <30s             | <120s   | <300s   |
| Red-team drill execution                                   | <30min wallclock | —       | —       |

Hourly harness overhead: <0.01% of production capacity. Trivial.

---

## 11. Testing Strategy

### Unit

- Each `CriterionEvaluator`: seeded data → expected observed/threshold/passed.
- `GaReadinessComputer`: matrix of (all-pass / 1-window / 2-window / incident / tenant-count / runbook-coverage) → `is_ga_ready` boolean.
- Runbook coverage: last-pass calculation across multiple runbook entries.

### Integration

- Full hourly cycle: seed fixture metrics/audit data → run `evaluateAll` → persist results → `GaReadinessComputer.compute` → expected state.
- GA gate state flip: seed conditions meeting all criteria → verify `is_ga_ready: true` + notification fires.
- Threshold change: PR seeded → audit event emitted; dashboard reflects new threshold immediately on next tick.
- Cost reconciliation: seed `agent_cost_event` + vendor invoice differing by 3% → alert fires.
- Red-team drill: plant degradation → canary detects within simulated 30 min window → drill outcome recorded.

### E2E

- Full quarterly cycle: drill scheduled → executed → logged → coverage gauge updates → next quarter scheduled.
- Production readiness scenario: start with `is_ga_ready: false`; over simulated 60+ days, all criteria pass; GA gate flips; notification fires; stakeholders see scorecard.

### Property

- Monotonicity of consecutive-windows: one criterion fails in window N → consecutive count resets to 0; does not mid-decrement.

### Fixtures

- `fixtures/readiness/all-pass-scenario.ts`
- `fixtures/readiness/one-criterion-fails.ts`
- `fixtures/readiness/runbook-coverage-gap.ts`
- `fixtures/readiness/p1-incident-in-window.ts`
- `fixtures/red-team/broken-prompt-planted.ts`.

---

## 12. Acceptance Criteria

- All unit + integration + property + E2E tests pass.
- Harness runs hourly in production; `agent_readiness_check` rows persist.
- GA readiness dashboard accessible + accurately reflects state.
- First runbook dry-run of each §18.6 runbook completed + logged.
- First quarterly red-team drill completed successfully.
- Cost reconciliation runs weekly + alerts on divergence.
- Cross-tenant leak suite runs nightly in production env + on every PR.
- Threshold change audit trail demonstrable.

---

## 13. Rollout Plan

This plan itself rolls out alongside the others:

- **Phase 1 (MVP)** — ship criteria-evaluator framework + first subset (§18.1 reliability + §18.2 security). Continuous observation begins.
- **Phase 2 (Beta)** — add §18.3 cost + §18.4 observability evaluators. First red-team drill + first runbook dry-runs.
- **Phase 3 (Beta, mid)** — add §18.5 rollout + §18.6 tracking. GA gate computer active.
- **Phase 4 (Beta, late)** — all criteria continuous; two-consecutive-window tracking begins.
- **Phase 5 (GA candidacy)** — harness reports `is_ga_ready: true`; human review; GA announcement.

**Backout:** harness failure does not affect user-facing runtime. Evaluators failing just means criteria go unknown; operators manually verify until harness restored.

---

## 14. Dependencies

- Plan 01: tool gateway pipeline (observability surface consumed).
- Plan 02: session + hashes.
- Plan 03: phase execution metrics.
- Plan 04: conversation state (GDPR runbook).
- Plan 05: cost events + budget state (cost reconciliation).
- Plan 06: SSE + abort (reliability metrics).
- Plan 07: observability infrastructure (heavy consumer).
- Plan 08: drafts + approval (R-08.30 audit-trail query).
- Plan 09: async agents (runbook coverage includes async incident scenarios).
- Plan 10: canary infrastructure + scorer registry + golden-trace CI.
- Plan 11: rollout + shadow infrastructure.
- Plan 12: iterative topology (additional failure modes if Beta-active).
- Kernel module: audit events + `canDo` for operator access.

## 15. Integration Points

- `@future/db` — `agent_readiness_check`, `agent_runbook_dry_run`, `agent_ga_readiness_state`, `agent_p1_incident_log`, `agent_cost_reconciliation`.
- `apps/api/src/modules/agents/application/services/readiness-validator.ts`.
- `apps/api/src/modules/agents/application/services/criterion-evaluators/` — directory of per-criterion evaluators.
- `apps/api/src/modules/agents/application/services/ga-readiness-computer.ts`.
- `apps/api/src/modules/agents/application/services/runbook-dry-run-scheduler.ts`.
- `apps/api/src/modules/agents/application/services/cost-reconciliation-job.ts`.
- `apps/api/src/modules/agents/infrastructure/workers/readiness-hourly-worker.ts`.
- `apps/api/src/modules/agents/interface/trpc/readiness-facade.ts`.
- `web-admin/src/app/agent/readiness/` — scorecard UI.
- Grafana / dashboard platform — data sources via metrics API.

## 16. Activation Gate

Continuous from Beta onward. Itself gates GA.

## 17. Out of Scope

- User-facing GA announcement (product / marketing concern).
- Per-customer SLO dashboards (separate product concern; overlap but different framing).
- Anomaly detection beyond threshold comparison (future: statistical regression detection; not MVP).
- Automated tenant count projection (manual tenant onboarding → count manually).

## 18. Open Questions

- **Threshold governance process.** PR + audit log + who reviews? Recommend: security-eng + agent-ops co-review for security/cost thresholds; eng-lead only for observability. Owner: security lead.
- **Vendor invoice ingestion.** API-scraped (brittle) vs manual upload (lossy). Recommend: both; API preferred, manual monthly reconciliation as backup. Owner: ops.
- **Red-team drill design.** Planted degradation specs — who designs? Recommend: security team + agent-ops rotate quarterly. Each quarter different attack class. Owner: security lead.
- **GA announcement process.** Data says ready + human decides when to announce. Who approves? Recommend: CTO + VP eng + head of security jointly. Owner: leadership.
- **Criterion threshold values.** Current defaults are placeholders; tune after first 30 days of production data.
- **Incident log authoritative source.** Right now this plan assumes agents-team-curated. Should it consume from org-wide incident tracker? Recommend: cross-link but maintain agents-scoped log for harness.
- **Two-window consecutive vs three.** §18 says two; is three safer? Recommend: two is right — three pushes GA timeline meaningfully; two catches sustained regression while balancing speed. Owner: leadership decision.
