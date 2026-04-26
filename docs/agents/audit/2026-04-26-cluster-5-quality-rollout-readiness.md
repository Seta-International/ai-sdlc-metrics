# Audit: Cluster 5 — Quality / Rollout / Readiness

**Date:** 2026-04-26  
**Plans:** 10 (Harness + Replay + Canary), 11 (Shadow-mode + Canary Rollout), 13 (Production Readiness Validation)  
**Auditor:** Claude Sonnet 4.6 (read-only)  
**Status per README:** Plan 10 — In Progress; Plan 11 — Pending (README says Pending, recent commit `2630b987` shipped mechanics); Plan 13 — In Progress

---

## Summary Table

| Severity  | Count  |
| --------- | ------ |
| P0        | 5      |
| P1        | 9      |
| P2        | 6      |
| INFO      | 3      |
| **Total** | **23** |

### Top 5 P0 Findings

| #   | Plan  | File:Line                                                   | Description                                                                                                                                                                              |
| --- | ----- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 10    | `application/services/golden-trace-runner.ts:142`           | CI hard-fail gate is a structural no-op — actual fingerprint always equals expected (no real pipeline execution).                                                                        |
| 2   | 11    | `application/services/trpc-caller.ts:60`                    | `mode:'dry-run'` throws `Error` in production; shadow turns never execute candidate pipeline; R-11.1 unverifiable.                                                                       |
| 3   | 11    | `infrastructure/workers/shadow-turn-worker.spec.ts:1`       | Missing seeded adversarial test that shadow turns produce no real writes; mandatory §12 acceptance criterion.                                                                            |
| 4   | 10/11 | `packages/db/drizzle/migrations/0000_initial.sql:268`       | agent_canary_run, agent_canary_query, agent_golden_trace, agent_rollout_config, agent_rollout_event, agent_shadow_run — all carry tenant_id but have no ENABLE/FORCE ROW LEVEL SECURITY. |
| 5   | 13    | `application/services/extensibility-invariant-audit.ts:206` | EI-7, EI-8, EI-9, EI-10 audit checks are unconditional stubs returning `passed:true`. 4 of 10 CI invariants are blind.                                                                   |

---

## Plan 10: Harness + Replay + Golden-trace CI + Quality Canary

### §3 Data Model

All six required tables are present in the schema and migration:

- `agent_golden_trace` — present with correct columns including `removed_at` soft-delete. Missing: no ≤20-row enforcement at DB or repository layer (P1).
- `agent_scorer_registration` — present with correct `kind`, `scope`, `status`, `meta_eval_agreement` columns and CHECK constraints.
- `agent_canary_run` — present; `tenant_id` column present but **no RLS** in migration (P0).
- `agent_canary_query` — present; `tenant_id` present but **no RLS** (P0).
- `agent_tier_health` — not materialized as a DB table (in-memory with Redis backing per plan §3); accepted per design.
- `SetaGoldenCorpus` — no implementation; Beta-gated INFO.

**Schema drift:** `agent_golden_trace` column name is `tenantId` (mapped from `tenant_id`) — matches plan §3 `fixture_tenant_id` concept but column is generically named; acceptable.

### §4 Interface Contracts

- `ReplayHarness.replay({ traceId, mode })` — implemented at `application/services/replay-harness.ts`. Contract shape matches §4 including `missedHashes: never` type-level guarantee and explicit error on any lookup miss. **Canonicalizer version hash verification** is present (stored in session, returned in result) but not cross-checked against trace metadata — the `session.canonicalizerVersionHash` is returned verbatim without asserting it matches the trace's recorded version (P2 quality concern, not blocking).
- `SetaScorer` typed contract — implemented in `domain/scorer-types.ts`. Shape matches exactly including `score: 0 | 1`, `passed: boolean`, `reason?: string`.
- `ScorerRegistry.register()` — enforcement rules R-10.7, R-10.8, R-10.32 all implemented and tested (`scorer-registry.spec.ts`).
- `IntentDriftScorer` — implemented as deterministic, `kind:'deterministic'`, `scope:'trace'`. Substring matching logic is intentionally simple per plan §2.
- `LlmJudgeScorer` — scaffolded with `TypedPromptTemplate`, `metaEvalAgreement`, observe-only stub. Registration enforcement delegated to `ScorerRegistry`. Beta-gated intentional deferral (INFO).
- `GoldenTraceRunner.runCiGate()` — structurally implemented but **actual fingerprint equals expected** (no real pipeline execution). CI hard-fail gate is a no-op (**P0**).
- `QualityCanaryScheduler.tickHourly()` — implemented. Records synthetic `outcome:'passed'` runs as MVP stub (P2 quality concern).
- `CanaryQueryRotator.rotateQuarterly()` — implemented. `ingestFromProduction()` returns `[]` (empty), documented as Beta-phase operation (acceptable).
- `DegradedTierFallback.shouldFallback()` and `getElevatedNoticeLevel()` — implemented correctly, reading cached flags from scheduler.
- `ConfidenceCalibrationDashboard` — `confidence-calibration-service.ts` exists but was not read in detail; service file present.

### §6 Requirements

| Req                                                          | Status                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| R-10.1 Reconstruct message array from trace_id               | Implemented                                                                                     |
| R-10.2 Resolves via prompt/narrative stores                  | Implemented                                                                                     |
| R-10.3 Errors explicitly on lookup miss                      | Implemented — `ReplayLookupMissError` and `ReplayToolOutputMissError`                           |
| R-10.4 Full replay restricted to 100%-captured               | Implemented — raises `ReplayToolOutputMissError` if resultPreview null                          |
| R-10.5 Assembly-level not HTTP-level                         | Implemented                                                                                     |
| R-10.6 Canonicalizer version hash verified                   | Partial — hash returned but not cross-validated against trace metadata                          |
| R-10.7 Scorer shape                                          | Implemented                                                                                     |
| R-10.8 llm-judge + non-test scope rejected without meta-eval | Implemented                                                                                     |
| R-10.9 Scorer registration emits audit                       | Implemented                                                                                     |
| R-10.10 Scorer demotion automatic                            | `demote()` implemented; auto-trigger mechanism depends on Beta meta-eval runner (not yet wired) |
| R-10.11 ≤20 active rows enforced                             | Schema has no constraint; no repo-layer enforcement — **P1**                                    |
| R-10.12 Row shape                                            | Schema matches                                                                                  |
| R-10.13 Soft-delete only                                     | `removed_at` column present; hard-delete not implemented                                        |
| R-10.14 CI hard fail on regression                           | Structurally present but no-op (actual=expected stub) — **P0**                                  |
| R-10.15 Adversarial sanitization-projection subset           | No golden trace rows seeded — **P1** (fixture gap)                                              |
| R-10.16 Rolling probe per tier                               | Implemented                                                                                     |
| R-10.17 Fixture tenant                                       | Hardcoded `CANARY_FIXTURE_TENANT_ID` constant used                                              |
| R-10.18 Queries rotated quarterly                            | `rotateQuarterly()` implemented; automation is Beta-phase                                       |
| R-10.19 Degraded-flag from threshold                         | Implemented (90% threshold)                                                                     |
| R-10.20 Dashboard shows raw rate                             | `computeHealth()` returns `successRateRolling`; dashboard wiring unverified                     |
| R-10.21 Degraded → budget-independent fallback               | `DegradedTierFallback` implemented; plan 05 integration not verified here                       |
| R-10.22 Both-degraded: elevated or hard refusal              | Implemented in `getElevatedNoticeLevel()`                                                       |
| R-10.23 Canary feeds SetaGoldenCorpus                        | Not implemented — Beta gate INFO                                                                |
| R-10.24/25/26 Confidence calibration                         | Service file present; not deeply verified                                                       |
| R-10.27/28 Retention policy                                  | No GC coordination logic found; noted as Open Question in plan §18                              |
| R-10.29 Drift scorer runs in CI                              | IntentDriftScorer implemented; CI turbo task wiring unverified                                  |
| R-10.30 LLM-judge observe-only                               | Implemented as stub                                                                             |
| R-10.31 Promotion requires corpus + meta-eval                | Enforced at registry registration time                                                          |
| R-10.32 llm-judge rejected as iterative exit gate            | Enforced in ScorerRegistry                                                                      |
| R-10.33 Replay errors on lookup miss                         | Implemented                                                                                     |
| R-10.34 Canary queries rotated quarterly                     | Mechanism implemented                                                                           |

### §8 Observability

**All plan 10 §8 metrics are missing from the codebase.** The `gateway-metrics.ts` file has no entries for any of: `agent_replay_attempted_total`, `agent_replay_miss_total`, `agent_golden_trace_count_active`, `agent_golden_trace_ci_fail_total`, `agent_canary_run_total`, `agent_canary_success_rate_rolling`, `agent_tier_degraded_gauge`, `agent_scorer_registered_total`, `agent_confidence_calibration_inversion`. No spans for `REPLAY:resolve`, `CANARY:run`, `GOLDEN_TRACE:ci-run`. **(P1)**

### §11 Testing Strategy

- **Unit tests:** `replay-harness.spec.ts` (7 cases, comprehensive), `scorer-registry.spec.ts`, `intent-drift-scorer.spec.ts`, `golden-trace-runner.spec.ts`, `quality-canary-scheduler.spec.ts`, `degraded-tier-fallback.spec.ts`, `canary-query-rotator.spec.ts` — all present.
- **Integration tests:** Missing. The scenarios in §11 (full round-trip replay, drift-scorer fixture, LLM-judge observe-only pipeline, canary rotation disjoint check) are absent.
- **Property tests:** Missing (determinism, fingerprint ordering).
- **E2E tests:** Missing.
- **Named fixtures:** Missing (`fixtures/golden-traces/`, `fixtures/canary-queries/`, `fixtures/setaGoldenCorpus/`, `fixtures/fixture-tenant/`).

### §12 Acceptance Criteria

- Replay miss metric = 0: metric not emitted — cannot verify.
- Golden-trace CI hard-fails on seeded regression: no-op at MVP — **P0**.
- Canary runs hourly per tier: scheduler wired; synthetic stub data.
- Degraded-flag fires on seeded failures: achievable by directly inserting failed canary runs.
- LLM-judge framework scaffolding: present — typed path, stub, registry.
- **Declared-intent drift scorer gate passes on clean PRs and hard-fails on seeded violation:** Unit tests confirm behavior; CI turbo task wiring not verified in this audit.

---

## Plan 11: Shadow-mode Traffic + Canary Rollout Mechanics

### §3 Data Model

All three required tables present:

- `agent_rollout_config` — correct columns including `stability_key`, `regression_thresholds JSONB`, `status` CHECK. **No RLS** (P0).
- `agent_rollout_event` — correct. **No RLS** (P0).
- `agent_shadow_run` — correct including `diff_category` CHECK, `diff_score` range check. **No RLS** (P0).

### §4 Interface Contracts

- `RolloutResolver.resolveVersion()` — implemented with deterministic sha256 hash routing, retry bypass, stability key logic. Contract matches §4 exactly.
- `ShadowExecutor.shouldShadow()` / `runShadow()` — implemented. Fire-and-forget via pg-boss. Note: trafficPercentage hash check intentionally deferred per comment (R-11.15 half-noted).
- `ShadowDiffScorer.score()` — implemented as deterministic rule-based diff (tool-call overlap, shape match, permission-key match). MVP only, LLM-judge GA-gated.
- `RegressionSignalMonitor.evaluate()` — implemented. Cost/approval/router signals are MVP stubs returning 0. Only error_rate is computed from real shadow run data.
- `RolloutController` tRPC procedures — `rollout.router.ts`: createRollout, shiftPercentage, rollback, complete, list, get, getDiffReport all implemented with AGENT_ROLLOUT_MANAGE permission gates.
- `AutoRollbackOrchestrator.rollback()` — present (`auto-rollback-orchestrator.ts`).

### §6 Requirements

| Req                                             | Status                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| R-11.1 Gateway dry-run discriminator            | **P0** — `TrpcCallerImpl` throws Error on `mode:'dry-run'`; shadow candidate never actually executes |
| R-11.2 Shadow async after baseline              | Implemented via pg-boss fire-and-forget                                                              |
| R-11.3 Shadow does not commit drafts/writes     | Unverifiable given R-11.1 failure; no test asserts it                                                |
| R-11.4 Shadow cost tagged separately            | Not implemented — no shadow cost tagging found                                                       |
| R-11.5 Shadow traces linked via parent_trace_id | `shadow_trace_id` stored but `parent_trace_id` link via OTel attribute unverified                    |
| R-11.6 Rollout 1%→5%→25%→100% manual            | Implemented in RolloutController                                                                     |
| R-11.7 A/B stability keys                       | Implemented in RolloutResolver                                                                       |
| R-11.8 Hash-based assignment deterministic      | Implemented and tested                                                                               |
| R-11.9 Independent hash spaces                  | Implemented and tested                                                                               |
| R-11.10 Auto-rollback on regression signal      | RegressionSignalMonitor + AutoRollbackOrchestrator implemented                                       |
| R-11.11 Rollout events audited                  | All mutations emit kernel audit                                                                      |
| R-11.12 pg-boss retry version pinning           | Implemented in RolloutResolver `retryContextVersion` bypass                                          |
| R-11.13 Session-pinned hashes stable            | Depends on plan 02 session pinning; not re-verified here                                             |
| R-11.14 MVP diff scorer deterministic           | Implemented                                                                                          |
| R-11.15 Diff category enum                      | Implemented with DB CHECK constraint                                                                 |
| R-11.16 LLM-judge GA-gated                      | Enforced                                                                                             |
| R-11.17 RolloutController gated                 | Implemented                                                                                          |
| R-11.18 Every mutation emits audit              | Implemented                                                                                          |
| R-11.19 getDiffReport                           | Implemented                                                                                          |
| R-11.20 Rolled-back config not editable         | Enforced by status CHECK in shiftPercentage                                                          |
| R-11.21-25 Threshold defaults                   | Defined in schema RegressionThresholds interface; defaults documented                                |

### §8 Observability

**All plan 11 §8 metrics are missing.** No `agent_rollout_version_resolved_total`, `agent_shadow_run_total`, `agent_shadow_diff_category_total`, `agent_shadow_run_queue_depth`, `agent_rollout_auto_rollback_total`, `agent_rollout_active_count`, `agent_rollout_regression_signal` counter/gauge instruments. Spans `ROLLOUT:resolve-version`, `SHADOW:execute`, `SHADOW:diff-score` not emitted. **(P1)**

### §11 Testing Strategy

- **Unit tests:** RolloutResolver (comprehensive, 9 test cases including hash isolation and monotonicity property), ShadowExecutor (shouldShadow + runShadow), ShadowDiffScorer, RegressionSignalMonitor, AutoRollbackOrchestrator — all present.
- **Integration tests:** Missing adversarial shadow side-effect gate, cross-tenant isolation, auto-rollback with error-rate spike, retry version pinning.
- **Named fixtures:** Missing (`fixtures/rollouts/`, `fixtures/shadow-diff-scorer/`).

### §12 Acceptance Criteria

- Shadow side-effect verification: **P0** — seeded adversarial test missing.
- Auto-rollback drill: missing integration/E2E test.
- Version pinning verified: unit test only, no integration.
- Hash isolation: unit tested.
- Operator dashboard: getDiffReport implemented; real dashboard (web-admin) not audited here.

---

## Plan 13: Production Readiness Validation Harness

### §3 Data Model

All five required tables present in `agent-readiness.schema.ts`:

- `agent_readiness_check` — correct; no tenant_id by design (platform-level), documented exception.
- `agent_runbook_dry_run` — correct; has tenant_id + CHECK constraints for runbook_id values and outcome values.
- `agent_ga_readiness_state` — correct singleton row pattern.
- `agent_p1_incident_log` — correct; has tenant_id.
- `agent_cost_reconciliation` — correct; no tenant_id by design.

### §4 Interface Contracts

- `ReadinessValidator.evaluateAll()` — implemented; evaluates all registered `CriterionEvaluator`s sequentially (no Promise.all per CLAUDE.md rule). Result shape matches §4.
- `CriterionEvaluator` — per-criterion evaluators exist for all §18.1-§18.5 criteria. **Concern:** metric sources are stub (`StubMetricsQuery`) so evaluators return synthetic results.
- `GaReadinessComputer.compute()` — implemented; reads readiness checks, runbook coverage, P1 incidents, tenant/turn counts. Persists to `agent_ga_readiness_state`.
- `RunbookDryRunScheduler.schedule()` / `logRun()` / `getCoverage()` — implemented.
- `CostReconciliationJob.runWeekly()` — implemented.
- `ScaleProbeRunner.run()` — implemented; checks EI-4, EI-5, EI-6 against synthetic 12-module fixture. Persists three `agent_readiness_check` rows per run.
- `ExtensibilityInvariantAudit.run()` — implemented for EI-1..EI-6 with real logic; EI-7..EI-10 are static-assertion stubs returning `passed:true` unconditionally **(P0)**.
- `FlowCorrelationProbe.sample()` — implemented.

### §6 Requirements

| Req                                                            | Status                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| R-13.1 Every §18 criterion has evaluator                       | All §18.1-5 criteria have evaluators; metric sources are stubs — P1 unverified |
| R-13.2 Evaluators run hourly; persist to agent_readiness_check | Hourly worker implemented (`readiness-hourly-worker.ts`)                       |
| R-13.3 GA readiness state computed continuously                | GaReadinessComputer wired                                                      |
| R-13.4 State transition false→true emits notification          | Implemented in GaReadinessComputer                                             |
| R-13.5 Two consecutive 30-day windows                          | Logic implemented in GaReadinessComputer                                       |
| R-13.6 All runbooks have pass in 180d                          | Logic implemented                                                              |
| R-13.7 Zero P1 security incidents                              | Logic queries agent_p1_incident_log                                            |
| R-13.8 >=3 tenants, >=1000 turns/day                           | Computed but StubGaMetrics returns 0 — INFO deferral                           |
| R-13.9 Dry-run logged for all 8 runbooks                       | All 8 runbook IDs validated by DB CHECK constraint                             |
| R-13.10 Each dry-run captures post-mortem URL                  | Schema column present                                                          |
| R-13.11 Weekly cost reconciliation                             | Implemented                                                                    |
| R-13.12 >2% divergence → alert                                 | Implemented                                                                    |
| R-13.13 Quarterly drill                                        | QuarterlyRedTeamDrill interface — not read in detail; file structure present   |
| R-13.14 Drill feeds canary criterion                           | Linked via observability-canary-detects-degradation.evaluator                  |
| R-13.15 Thresholds in code/config, PR-reviewed                 | `criterion-thresholds.ts` committed file — PR review enforced by Git           |
| R-13.16 Threshold change emits audit                           | Not verified — no audit call found in criterion-thresholds.ts                  |
| R-13.17 GA readiness dashboard                                 | readiness.router.ts + web-admin route noted in plan; not audited here          |
| R-13.18 is_ga_ready visible                                    | readiness.router.ts serves state                                               |
| R-13.19 Scale probe CI gate on plan 02/02.5/07 PRs             | ScaleProbeRunner implemented; CI turbo task wiring not verified                |
| R-13.20 EI-1..10 audit zero failures                           | EI-1..6 real; EI-7..10 stubs — **P0**                                          |
| R-13.21 Intent-slug coverage probe nightly                     | rollout-intent-slug-coverage.evaluator.ts present                              |
| R-13.22 flow_id correlation probe monthly                      | FlowCorrelationProbe implemented                                               |
| R-13.23 GA gate: all §18.1-5 held two consecutive windows      | Logic implemented; depends on real metric sources                              |

### §8 Observability

Plan 13 §8 metrics: `agent_readiness_criterion_passed`, `agent_readiness_ga_ready`, `agent_readiness_consecutive_windows_met`, `agent_runbook_dry_run_coverage`, `agent_cost_reconciliation_divergence_pct`, `agent_p1_security_incident_count_90d`. **Not found as emit sites** — the `StubGaMetrics` and `StubMetricsQuery` ports are not metric emitters. **(P1)**

### §11 Testing Strategy

- **Unit tests:** Each criterion evaluator has a co-located spec (15+ evaluator spec files), GaReadinessComputer, RunbookDryRunScheduler, ScaleProbeRunner, ExtensibilityInvariantAudit, FlowCorrelationProbe — all present.
- **Integration tests:** Some present (drizzle-ga-readiness-state.repository.spec.ts, drizzle-readiness-check.repository.spec.ts).
- **Named fixtures missing:** `fixtures/readiness/` and `fixtures/red-team/` directories absent.
- **E2E tests:** Missing.

---

## Cross-Plan Observations

### Intra-Cluster Dependencies

Plan 11's shadow diff scoring (R-11.14) depends on plan 10's `SetaScorer` contract — correctly implemented. Plan 13's §18.5 scale probe depends on plan 02/02.5/07 surfaces — the scale probe runs against synthetic in-memory fixtures so does not block on those plans shipping.

### Systematic RLS Gap (P0, all three plans)

Only `agent_tool_result_cache` has RLS applied in the migration (line 1832). All new tables introduced by plans 10, 11, and 13 with `tenant_id` columns lack `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + policy. This is a systematic omission affecting:

- Plan 10: `agent_golden_trace`, `agent_canary_run`, `agent_canary_query`
- Plan 11: `agent_rollout_config`, `agent_rollout_event`, `agent_shadow_run`
- Plan 13: `agent_runbook_dry_run`, `agent_p1_incident_log`

The plan-13 tables explicitly document the tenant_id exception rationale (platform-level tables with no RLS by design) — this is **acceptable** for `agent_readiness_check`, `agent_ga_readiness_state`, `agent_cost_reconciliation`. But `agent_runbook_dry_run` and `agent_p1_incident_log` have tenant_id and require RLS per CLAUDE.md hard rule.

### Systematic Observability Gap (P1, all three plans)

Zero metrics from plans 10, 11, 13 are emitted anywhere in the codebase. This is a systematic gap — likely because the observability backend (Langfuse/OTEL) is acknowledged as deferred in CLAUDE.md, but the metric instruments themselves should exist even if the backend isn't wired. The canary health and rollout signals are especially critical for operator dashboards.

### Golden-trace CI Gate Is Not Functional (P0)

The CI hard-fail gate (R-10.14) produces no failures at MVP because `actualFingerprint = { ...expectedFingerprint }`. PRs that regress sub-agent behavior will pass this gate until Task 9 is implemented. This is the single highest-risk finding: the primary regression protection mechanism is not operational.

### dry-run Is Not Implemented for Shadow (P0)

The shadow execution architecture (plan 11) depends on tool handlers respecting `mode:'dry-run'` to prevent side effects. `TrpcCallerImpl` throws an explicit Error for `mode:'dry-run'` today. This means shadow turns, when the stub is replaced with real execution, will fail immediately on any tool invocation. The seeded adversarial test proving no writes commit (§12 acceptance criterion) cannot pass until this is resolved.
