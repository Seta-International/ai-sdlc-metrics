# 09 — Async Agents + Scheduling (Read-only + Notify + Draft-to-Inbox)

**Design §§:** §11 (Async Agents), §10 (drafts integration), §13 (per-delegation cost caps).

## Revision 2026-04-22

Production-ready-comprehensive revision against the 2026-04-22 cut of `docs/architecture/agent-runtime.md`. MVP scope is narrowed to **read-only + draft-to-inbox only**: async turns cannot execute mutations directly; any mutation intent yields a draft that routes through plan 08 to the initiator's inbox. Delegation-signed autonomous writes are structurally plumbed in MVP (the carrier exists) but are flag-gated off behind `feature.agent.async_autonomous_writes` (default off). Activation is Beta-gated per §16: **4 weeks of incident-free async draft-to-inbox on ≥2 tenants AND approval-rate ≥95%** on the async draft stream. `flow_id` is stamped on every pg-boss async job row; async-spawned drafts inherit the `flow_id` and correlate back to the scheduling origin trace via `parent_trace_id` (plan 07). Taint seeding at job spawn (already in §2) is unchanged. 18-section structure preserved; patches are additive.

---

## 1. Scope

### In

**MVP scope (narrowed 2026-04-22):**

- Scheduled async turns (pg-boss cron + event-triggered spawns).
- Read-only tool invocations only.
- Draft-to-inbox creation — async turns draft; the initiator (personal-schedule owner or tenant-wide recipient set) surfaces and approves the draft via plan 08.
- Delegation grant plumbing — the pg-boss job carries the delegation_id as a **carrier** for Beta; at MVP the carrier exists but does not sign autonomous writes.
- Taint propagation across the async boundary (unchanged from §2).
- `flow_id` stamped on every pg-boss async job row; async-spawned drafts inherit the `flow_id` and correlate back to the scheduling origin trace.

**Structural (shipped at MVP; active across phases):**

- pg-boss-backed scheduled agent turns.
- Two identity models: personal-schedule delegation + tenant-wide scheduler principal.
- Delegation grant minting at schedule creation (personal); tenant-admin-approved grants (tenant-wide).
- pg-boss job row shape carrying `{ tenant_id, user_on_behalf_of?, actor_principal, schedule_id, delegation_id, taint_seeded, cost_ceiling_remaining, invocation_ceiling_remaining, pinned_versions }`.
- Taint seeding at job spawn when trigger content is tenant-authored.
- Per-delegation cost + invocation ceilings enforced pre-spawn.
- Version pinning across retries (pg-boss retry hits the same versions).
- Schedule CRUD interface + admin UI stubs.
- Cancellation (per-run cancel + schedule pause/delete).
- Delegation lifecycle invariants (max-active, creation rate limit, auto-expire).
- Cleanup sweeps for orphaned delegations, stale schedules.

### Out

- **Autonomous writes (delegation-signed executions without user review).** Deferred to Beta per §16 activation gate. The code path exists structurally behind `feature.agent.async_autonomous_writes` (default off) so the flag flip is the entire rollout; no re-plumbing at Beta.
- Event-triggered schedules firing on domain events (can ship as MVP but complex integration — captured here as "firable by event or cron" interface; event routing lives in the triggering domain).
- Schedule admin UI implementation (interface stubs here; UI in `web-admin`).
- Natural-language schedule creation ("every Friday at 5pm" → cron) — product/UX concern.

---

## 2. Design Context

**Delegation, not impersonation.** The foundational security principle (§11, Tenet #4). When an async agent runs on behalf of a user without a live session (scheduled task, approved-draft execution), it carries a kernel-owned scoped grant — never copied credentials. The delegation is revocable, time-bounded, and audited. Mastra has no equivalent; their async runs are just workflow invocations with no identity model.

**Two identity sub-cases:**

1. **Personal schedules** — "draft my timesheet every Friday." Delegation: `{ delegator: user_id, delegate: 'agent:scheduler', scope: specific-task, expires_at }`. `canDo` evaluates against the delegator's permissions. Actions tagged `on_behalf_of=user_id`.

2. **Tenant-wide schedules** — "summarize all projects weekly for CEO dashboard." Runs as dedicated `agent:scheduler` principal (no `on_behalf_of`). Explicit narrow grant approved by tenant admin. Actions tagged `actor_principal=agent:scheduler`.

**v1 write policy: read-only + notify + draft-to-inbox.** Regardless of what the delegation structurally permits, async agents do NOT autonomously write at MVP. Drafts go to approval inbox via plan 08; the user sees them and approves manually. Caps unattended-write blast radius at zero until eval coverage and incident data support trust.

**Taint across the async boundary.** If an event-triggered schedule fires due to tenant-authored content (project closing note, ticket comment), `taint_seeded: true`. The async turn starts tainted. Without this, async silently bypasses the write-approval bump. Gateway enforces regardless (defense in depth from plan 08), but seeding at job spawn makes the signal explicit.

**Per-delegation cost + invocation ceilings enforced before pg-boss spawns the LLM turn.** Event-triggered schedules can misfire catastrophically (bad filter → 10k fires/day → runaway LLM bill); pg-boss concurrency limits alone don't catch spend. A misbehaving delegation self-limits.

**Version pinning across retries.** pg-boss retry hits the same versions pinned at original spawn, even if production rollout advanced mid-job. Same discipline as single-trace-id rule — reproducibility of the specific job matters more than "use latest."

**Delegation lifecycle invariants:**

- Max 10 active delegations per user (default).
- Schedule/delegation creation rate limit (plan 05 R-05.25): 5 per user per day.
- Auto-expire grants older than 180d regardless of stated expiry.
- Admin UI shows all active grants per user.

**What this is NOT:** a general scheduling framework or a workflow engine. It's a constrained async-turn surface with delegation semantics.

**Prior-art review — what was adopted and what was rejected.** Claude Code's scheduling substrate (`tools/ScheduleCronTool/`, `cronScheduler.ts`, `hooks/useScheduledTasks.ts`, `remote/RemoteSessionManager.ts`) was reviewed as prior art. Three patterns are confirmed aligned: (a) structured payload serialization at enqueue time — not "run this shell command later"; (b) version pinning + retry idempotency (our pinned_versions are stricter — router, sub-agent, tool_meta, model_id — because Claude Code is single-process single-user and can assume stable versions); (c) explicit identity attribution via `RequestContext` rather than credential copy. Four patterns were explicitly **rejected** because they fit a developer's laptop, not a multi-tenant multi-pod SaaS: (i) **File-based task storage** (`.claude/scheduled_tasks.json`) — we use Postgres + RLS; file storage has no tenant isolation and doesn't survive pod restart. (ii) **Process-local scheduling loop** (1s setInterval in the REPL) — incompatible with autoscaling ECS; scheduling must be server-side via pg-boss. (iii) **Raw command-string scheduling** — our schedules carry structured payload (`prompt`, `delegation_id`, `pinned_versions`, `taint_seeded`), never raw shell or prompt strings. (iv) **Per-task `durable` flag** — all schedules are durable by default; two-tier persistence invites drift.

---

## 3. Data Model

### `agent_schedule`

- `id UUID PK`.
- `tenant_id UUID` (RLS).
- `kind TEXT` — `'personal' | 'tenant_wide'`.
- `owner_user_id UUID?` — set for personal; NULL for tenant-wide (admin is the creator in a separate audit row).
- `created_by UUID` — always populated.
- `trigger_kind TEXT` — `'cron' | 'event'`.
- `cron_expression TEXT?` — for cron-kind; UTC.
- `event_subscription JSONB?` — for event-kind; `{ event_type, filter }`.
- `prompt TEXT` — the fixed user-utterance-equivalent that drives the scheduled turn.
- `delegation_id UUID` — FK to `agent_delegation`; minted at schedule creation.
- `cost_ceiling_daily_usd NUMERIC(10,2)` — per-delegation daily budget.
- `invocation_ceiling_daily INT` — max fires per day.
- `status TEXT` — `'active' | 'paused' | 'deleted'`.
- `pause_reason TEXT?` — set when `status='paused'`; values include `'owner_requested' | 'delegation_expired' | 'owner_offboarded' | 'tenant_spend_exhausted' | 'consecutive_failures' | 'admin_intervention'`.
- `consecutive_failure_count INT DEFAULT 0` — incremented on each run failure, reset on success. Drives R-09.29 escalation.
- `failure_alert_policy TEXT DEFAULT 'owner_and_admin'` — `'owner' | 'owner_and_admin' | 'admin_only' | 'silent'`. Set per-schedule at creation; admin can override tenant-wide default via `admin_tenant_config.default_schedule_failure_alert_policy`.
- `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`.
- Index: `(tenant_id, status, trigger_kind, cron_expression)`, `(tenant_id, owner_user_id, status)`.

### `agent_schedule_run`

- `id UUID PK`.
- `schedule_id UUID FK`.
- `tenant_id UUID` (RLS).
- `trace_id UUID`.
- `pg_boss_job_id TEXT` — for correlation with pg-boss internal state.
- `started_at TIMESTAMPTZ`, `ended_at TIMESTAMPTZ?`.
- `outcome TEXT` — `'completed' | 'refused' | 'budget' | 'error' | 'cancelled_per_run' | 'cancelled_schedule_paused'`.
- `taint_seeded BOOLEAN`.
- `pinned_versions JSONB` — `{ router_version, sub_agent_version, tool_meta_version, model_id }`.
- `cost_spent_usd NUMERIC(12,6)`.
- `fired_by TEXT` — `'cron' | 'event:<type>'`.
- Index: `(schedule_id, started_at DESC)`, `(tenant_id, trace_id)`.

### `agent_delegation` (kernel-owned; relevant)

Schema owned by kernel. Approval-executor delegation (plan 08) already defined; this plan consumes the same table with `delegate = 'agent:scheduler'` for schedules.

- `id UUID PK`.
- `tenant_id UUID`.
- `delegator_user_id UUID?` — NULL for tenant-wide.
- `delegate TEXT` — `'agent:scheduler'`.
- `scope JSONB` — `{ schedule_id, permitted_tools, permitted_domains, notes }`. **Delegation-grant carrier (MVP):** at MVP the carrier is present on every async job but does not yet sign autonomous writes; enforcement to draft-to-inbox-only is done at the worker/gateway boundary (§5, R-09.6a).
- `expires_at TIMESTAMPTZ`.
- `status TEXT` — `'active' | 'expired' | 'revoked'`.
- `autonomous_writes_allowed BOOLEAN DEFAULT false` — **autonomous-write gating field.** Exists in MVP schema; ignored at MVP because `feature.agent.async_autonomous_writes` is off globally. When the feature flag activates at Beta, this per-delegation field becomes the second authorization factor (flag on + field true). Populated at delegation creation; admin-auditable per R-09.23.
- `created_at TIMESTAMPTZ`.
- `max_active_per_user INT` — config; default 10.

### pg-boss job (schema owned by pg-boss; payload shape below)

Queue name: `agent.scheduled-turn`.

Payload:

```
{
  tenant_id: UUID;
  user_on_behalf_of: UUID | null;       // null for tenant-wide
  actor_principal: 'user' | 'agent:scheduler';
  schedule_id: UUID;
  delegation_id: UUID;                   // carrier; MVP does not use it to sign autonomous writes
  flow_id: string;                       // stamped at spawn; async-spawned drafts + turn-start audit correlate via this
  taint_seeded: boolean;
  cost_ceiling_remaining_usd: number;   // at spawn time
  invocation_ceiling_remaining: number;
  pinned_versions: {
    router_version: string;
    sub_agent_version: string;
    tool_meta_version: string;
    model_id: string;
  };
  fired_by: 'cron' | `event:${string}`;
  event_payload?: unknown;               // only for event-kind
}
```

---

## 4. Interface Contracts

### `ScheduleRepository`

```
create(opts: {
  tenantId; createdBy;
  kind: 'personal' | 'tenant_wide';
  ownerUserId?: UUID;              // required for personal
  triggerKind: 'cron' | 'event';
  cronExpression?: string;
  eventSubscription?: { eventType: string; filter: unknown };
  prompt: string;
  delegationScope: DelegationScope;
  costCeilingDailyUsd: number;
  invocationCeilingDaily: number;
}): Promise<{ schedule: Schedule; delegation: Delegation }>

pause(opts: { tenantId; scheduleId }): Promise<void>
resume(opts: { tenantId; scheduleId }): Promise<void>
delete(opts: { tenantId; scheduleId }): Promise<void>
listForUser(opts: { tenantId; userId }): Promise<Schedule[]>
listForTenant(opts: { tenantId }): Promise<Schedule[]>  // admin view
```

### `SchedulerPrincipal`

```
// Resolves the effective identity for a scheduled run at spawn time.
resolve(opts: { schedule: Schedule; delegation: Delegation }): {
  actorPrincipal: 'user' | 'agent:scheduler';
  userOnBehalfOf: UUID | null;
  delegationId: UUID;
  canDoBasis: 'delegator' | 'scheduler';
}
```

### `ScheduledTurnSpawner` (runs on cron trigger + event subscription)

```
spawn(opts: {
  schedule: Schedule;
  firedBy: 'cron' | `event:${string}`;
  eventPayload?: unknown;
}): Promise<{ spawned: boolean; reason?: 'rate_limited' | 'ceiling_exhausted' | 'delegation_expired' | 'paused' }>
```

Steps (§5 control flow) — all pre-checks fail before the pg-boss job is enqueued.

### `ScheduledTurnWorker` (pg-boss consumer)

```
handle(job: ScheduledTurnJob): Promise<void>
// Runs an agent turn with pinned versions, read-only policy, and taint seeding.
```

### `DelegationLifecycle`

```
create(opts: { tenantId; delegatorUserId?; delegate; scope; expiresAt }): Promise<Delegation>
// Enforces:
//  - max-active per user
//  - rate limit (plan 05 R-05.25)
//  - auto-expire ≤ 180d regardless of requested expires_at
//  - scope.permitted_tools each resolvable against current tRPC registry — unknown tools log a drift warning (not a failure); the effective scope narrows to intersecting tools only. Admin audit captures the mismatch so stale grants can be renewed.
revoke(opts: { tenantId; delegationId; reason: string }): Promise<void>
listActive(opts: { tenantId; userId? }): Promise<Delegation[]>
sweepExpired(): Promise<{ expiredCount: number }>  // scheduled cron
handleUserOffboarding(opts: { tenantId; userId; offboardingActorId }): Promise<{
  revokedDelegationCount: number;
  pausedScheduleCount: number;
  reassignedScheduleCount: number;    // 0 at MVP — reassignment is Beta
}>
// Called by people module when a user is offboarded. Default policy:
//   - revoke all delegations with delegator_user_id = userId (status='revoked', reason='owner_offboarded')
//   - pause all personal schedules with owner_user_id = userId (status='paused', pause_reason='owner_offboarded')
//   - emit kernel audit agent.schedules_revoked_on_offboarding with full inventory
//   - notify tenant admin with summary
// Beta+: optional per-tenant policy to reassign schedules to a configured fallback owner instead of pausing.
```

### `TaintSeedDetector` (for event-triggered schedules)

```
shouldSeedTaint(opts: {
  eventType: string;
  eventPayload: unknown;
  schedule: Schedule;
}): boolean
// Heuristic: if the event payload references tenant-authored content
// (e.g. ticket.comment, project.note), seed taint.
// Conservative: default true on any user-authored payload field.
```

### `ScheduleUiFacade` (tRPC procedures for `web-admin`)

```
list(): Promise<Schedule[]>                 // scoped to tenant_admin canDo
create(input): Promise<Schedule>            // canDo('admin.schedule.create') for tenant-wide; canDo('agent.schedule.create') for personal
update(id, input): Promise<Schedule>
delete(id): Promise<void>
listDelegationsForUser(userId): Promise<Delegation[]>
revokeDelegation(delegationId): Promise<void>
```

Tenant-wide creation is gated `canDo('admin.schedule.create')`. Personal schedule creation is gated by the user's own `canDo('agent.schedule.create')`.

---

## 5. Control Flow

### Two paths (write policy)

**MVP path (active; `feature.agent.async_autonomous_writes` off):**

1. Async turn spawns — spawner stamps `flow_id` on the pg-boss payload and records it on `agent_schedule_run.flow_id`.
2. Worker hydrates `RequestContext` and runs the gateway pipeline under a **read-only policy envelope**: the gateway refuses to dispatch any tool whose meta declares `mutation: true` for direct execution.
3. Any mutation intent produced during the turn is coerced into a **draft-to-inbox** via plan 08 — never an execution. The draft inherits the job's `delegation_id` (as author of record) and `flow_id` (for correlation).
4. Kernel audit records the turn-start, every draft creation, and the turn-end outcome. Notification to the initiator surfaces the draft for manual approval.

**Beta path (gated off at MVP; structural plumbing present):**

1. Same spawn + hydrate.
2. If `feature.agent.async_autonomous_writes` is on AND `agent_delegation.autonomous_writes_allowed = true` AND tool is within the delegation's `permitted_tools`: the gateway permits delegation-signed autonomous execution on the first low-risk tier. Higher tiers still draft.
3. At MVP, both flags resolve off → path 2 is structurally unreachable; the worker emits a **dry-run audit** (§9) recording the would-have-executed tool so the soak period has data to judge the Beta activation gate.

### Schedule creation (personal)

1. User opens `web-admin` schedule UI → fills form: cron, prompt, scope (which tools/domains).
2. UI calls `ScheduleUiFacade.create(...)`.
3. Facade validates:
   a. `canDo('agent.schedule.create')` for user.
   b. Rate limit: `RateLimiter.check({ limitKey: 'schedule_creations/user/day' })` — refuse if exceeded.
   c. Max-active check: `countActiveDelegations(userId) < 10`; refuse if at cap.
4. `DelegationLifecycle.create({ delegatorUserId, delegate: 'agent:scheduler', scope: { schedule_id: pending, permitted_tools, permitted_domains }, expiresAt: min(user_request, 180d) })`.
5. `ScheduleRepository.create(...)` — writes schedule row.
6. Update delegation scope `schedule_id` → now points to the newly-created schedule.
7. Emit kernel audit `agent.schedule_created` with actor + delegation + scope.
8. Register cron or event subscription.

### Schedule creation (tenant-wide)

1. Admin opens `web-admin` → tenant-wide schedule form.
2. Form requires explicit grant approval: admin picks which permissions the scheduler principal has (e.g. `insights.read.aggregate-only`).
3. Facade validates `canDo('admin.schedule.create')`.
4. `DelegationLifecycle.create({ delegatorUserId: null, delegate: 'agent:scheduler', scope: { schedule_id: pending, permitted_tools, permitted_domains, admin_approved_by } })`.
5. Same pattern as personal; delegation has no `delegator_user_id`.
6. Audit event includes `admin_approved_by`.

### Cron-triggered spawn

1. Cron scheduler (separate process or pg-boss scheduled jobs) fires per `agent_schedule.cron_expression`.
2. `ScheduledTurnSpawner.spawn({ schedule, firedBy: 'cron' })`:
   a. Reload schedule; verify `status = 'active'`.
   b. Verify `agent_delegation` is still `active`.
   c. Check `invocation_ceiling_daily` against today's fire count; refuse if exhausted.
   d. Check `cost_ceiling_daily_usd` against today's spend; refuse if exhausted.
   e. Apply `TaintSeedDetector.shouldSeedTaint(...)` → for cron, typically `false` (no tenant-authored event payload).
   f. Capture pinned versions from current production rollout.
   g. Enqueue pg-boss `agent.scheduled-turn` job with full payload.
3. pg-boss persists the job; worker picks up.

### Event-triggered spawn

1. Domain event fires (e.g. `ticket.comment.created`). Event carries `event.tenant_id`.
2. Event-router matches `agent_schedule.event_subscription.event_type` filters **AND enforces `event.tenant_id === schedule.tenant_id`** as a hard match requirement (R-09.28). Cross-tenant event/schedule pairings are never routed; attempted routing with a tenant mismatch is rejected and audited as a P0 candidate.
3. For each matching schedule: `ScheduledTurnSpawner.spawn({ schedule, firedBy: 'event:ticket.comment.created', eventPayload })`.
4. `TaintSeedDetector.shouldSeedTaint(...)` → typically `true` for user-authored event content.
5. Same pre-checks as cron.
6. pg-boss job payload includes `event_payload`. Worker re-validates `tenant_id` match on first DB read (belt-and-suspenders).

### Worker execution

1. pg-boss worker picks up `agent.scheduled-turn` job.
2. Worker validates (defense in depth):
   a. Schedule still `active`.
   b. Delegation still `active`.
   c. Ceilings not exhausted.
3. Worker constructs `RequestContext` with:
   - `tenant_id`, `user_id = user_on_behalf_of` (for personal) or NULL (for tenant-wide).
   - `trace_id` (fresh UUIDv7, linked via `parent_trace_id` to schedule's creation trace).
   - `delegation_id`, `schedule_id`.
   - `pinned_versions` override — overrides the A/B stability key for this turn.
   - `turn_state.tainted = taint_seeded`.
4. Worker invokes the turn pipeline: plan 02 router + plan 03 phase execution + plan 06 stream (internal; no SSE to a client — results go to notifications).
5. Turn runs with `actor_principal='agent:scheduler'` if tenant-wide, `user` if personal.
6. Any drafts produced route through plan 08 with delegation_id already set (no synthetic-mint needed; reuse schedule's delegation).
7. Synthesizer output posted to `notifications_item` for `owner_user_id` (personal) or configured recipients (tenant-wide).
8. Record `agent_schedule_run` row with outcome, cost, usage.
9. If retry-able failure (§4 error model): pg-boss retry with same payload (versions pinned).
10. If permanent failure: schedule_run status `error`; notify owner.

### Per-delegation ceiling decrement

1. Worker accumulates cost per LLM call via plan 05 `CostRecorder`.
2. At turn end, decrement `agent_schedule.cost_ceiling_remaining_usd` atomically:
   ```
   UPDATE agent_schedule SET cost_ceiling_remaining_usd = cost_ceiling_remaining_usd - :delta WHERE id = :schedule_id AND ...
   ```
3. If the decrement would make remaining negative, MID-TURN abort fired via `systemAbortController.abort({ reason: 'budget' })` from plan 06.
4. Daily ceiling refills at midnight UTC (scheduled job).

### Schedule pause / resume / delete

- **Pause**: `agent_schedule.status = 'paused'`. Future fires suppressed; in-flight runs continue.
- **Resume**: `status = 'active'`; future fires re-enabled.
- **Delete**: `status = 'deleted'`; delegation `status = 'revoked'`; future fires suppressed. In-flight runs continue but drafts surfaced under "schedule deleted" banner.
- **Per-run cancel**: marks specific `agent_schedule_run` for cancellation via `pg-boss.cancel(job_id)`; doesn't affect schedule or delegation.

### Delegation expiry + sweep

1. `DelegationLifecycle.sweepExpired()` runs daily.
2. Finds `agent_delegation WHERE status='active' AND (expires_at < now() OR created_at + '180 days' < now())`.
3. Updates `status = 'expired'`.
4. Marks dependent schedules as `paused` with `pause_reason = 'delegation_expired'`.
5. Notifies delegator.

### User offboarding

1. People module flags a user as offboarded (terminated, left tenant, etc.).
2. People module calls `DelegationLifecycle.handleUserOffboarding({ tenantId, userId, offboardingActorId })`.
3. Revokes all delegations where `delegator_user_id = userId` (status='revoked', reason='owner_offboarded').
4. Pauses all personal schedules where `owner_user_id = userId` (status='paused', pause_reason='owner_offboarded').
5. Emits kernel audit `agent.schedules_revoked_on_offboarding` with the full inventory of revoked delegations + paused schedules + initiating actor.
6. Notifies tenant admin with a summary report (one notification, not one per schedule).
7. Admin UI surfaces a "former-owner schedules" view so admins can either keep them paused or (at Beta) reassign to a designated successor. At MVP: pause-only.

### Consecutive-failure escalation

1. Worker run completes with `outcome` in `{'error', 'refused', 'budget'}` — non-success.
2. Worker increments `agent_schedule.consecutive_failure_count` atomically.
3. If count == 1 or 2: notify per `failure_alert_policy` (default: owner + admin).
4. If count == 3: escalate — always notify admin + owner regardless of per-schedule policy, AND pause the schedule with `pause_reason='consecutive_failures'`. Rationale: three consecutive failures is almost always a config/permission drift; letting the schedule keep firing wastes LLM spend and noise-floods the inbox.
5. On any successful run, counter resets to 0.
6. Admin runbook action to resume a `consecutive_failures`-paused schedule flips `status='active'` and clears the counter.

### Tenant-wide spend exhaustion

1. Daily aggregation job sums `agent_cost_event` for the tenant across all `layer ∈ {'sub_agent:*', 'router', 'synthesizer', 'summarizer'}` where the originating turn carried `via_schedule_id`.
2. Compares against `admin_tenant_config.scheduled_spend_daily_limit_usd` (if set).
3. If exceeded: bulk-pauses all schedules in the tenant with `pause_reason='tenant_spend_exhausted'`, notifies tenant admin. Manual resume required.
4. Not a mid-run abort — enforcement is at the next spawn boundary to avoid tearing down active runs.

### Taint seeding + approval bump

1. Event-triggered schedule fires from `ticket.comment.created`; `TaintSeedDetector` returns `true`.
2. Worker sets `turn_state.tainted = true` at turn start (before any tool call).
3. Any drafted write this turn: plan 08 `DraftTierClassifier` sees taint → bumps to high_risk regardless of tool default.
4. Draft card shows "derived from tainted source" warning with the triggering event's author + content reference.

---

## 6. Requirements

### Identity model

| #      | Requirement                                                                                                                        | Design §§ |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-09.1 | Two sub-cases: personal (delegation-based) + tenant-wide (scheduler principal)                                                     | §11       |
| R-09.2 | Personal: delegation `{ delegator: user_id, delegate: 'agent:scheduler', scope, expires_at }`; `canDo` evaluates against delegator | §11       |
| R-09.3 | Tenant-wide: `agent:scheduler` principal; `canDo` against admin-approved narrow grant                                              | §11       |
| R-09.4 | All actions tagged `on_behalf_of + via_delegation + via_schedule`                                                                  | §11       |
| R-09.5 | pg-boss job carries delegation token, not copied credentials                                                                       | §11       |

### Write policy

| #       | Requirement                                                                                                                                                                                                                                         | Design §§ |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-09.6  | MVP: read-only + notify + draft-to-inbox. No autonomous writes                                                                                                                                                                                      | §11       |
| R-09.6a | Async turns cannot execute mutations directly at MVP; any mutation intent produced by the gateway is coerced into a draft-to-inbox via plan 08. Enforced at the worker/gateway boundary — refusal of any `mutation: true` tool for direct dispatch. | §11, §10  |
| R-09.6b | Feature flag `feature.agent.async_autonomous_writes` governs the Beta path. Default **off** at MVP. Activation gate: **4 weeks of incident-free async draft-to-inbox on ≥2 tenants AND approval-rate ≥95% on the async draft stream** (§16).        | §11, §16  |
| R-09.6c | `agent_delegation.autonomous_writes_allowed` column exists in MVP schema but is ignored while `feature.agent.async_autonomous_writes` is off. When the flag activates, authorization is flag-on AND per-delegation-field-true (two-factor).         | §11       |
| R-09.6d | `flow_id` stamped on every pg-boss async job row at spawn; recorded on `agent_schedule_run.flow_id`; async-spawned drafts inherit and correlate to the scheduling origin trace via `parent_trace_id` (plan 07).                                     | §11, §12  |
| R-09.6e | Event-triggered-by-tenant-content: a schedule fired by a user-authored event payload starts tainted (`taint_seeded: true` at spawn). Covered by explicit integration test (§11 Testing).                                                            | §2, §11   |
| R-09.7  | Drafts from async turns route through plan 08 approval flow; reuse schedule's delegation                                                                                                                                                            | §11, §10  |

### Job row shape

| #      | Requirement                                                                                                                                                                                                      | Design §§ |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-09.8 | Payload includes `{ tenant_id, user_on_behalf_of?, actor_principal, schedule_id, delegation_id, taint_seeded, cost_ceiling_remaining, invocation_ceiling_remaining, pinned_versions, fired_by, event_payload? }` | §11       |

### Taint across async boundary

| #       | Requirement                                                                                        | Design §§ |
| ------- | -------------------------------------------------------------------------------------------------- | --------- |
| R-09.9  | Event-triggered schedule firing on tenant-authored content → `taint_seeded: true` at spawn         | §2, §11   |
| R-09.10 | Worker sets `turn_state.tainted = true` before any tool call when `taint_seeded`                   | §2, §11   |
| R-09.11 | Plan 08 draft proposer sees taint and bumps drafted writes to high_risk regardless of tool default | §10       |

### Per-delegation ceilings

| #       | Requirement                                                           | Design §§ |
| ------- | --------------------------------------------------------------------- | --------- |
| R-09.12 | Pre-spawn cost + invocation caps enforced; spawn refused if exhausted | §11, §13  |
| R-09.13 | Mid-turn cost-ceiling enforcement via plan 05 `systemAbortController` | §11, §13  |
| R-09.14 | Daily ceilings refill at midnight UTC                                 | §13       |

### Version pinning

| #       | Requirement                                                                     | Design §§ |
| ------- | ------------------------------------------------------------------------------- | --------- |
| R-09.15 | pg-boss retry hits same pinned versions as original spawn                       | §11, §14  |
| R-09.16 | Pinned versions: router_version, sub_agent_version, tool_meta_version, model_id | §11, §14  |

### Cancellation

| #       | Requirement                                                     | Design §§ |
| ------- | --------------------------------------------------------------- | --------- |
| R-09.17 | Per-run cancel cancels specific job; doesn't affect schedule    | §11       |
| R-09.18 | Schedule pause suppresses future fires; in-flight runs continue | §11       |
| R-09.19 | Schedule delete revokes delegation + marks paused               | §11       |

### Delegation lifecycle

| #        | Requirement                                                                                                                                                                                                                                                                                                                              | Design §§ |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-09.20  | Max active delegations per user: 10 default                                                                                                                                                                                                                                                                                              | §11       |
| R-09.21  | Creation rate limit: `schedule_or_delegation_creations_per_user_per_day` default 5 (single counter per plan 05 R-05.25)                                                                                                                                                                                                                  | §11, §13  |
| R-09.22  | Auto-expire grants ≥ 180d regardless of requested expiry                                                                                                                                                                                                                                                                                 | §11       |
| R-09.23  | Admin UI shows all active grants per user                                                                                                                                                                                                                                                                                                | §11       |
| R-09.24  | Expired delegations trigger paused schedules; owner notified                                                                                                                                                                                                                                                                             | §11       |
| R-09.24a | `DelegationLifecycle.handleUserOffboarding(userId)` revokes all delegations owned by `userId` and pauses all personal schedules with `owner_user_id=userId`, emitting `agent.schedules_revoked_on_offboarding` audit with the full inventory. People module is the caller. Reassignment to a successor is Beta-gated; MVP is pause-only. | §11       |
| R-09.24b | `DelegationLifecycle.create` validates `scope.permitted_tools` against the current tRPC registry. Unknown tools emit a drift warning audit and narrow the effective scope to intersecting tools only. Does NOT fail creation.                                                                                                            | §11       |

### Cross-tenant event isolation

| #       | Requirement                                                                                                                                                                                                                                                                                | Design §§     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| R-09.28 | Event-router MUST filter schedule matches by `event.tenant_id === schedule.tenant_id` BEFORE calling `ScheduledTurnSpawner.spawn()`. Any attempted cross-tenant routing is rejected and audited as a P0 candidate. Worker re-validates `tenant_id` on first DB read (belt-and-suspenders). | §11, Tenet #1 |

### Failure escalation + tenant spend

| #       | Requirement                                                                                                                                                                                                                                                           | Design §§ |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-09.29 | `agent_schedule.consecutive_failure_count` tracked per schedule; incremented on non-success outcomes, reset on success. At count=3, schedule is auto-paused with `pause_reason='consecutive_failures'` and admin+owner notified regardless of `failure_alert_policy`. | §11       |
| R-09.30 | Per-schedule `failure_alert_policy ∈ {'owner' \| 'owner_and_admin' \| 'admin_only' \| 'silent'}` at creation time; tenant-wide default in `admin_tenant_config`. Ignored on the count=3 escalation (which always alerts both).                                        | §11       |
| R-09.31 | `admin_tenant_config.max_active_schedules INT` (default 100) — tenant-wide cap on `status='active'` schedules. At 80% → warn admin; at 100% → new-schedule creation refused until existing schedules are deleted.                                                     | §11, §13  |
| R-09.32 | `admin_tenant_config.scheduled_spend_daily_limit_usd NUMERIC(10,2)?` (optional; when set, a daily aggregation job pauses all schedules in the tenant at limit breach with `pause_reason='tenant_spend_exhausted'`). Bulk pause, not mid-run abort.                    | §11, §13  |

### Audit + observability

| #       | Requirement                                                                                                                                                                                                                                                                   | Design §§  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| R-09.25 | Kernel audit events: `agent.schedule_created`, `agent.schedule_paused`, `agent.schedule_resumed`, `agent.schedule_deleted`, `agent.schedule_run_started`, `agent.schedule_run_completed`, `agent.schedule_run_failed`, `agent.delegation_revoked`, `agent.delegation_expired` | §11, §15.5 |
| R-09.26 | `agent_schedule_run` row per turn with trace_id correlation                                                                                                                                                                                                                   | §11        |
| R-09.27 | Parent-trace-link: schedule_run's trace has `parent_trace_id` attribute pointing to schedule-creation trace                                                                                                                                                                   | §12        |

---

## 7. Failure Modes & Recovery

| Failure                                                                                           | Symptom                                                                                  | Recovery                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cron fires for deleted schedule                                                                   | Spawner checks status; refuses                                                           | Audit logs; no job enqueued.                                                                                                                                                                                    |
| Delegation expired between cron-fire and worker-pickup                                            | Worker step 2 validation fails                                                           | Worker marks schedule paused; owner notified; spawner skips subsequent fires until owner renews.                                                                                                                |
| pg-boss retry of a job whose schedule was paused mid-flight                                       | Worker step 2 detects pause                                                              | Retry still runs to completion if already past check (race); subsequent retries refused.                                                                                                                        |
| Cost ceiling exhausted mid-run                                                                    | `systemAbortController` fires                                                            | `outcome: 'budget'`; partial-answer gate applies (plan 03); audit captures.                                                                                                                                     |
| Worker crashes mid-LLM-call                                                                       | pg-boss retry                                                                            | Retry with same pinned versions; up to 3 retries.                                                                                                                                                               |
| Event-payload schema changes in triggering domain                                                 | `TaintSeedDetector` may misclassify                                                      | Conservative default = seed taint; prefer over-classify.                                                                                                                                                        |
| Invocation ceiling rate-limiting a legitimate bursty schedule (e.g. 5-min cron hitting daily cap) | Spawner refuses                                                                          | Owner sees "ceiling exhausted" in notification; adjust schedule config or increase ceiling.                                                                                                                     |
| Delegation max-active cap hit                                                                     | Create refuses with structured error                                                     | Owner revokes unused delegations to free slots.                                                                                                                                                                 |
| Orphaned delegation (schedule deleted but delegation still active)                                | Cleanup sweeper catches                                                                  | Delegation revoked within 24h.                                                                                                                                                                                  |
| Tenant-wide schedule runs with no configured recipients                                           | Synthesizer output has nowhere to go                                                     | Fallback: post to generic `tenant_admin_notifications` channel; audit + alert.                                                                                                                                  |
| Two concurrent cron fires for same schedule (rare race)                                           | pg-boss dedup or application-layer check                                                 | pg-boss job uniqueness based on `(schedule_id, fire_time)`; duplicate enqueue rejected.                                                                                                                         |
| Retry-with-pinned-versions but pinned-version artifact removed (aggressive prompt-store GC)       | Worker can't resolve prompt hashes                                                       | Audit + mark run failed with `missing_pinned_artifacts`; operational alert — GC policy needs adjustment.                                                                                                        |
| User offboarded with active personal schedules                                                    | People module calls `handleUserOffboarding`                                              | All owned delegations revoked; all owned personal schedules paused; admin notified; audit `agent.schedules_revoked_on_offboarding` lists the inventory.                                                         |
| Delegation permitted_tools contains a tool renamed/deleted since creation                         | `DelegationLifecycle.create` drift warning; scope narrows to intersecting tools only     | Owner (and admin) notified of drift; grant still works for remaining tools; owner can recreate for renamed tool.                                                                                                |
| Cross-tenant event-router misconfig attempts to route to mismatched tenant's schedule             | Event router's `tenant_id` filter rejects; audit event fires                             | P0 candidate incident; runbook investigates event-router config; worker's belt-and-suspenders check catches any that slip past router.                                                                          |
| Schedule hits 3 consecutive failures                                                              | Auto-paused with `pause_reason='consecutive_failures'`; admin + owner notified           | Admin runbook reviews the run failures, fixes underlying cause (permission, tool change, data state), flips status back to active.                                                                              |
| Tenant exceeds `max_active_schedules`                                                             | New schedule creation refused at 100%; warn at 80%                                       | Owner / admin deletes or pauses unused schedules; limit can be raised via admin runbook.                                                                                                                        |
| Tenant exceeds `scheduled_spend_daily_limit_usd`                                                  | Daily aggregation bulk-pauses all schedules with `pause_reason='tenant_spend_exhausted'` | Admin reviews spend, increases limit if legitimate or identifies misfiring schedule; manual resume per schedule.                                                                                                |
| Draft-to-inbox creation fails mid-turn (plan 08 inbox unreachable, DB error)                      | Worker catches the draft-write error                                                     | pg-boss retry of the entire job with pinned versions; up to 3 retries. On exhaustion: run outcome `error`; no partial-draft state persists.                                                                     |
| Async-spawned draft stream overwhelms initiator's inbox (flood from bursty event schedule)        | Per-initiator inbox depth crosses plan 08 / §13 throttle threshold                       | Plan 08 approval-inbox throttle (§13) kicks in — new async drafts for that initiator are rate-limited; schedule `consecutive_failure_count` does NOT increment (throttle is not a run failure). Admin notified. |
| Async turn gateway coerces a mutation intent into a draft, but no draft tier applies              | Plan 08 draft proposer returns no-tier                                                   | Run outcome `refused`; audit captures the tool + intent; owner notified; does not count toward `consecutive_failure_count` as "error" but as `refused`.                                                         |

---

## 8. Observability Surface

### Spans

- `SCHEDULE:spawn` (entity `DELEGATION`) — emitted by spawner; attrs `schedule_id`, `fired_by`, `pre_check_outcome`, `taint_seeded`.
- `SCHEDULED_TURN:execute` — parent of the full turn span tree for the scheduled run; `parent_trace_id` links to schedule-creation trace.
- `DELEGATION:validate` — child of spawn + worker; attrs `delegation_id`, `status`.

### Metrics

- `agent_schedule_fire_total{tenant_id, kind, trigger, outcome}` — counter.
- `agent_schedule_active_count{tenant_id}` — gauge.
- `agent_schedule_run_duration_ms{tenant_id, kind}` — histogram.
- `agent_delegation_active_count{tenant_id}` — gauge.
- `agent_delegation_expired_total{tenant_id, reason}` — counter.
- `agent_delegation_creations_total{tenant_id}` — counter (for rate-limit observability).
- `agent_async_taint_seeded_total{tenant_id, event_type}` — counter.
- `agent_schedule_ceiling_exhausted_total{tenant_id, ceiling_kind}` — counter.
- `agent_schedule_consecutive_failure_pause_total{tenant_id}` — counter. Fires when R-09.29 auto-pause triggers.
- `agent_schedule_tenant_spend_pause_total{tenant_id}` — counter. Fires when R-09.32 bulk-pause triggers.
- `agent_schedule_active_count{tenant_id}` — gauge (already present above); alert at 80% of `max_active_schedules` per R-09.31.
- `agent_schedules_revoked_on_offboarding_total{tenant_id}` — counter; spike correlates with user-departure events.
- `agent_delegation_scope_drift_total{tenant_id, reason}` — counter. `reason ∈ {'tool_renamed', 'tool_removed'}`; fires from `DelegationLifecycle.create` drift check.
- `agent_event_router_cross_tenant_rejected_total{tenant_id}` — counter; any non-zero is a P0 candidate.

### Dashboards

- Active schedule count per tenant (growth trend; alert on explosive growth — possible misuse).
- Schedule fire success rate (alert if < 95% sustained).
- Per-delegation cost spend vs ceiling (heatmap).
- Taint-seeded turn outcome: approval rate of resulting drafts (signal for event-based injection attack detection).
- Delegation expiry pipeline health (sweep lag).

---

## 9. Security Considerations

- **Delegation-not-impersonation.** Worker executes under `delegator_user_id`, not the scheduler. A compromised scheduler CANNOT exceed the delegator's authority because RLS + `canDo` evaluate against the delegator.
- **Tenant-wide scheduler scope.** Must be admin-approved with narrow `scope.permitted_tools / permitted_domains`. Default-deny — empty scope = no-op schedule.
- **Event-triggered spawn is an injection vector.** A ticket comment author can trigger a schedule run with attacker-authored content. Taint seeding → approval bump closes the write side; read-only-at-MVP closes the autonomous side. Draft-card provenance surfaces the trigger author.
- **Invocation ceiling is a DoS defense.** Bad event filter → 10k fires/day with LLM cost = runaway bill. Pre-spawn refusal caps exposure.
- **Max-active delegation cap** closes the "churn through cycles" bypass (create-revoke-create to stay under active count while accumulating delegation history).
- **180d auto-expire.** Hard cap regardless of requested expiry. Long-lived delegations drift; periodic renewal forces visibility.
- **pg-boss job payload contains delegation_id, not credentials.** No raw tokens stored.
- **Pinned-version artifact retention.** Prompt store + narrative store must retain referenced hashes long enough to cover retry window; aggressive GC breaks retries.
- **Cross-tenant schedule fire.** pg-boss workers MUST verify `tenant_id` on every payload; buggy event router leaking across tenants would be caught by RLS on the first DB read but belt-and-suspenders verification at payload parse is cheap. Additionally (R-09.28), the event router itself filters by `event.tenant_id === schedule.tenant_id` BEFORE calling `ScheduledTurnSpawner.spawn()`; any attempted cross-tenant routing is rejected and metric-audited as a P0 candidate. Defense in depth: router filter + worker re-validation + RLS.
- **Owner offboarding closure.** R-09.24a ensures a departed user's delegations are revoked and schedules paused at offboarding time rather than relying on 180d auto-expire. Prevents a long tail of "still running as ex-employee" schedules that are legal/compliance-sensitive.
- **Tenant-wide spend containment.** R-09.32's optional `scheduled_spend_daily_limit_usd` bulk-pauses all schedules at breach. Protects against runaway misfires (bad filter, loop, infinite event cascade) from costing the tenant more than their admin configured.
- **Beta-gating of autonomous writes is a security control, not a product rollout convenience.** Autonomous writes widen the blast radius from "user-reviewed draft" to "kernel-signed execution without live human." The `feature.agent.async_autonomous_writes` flag + `agent_delegation.autonomous_writes_allowed` two-factor (R-09.6b, R-09.6c) are the enforcement surface; either being false denies the write. The 4-week incident-free soak + ≥95% approval-rate gate (§16) is the evidence threshold for flipping the global flag — not a product-taste call.
- **Dry-run audit path during soak.** While the flag is off, the worker still evaluates the hypothetical "would autonomous-write have fired here?" and emits a `agent.async_dry_run_would_have_written` audit event with tool, tier, delegation scope, and taint state. This gives the soak period quantitative data (what would the autonomous-write volume look like? what would the approval-rate-on-draft have rejected?) to judge whether the 95% threshold holds in counterfactual. No user-visible behavior; audit-only.

---

## 10. Performance Budget

| Operation                                              | p50             | p95     | p99     |
| ------------------------------------------------------ | --------------- | ------- | ------- |
| `ScheduledTurnSpawner.spawn` (pre-checks + enqueue)    | <50ms           | <150ms  | <400ms  |
| Worker pickup + validation                             | <100ms          | <300ms  | <800ms  |
| Full scheduled-turn execution (same as plan 03 budget) | matches plan 03 | matches | matches |
| Delegation sweep (1K delegations scanned)              | <500ms          | <1500ms | <4000ms |
| Cron scheduler tick                                    | <50ms           | <100ms  | <300ms  |
| Schedule CRUD tRPC                                     | <50ms           | <150ms  | <400ms  |

---

## 11. Testing Strategy

### Unit

- `DelegationLifecycle.create`: enforces max-active, rate limit, 180d auto-expire.
- `ScheduledTurnSpawner.spawn`: refuses on inactive schedule, expired delegation, exhausted ceiling.
- `TaintSeedDetector.shouldSeedTaint`: true for user-authored event payloads; false for system events.
- `SchedulerPrincipal.resolve`: correct `actor_principal` + `userOnBehalfOf` for each kind.
- Worker idempotence: seeded duplicate pg-boss delivery executes once.

### Integration

- Happy personal schedule: create → cron fires → worker runs → synthesizer output → notification to owner.
- Happy tenant-wide: admin creates → cron fires → runs under `agent:scheduler` → notification to configured recipients.
- Event-triggered + taint: ticket.comment.created → schedule fires → `taint_seeded: true` → drafted write bumped to high_risk.
- Delegation expired: schedule's delegation crosses 180d → next fire refused → schedule auto-paused.
- Ceiling exhausted: seed daily cost to 100% → next fire refused.
- Mid-run cost exhaust: seed spawn at 99%; mid-turn crosses 100% → `outcome: 'budget'`; partial-answer gate applies.
- Pause/resume: pause mid-flight → current run completes; future fires suppressed.
- Schedule delete: in-flight run sees "schedule deleted" banner in notification.
- Version pinning: spawn with pinned v1; rollout to v2 mid-run; pg-boss retry uses v1 (verified via trace attr).
- Cross-tenant: tenant A's schedule does not fire under tenant B's context even if event routing hypothetically leaked.
- Event-router tenant filter (R-09.28): seed a mismatched tenant event → router rejects before spawner is called; `agent_event_router_cross_tenant_rejected_total` increments; P0 audit emitted.
- User offboarding: seed user with 3 personal schedules + 2 delegations → call `handleUserOffboarding` → 2 delegations revoked, 3 schedules paused with `pause_reason='owner_offboarded'`, single summary notification to admin with full inventory.
- Delegation scope drift: seed scope with `permitted_tools: ['hiring.oldName', 'hiring.existing']` where `hiring.oldName` was renamed → `DelegationLifecycle.create` succeeds with narrowed scope; `agent_delegation_scope_drift_total{reason: 'tool_renamed'}` increments; drift audit captures the unknown tool name.
- Consecutive-failure escalation: seed 3 consecutive error-outcome runs → schedule auto-pauses with `pause_reason='consecutive_failures'`; admin+owner notified; 4th cron fire does not spawn (paused); metric increments.
- Tenant active-schedule cap: seed tenant at 100 active schedules + attempt to create 101st → creation refused; warn at 80 threshold observable via dashboard.
- Tenant spend cap: seed daily aggregation sum exceeding `scheduled_spend_daily_limit_usd` → bulk pause fires on next aggregation tick; all schedules status='paused' with correct reason.

### Property

- Delegation max-active: fuzz N concurrent creates → never exceed 10 active per user.
- Daily ceiling refresh: simulate 24h clock → ceiling resets exactly at midnight UTC.

### E2E

- User creates personal schedule in `web-admin` → cron fires → notification appears in user's inbox with draft card (if the schedule produces a draft).
- Admin creates tenant-wide schedule with narrow scope → fires → limited tools available; scope violation caught by `canDo`.

### Fixtures

- `fixtures/schedules/personal-weekly-timesheet.ts`
- `fixtures/schedules/tenant-wide-kpi-summary.ts`
- `fixtures/schedules/event-triggered-ticket-comment.ts`
- `fixtures/delegations/expired-past-180d.ts`
- `fixtures/delegations/at-max-active-cap.ts`

---

## 12. Acceptance Criteria

- All unit + integration + property + E2E tests pass.
- Delegation-not-impersonation verified: audit trail shows `on_behalf_of ≠ delegate` on every schedule_run.
- Taint-seeded turns correctly bump drafts (verified via cross-plan test).
- Max-active + rate-limit + 180d auto-expire all enforced.
- Version pinning across retries verified by trace attr.
- Scheduled-turn trace correlation: `parent_trace_id` points to schedule-creation trace.
- Cross-tenant isolation: pg-boss payload `tenant_id` always verified; mismatched payload rejected.
- Event-router tenant filter rejects all seeded cross-tenant pairings (R-09.28); never a single metric hit in production-suite baseline run.
- User-offboarding flow verified: delegations revoked, schedules paused, audit inventory populated, admin summary notification.
- Delegation scope-drift validation on create: warning-not-failure confirmed; effective scope narrows to existing tools.
- Consecutive-failure escalation: 3 non-success runs auto-pause the schedule with correct `pause_reason`.
- Tenant active-schedule cap + tenant spend cap both enforce at thresholds; alerts fire at 80%.

---

## 13. Rollout Plan

- **Phase 1** — ship `agent_schedule` + delegation infrastructure + cron-kind spawner. Internal tenant only; single personal schedule.
- **Phase 2** — event-kind spawner + taint seeding; one event type (e.g. `ticket.comment.created`).
- **Phase 3** — tenant-wide schedules; admin UI.
- **Phase 4** — delegation lifecycle sweeper + expiry notifications.
- **Phase 5** — full rollout to all tenants.

**Backout:** schedule creation gated `canDo` — revoke the permission to halt all new creations; existing schedules can be mass-paused via admin script. Workers fail-safe by checking schedule + delegation status at pickup.

---

## 14. Dependencies

- Plan 00 (shipped): sanitizer.
- People module: call-site for `DelegationLifecycle.handleUserOffboarding` at offboarding events (R-09.24a).
- Admin module: `admin_tenant_config` fields `max_active_schedules` (default 100), `scheduled_spend_daily_limit_usd?`, `default_schedule_failure_alert_policy` (R-09.30-32).
- Plan 01: gateway pipeline (tool invocations in scheduled turns).
- Plan 02: registry (same sub-agents available to scheduled turns).
- Plan 03: phase execution.
- Plan 04: conversation state (scheduled turns create conversations too, tagged `surface: 'async'`).
- Plan 05: per-delegation ceilings; rate limit; `systemAbortController` for mid-turn budget abort.
- Plan 06: stream gateway (internal-only for scheduled turns; no SSE to client).
- Plan 07: parent-trace-link + audit.
- Plan 08: drafts reuse schedule's delegation.
- Kernel module: delegation grants + `canDo` + audit.
- pg-boss: `agent.scheduled-turn` queue.
- `web-admin`: schedule CRUD UI.
- Domain event routers (for event-kind triggers).

## 15. Integration Points

- `@future/db` — `agent_schedule`, `agent_schedule_run` migrations.
- `apps/api/src/modules/agents/infrastructure/schema/agent-schedule.ts`.
- `apps/api/src/modules/agents/infrastructure/schema/agent-schedule-run.ts`.
- `apps/api/src/modules/agents/application/services/schedule-repository.ts`.
- `apps/api/src/modules/agents/application/services/scheduler-principal.ts`.
- `apps/api/src/modules/agents/application/services/scheduled-turn-spawner.ts`.
- `apps/api/src/modules/agents/application/services/delegation-lifecycle.ts`.
- `apps/api/src/modules/agents/application/services/taint-seed-detector.ts`.
- `apps/api/src/modules/agents/infrastructure/workers/scheduled-turn-worker.ts`.
- `apps/api/src/modules/agents/infrastructure/workers/delegation-expiry-sweep.ts`.
- `apps/api/src/modules/agents/interface/trpc/schedule-ui-facade.ts`.
- Kernel `KernelDelegationFacade` (if exists; else create as part of this plan's kernel-integration).
- pg-boss — queue + scheduled jobs.
- Domain event routers — subscribe + invoke spawner.
- `web-admin` — schedule + delegation UI.

## 16. Activation Gate

**MVP gate (read-only + draft-to-inbox):** first production turn. Ships with the MVP cut. Constraint: read-only tool invocations + notify + draft-to-inbox only. `feature.agent.async_autonomous_writes` is globally off; `agent_delegation.autonomous_writes_allowed` is present in schema but ignored.

**Beta gate (autonomous writes):** `feature.agent.async_autonomous_writes` activation requires **4 weeks of incident-free async draft-to-inbox on ≥2 tenants AND approval-rate ≥95% on the async draft stream** (per architecture §16 row "Async delegation-signed writes (beyond draft-to-inbox)"). The dry-run audit stream (§9) provides the counterfactual approval-rate-on-would-be-execution signal used alongside the live approval-rate-on-draft signal. Gate evaluation is a joint Product + Security sign-off (see §18).

## 17. Out of Scope

- Async autonomous writes (GA).
- Natural-language schedule creation ("every Friday") → cron (product/UX).
- Schedule "templates" or tenant-shared libraries (product).
- Tenant-wide scheduler principal auto-escalation (admin must approve each grant explicitly).
- Cross-tenant schedule migration.

## 18. Open Questions

- **Event-router module ownership.** Which module owns the subscription matcher? Recommend: domain that emits the event. Agent module exposes `ScheduledTurnSpawner.spawn` as a public interface consumable from any domain's event handler.
- **Pinned-version artifact retention.** How long must prompt-store entries be retained for retry resolution? Proposal: retain all entries referenced by an in-flight or recent (last 7d) schedule_run. Owner: plan 07.
- **Tenant-wide principal canonical name.** `'agent:scheduler'` is generic; do we want `'agent:scheduler:<schedule-id>'` for per-schedule attribution? Recommend: keep principal generic; per-schedule attribution via `via_schedule_id` audit tag. Owner: security review.
- **Mid-run cost decrement races.** Concurrent LLM calls within a single scheduled run → atomic decrements. Defer to implementation doc; current plan assumes single-request-at-a-time LLM calls (true for bounded; check for iterative).
- **Delegation renewal UX.** Auto-expire at 180d — how does the owner see "renew soon"? Recommend: notification 7 days before expiry. Owner: product.
- **Event-triggered schedule debouncing.** If an event fires 100x in a minute (bursty domain event), do 100 schedule runs fire? Recommend: per-schedule debounce config with default 60s. Owner: schedule UX.
- **Soak-audit sign-off authority for async autonomous writes.** Who signs the 4-week soak audit decision to flip `feature.agent.async_autonomous_writes` on — Product and Security jointly, or does Security hold veto? Recommend: joint approval required, with Security holding an explicit veto on any single hard criterion (incident rate, taint-path false-negative count, dry-run-vs-live approval-rate delta). Owner: security review before Beta begins.
