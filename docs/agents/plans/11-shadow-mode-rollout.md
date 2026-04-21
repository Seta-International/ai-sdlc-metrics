# 11 — Shadow-mode Traffic + Canary Rollout Mechanics

**Design §§:** §14 (Rollout & Eval), §7 (gateway `mode: 'execute' | 'dry-run'`).

---

## 1. Scope

### In

- Shadow-mode traffic routing: production turns dual-executed against candidate code alongside baseline.
- `mode: 'dry-run'` gateway discriminator activation (gateway is shadow-ready from plan 01).
- Canary rollout mechanics: 1% → 5% → 25% → 100% tenant-level traffic splits.
- Automated rollback on regression signals exceeding thresholds.
- A/B stability keys per §14: router/planner/model/tool-meta → `tenant_id`; sub-agent prompt tweaks → `(tenant_id, user_id)`.
- Version assignment sticky across retries (pg-boss retry hits same versions as original spawn).
- Diff-and-score: shadow vs baseline output comparison via `SetaScorer`s from plan 10.
- Shadow-only side effects are NOT committed (writes dry-run-only; no real drafts surface from shadow).
- Rollout-event audit trail (every % shift emits kernel audit).

### Out

- The `SetaScorer` contract itself (plan 10).
- The replay harness (plan 10).
- Offline replay (plan 10 Phase D).
- LLM-judge scorers for shadow diffing (activation-gated GA).
- Feature-flag UI for rollout control (infra concern; this plan provides the API).
- Self-hosted model tier shadow (GA activation-gated).

---

## 2. Design Context

Shadow-mode is the safe path for **model swap + planner change** class of changes (§14 change-class table). A candidate version runs against real production traffic with dry-run side effects, produces an answer, and a diff scorer compares against the baseline's answer. The user sees ONLY baseline; shadow results are captured for analysis.

**Gateway was shadow-ready from MVP** (plan 01 R-01.7). Every tool handler accepts `mode: 'execute' | 'dry-run'`. Retrofitting `mode` later would have been a whole-surface change — we paid the cost up front. This plan activates what plan 01 built.

**Canary rollout = 1% → 5% → 25% → 100%.** Not a cron; each step is a product decision backed by regression-signal dashboards. Auto-rollback triggers on signals exceeding thresholds: error-rate spike, cost-spike, initiator-approval drop, router-accuracy signal. Rollback is immediate; rollout is deliberate.

**A/B stability keys** per §14: tenant-level consistency for router/planner/model/tool-meta; user-level for sub-agent prompt tweaks. Same-tenant users comparing notes must not see different capabilities. Sub-agent prompt tweaks are isolated-per-user faster iteration.

**Version assignment sticky across retries.** pg-boss job retry hits the same pinned versions as the original spawn (plan 09 R-09.15). Without this, retries flip assignments mid-job — a disaster for reproducibility.

**Shadow traffic has dry-run-only side effects.** Writes don't commit; drafts don't surface; notifications don't fire. Plan 08 draft path respects `mode: 'dry-run'` and captures the would-be-draft in the shadow trace only.

**What this is NOT:** a general feature-flag framework. It is a specific rollout-and-shadow mechanism for the agent runtime, with opinionated scope and integration points.

---

## 3. Data Model

### `agent_rollout_config`

- `id UUID PK`.
- `change_class TEXT` — `'router' | 'planner' | 'model' | 'tool_meta' | 'sub_agent_prompt'`.
- `candidate_version TEXT` — the new version identifier.
- `baseline_version TEXT` — what it replaces.
- `stability_key TEXT` — `'tenant_id' | 'tenant_id+user_id'` (derived from change_class).
- `traffic_percentage NUMERIC` — 0-100.
- `shadow_enabled BOOLEAN` — if true, traffic that WOULD hit candidate also gets routed to shadow-execute the baseline; if false, only the candidate runs (no diff).
- `auto_rollback_enabled BOOLEAN`.
- `regression_thresholds JSONB` — `{ error_rate_max, cost_delta_pct_max, initiator_approval_drop_max, router_accuracy_signal_max, ... }`.
- `status TEXT` — `'drafting' | 'active' | 'rolled_back' | 'completed'`.
- `created_at TIMESTAMPTZ`, `activated_at TIMESTAMPTZ?`, `completed_or_rolled_back_at TIMESTAMPTZ?`.
- `created_by UUID`.

### `agent_rollout_event`

- `id UUID PK`.
- `rollout_config_id UUID FK`.
- `event_type TEXT` — `'activated' | 'percentage_shifted' | 'auto_rolled_back' | 'manually_rolled_back' | 'completed'`.
- `from_percentage NUMERIC?`, `to_percentage NUMERIC?`.
- `reason TEXT`.
- `triggered_by TEXT` — `'human:user_id' | 'auto:signal_name'`.
- `ts TIMESTAMPTZ`.

### `agent_shadow_run`

- `id UUID PK`.
- `tenant_id UUID` (RLS).
- `baseline_trace_id UUID` — the real turn that served the user.
- `shadow_trace_id UUID` — the shadow-execute turn.
- `rollout_config_id UUID FK`.
- `candidate_version TEXT`, `baseline_version TEXT`.
- `diff_score NUMERIC` — computed by diff scorer.
- `diff_category TEXT` — `'identical' | 'minor_difference' | 'major_difference' | 'shadow_errored'`.
- `ts TIMESTAMPTZ`.
- Index: `(rollout_config_id, ts DESC)`.

### Pinned-version table augmentation

`agent_session` (plan 02) already pins hashes. Rollout resolves via:

```
resolveVersion(opts: { changeClass, stabilityKey, keyValue }): string
// returns 'candidate' or 'baseline' version based on hash(keyValue) % 100 < traffic_percentage
```

Deterministic — same tenant_id / user_id always sees the same assignment during a rollout.

---

## 4. Interface Contracts

### `RolloutResolver`

```
resolveVersion(opts: {
  changeClass: 'router' | 'planner' | 'model' | 'tool_meta' | 'sub_agent_prompt';
  tenantId: UUID;
  userId?: UUID;            // required when change_class is sub_agent_prompt
  retryContextVersion?: string;  // for pg-boss retries; forces specific version
}): {
  version: string;
  fromCandidate: boolean;
  rolloutConfigId: UUID | null;   // null if no active rollout for this class
}
```

Sticky semantics:

- If `retryContextVersion` present → return it (retry consistency).
- Else compute via hash on stability key.

### `ShadowExecutor`

```
shouldShadow(opts: { rolloutConfig; tenantId; userId?; fromCandidate: boolean }): boolean
// true iff: candidate is active + shadow_enabled + candidate-assigned traffic

runShadow(opts: {
  baselineTrace: Trace;
  baselineOutput: TurnResult;
  candidateVersion: string;
  requestContext: RequestContext;
}): Promise<ShadowRunResult>

type ShadowRunResult = {
  shadowTraceId: UUID;
  outcome: 'completed' | 'errored' | 'timed_out';
  diffScore: number;
  diffCategory: 'identical' | 'minor_difference' | 'major_difference' | 'shadow_errored';
}
```

### `ShadowDiffScorer` (one or more `SetaScorer`s from plan 10)

```
score(opts: {
  baselineOutput: TurnResult;
  candidateOutput: TurnResult;
}): {
  score: number;        // 0-1
  category: 'identical' | 'minor_difference' | 'major_difference';
  componentDiffs: Record<string, number>;   // e.g. tool-call-set-diff, shape-diff, text-similarity
}
```

MVP: deterministic rule-based diff (tool-call overlap + shape match + permission-key match). LLM-judge diff is GA activation-gated.

### `RegressionSignalMonitor`

```
evaluate(opts: {
  rolloutConfigId: UUID;
  windowMs: number;     // e.g. 15 minutes
}): {
  tripped: boolean;
  trippedSignals: Array<{ signal: string; observed: number; threshold: number }>;
}
```

Signals evaluated per window:

- `error_rate`: `agent_turn_total{reason='error'}` / `agent_turn_total`.
- `cost_delta_pct`: `cost_p50(candidate) - cost_p50(baseline)`.
- `initiator_approval_drop`: baseline approval rate minus candidate approval rate.
- `router_accuracy_signals`: plan 07 signal counts.

Tripped → `AutoRollbackOrchestrator.rollback(rolloutConfigId)`.

### `RolloutController` (tRPC procedures)

```
createRollout(opts: {
  changeClass; candidateVersion; baselineVersion;
  shadowEnabled; autoRollbackEnabled; regressionThresholds;
}): Promise<AgentRolloutConfig>

shiftPercentage(opts: { rolloutConfigId; toPercentage; reason }): Promise<void>
rollback(opts: { rolloutConfigId; reason }): Promise<void>
complete(opts: { rolloutConfigId }): Promise<void>   // finalizes candidate as new baseline
list(): Promise<AgentRolloutConfig[]>
get(opts: { rolloutConfigId }): Promise<AgentRolloutConfig>
getDiffReport(opts: { rolloutConfigId; timeRange }): Promise<DiffReport>
```

All mutations gated `canDo('agent.rollout.manage')` + emit kernel audit.

### `AutoRollbackOrchestrator`

```
rollback(opts: { rolloutConfigId; trippedSignals; triggeredBy: 'auto' | 'manual' }): Promise<void>
// Flips traffic_percentage to 0; status to 'rolled_back'; emits audit + ops alert.
```

---

## 5. Control Flow

### Turn start with active rollout

1. Plan 06 controller receives `POST /agent/turn`.
2. For each change-class relevant to this turn (router/planner/model/tool-meta/sub-agent-prompt):
   a. `RolloutResolver.resolveVersion({ changeClass, tenantId, userId? })` → returns version string + `fromCandidate` flag.
3. Resolved versions pinned into `agent_session` (plan 02) and propagated to all components.
4. If `fromCandidate && rolloutConfig.shadow_enabled`:
   a. Spawn shadow execution AFTER baseline serves the user (so user-visible latency unaffected).
5. Baseline turn runs normally; user sees answer; stream closes.
6. Shadow execution runs asynchronously with `requestContext` identical to baseline (same tenant, user, utterance, conversation state at turn start).

### Shadow execution (async, post-baseline)

1. `ShadowExecutor.runShadow(...)` enqueues a pg-boss job `agent.shadow-turn`.
2. Worker picks up; constructs a fresh turn with:
   - Same `tenantId`, `userId`, `conversationId`, `userUtterance`.
   - Pinned to `candidateVersion` explicitly.
   - `mode: 'dry-run'` throughout the gateway pipeline (every tool call, every write).
   - Separate `trace_id` (`shadow_trace_id`) with `parent_trace_id = baselineTrace.trace_id`.
3. Shadow turn runs through plans 01-07 as normal, BUT:
   - Drafts generated during shadow → captured in shadow trace; NOT written to `agent_draft` in a user-visible way (stored with `mode: 'shadow'` flag for analysis).
   - Notifications suppressed.
   - Memory writes (L2 message persist, L3 writes, post-turn summary) suppressed.
   - Cost events tagged `layer: 'shadow:<sub_agent_key>'` and counted against a separate shadow budget, not tenant daily.
4. Shadow output captured.
5. `ShadowDiffScorer.score(...)` computes diff against baseline output.
6. Write `agent_shadow_run` row.
7. Update rollout-aggregate metrics (diff categories, error rate, cost delta).

### Percentage shift (manual)

1. Operator reviews diff reports in dashboard; confident to advance.
2. `RolloutController.shiftPercentage({ rolloutConfigId, toPercentage: 5, reason: 'low diff rate; error rate within thresholds' })`.
3. Config updated; `rollout_event` row persisted; kernel audit `agent.rollout_percentage_shifted`.
4. New turns immediately hit the new split (hash-based assignment updates atomically).

### Auto-rollback

1. `RegressionSignalMonitor.evaluate(...)` runs every 5min per active rollout.
2. One or more signals trip thresholds → `AutoRollbackOrchestrator.rollback(...)`.
3. `traffic_percentage → 0`; status → `'rolled_back'`.
4. Kernel audit `agent.rollout_auto_rolled_back` with tripped signals + values.
5. Ops alert fires immediately (not rate-limited — a rollback is always P1-relevant).
6. All in-flight shadow runs complete; no new shadow spawns.
7. Operator reviews; may `RolloutController.createRollout(...)` a new config with fixes.

### Completion (100% successful rollout)

1. Rollout reaches 100%; stable for operator-defined stability window (default 48h).
2. `RolloutController.complete(...)`:
   a. Baseline version officially retired.
   b. Candidate becomes new baseline.
   c. `rollout_event` type `'completed'`; kernel audit `agent.rollout_completed`.
   d. `agent_prompt_store` + `agent_narrative_store` entries for baseline version may now be GC-eligible (coordinated with plan 10 retention).

### pg-boss retry sticky version

1. Async turn (plan 09) spawned with `pinned_versions: { router_version: 'v5-candidate', ... }`.
2. Turn fails mid-flight; pg-boss enqueues retry with same payload.
3. Retry worker reads `pinned_versions`; passes to `RolloutResolver.resolveVersion({ retryContextVersion: 'v5-candidate' })`.
4. Resolver returns `retryContextVersion` verbatim; no recomputation.
5. Retry runs under same version as original.

### Shadow trace correlation

1. Every shadow trace has `parent_trace_id = baseline_trace_id`.
2. Operator can navigate: baseline trace → "view shadow execution" deeplink → shadow trace with diff attributes.
3. Dashboard aggregates: "for rollout X, show diff-score distribution over last 7 days."

### Hash-based stability key

```
shouldRouteTo('candidate', stability_key, traffic_percentage):
  hash = sha256(rollout_config_id + stability_key_value) mod 100
  return hash < traffic_percentage
```

Deterministic: same `(rollout_config_id, key_value)` → same routing. Different rollout_config_ids have independent hash spaces (so two rollouts don't converge on the same tenant getting both candidates).

---

## 6. Requirements

### Shadow mode

| #      | Requirement                                                                                                   | Design §§ |
| ------ | ------------------------------------------------------------------------------------------------------------- | --------- |
| R-11.1 | Gateway `mode: 'dry-run'` discriminator activated for shadow turns; tool handlers do not execute side effects | §7, §14   |
| R-11.2 | Shadow executions run ASYNCHRONOUSLY after baseline serves the user — no added user-visible latency           | §14       |
| R-11.3 | Shadow turns do NOT commit drafts, notifications, memory writes, or post-turn summaries                       | §14       |
| R-11.4 | Shadow cost tagged separately (`layer: 'shadow:*'`) and counted against shadow budget, not tenant daily       | §13, §14  |
| R-11.5 | Shadow traces linked via `parent_trace_id` to baseline                                                        | §12       |

### Canary rollout

| #       | Requirement                                                                                                                      | Design §§ |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-11.6  | Rollout progresses 1% → 5% → 25% → 100% via manual operator decisions backed by dashboards                                       | §14       |
| R-11.7  | A/B stability keys per change class: `tenant_id` for router/planner/model/tool_meta; `(tenant_id, user_id)` for sub_agent_prompt | §14       |
| R-11.8  | Hash-based assignment is deterministic: same key value → same routing                                                            | §14       |
| R-11.9  | Different rollouts have independent hash spaces (don't converge)                                                                 | §14       |
| R-11.10 | Auto-rollback on any regression signal exceeding threshold                                                                       | §14       |
| R-11.11 | Rollout + rollback events audited in kernel                                                                                      | §14       |

### Version pinning

| #       | Requirement                                                                                                                        | Design §§ |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-11.12 | pg-boss retry hits same pinned version as original spawn                                                                           | §11, §14  |
| R-11.13 | Session-pinned hashes (plan 02) reflect resolved versions at turn start; mid-session registry changes do not affect active session | §8, §14   |

### Diff scoring

| #       | Requirement                                                                               | Design §§        |
| ------- | ----------------------------------------------------------------------------------------- | ---------------- | ---------------- | --------------- | --- |
| R-11.14 | MVP diff scorer is deterministic (tool-call overlap + shape match + permission-key match) | §14              |
| R-11.15 | Diff category enum: `identical                                                            | minor_difference | major_difference | shadow_errored` | §14 |
| R-11.16 | LLM-judge diff scorers GA-activation-gated; only promoted via plan 10 meta-eval           | §14              |

### Controller + tooling

| #       | Requirement                                                                                                  | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| R-11.17 | `RolloutController` tRPC mutations gated `canDo('agent.rollout.manage')`                                     | §14       |
| R-11.18 | Every mutation emits kernel audit event                                                                      | §14       |
| R-11.19 | `getDiffReport` provides operator-visible rollout dashboard data                                             | §14       |
| R-11.20 | Rolled-back rollout can be re-attempted via new `rollout_config_id` (no edit-in-place of rolled-back config) | §14       |

### Auto-rollback thresholds (MVP defaults)

| #       | Requirement                                                                                              | Design §§ |
| ------- | -------------------------------------------------------------------------------------------------------- | --------- |
| R-11.21 | `error_rate_max: 2%` (candidate `turn.ended.reason=error` rate > 2× baseline)                            | §14       |
| R-11.22 | `cost_delta_pct_max: 20%` (candidate median turn cost > baseline × 1.2)                                  | §14       |
| R-11.23 | `initiator_approval_drop_max: 10%` (candidate initiator-approval rate < baseline − 10 percentage points) | §14       |
| R-11.24 | `router_accuracy_signal_max: 15%` (candidate's `user-corrects-mid-conversation` rate > 15%)              | §14       |
| R-11.25 | Window: 15-minute rolling                                                                                | §14       |

---

## 7. Failure Modes & Recovery

| Failure                                                                                 | Symptom                                              | Recovery                                                                                                                                                |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shadow pg-boss backlog (shadows queue faster than they process)                         | `agent_shadow_run_queue_depth` rises                 | Shadow is lossy-okay; drop oldest after threshold (e.g. 1000); alert. Shadow is an observability tool, not a critical path.                             |
| Candidate version fails to load (bad artifact)                                          | Shadow job errors immediately                        | Log + shadow_errored category; rollout monitor sees error rate → auto-rollback.                                                                         |
| Diff scorer itself has a bug                                                            | Inflated diff scores                                 | Operator notices in dashboard; dispute + investigate. Scorer versions are pinnable; use previous scorer version.                                        |
| Auto-rollback fires on a true positive (candidate actually regressed)                   | Expected                                             | Operator reviews trip-reason; files bug; creates new rollout with fix.                                                                                  |
| Auto-rollback fires on a false positive (e.g. transient provider outage during rollout) | Unnecessary rollback                                 | Rollout monitor should distinguish `provider_outage` (tagged in trace) from genuine regression. If it conflates, thresholds tuned or rollout restarted. |
| Stability-key hash collision (rare)                                                     | Two change classes' rollouts converge on same tenant | Independent hash spaces prevent (hash includes `rollout_config_id`). Unit-tested.                                                                       |
| Shadow write attempt slips past `mode: 'dry-run'` check                                 | Real side effect in shadow                           | P1 incident. Gateway pipeline step 5 enforces mode; seeded test verifies. Any leak = immediate rollback.                                                |
| Rollout percentage set to invalid value (e.g. 150)                                      | Config insert fails                                  | Schema validation at write.                                                                                                                             |
| Rolled-back rollout's `agent_shadow_run` rows retained                                  | History preserved                                    | Rows retained for analysis; indexed by rollout_config_id for retrospective review.                                                                      |
| Completed rollout's baseline prompt hashes GC'd prematurely                             | Replay on old traces fails                           | Plan 10 retention coordination prevents; referenced hashes never GC'd while trace retention active.                                                     |

---

## 8. Observability Surface

### Spans

- `ROLLOUT:resolve-version` (entity `PROCESSOR`) — child of `TURN`; attrs `change_class`, `rollout_config_id`, `fromCandidate`, `stability_key_value_hash`.
- `SHADOW:execute` — parent of the shadow turn tree; linked via `parent_trace_id` to baseline.
- `SHADOW:diff-score` — after shadow completes; attrs `diff_category`, `diff_score`.

### Metrics

- `agent_rollout_version_resolved_total{rollout_config_id, change_class, assignment}` — counter (`assignment: 'candidate' | 'baseline'`).
- `agent_shadow_run_total{rollout_config_id, outcome}` — counter.
- `agent_shadow_diff_category_total{rollout_config_id, category}` — counter.
- `agent_shadow_run_queue_depth` — gauge.
- `agent_rollout_auto_rollback_total{tripped_signal}` — counter.
- `agent_rollout_active_count` — gauge.
- `agent_rollout_regression_signal{rollout_config_id, signal}` — gauge; populated by `RegressionSignalMonitor`.

### Dashboards

- Per-rollout rollout-progress tracker: % over time + diff-category breakdown.
- Regression-signal dashboard per active rollout.
- Shadow queue health (depth + age distribution).
- Auto-rollback history (root-cause analysis).

---

## 9. Security Considerations

- **Shadow side-effect leak is P1.** Any real write during a shadow turn is a production-data integrity bug. Gateway `mode: 'dry-run'` is enforced at every tool handler — not at a higher level. Seeded tests cover the attack surface.
- **Rollout management permission.** `canDo('agent.rollout.manage')` is admin-tier; not a per-tenant permission since rollouts affect production broadly.
- **Stability-key determinism prevents gaming.** A tenant can't "retry until they get baseline" — hash is deterministic.
- **Pinned-version artifact retention.** Rolled-back candidate's prompt/narrative entries remain queryable for post-hoc analysis until retention policy says otherwise.
- **Shadow budget separation** prevents a buggy shadow candidate from consuming tenant budget.
- **Auto-rollback audit trail.** Every rollback has the tripped-signal context captured, so post-hoc "why did we roll back?" is instant.
- **Rollout config can't be edited mid-flight.** To change a config, roll back + create new — audit trail preserves original config intact.

---

## 10. Performance Budget

| Operation                                        | p50                    | p95     | p99     |
| ------------------------------------------------ | ---------------------- | ------- | ------- |
| `RolloutResolver.resolveVersion`                 | <1ms                   | <3ms    | <8ms    |
| `ShadowExecutor.shouldShadow`                    | <0.5ms                 | <1ms    | <3ms    |
| Shadow-job enqueue (fire-and-forget)             | <5ms                   | <15ms   | <40ms   |
| Shadow execution (async)                         | matches plan 03 budget | matches | matches |
| `ShadowDiffScorer.score` (deterministic)         | <50ms                  | <150ms  | <400ms  |
| `RegressionSignalMonitor.evaluate` (5min window) | <200ms                 | <500ms  | <1200ms |
| `RolloutController.shiftPercentage`              | <50ms                  | <150ms  | <400ms  |

Baseline turn adds <10ms from rollout resolution. Shadow is entirely off critical path.

---

## 11. Testing Strategy

### Unit

- `RolloutResolver.resolveVersion`: hash-based assignment deterministic; retry pinning bypasses hash.
- Stability keys: router change resolves by tenant_id; sub_agent_prompt change resolves by (tenant_id, user_id).
- `ShadowExecutor.shouldShadow`: shadow enabled + candidate assignment → true; other combinations → false.
- `ShadowDiffScorer`: identical outputs → `category: 'identical'`; divergent tool calls → `'major_difference'`.
- Regression threshold tripping: seed metrics crossing threshold → `tripped: true`.

### Integration

- Happy path rollout: create config → shift 1% → 5% → 25% → 100% → complete. Each step audits; stability keys deterministic.
- Shadow turn: seed active rollout with shadow_enabled → baseline turn serves user → shadow spawns → diff row persists.
- Shadow side-effect seed: attempt a write during shadow → gateway blocks via `mode: 'dry-run'`; seeded test fails loudly if any real side effect.
- Auto-rollback: seed error-rate spike → monitor trips → rollback fires → config status `rolled_back`; traffic to candidate stops.
- Retry version pinning: async turn with pinned candidate version → pg-boss retry → same version used.
- Cross-tenant: rollout configured for tenant A's sub-agent-prompt does not affect tenant B's routing.
- Hash isolation: two concurrent rollouts → same tenant does NOT get both candidates (different hash spaces).

### Property

- Determinism: for any `(rollout_config_id, key)` pair, routing result identical across 1000 calls.
- Monotonicity: as `traffic_percentage` increases, monotonically more users route to candidate.

### E2E

- Scenario: model swap rollout. Create config for `model:v5 → model:v6`. Activate 1%. Observe dashboards: diff rate, error rate, approval rate. Advance to 5%, 25%, 100%. Complete.
- Scenario: bad candidate auto-rollback. Create config with an intentionally-regressed candidate (e.g. breaks a golden-trace scenario). Activate 1%. Monitor auto-trips within 15min; rollback completes; traffic returns 100% to baseline.

### Fixtures

- `fixtures/rollouts/model-swap-v5-v6.ts`
- `fixtures/rollouts/sub-agent-prompt-tweak.ts`
- `fixtures/rollouts/router-version-bump.ts`
- `fixtures/shadow-diff-scorer/identical-cases.ts`
- `fixtures/shadow-diff-scorer/major-difference-cases.ts`

---

## 12. Acceptance Criteria

- All unit + integration + property + E2E tests pass.
- Shadow side-effect verification: seeded adversarial test proves no real writes commit under `mode: 'dry-run'`.
- Auto-rollback drill: seeded regression triggers rollback within 15min window; full audit trail present.
- Version pinning across retries verified.
- Hash isolation across rollouts verified.
- Operator dashboard shows live rollout progress + diff category breakdown.
- First production model-swap rollout completes successfully (dry-run exercise in Beta).

---

## 13. Rollout Plan

(Meta: rolling out the rollout infrastructure itself.)

- **Phase 1** — ship `RolloutResolver` + `agent_rollout_config` + `agent_rollout_event`; no active rollouts yet.
- **Phase 2** — ship `ShadowExecutor` + pg-boss `agent.shadow-turn` queue; dry-run test against non-production data.
- **Phase 3** — ship deterministic `ShadowDiffScorer`; ship diff reports dashboard.
- **Phase 4** — ship `RegressionSignalMonitor` + `AutoRollbackOrchestrator`.
- **Phase 5** — ship `RolloutController` tRPC + admin UI.
- **Phase 6** — first real rollout: small prompt tweak on an internal-tenant-only sub-agent.
- **Phase 7** — expand to production; activate 1% → 5% → 25% → 100% discipline.

**Backout:** rollout infrastructure itself is not on critical turn path. If `RolloutResolver` fails, fallback: always return baseline (no candidate routing; rollout paused). Alert. Infrastructure ship does not affect users' turns.

---

## 14. Dependencies

- Plan 01: gateway `mode: 'execute' | 'dry-run'` discriminator (shipped ready at MVP).
- Plan 02: version-pinned session; A/B stability keys.
- Plan 06: trace correlation.
- Plan 07: observability attrs + sampling.
- Plan 08: draft `mode: 'dry-run'` (shadow drafts captured, not committed).
- Plan 09: pg-boss retry version pinning.
- Plan 10: `SetaScorer` contract + replay harness + quality canary (rollout regression signals include canary).
- Kernel module: audit events + admin `canDo`.
- `web-admin`: rollout management UI.

## 15. Integration Points

- `@future/db` — `agent_rollout_config`, `agent_rollout_event`, `agent_shadow_run`.
- `apps/api/src/modules/agents/application/services/rollout-resolver.ts`.
- `apps/api/src/modules/agents/application/services/shadow-executor.ts`.
- `apps/api/src/modules/agents/application/services/shadow-diff-scorer.ts`.
- `apps/api/src/modules/agents/application/services/regression-signal-monitor.ts`.
- `apps/api/src/modules/agents/application/services/auto-rollback-orchestrator.ts`.
- `apps/api/src/modules/agents/interface/trpc/rollout-controller.ts`.
- `apps/api/src/modules/agents/infrastructure/workers/shadow-turn-worker.ts`.
- `web-admin/src/app/agent/rollouts/` — admin UI pages.
- Kernel `KernelAuditFacade` — rollout events.
- pg-boss — `agent.shadow-turn` queue.

## 16. Activation Gate

MVP for: shadow-mode infrastructure (interface active; first real shadow rollout can happen in Beta).

MVP also: `RolloutResolver` + deterministic hash-based assignment (needed for any A/B change, even without shadow).

Beta for: first model-swap rollout with live shadow diffing at scale.

GA for: LLM-judge diff scorers in rollout gating (post plan 10 meta-eval).

## 17. Out of Scope

- LLM-judge scorers in shadow diffing (GA).
- Self-hosted model tier rollouts (GA).
- Multi-variant / A/B/n testing (MVP is binary candidate-vs-baseline).
- Tenant-segment targeting beyond stability-key hashing (e.g. "only premium tenants") — add only if a real use case emerges.

## 18. Open Questions

- **Shadow budget sizing.** How large a shadow budget per rollout? Proposal: 10% of baseline production cost. Tune after first real shadow rollout.
- **Diff scorer composition.** MVP uses rule-based only. LLM-judge GA. Does Beta need any intermediate? Recommend: no — either you have meta-eval-validated LLM-judge or you don't; half-validated judges as rollout gates are risky.
- **Rollback threshold sensitivity.** Defaults are opinions; tune per observed data.
- **Completion stability window.** 48h default before "complete." Justified? Recommend: start at 48h; tune based on observed regression-manifestation patterns.
- **Rolled-back config revival.** Can operators "restart" a rolled-back rollout or must they create a new config? Recommend: must create new — preserves audit integrity.
- **Cross-change-class rollout composition.** What if router + sub_agent_prompt change at same time (different stability keys)? Proposal: independent hash spaces already handle; ship as-is.
