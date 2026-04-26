# Cluster 4 Audit — Drafts / Async / Governance

**Date:** 2026-04-26
**Auditor:** Claude Sonnet 4.6 (read-only)
**Plans:** 08 (Drafts + Approval + Delegation), 09 (Async Agents), 15 (Governance Authoring Lints)
**Repo root:** `/Users/canh/Projects/Seta/future`

---

## Summary Table

| Severity  | Plan 08 | Plan 09 | Plan 15 | Total  |
| --------- | ------- | ------- | ------- | ------ |
| P0        | 5       | 2       | 0       | **7**  |
| P1        | 4       | 4       | 1       | **9**  |
| P2        | 1       | 0       | 2       | **3**  |
| INFO      | 1       | 2       | 1       | **4**  |
| **Total** | **11**  | **8**   | **4**   | **23** |

---

## Plan 08 — Drafts + Approval + Delegation (In Progress)

### §1 Scope Assessment

Plan 08 covers draft proposal, tier classification, per-flow approval policy, execution worker, expiry sweep, delegation minting, approval card presenter, compliance query facade. Status in README: **In Progress**.

### §3 Data Model

**agent_draft** (`apps/api/src/modules/agents/infrastructure/schema/agent-draft.schema.ts`)

- All required columns present: id, tenant_id, trace_id, flow_id, initiator_user_id, on_behalf_of, via_delegation_id, via_schedule_id, approver_user_id, tier, status, tool_name, args, expected_output_shape, permission_envelope_at_draft_time, approval_freshness, approval_ttl, drafted_at, expires_at, approved_at, executed_at, execution_outcome, provenance, taint_at_draft_time.
- Required indexes present: (tenant_id, status, expires_at), (tenant_id, approver_user_id, status), (trace_id).
- **P1 — MISSING RLS:** `0000_initial.sql` contains no `FORCE ROW LEVEL SECURITY` or `CREATE POLICY` for `agents.agent_draft`. The schema declares `tenant_id NOT NULL` but RLS enforcement is absent. Only `agents.agent_tool_result_cache` has RLS enabled in the migration (lines 1832-1834). Cross-tenant isolation cannot be DB-enforced.

**agent_delegation** (`apps/api/src/modules/kernel/infrastructure/schema/agent-delegation.schema.ts`)

- All required columns present including `autonomous_writes_allowed BOOLEAN DEFAULT false` (plan 09 R-09.6c).
- **P1 — MISSING RLS:** Same issue — no FORCE ROW LEVEL SECURITY in migration for `core.agent_delegation`.

### §4 Interface Contracts

**DraftTier literals:** Commit `7efd6696 fix(agents): correct DraftTier literal values` landed correctly. `draft-types.ts:6` defines `'low_risk_auto' | 'high_risk_approval_required'` exactly matching the plan §4 spec. `draft-tier-classifier.ts` and `draft-tier-classifier.spec.ts` both use the correct string literals throughout.

**DraftTierClassifier:** Contract matches §4. Priority rules 1-4 all implemented and tested with 8 scenarios.

**FlowPolicyResolver:** Contract matches §4. Most-strict-wins logic (max on freshness, min on TTL, upgrade-only tier_bump) correctly implemented. Build-time duplicate detection is runner-side (intent-slug-uniqueness and flow-policy-key-uniqueness lint rules) rather than hard aggregator failure — functionally equivalent.

**DraftProposer:** Interface generally correct. **P0 gaps** in provenance population:

- `user_utterance` hardcoded to `''` (`draft-proposer.ts:59`). R-08.2 and R-08.24 both violated.
- `derived_from_tainted_sources` always `[]` — never reads `turnState.taintSources` (`draft-proposer.ts:57-63`). R-08.2 violated.

**DraftAuditQueryFacade:** Implemented as `draft-audit.router.ts`. Supports all required dimensions: initiatorUserId, approverUserId, tier, statuses, domainKind, approvedAt time buckets, taintAtDraftTime. Router correctly injects tenant_id from context (RLS boundary). Spec test present at `draft-audit.router.spec.ts`.

**ApprovalCardPresenter (AgentDraftCard):** **P0 — ABSENT.** No component exists at `packages/ui/src/components/agent-draft-card.tsx` or anywhere under `packages/ui/`. The `@future/ui` package has no agent-related components.

**TenantApprovalPolicy:** Shape implemented in `draft-types.ts:71`. MVP fields (tier_overrides_by_tool, approval_ttl_override_hours, approver_escalation_rule) present.

**ExecuteApprovedDraftWorker:** Contract roughly matches §4. Idempotence via atomicTransitionToExecuted implemented. Delegation active-status check implemented. Permission widening audit emitted. **P0 gap:** `approval_freshness` field is received in the job payload but never acted on — no domain revalidation step.

**DraftExpirySweeper:** Matches §4. Runs on `*/15 * * * *` (every 15 min, plan says hourly or daily — functionally more aggressive, not a violation).

### §6 Requirements

| Req      | Status                                                      | Note                                                                             |
| -------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| R-08.1   | Likely met (depends on sub-agent runner wiring)             | DraftProposer.propose() callable                                                 |
| R-08.2   | **P0 FAIL**                                                 | provenance.user_utterance = ''; derived_from_tainted_sources = [] always         |
| R-08.3   | Met                                                         | permissionEnvelopeAtDraftTime defaults to {} (never null)                        |
| R-08.4   | Met                                                         | DraftTierClassifier rule 2 correct                                               |
| R-08.5   | Met (structurally)                                          | turn ends at draft submitted, no blocking wait in proposer                       |
| R-08.6   | Unverified — plan 06 (streaming) is In Progress             | INFO                                                                             |
| R-08.7   | Met (DraftSink posts to notifications for high-risk)        |                                                                                  |
| R-08.8   | Unverified — no approve tRPC handler found in agents module | P1 unverified                                                                    |
| R-08.9   | Met                                                         | ApprovalExecutorDelegationMinter.mintForDraft() implemented                      |
| R-08.10  | Met                                                         | DraftProposer verifies existing delegation for scheduled context                 |
| R-08.11  | Met (structurally)                                          | worker executes under delegator, not approver                                    |
| R-08.12  | Met                                                         | worker verifies delegation.status === 'active'                                   |
| R-08.13  | Unverified                                                  | execute-time canDo comparison not wired; worker compares delegation scope fields |
| R-08.14  | Met                                                         | isPermissionEnvelopeWidened() + audit event                                      |
| R-08.15  | Partially met                                               | no canDo re-check; relies on delegation scope comparison                         |
| R-08.16  | **P0 FAIL**                                                 | approvalFreshness ignored in worker — no domain revalidation                     |
| R-08.17  | Met (type only)                                             | accept-stale declared but no explicit path                                       |
| R-08.18  | Unverified                                                  | drift test depends on plan 01 tool-meta                                          |
| R-08.19  | Met                                                         | default 72h TTL                                                                  |
| R-08.20  | Met (via tool meta field)                                   |                                                                                  |
| R-08.21  | Met                                                         | shorter TTL accepted via approvalTtlHours                                        |
| R-08.22  | Met                                                         | sweeper marks expired, emits audit, notifies                                     |
| R-08.23  | **P0 FAIL**                                                 | provenance fields user_utterance and derived_from_tainted_sources not populated  |
| R-08.24  | **P0 FAIL**                                                 | project_to_schema sanitization absent from proposer                              |
| R-08.25  | **P0 FAIL**                                                 | AgentDraftCard not implemented in @future/ui                                     |
| R-08.25a | **P1 FAIL**                                                 | Scheduled summary-lint job absent                                                |
| R-08.26  | **P0 FAIL**                                                 | No AgentDraftCard implemented                                                    |
| R-08.27  | **P0 FAIL**                                                 | No AgentDraftCard implemented                                                    |
| R-08.28  | **P0 FAIL**                                                 | agent.draft_approved, agent.draft_rejected, agent.draft_execution_failed missing |
| R-08.29  | Partial                                                     | emitted events miss approved_by, via_schedule fields                             |
| R-08.30  | Met                                                         | DraftAuditQueryFacade supports taint_at_draft_time dimension                     |
| R-08.30a | Met                                                         | draft-audit.router.ts implements compliance query facade                         |
| R-08.31  | Met (via lint runner)                                       | flow-policy key uniqueness enforced at lint time                                 |
| R-08.32  | Met                                                         | FlowPolicyResolver most-strict-wins                                              |
| R-08.33  | Unverified                                                  | depends on gateway pipeline wiring (plan 01)                                     |
| R-08.34  | Met                                                         | agent_draft.flow_id column present                                               |
| R-08.35  | Unverified                                                  | build-time check not confirmed beyond lint                                       |
| R-08.36  | **P0 FAIL**                                                 | No domain allowlist / feature flag enforcement found                             |

### §8 Observability Surface

**P1 — ALL PLAN 08 METRICS MISSING:** None of the plan 08 §8 metrics are defined in `gateway-metrics.ts` or any other file:

- `agent_draft_proposed_total{tenant_id, tier, tool_name}`
- `agent_draft_approved_total{tenant_id, tier, time_to_approval_bucket}`
- `agent_draft_rejected_total{tenant_id, tier, reason}`
- `agent_draft_expired_total{tenant_id, tier, ttl}`
- `agent_draft_executed_total{tenant_id, tier, outcome}`
- `agent_permission_widened_between_draft_and_execute_total{tenant_id}`
- `agent_approval_inbox_depth{tenant_id, approver_bucket}`
- `agent_draft_ttl_utilized_ratio`

**P1 — ALL PLAN 08 SPANS MISSING:** No OTel span creation in draft-proposer, draft-tier-classifier, approval-executor-delegation-minter, draft-sink, or execute-approved-draft workers.

**Audit events status:**

- `agent.draft_proposed` — PRESENT (`draft-sink.ts:67`)
- `agent.draft_expired` — PRESENT (`sweep-expired-drafts.ts:37`)
- `agent.draft_executed` — PRESENT (`execute-approved-draft.ts:144`)
- `agent.draft_approved` — **ABSENT** (P0)
- `agent.draft_rejected` — **ABSENT** (P0)
- `agent.draft_execution_failed` — **ABSENT** (P0)
- `permission_widened_between_draft_and_execute` — PRESENT (`execute-approved-draft.ts:115`)

### §11 Testing Strategy

**Unit tests:** DraftTierClassifier (8 scenarios, comprehensive). DraftProposer (mock-based, limited). DraftSink (mock-based). ExecuteApprovedDraftWorker (6 scenarios: happy path, idempotence, delegation expired/not-found, permission widened, atomic-transition race). DraftExpirySweeper (spec exists). FlowPolicyResolver (spec exists).

**Integration tests:** **P1 — ABSENT.** No integration tests found for plan 08 scenarios against real DB: taint bump end-to-end, utterance sanitization, permission widened/narrowed, TTL expiry with real clock, compliance query facade cross-tenant isolation.

**Property tests:** Absent.
**E2E tests:** Absent (Playwright).
**Fixtures:** Absent (no fixtures/drafts/ directory found).

### §12 Acceptance Criteria Status

| Criterion                                          | Status                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| All unit + integration + property + E2E tests pass | FAIL — integration, property, E2E absent                                   |
| §18.2 taint-propagates-across-approval E2E test    | FAIL — absent                                                              |
| Provenance block always populated                  | FAIL — user_utterance and taint_sources empty                              |
| Permission-widening audit fires when expected      | PARTIAL — present in worker, absent as audit event type for draft_approved |
| TTL expiry sweeper reliable, metric emits          | FAIL — metric absent                                                       |
| Cross-tenant isolation                             | FAIL — RLS not enforced                                                    |
| Double-execute idempotence                         | PASS — atomicTransitionToExecuted                                          |
| AgentDraftCard only rendering path                 | FAIL — component absent                                                    |
| Summary-lint job on seeded corpus                  | FAIL — absent                                                              |
| DraftAuditQueryFacade dimensions queryable + RLS   | PARTIAL — facade present, RLS not enforced at DB level                     |
| Tenant policy upgrade enforced; downgrade ignored  | PASS                                                                       |

---

## Plan 09 — Async Agents (In Progress)

### §3 Data Model

**agent_schedule** (`apps/api/src/modules/agents/infrastructure/schema/agent-schedule.schema.ts`)

- All required columns present: id, tenant_id, kind, owner_user_id, created_by, trigger_kind, cron_expression, event_subscription, prompt, delegation_id, cost_ceiling_daily_usd, invocation_ceiling_daily, status, pause_reason, consecutive_failure_count, failure_alert_policy, created_at, updated_at.
- Indexes present: (tenant_id, status, trigger_kind), (tenant_id, owner_user_id, status), (tenant_id, delegation_id) — the third index is an addition beyond plan spec but acceptable.
- **P1 — MISSING RLS:** No FORCE ROW LEVEL SECURITY in migration.

**agent_schedule_run** (`apps/api/src/modules/agents/infrastructure/schema/agent-schedule-run.schema.ts`)

- All required columns present including flow_id (R-09.6d) and parent_trace_id (R-09.27).
- **P1 — MISSING RLS:** No FORCE ROW LEVEL SECURITY in migration.

**pg-boss job shape:** `scheduled-turn-contracts.ts` verified — payload includes all fields from §3: tenant_id, user_on_behalf_of, actor_principal, schedule_id, delegation_id, flow_id, taint_seeded, cost_ceiling_remaining_usd, invocation_ceiling_remaining, pinned_versions, fired_by, event_payload?

**autonomous_writes_allowed column:** Present in `core.agent_delegation` (kernel schema line 45). Default false. Correctly ignored at MVP per R-09.6c.

### §4 Interface Contracts

**ScheduleRepository:** `schedule-repository.ts` implements create, pause, resume, delete, listForUser, listForTenant, update. Contract matches §4.

**SchedulerPrincipal:** `scheduler-principal.ts` implemented. Resolves actorPrincipal + userOnBehalfOf correctly for personal vs. tenant-wide.

**ScheduledTurnSpawner:** `scheduled-turn-spawner.ts` implements all §5 prechecks (schedule active, delegation active, invocation ceiling, cost ceiling, taint seed, pinned versions, flow_id generation, enqueue). **P0 gap:** R-09.28 cross-tenant event tenant filter is absent.

**ScheduledTurnWorker:** `scheduled-turn-worker.ts` validates schedule + delegation, creates schedule_run, emits dry-run audit. **P0 gap:** The full turn pipeline is NOT invoked — the worker is an MVP stub that emits a dry-run audit and immediately marks the run 'completed'. This means R-09.6a (read-only gateway enforcement) cannot be tested in production because no turn actually runs.

**DelegationLifecycle:** Fully implemented including create (max-active, rate limit, 180d cap, tool drift check), revoke, listActive, sweepExpired (pauses dependent schedules), handleUserOffboarding (revoke + pause + audit + notify). R-09.24b scope-drift narrowing implemented.

**TaintSeedDetector:** Conservative heuristic implemented. Returns true for event-triggered schedules with user-authored event types or payload fields.

**ScheduleUiFacade:** `schedule-ui-facade.ts` implements list, create, pause, resume, delete, update, cancelRun, listDelegations, revokeDelegation. **P1 gap:** No canDo permission gates implemented per R-09.23.

### §6 Requirements

| Req      | Status                                  | Note                                                                                                                                                                                                   |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-09.1   | Met                                     | personal + tenant-wide sub-cases                                                                                                                                                                       |
| R-09.2   | Met                                     | delegation carries delegator_user_id                                                                                                                                                                   |
| R-09.3   | Met                                     | tenant-wide uses agent:scheduler principal                                                                                                                                                             |
| R-09.4   | Met                                     | job payload carries on_behalf_of, via_delegation, via_schedule                                                                                                                                         |
| R-09.5   | Met                                     | pg-boss carries delegation_id, not credentials                                                                                                                                                         |
| R-09.6   | Met (MVP policy enforced via stub turn) |                                                                                                                                                                                                        |
| R-09.6a  | **P0 FAIL**                             | read-only policy envelope not enforced; turn pipeline not invoked                                                                                                                                      |
| R-09.6b  | Met                                     | feature.agent.async_autonomous_writes = false constant                                                                                                                                                 |
| R-09.6c  | Met                                     | autonomous_writes_allowed column present, ignored                                                                                                                                                      |
| R-09.6d  | Met                                     | flow_id in job payload and schedule_run row                                                                                                                                                            |
| R-09.6e  | Met                                     | TaintSeedDetector.shouldSeedTaint returns true for event schedules                                                                                                                                     |
| R-09.7   | Unverified                              | depends on plan 08 draft-proposer wiring                                                                                                                                                               |
| R-09.8   | Met                                     | job shape complete                                                                                                                                                                                     |
| R-09.9   | Met                                     | event-triggered → taint_seeded: true in job                                                                                                                                                            |
| R-09.10  | Met                                     | worker sets taintSeeded on schedule_run row                                                                                                                                                            |
| R-09.11  | Met (structurally)                      | flow passes taint to plan 08 via job                                                                                                                                                                   |
| R-09.12  | Met                                     | spawner pre-checks invocation + cost ceilings                                                                                                                                                          |
| R-09.13  | Partial                                 | mid-turn abort requires running pipeline (see R-09.6a stub)                                                                                                                                            |
| R-09.14  | Unverified                              | daily refill job not found                                                                                                                                                                             |
| R-09.15  | Met                                     | pg-boss retry uses pinned_versions from original job                                                                                                                                                   |
| R-09.16  | Met                                     | pinned_versions: {router_version, sub_agent_version, tool_meta_version, model_id}                                                                                                                      |
| R-09.17  | Met                                     | cancelRun in ScheduleUiFacade                                                                                                                                                                          |
| R-09.18  | Met                                     | pause sets status; spawner checks status=active                                                                                                                                                        |
| R-09.19  | Partial                                 | delete sets status=deleted; delegation revocation not confirmed                                                                                                                                        |
| R-09.20  | Met                                     | DELEGATION_MAX_ACTIVE = 10                                                                                                                                                                             |
| R-09.21  | Met                                     | rate limiter check for schedule_creations/user/day                                                                                                                                                     |
| R-09.22  | Met                                     | DELEGATION_MAX_DAYS = 180; cap enforced in create()                                                                                                                                                    |
| R-09.23  | **P1 FAIL**                             | canDo gates deferred                                                                                                                                                                                   |
| R-09.24  | Met                                     | sweepExpired pauses dependent schedules, notifies                                                                                                                                                      |
| R-09.24a | Met                                     | handleUserOffboarding implemented                                                                                                                                                                      |
| R-09.24b | Met                                     | tool drift warning + scope narrowing                                                                                                                                                                   |
| R-09.25  | Partial                                 | schedule_created, schedule_run_started, schedule_run_completed, delegation_revoked, delegation_expired emitted. schedule_paused, schedule_resumed, schedule_deleted, schedule_run_failed not confirmed |
| R-09.26  | Met                                     | agent_schedule_run row per turn                                                                                                                                                                        |
| R-09.27  | Met                                     | parent_trace_id column on schedule_run; schedule_run_started payload includes trace link                                                                                                               |
| R-09.28  | **P0 FAIL**                             | No cross-tenant event router filter                                                                                                                                                                    |
| R-09.29  | Met                                     | consecutiveFailureCount tracking; auto-pause at count=3                                                                                                                                                |
| R-09.30  | Met                                     | failure_alert_policy per schedule; owner/admin logic in worker                                                                                                                                         |
| R-09.31  | **P1 FAIL**                             | max_active_schedules not implemented                                                                                                                                                                   |
| R-09.32  | **P1 FAIL**                             | scheduled_spend_daily_limit_usd not implemented                                                                                                                                                        |

### §8 Observability

**P1 — ALL PLAN 09 METRICS MISSING.** No plan 09 schedule/delegation metrics found in any metrics file. Complete list missing:
`agent_schedule_fire_total`, `agent_schedule_active_count`, `agent_schedule_run_duration_ms`, `agent_delegation_active_count`, `agent_delegation_expired_total`, `agent_delegation_creations_total`, `agent_async_taint_seeded_total`, `agent_schedule_ceiling_exhausted_total`, `agent_schedule_consecutive_failure_pause_total`, `agent_schedule_tenant_spend_pause_total`, `agent_schedules_revoked_on_offboarding_total`, `agent_delegation_scope_drift_total`, `agent_event_router_cross_tenant_rejected_total`.

**Spans:** SCHEDULE:spawn, SCHEDULED_TURN:execute, DELEGATION:validate — absent from spawner and worker implementations.

**Dry-run audit:** `agent.async_dry_run_would_have_written` correctly emitted from scheduled-turn-worker with all required fields (plan §9 Beta soak data). This is a bright spot.

### §11 Testing

**Unit tests:** ScheduledTurnSpawner (ceiling, delegation, paused schedule paths). ScheduledTurnWorker (consecutive failure escalation, dry-run audit, delegation expired). DelegationLifecycle (max-active, rate limit, 180d cap, tool drift, offboarding). TaintSeedDetector. SchedulerPrincipal. All present and reasonably comprehensive.

**Integration tests:** **P1 — ABSENT.** No cross-tenant event-router test, no delegation scope drift integration test, no consecutive-failure escalation with real DB, no tenant spend cap test.

**Property tests:** Absent.
**E2E tests:** Absent.
**Fixtures:** Exist in schema test form but not as the `fixtures/schedules/*.ts` files specified in §11.

### §12 Acceptance Criteria

| Criterion                                                     | Status                                         |
| ------------------------------------------------------------- | ---------------------------------------------- |
| All unit + integration + property + E2E tests pass            | FAIL — integration layers absent               |
| Delegation-not-impersonation verified in audit trail          | PASS (structurally correct)                    |
| Taint-seeded turns bump drafts                                | PARTIAL — wired, but turn pipeline not running |
| Max-active + rate-limit + 180d enforced                       | PASS                                           |
| Version pinning across retries                                | PASS                                           |
| Scheduled-turn trace correlation (parent_trace_id)            | PASS                                           |
| Cross-tenant isolation (payload + RLS)                        | FAIL — R-09.28 absent, RLS missing             |
| Event-router tenant filter rejects all cross-tenant (R-09.28) | FAIL — not implemented                         |
| User offboarding flow                                         | PASS                                           |
| Delegation scope-drift validation                             | PASS                                           |
| Consecutive-failure escalation                                | PASS                                           |
| Tenant active-schedule cap + tenant spend cap                 | FAIL — R-09.31/32 not implemented              |

---

## Plan 15 — Governance Authoring Lints (In Progress)

### §3 Data Model (None — governance is authoring-time)

No DB tables required. Lint config, review checklist template, and override audit script all present per §3.

### §4 Interface Contracts

**LintRule, LintContext, LintResult:** All defined in `tools/lint/agent-authoring/types.ts`. Contract matches §4.

**Lint runner:** `runner.ts` implements `runLinter({ singleFile?, verbose? })` returning `LinterRunResult`. EI-10 glob (`apps/api/src/modules/*/agent/**/*.ts`) correct. Per-file and aggregated rule passes both present. Exit non-zero on error-severity findings implemented.

**PR review bot:** `pr-agent-review-bot.yml` triggers on PR open/synchronize/reopened. Correctly detects agent file changes via regex, posts checklist from `tools/lint/agent-authoring/review-checklist.md`. Update-existing-comment logic present (idempotent re-post). Contract matches §4.

**Override grammar:** `// lint-override: <rule-id> — <justification>` pattern parsed by `override-applier.ts`. Min-20-char justification enforced by `override-justification.ts` rule.

### §6 Requirements

| Req     | Status | Note                                                                                                                                                                                |
| ------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-15.1  | Met    | tool-meta-when-to-use.ts; min 80 chars (locked in config per §18) + action verb                                                                                                     |
| R-15.2  | Met    | tool-meta-when-not-to-use.ts; placeholder string rejection                                                                                                                          |
| R-15.3  | Met    | tool-meta-examples-negative.ts; negative example required                                                                                                                           |
| R-15.4  | Met    | sub-agent-quality.ts; mirrors R-15.1/R-15.2 on sub-agent surface                                                                                                                    |
| R-15.5  | Met    | intent-slug-uniqueness.ts; error severity                                                                                                                                           |
| R-15.6  | Met    | flow-policy-key-uniqueness.ts; error severity                                                                                                                                       |
| R-15.7  | **P2** | Severity config entry exists but no dedicated rule implementation                                                                                                                   |
| R-15.8  | Met    | pr-agent-review-bot.yml triggers on agent file PRs; checklist contains all required sign-offs (taint, compositionSensitive, whenToUse, whenNotToUse, golden-trace, authoring tenet) |
| R-15.9  | Met    | tool-meta-contradiction.ts; warning severity                                                                                                                                        |
| R-15.10 | Met    | sub-agent-golden-trace-gate.ts; error severity; Git rename detection described in §7                                                                                                |
| R-15.11 | Met    | override-justification.ts; error severity                                                                                                                                           |
| R-15.12 | **P2** | Quarterly audit script (audit-overrides.ts) exists but no scheduled CI workflow                                                                                                     |

### §8 Observability

- CI step `Agent authoring lints` present in `ci.yml:29` — lint runtime is observable from CI logs.
- No dashboarding of per-rule firing frequency or override counts per month as §8 specifies. This is an authoring-time concern without a live metrics backend — acceptable given MVP scope.

### §11 Testing

All rules have co-located `.spec.ts` files (TDD compliant). Tests verified: tool-meta-when-to-use.spec.ts, tool-meta-when-not-to-use.spec.ts, tool-meta-examples-negative.spec.ts, tool-meta-contradiction.spec.ts, sub-agent-quality.spec.ts, intent-slug-uniqueness.spec.ts, flow-policy-key-uniqueness.spec.ts, override-justification.spec.ts, sub-agent-golden-trace-gate.spec.ts, audit-overrides.spec.ts, override-applier.spec.ts, file-parser.spec.ts, runner.spec.ts.

### §12 Acceptance Criteria

| Criterion                                              | Status                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| All 12 R-15.x rules enabled in CI                      | PARTIAL — R-15.7 has severity config entry but no rule impl     |
| Full lint run < 30s                                    | Unverified (no CI timing data)                                  |
| Lint run passes on MVP modules after warning phase     | Unverified                                                      |
| PR review bot posts on seeded test PR                  | Implemented; unverified in live CI                              |
| Override-audit tooling produces per-rule count report  | PASS (audit-overrides.ts exists with spec)                      |
| Synthetic-module fixture demonstrates EI-10            | Unverified — no \_synthetic module fixture found in test output |
| New-sub-agent gate blocks PR without golden-trace      | PASS (sub-agent-golden-trace-gate.spec.ts)                      |
| Rule-severity config change without touching rule code | PASS (config.ts is the sole source)                             |

---

## Intra-Cluster Cross-Plan Observations

### 1. Provenance Chain Broken (P08 → P09)

Plan 08 R-08.2 and plan 09 R-09.6e are tightly coupled via taint propagation. The `derived_from_tainted_sources` field is never populated in DraftProposer (plan 08 P0), which means async-spawned tainted turns (plan 09 R-09.6e) produce drafts with no provenance taint record even though the scheduler correctly sets `taint_seeded: true` on the job.

### 2. RLS Gap is Cross-Plan

The missing FORCE ROW LEVEL SECURITY on agent_draft, agent_schedule, agent_schedule_run, and agent_delegation is a structural gap affecting plans 08, 09, and the compliance query surface of plan 08 (R-08.30a). All three plans' §12 cross-tenant acceptance criteria fail at the DB layer.

### 3. Plan 15 Lints Cannot Cover Missing Plan 08 UI Artifacts

The AgentDraftCard (plan 08 R-08.25) is a UI component that plan 15 governance does not lint (plan 15 scope is `modules/*/agent/**`, not `packages/ui/`). The lint protocol has no mechanism to catch the absence of the presenter component. The §12 acceptance criterion "AgentDraftCard presenter is the only rendering path (lint/review-enforced)" relies on human review via the plan 15 checklist, not an automated rule.

### 4. Worker Stub (P09) Undermines Plan 08 Draft-to-Inbox

Plan 09's ScheduledTurnWorker is an MVP stub that does not invoke the turn pipeline (P0 finding). This means async-originated drafts that plan 08 §1 claims to handle ("Draft-to-inbox at MVP (day 1)") cannot be produced by async scheduled turns in production. Only live-session drafts are currently functional end-to-end.

### 5. Plan 15 CI Is Correctly Wired — a Positive Finding

The `ci.yml` correctly runs `bun run lint:agent-authoring` in the CI pipeline (line 29). The `pr-agent-review-bot.yml` is structurally correct for posting the checklist. The review checklist itself (`review-checklist.md`) includes all required sign-off items (taint declaration, compositionSensitive, whenToUse/whenNotToUse, golden-trace, authoring tenet). Plan 15 is the most complete of the three plans.

---

## Output Artifacts

- Narrative: `/Users/canh/Projects/Seta/future/docs/agents/audit/2026-04-26-cluster-4-drafts-async-governance.md`
- Findings JSON: `/Users/canh/Projects/Seta/future/docs/agents/audit/findings/cluster-4.json`
