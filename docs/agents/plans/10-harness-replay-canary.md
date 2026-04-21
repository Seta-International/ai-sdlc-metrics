# 10 — Harness + Replay + Golden-trace CI + Quality Canary

**Design §§:** §8 (Replay harness), §12 (Quality canary), §14 (Rollout & Eval).

---

## 1. Scope

### In

- Replay harness: given `trace_id`, deterministically reconstructs the full message array sent to each LLM call.
- Content-hash-keyed prompt + narrative store consumption (already shipped in plan 00).
- Replay operates at assembly level, NOT HTTP level — rebuilds prompt fragments, narrative-hash resolutions, γ/α snapshot, captured tool outputs, model + version pins.
- `SetaScorer` typed contract with `kind: 'deterministic' | 'llm-judge'` registration-time enforcement.
- Golden-trace regression suite: ≤20-row CI-gating set, additive-removal policy.
- Quality canary: rolling health probe per model tier; fixture-tenant frozen data.
- Canary queries rotated quarterly from anonymized production traffic.
- Degraded-flag per tier; budget-independent fallback.
- Both-tiers-degraded elevated-notice + hard-refusal threshold.
- Offline replay harness integrated with `SetaGoldenCorpus` (Beta — corpus >100 rows, separate from CI gate).
- Confidence-calibration dashboard (correlation between synthesizer confidence and thumbs-down + initiator-approval).

### Out

- Live shadow-mode traffic routing (plan 11 — traffic direction; this plan provides scorer + replay infrastructure).
- LLM-judge scorers promoted to gating (GA activation-gated).
- Full-fleet (beyond stratified) prompt capture (GA activation-gated).
- `SetaGoldenCorpus` ≥100 rows for meta-eval (Beta — separate authoring effort).
- Human annotator UI for corpus labeling (product concern).

---

## 2. Design Context

**Replay is a test-fixture tool AND a production debugging tool.** Mastra's `_llm-recorder` is MSW-based HTTP interception (spike 06) — great for tests, wrong for production incident reconstruction. Our replay operates one level up: it rebuilds the prompt assembly from content-hash stores + captured tool outputs, then the user re-issues the outbound LLM call to the live provider. Two benefits: (a) no dependence on HTTP snapshots that rot with SDK version bumps; (b) debugging a production incident with current prompts against the original context is exactly what operators want.

**Errors explicitly on any lookup miss.** Mastra ships a string-similarity fuzzy fallback at threshold 0.6 that `console.warn`s and returns a near-miss response. Our replay raises on any miss — fuzzy reconstruction without warning is worse than no reconstruction. Named anti-pattern in §8 rejection.

**Replay scope: full deterministic replay on 100%-captured turns only.** Baseline-sampled (1%) turns are prompt-replayable but NOT tool-output-replayable — tool re-invocation returns current data. This is accepted; the 100%-capture triggers coincide with the population where replay is most valuable (errors, taint, approvals, ceilings, amplification).

**`SetaScorer.kind` discriminator.** Registration-time enforcement blocks LLM-judge scorers from production-gating roles until meta-eval clears (§14). Mastra's scorer pipeline is 4-stage + workflow-engine-backed and over-built for our needs; we keep the `{ score, passed, reason }` output contract + `scoreSource` taxonomy, drop the pipeline.

**Golden-trace ≤20-row cap.** Above 20, CI latency dominates and contributors bypass. Coverage gains past 20 are marginal. Larger corpus lives in `SetaGoldenCorpus` for offline meta-eval, separate from CI.

**Quality canary = rolling production probe with fixture-tenant data.** Both full-reasoning AND nano probed independently. Canary queries rotated quarterly from anonymized production traffic (not a fixed "known-good" set — fixed sets ossify and drift from real distribution). Canary executes against a frozen fixture tenant's data so "model degraded" doesn't false-flag on "data changed."

**Budget-independent fallback.** When canary fires degraded-flag, turns route to the other tier regardless of budget state. Reuses plan 05 tier-shift UX surface — same presenter, different trigger source.

**Canary feeds the meta-eval corpus.** Every canary run is itself an eval data point — ground truth (fixture data), known query, outcome.

**What this is NOT:** a comprehensive eval framework. It's a focused production-operations harness: replay for incidents, golden traces for rollout gates, canary for degradation detection, scorer contract for all of the above.

---

## 3. Data Model

### `agent_prompt_store` (shipped plan 00)

Consumed by replay: `(content_hash) → { layer, content, first_seen_at }`. Append-only.

### `agent_narrative_store` (shipped plan 00)

Consumed by replay: `(tenant_id, role_id) → narrative_hash → text`. Append-only.

### `agent_tool_invocation` (shipped plan 07)

For 100%-captured turns: consumed by replay to rebuild tool outputs at their original values.

### `agent_golden_trace`

CI-gating set. Strict ≤20 rows.

- `id UUID PK`.
- `title TEXT` — human-readable scenario name.
- `fixture_tenant_id UUID` — always a fixture tenant (never prod tenant).
- `seed_user_id UUID` — fixture user.
- `user_utterance TEXT` — the canonical query.
- `expected_tool_calls JSONB` — `string[]` of tool names in any order.
- `expected_shape TEXT` — `'short-answer' | 'list' | 'table' | 'narrative' | 'chart' | 'refusal'`.
- `expected_permission_keys JSONB` — `string[]`.
- `taint_expectation BOOLEAN` — `true` if this scenario should flip taint; `false` otherwise.
- `answer_shape_contract JSONB` — shape-specific (e.g. `{ columns: [...] }` for table).
- `adversarial_category TEXT?` — `'sanitization-projection' | 'taint-escalation' | 'permission-denial' | 'disambiguation' | 'contradiction' | null`.
- `created_by UUID`.
- `created_at TIMESTAMPTZ`.
- `removed_at TIMESTAMPTZ?` — non-null on retirement; row never deleted.
- `removal_reason TEXT?`.

Removal requires explicit PR with documented reason ("domain sunset", "duplicate coverage"). Never silent cleanup.

### `agent_scorer_registration`

- `scorer_id TEXT PK`.
- `name TEXT`.
- `kind TEXT` — `'deterministic' | 'llm-judge'`.
- `scope TEXT` — `'live' | 'trace' | 'experiment' | 'test'`.
- `registered_at TIMESTAMPTZ`.
- `meta_eval_agreement NUMERIC?` — only populated for LLM-judge scorers post-corpus validation.
- `status TEXT` — `'provisional' | 'gating_eligible'`.

LLM-judge scorers start `provisional`; promoted to `gating_eligible` only after meta-eval agreement ≥95% on `SetaGoldenCorpus` (Beta).

### `agent_canary_run`

- `id UUID PK`.
- `run_at TIMESTAMPTZ`.
- `tier TEXT` — `'full' | 'nano'`.
- `canary_query_id UUID` — reference to a rotated query.
- `fixture_tenant_id UUID`.
- `trace_id UUID` — the canary run's own trace.
- `outcome TEXT` — `'passed' | 'failed' | 'error'`.
- `score NUMERIC` — 0-1 against the expected answer-shape contract.
- `duration_ms INT`.
- Index: `(tier, run_at DESC)`.

### `agent_canary_query`

- `id UUID PK`.
- `tier TEXT`.
- `utterance TEXT`.
- `fixture_tenant_id UUID`.
- `expected_answer_contract JSONB`.
- `rotation_quarter TEXT` — e.g. `'2026-Q2'`.
- `source TEXT` — `'production_anonymized' | 'manually_authored'`.
- `status TEXT` — `'active' | 'retired'`.

Quarterly rotation: retire previous quarter's queries; ingest a new batch from anonymized production traffic.

### `agent_tier_health` (derived / in-memory with Redis backing for speed)

- `tier TEXT PK`.
- `success_rate_rolling NUMERIC` — computed over sliding 30-min window.
- `degraded_flag BOOLEAN` — derived from threshold.
- `degraded_since TIMESTAMPTZ?`.
- `elevated_notice_level TEXT` — `'none' | 'elevated' | 'hard_refusal'`.

### `SetaGoldenCorpus` (Beta, separate from CI gate)

≥100 rows for meta-eval; same shape as `agent_golden_trace` but without the 20-row cap. Used only for offline scorer meta-eval, never gates CI.

---

## 4. Interface Contracts

### `ReplayHarness`

```
replay(opts: {
  traceId: UUID;
  mode: 'prompt-only' | 'full';      // full requires 100%-capture
}): Promise<ReplayResult>

type ReplayResult = {
  messages: LlmMessageArray[];       // per-LLM-call reconstruction
  toolOutputs?: ToolCall[];          // only in 'full' mode
  pinnedVersions: Record<string, string>;
  canonicalizerVersionHash: string;
  missedHashes: never;               // type-level guarantee: no misses permitted; missing = error raised
}
```

### `SetaScorer` (typed contract)

```
type SetaScorer<TInput, TOutput> = {
  id: string;
  name: string;
  kind: 'deterministic' | 'llm-judge';
  scope: 'live' | 'trace' | 'experiment' | 'test';
  definitionSource: 'code' | 'stored';
  run(ctx: ScorerContext<TInput, TOutput>): Promise<ScorerResult>;
}

type ScorerResult = {
  score: 0 | 1;
  passed: boolean;
  reason?: string;
}

type ScorerContext<TInput, TOutput> = {
  traceId?: UUID;
  input: TInput;
  output: TOutput;
  requestContext?: RequestContext;
}
```

Registration-time enforcement via `ScorerRegistry.register(scorer)`:

- `kind: 'llm-judge'` + `scope != 'test'` + no `meta_eval_agreement` → rejected.
- Missing required fields → compile error.

### `GoldenTraceRunner`

```
runCiGate(opts: { branch: string; commit: string }): Promise<{
  passed: boolean;
  regressions: RegressionReport[];
  durationMs: number;
}>

type RegressionReport = {
  goldenTraceId: UUID;
  expectedFingerprint: Fingerprint;
  actualFingerprint: Fingerprint;
  divergedFields: string[];
}

type Fingerprint = {
  toolCallsSorted: string[];
  shape: AnswerShape;
  permissionKeys: string[];
  taintFlipped: boolean;
}
```

Invoked on every PR via turbo task; hard fail on any regression.

### `QualityCanaryScheduler`

```
tickHourly(): Promise<void>              // scheduled; runs a canary query per tier per tick
computeHealth(tier: 'full' | 'nano'): TierHealth
degradedFlag(tier): boolean              // reads from cached tier_health
```

### `CanaryQueryRotator`

```
rotateQuarterly(): Promise<{ retired: number; ingested: number }>
ingestFromProduction(anonymizedTraces: Trace[]): CanaryQuery[]
```

Runs as a scheduled job once per quarter.

### `DegradedTierFallback` (integrates with plan 05 tier-shift)

```
shouldFallback(currentTier: 'full' | 'nano'): 'full' | 'nano' | 'both_degraded'
getElevatedNoticeLevel(): 'none' | 'elevated' | 'hard_refusal'
```

Both-tiers degraded + canary success < 50% → hard refusal. Both-tiers degraded + success ≥ 50% → elevated user notice, continue on least-degraded tier.

### `ConfidenceCalibrationDashboard` (query-only)

```
correlate(opts: { tenantId?; dateRange }): {
  byTier: Record<'high' | 'med' | 'low', { thumbs_down_rate; initiator_approval_rate; count }>;
  invertedOrdering: boolean;
}
```

Expected: `thumbs_down_rate(high) < thumbs_down_rate(med) < thumbs_down_rate(low)`. Inversion → triggers §9 confidence-derivation-rule refinement review.

---

## 5. Control Flow

### Replay a trace (dev/ops)

1. Operator provides `trace_id` via CLI or internal UI.
2. `ReplayHarness.replay({ traceId, mode: 'prompt-only' })`:
   a. Load trace metadata: pinned versions, content hashes, canonicalizer version.
   b. For each LLM-call span in the trace:
   - Look up `router_prompt_hash` → `agent_prompt_store` → content. Raise if miss.
   - Look up `permission_narrative_hash` → `agent_narrative_store`. Raise if miss.
   - Look up `tool_catalog_hash` → catalog content. Raise if miss.
   - Reconstruct developer message from trace-captured turn-dynamic content (L3, γ/α window).
   - Reconstruct user message from `agent_message.content`.
     c. Return reconstructed message array.
3. Operator can diff against current production prompts to see what changed, or re-issue via LLM provider for current-model comparison.

For `mode: 'full'` (100%-captured turns only):

- Also reconstructs tool outputs from `agent_tool_invocation.result_preview`.
- If any tool call lacks a stored output (i.e. turn was NOT 100%-captured), raise — do not degrade to tool re-invocation.

### Golden-trace CI gate

1. PR opened; turbo task `agent:golden-trace-ci` runs.
2. `GoldenTraceRunner.runCiGate(...)`:
   a. Load all non-retired `agent_golden_trace` rows (≤20).
   b. For each: execute against fixture tenant using current PR's code.
   c. Compute `Fingerprint`: sorted tool calls + shape + permission keys + taint.
   d. Compare to row's stored expected fingerprint.
   e. Any divergence → `RegressionReport`.
3. Any regressions → CI hard fail with detailed report. No "warn only" mode.
4. PR cannot merge until all golden traces pass.

### Adding a golden-trace row

1. Author writes fixture + expected fingerprint + rationale in PR.
2. Row count check: `active_count < 20` enforced.
3. Review approval required (tenant-admin or agent-ops reviewer).
4. Merge → row added.

### Removing a golden-trace row

1. Author proposes removal in PR with documented `removal_reason`.
2. Row marked `removed_at`, `removal_reason` filled. Never deleted.
3. Merge requires same approval level as addition.

### Canary run (hourly)

1. `QualityCanaryScheduler.tickHourly()` fires.
2. For each tier: pick next canary query from active rotation (round-robin).
3. Execute against fixture tenant via full agent pipeline; capture `trace_id`.
4. Score via deterministic scorer:
   - Compare actual vs expected answer-shape contract.
   - Compare captured tool calls against expected set.
5. Write `agent_canary_run` row with outcome + score.
6. Update `agent_tier_health.success_rate_rolling` (30-min sliding window).
7. Evaluate thresholds:
   - Rolling success < threshold (e.g. 90%) for window → `degraded_flag = true`, `degraded_since = now()`.
   - Rolling success ≥ threshold for recovery window → `degraded_flag = false`.
8. If `degraded_flag` flips, emit:
   - Metric `agent_tier_degraded{tier}` gauge.
   - Audit event `agent.tier_degraded` / `agent.tier_recovered`.
   - Operator alert (rate-limited).

### Fallback on degraded tier

1. Plan 06 stream controller at turn start calls `DegradedTierFallback.shouldFallback(requestedTier)`.
2. If degraded → use alt tier; trace attr `tier_shift: true`, `tier_shift_reason: 'quality_canary'`.
3. User-facing UI message per plan 13 tier-shift surface.

### Both-tiers-degraded

1. Canary detects both tiers degraded simultaneously.
2. `DegradedTierFallback.shouldFallback` returns `'both_degraded'`.
3. Plan 06: if canary success ≥ 50% on least-degraded → run on that tier with `elevated_notice_level: 'elevated'`; user sees banner _"Service quality is degraded across all tiers; responses may be unreliable."_
4. If < 50% (configurable stricter threshold) → `turn.ended.reason: 'quality_canary'`; hard refusal.

### Canary query rotation (quarterly)

1. Scheduled job runs first Sunday of quarter.
2. `CanaryQueryRotator.rotateQuarterly()`:
   a. Anonymize last quarter's production traces (remove PII, bucket timestamps, generalize entity IDs).
   b. Sample N representative utterances per tier.
   c. Author expected-answer-contract for each (semi-automated + reviewer approval).
   d. Ingest as new `agent_canary_query` rows with `rotation_quarter: '2026-Q3'`.
   e. Retire previous quarter's queries (`status: 'retired'`).
3. Audit event fired.

### Confidence calibration

1. Plan 03 synthesizer stamps `confidence: 'high' | 'med' | 'low'` on every answer.
2. Plan 08 tracks thumbs-down + initiator-approval per trace.
3. `ConfidenceCalibrationDashboard.correlate(...)` joins:
   - Group by confidence tier.
   - Compute thumbs-down rate + initiator-approval rate per tier.
4. Ordering check: `high < med < low` for thumbs-down.
5. Inversion → alert + trigger §9 rule-table refinement review.

### Replay miss handling

1. Replay attempts to resolve a hash.
2. Hash not found in store → raise `ReplayLookupMissError` with context: `{ hash, expected_layer, trace_id }`.
3. No fallback, no fuzzy match, no approximate reconstruction.
4. Operator sees explicit error, knows to investigate: prompt store pruning? canonicalizer version drift? trace-backend retention mismatch?

---

## 6. Requirements

### Replay harness

| #      | Requirement                                                                                               | Design §§ |
| ------ | --------------------------------------------------------------------------------------------------------- | --------- |
| R-10.1 | Given `trace_id`, reconstruct full message array for each LLM call                                        | §8        |
| R-10.2 | Resolves via `agent_prompt_store` + `agent_narrative_store` + trace-captured dynamic content              | §8        |
| R-10.3 | Errors explicitly on any lookup miss — no silent fallback, no fuzzy match                                 | §8        |
| R-10.4 | Full replay (including tool outputs) restricted to 100%-captured turns                                    | §8        |
| R-10.5 | Reconstructs prompt assembly, NOT outbound HTTP (operator re-issues to live provider)                     | §8        |
| R-10.6 | Canonicalization rules applied consistently — canonicalizer version hash verified matches trace's version | §8        |

### SetaScorer

| #       | Requirement                                                                                     | Design §§               |
| ------- | ----------------------------------------------------------------------------------------------- | ----------------------- | --- |
| R-10.7  | Scorer shape: `{ id, name, kind, scope, definitionSource, run(ctx) => { score: 0                | 1, passed, reason? } }` | §14 |
| R-10.8  | `kind: 'llm-judge' + scope != 'test'` registration REJECTED unless `meta_eval_agreement ≥ 0.95` | §14                     |
| R-10.9  | Scorer registration emits kernel audit event `agent.scorer_registered`                          | §14                     |
| R-10.10 | Scorer demotion automatic if agreement drops below threshold in Beta meta-eval run              | §14                     |

### Golden-trace suite

| #       | Requirement                                                                                                                                                            | Design §§ |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-10.11 | ≤20 active rows in CI-gating set — enforced at row-insert                                                                                                              | §14       |
| R-10.12 | Row shape: `{ title, user_utterance, expected_tool_calls, expected_shape, expected_permission_keys, taint_expectation, answer_shape_contract, adversarial_category? }` | §14       |
| R-10.13 | Rotation additive — removals require explicit PR with documented reason; rows never hard-deleted (set `removed_at`)                                                    | §14       |
| R-10.14 | CI hard fail on any regression; no "warn only" mode                                                                                                                    | §14       |
| R-10.15 | Suite includes adversarial sanitization-projection subset                                                                                                              | §14       |

### Quality canary

| #       | Requirement                                                                                       | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------- | --------- |
| R-10.16 | Rolling probe per tier (`full`, `nano`) independently                                             | §12       |
| R-10.17 | Canary executes against frozen fixture tenant data                                                | §12       |
| R-10.18 | Canary queries rotated quarterly from anonymized production traffic                               | §12       |
| R-10.19 | Degraded-flag derived from success-rate threshold over sliding window                             | §12       |
| R-10.20 | Dashboard shows raw success rate + trend, NOT just derived boolean                                | §12       |
| R-10.21 | Degraded tier → budget-independent fallback via plan 05 tier-shift surface                        | §12       |
| R-10.22 | Both-tiers-degraded: continue on least-degraded with elevated notice if ≥50%; hard refuse if <50% | §12       |
| R-10.23 | Canary runs feed `SetaGoldenCorpus` for meta-eval                                                 | §12, §14  |

### Confidence calibration

| #       | Requirement                                                                             | Design §§ |
| ------- | --------------------------------------------------------------------------------------- | --------- |
| R-10.24 | Dashboard correlates `confidence` tier × `thumbs_down_rate` + `initiator_approval_rate` | §12       |
| R-10.25 | Expected ordering: `thumbs_down(high) < thumbs_down(med) < thumbs_down(low)`            | §12       |
| R-10.26 | Inversion triggers §9 rule-table refinement review                                      | §12       |

### Retention for replay support

| #       | Requirement                                                                                                                  | Design §§ |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-10.27 | Prompt + narrative stores retain entries referenced by any trace in the last 30 days                                         | §8        |
| R-10.28 | Aggressive GC of older hashes coordinated with retention policy; referenced hashes never purged while trace retention active | §8        |

---

## 7. Failure Modes & Recovery

| Failure                                                                 | Symptom                                       | Recovery                                                                                                    |
| ----------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Replay lookup miss                                                      | `ReplayLookupMissError` with hash + layer     | Operator investigates: retention mismatch, store corruption, canonicalizer drift. Raise, don't fallback.    |
| Golden-trace flakiness (non-deterministic regression)                   | CI fails intermittently                       | If confirmed flaky → investigate scorer determinism; may indicate a test-data issue, not a code regression. |
| Golden-trace count exceeds 20                                           | Insert rejected                               | Author prunes or justifies cap raise in design doc (change of §14 constraint).                              |
| Canary probe fails due to fixture-tenant data mutation                  | All canary runs fail for that query           | Fixture-tenant data is write-locked at MVP; any mutation is a bug. Alert + revert.                          |
| Canary query ingestion produces bad (non-representative) queries        | Detection delayed; bad signal                 | Quarterly review cycle catches; human approval gate on rotation ingestion.                                  |
| Scorer throws                                                           | Single scorer failure does NOT kill the suite | Suite captures error per scorer; CI reports; operator investigates scorer logic.                            |
| LLM-judge scorer tries to register as gating-eligible without meta-eval | Registration rejected                         | Scorer remains `provisional`; operator completes meta-eval corpus run first.                                |
| Both-tiers-degraded but canary infrastructure itself is broken          | False degraded flag                           | Canary self-health probe: if 0 canary runs in last 2 hours → disable degraded-flag gating, alert.           |
| GC purges a hash still referenced by a recent trace                     | Replay fails on that trace                    | Coordinated retention policy prevents; if occurs, log as data-handling incident.                            |
| Confidence calibration inversion (true regression)                      | `thumbs_down(high) > thumbs_down(low)`        | Alert + trigger §9 rule-table review. May indicate a prompt regression or a data shift.                     |

---

## 8. Observability Surface

### Spans

- `REPLAY:resolve` (entity `PROCESSOR`) — when replay runs; attrs `trace_id`, `hash_count`, `miss_count` (should be 0).
- `CANARY:run` — each canary execution; full turn span tree under; attrs `tier`, `canary_query_id`, `score`.
- `GOLDEN_TRACE:ci-run` — one span per CI invocation; children per row.

### Metrics

- `agent_replay_attempted_total{mode}` — counter.
- `agent_replay_miss_total{layer}` — counter; P1 alert on any non-zero.
- `agent_golden_trace_count_active` — gauge (should stay ≤20).
- `agent_golden_trace_ci_fail_total{trace_id}` — counter.
- `agent_canary_run_total{tier, outcome}` — counter.
- `agent_canary_success_rate_rolling{tier}` — gauge.
- `agent_tier_degraded_gauge{tier}` — 0/1 gauge.
- `agent_scorer_registered_total{kind, scope}` — counter.
- `agent_confidence_calibration_inversion` — gauge (boolean).

### Dashboards

- Replay miss rate (should be 0; any nonzero = P1 data-handling issue).
- Canary success rate over time per tier (trend + current).
- Degraded-flag timeline (when tiers went degraded, duration).
- Golden-trace run history + regression patterns.
- Confidence calibration ordering per week.

---

## 9. Security Considerations

- **Replay is operator-gated.** Accessing replay on a production `trace_id` requires `canDo('agent.replay')` — admin-tier role. Replay output can contain tenant data (it's reconstructing the agent's context).
- **Fixture-tenant isolation.** Canary runs against fixture tenants; fixture tenants are real `tenant_id` values with locked data, never used by real users. Cross-tenant canary → production leak would be a P1; enforced by RLS + canary-runner identity.
- **Golden-trace fixture data.** Same isolation — all golden-trace scenarios run against fixture tenants; never touches production data.
- **Scorer registration audit.** LLM-judge promotion via meta-eval is kernel-audited; can't silently promote a scorer to gating without a traceable action.
- **Canary query anonymization.** Production-traffic ingestion removes PII before materializing as canary queries. Reviewed by human before rotation activates.
- **Replay-miss as signal.** A miss in production is a data-handling issue. It could indicate retention policy gone wrong (leaking referenced hashes) or an attacker deleting store rows (unlikely given append-only).

---

## 10. Performance Budget

| Operation                                                          | p50    | p95     | p99     |
| ------------------------------------------------------------------ | ------ | ------- | ------- |
| `ReplayHarness.replay` (prompt-only, ~3 LLM calls)                 | <200ms | <600ms  | <1500ms |
| `ReplayHarness.replay` (full mode, ~3 LLM calls + 10 tool outputs) | <500ms | <1500ms | <3000ms |
| Golden-trace CI gate (20 rows, sequential)                         | <5min  | <10min  | <15min  |
| Canary run per tick (1 query per tier)                             | <10s   | <30s    | <60s    |
| Scorer single execution (deterministic)                            | <100ms | <500ms  | <1500ms |
| Scorer single execution (LLM-judge)                                | <3s    | <10s    | <20s    |
| Quarterly rotation ingestion                                       | <30min | <1h     | <2h     |

CI latency target: ≤10min p99 for the golden-trace gate. Above this, contributors bypass.

---

## 11. Testing Strategy

### Unit

- `ReplayHarness.replay`: missing hash → raises; all hashes present → returns correct message array.
- `ScorerRegistry.register`: `kind: 'llm-judge' + scope: 'live'` + no meta-eval → rejected.
- `GoldenTraceRunner.runCiGate`: 20-row limit enforced; 21st row insert rejected.
- Canary scoring: comparison of expected vs actual fingerprint exact.
- `DegradedTierFallback.shouldFallback`: each combination of tier states returns correct value.

### Integration

- Full replay round-trip: capture a sampled turn → reconstruct via replay → resulting messages byte-for-byte match what was sent to the LLM (via test-mode capture).
- Replay on an unsampled turn (`mode: 'full'`) → fails with clear error (no tool outputs captured).
- Golden-trace regression: intentionally break a sub-agent's prompt → CI fails on the affected row with exact divergence report.
- Golden-trace rotation: remove a row → `removed_at` set; CI uses remaining rows; re-activation via updating `removed_at = NULL` (with audit).
- Canary run: hourly tick fires canary; `agent_canary_run` populated; tier health gauge updates.
- Degraded flag: seed 15 consecutive canary failures → `degraded_flag: true` → next turn uses alt tier with `tier_shift: true` trace attr.
- Both-tiers-degraded: both fail → depending on success rate, elevated notice or hard refusal.
- Scorer meta-eval: stored `SetaGoldenCorpus` with 100 rows → run scorer → compute agreement; score ≥0.95 → promotion; <0.95 → remains provisional.

### Property

- Replay determinism: for a given `trace_id`, two replay calls return byte-identical output.
- Fingerprint sorting: `expected_tool_calls` comparison is order-insensitive.

### E2E

- Scenario: production turn ends with `error`; operator opens replay UI; sees reconstructed prompts; diffs against current production; identifies the prompt regression.
- Scenario: quarterly rotation — ingest 50 anonymized production traces; 30 pass review gate; new rotation active.

### Fixtures

- `fixtures/golden-traces/planner-overdue.ts`
- `fixtures/golden-traces/taint-bumped-draft.ts`
- `fixtures/golden-traces/disambiguation-escalation.ts`
- `fixtures/golden-traces/cross-domain-definitional-clarity.ts`
- `fixtures/canary-queries/full-tier-kpi-query.ts`
- `fixtures/canary-queries/nano-tier-quick-fact.ts`
- `fixtures/setaGoldenCorpus/` — seed set for Beta meta-eval.
- `fixtures/fixture-tenant/seed-data.sql`.

---

## 12. Acceptance Criteria

- All unit + integration + property + E2E tests pass.
- Replay miss metric = 0 in prod for the last 30 days.
- Golden-trace CI hard-fails on seeded regression (verified in a dry-run PR).
- Canary runs every hour per tier; dashboards reflect reality.
- Degraded-flag fires correctly on seeded failures; fallback engages; tier-shift UI message surfaces.
- Both-tiers-degraded path exercised in a quarterly drill.
- LLM-judge promotion path demonstrated: provisional registration → meta-eval → agreement ≥0.95 → promoted to gating (Beta only).
- Confidence calibration dashboard accessible and shows expected ordering; alert fires on seeded inversion.

---

## 13. Rollout Plan

- **Phase 1** — ship replay harness with prompt-only mode. Operator CLI only.
- **Phase 2** — ship golden-trace suite (start with 5 rows); CI gate active.
- **Phase 3** — ship canary scheduler + fixture-tenant setup; degraded-flag observability only (no fallback yet).
- **Phase 4** — enable degraded-flag fallback via plan 05 tier-shift.
- **Phase 5** — grow golden-trace suite to 20; ship scorer registry + meta-eval corpus (Beta).
- **Phase 6** — LLM-judge promotion path (Beta); full replay mode for 100%-captured.

**Backout:** replay is read-only; regression is operator-visible but doesn't block production. Golden-trace CI gate can be disabled via env flag for emergencies — but no "warn only"; either on or off. Canary + degraded-fallback: disable via config; loses protection but doesn't break production.

---

## 14. Dependencies

- Plan 00 (shipped): prompt + narrative stores.
- Plan 01: tool gateway for canary tool invocations.
- Plan 02: router prompt assembly (canonicalization rules).
- Plan 03: phase execution (canary runs use it).
- Plan 04: conversation state.
- Plan 05: tier-shift UX surface (reused for canary-driven fallback).
- Plan 06: `systemAbortController` for hard-refusal on both-tiers-degraded.
- Plan 07: trace correlation + `agent_tool_invocation` for full-replay tool outputs.
- Plan 08: thumbs-down + initiator-approval for confidence calibration.
- Plan 11: shadow-mode (this plan's scorer infrastructure is consumed by plan 11).
- Kernel module: audit events.

## 15. Integration Points

- `@future/db` — `agent_golden_trace`, `agent_scorer_registration`, `agent_canary_run`, `agent_canary_query`, `agent_tier_health` (if not Redis-only).
- `apps/api/src/modules/agents/application/services/replay-harness.ts`.
- `apps/api/src/modules/agents/application/services/scorer-registry.ts`.
- `apps/api/src/modules/agents/application/services/golden-trace-runner.ts`.
- `apps/api/src/modules/agents/application/services/quality-canary-scheduler.ts`.
- `apps/api/src/modules/agents/application/services/canary-query-rotator.ts`.
- `apps/api/src/modules/agents/application/services/degraded-tier-fallback.ts`.
- `apps/api/src/modules/agents/application/services/confidence-calibration-service.ts`.
- CI runner — turbo task `agent:golden-trace-ci`.
- Dashboards — Grafana or equivalent.
- Fixture-tenant provisioning — separate migration package.

## 16. Activation Gate

MVP for: replay (prompt-only), golden-trace suite (CI gate), canary (observability + degraded-flag + fallback).

Beta for: `SetaGoldenCorpus` ≥100 rows, LLM-judge meta-eval promotion path.

GA for: LLM-judge scorers actually promoted to gating (depends on Beta corpus work passing meta-eval).

## 17. Out of Scope

- Live shadow-mode traffic routing (plan 11).
- Human annotator UI for corpus labeling (product).
- LLM-judge scorers in gating roles (GA).
- Full-fleet prompt capture (GA).
- Per-tenant canary customization.

## 18. Open Questions

- **Canary query ingestion automation.** How much of the "author expected answer contract" can be automated vs requires human review? Recommend: semi-automated — LLM-drafted, human-reviewed. Owner: agent-ops team.
- **Retention coordination.** Prompt-store GC vs trace retention — need clear policy so replay never misses for in-retention traces. Owner: plan 07 + platform ops.
- **Golden-trace scenario selection rubric.** Which 20 are the right 20? Start with: 1 per domain + adversarial subset + critical-path scenarios. Maintain intentionally — not accretion.
- **Meta-eval corpus authoring.** Who labels `SetaGoldenCorpus`? Beta-phase question. Owner: product + agent-ops.
- **Canary fixture-tenant data freshness.** When product launches new features, fixture data needs updates. Who owns? Recommend: agent-ops team, quarterly updates in sync with canary rotation.
- **Hard-refusal threshold.** 50% canary success as the cutoff — tune after observed data.
