# 09 — Async Agents + Scheduling (Read-only + Notify + Draft-to-Inbox)

**Design §§:** §11 (Async Agents), §10 (drafts integration), §13 (per-delegation cost caps).

---

## 1. Scope

### In

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

- Autonomous writes from async (GA activation-gated — MVP async is read-only + notify + draft-to-inbox).
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
- `scope JSONB` — `{ schedule_id, permitted_tools, permitted_domains, notes }`.
- `expires_at TIMESTAMPTZ`.
- `status TEXT` — `'active' | 'expired' | 'revoked'`.
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
  delegation_id: UUID;
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
revoke(opts: { tenantId; delegationId; reason: string }): Promise<void>
listActive(opts: { tenantId; userId? }): Promise<Delegation[]>
sweepExpired(): Promise<{ expiredCount: number }>  // scheduled cron
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

1. Domain event fires (e.g. `ticket.comment.created`).
2. Event-router matches `agent_schedule.event_subscription.event_type` filters.
3. For each matching schedule: `ScheduledTurnSpawner.spawn({ schedule, firedBy: 'event:ticket.comment.created', eventPayload })`.
4. `TaintSeedDetector.shouldSeedTaint(...)` → typically `true` for user-authored event content.
5. Same pre-checks as cron.
6. pg-boss job payload includes `event_payload`.

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

| #      | Requirement                                                                              | Design §§ |
| ------ | ---------------------------------------------------------------------------------------- | --------- |
| R-09.6 | MVP: read-only + notify + draft-to-inbox. No autonomous writes                           | §11       |
| R-09.7 | Drafts from async turns route through plan 08 approval flow; reuse schedule's delegation | §11, §10  |

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

| #       | Requirement                                                                                                             | Design §§ |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| R-09.20 | Max active delegations per user: 10 default                                                                             | §11       |
| R-09.21 | Creation rate limit: `schedule_or_delegation_creations_per_user_per_day` default 5 (single counter per plan 05 R-05.25) | §11, §13  |
| R-09.22 | Auto-expire grants ≥ 180d regardless of requested expiry                                                                | §11       |
| R-09.23 | Admin UI shows all active grants per user                                                                               | §11       |
| R-09.24 | Expired delegations trigger paused schedules; owner notified                                                            | §11       |

### Audit + observability

| #       | Requirement                                                                                                                                                                                                                                                                   | Design §§  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| R-09.25 | Kernel audit events: `agent.schedule_created`, `agent.schedule_paused`, `agent.schedule_resumed`, `agent.schedule_deleted`, `agent.schedule_run_started`, `agent.schedule_run_completed`, `agent.schedule_run_failed`, `agent.delegation_revoked`, `agent.delegation_expired` | §11, §15.5 |
| R-09.26 | `agent_schedule_run` row per turn with trace_id correlation                                                                                                                                                                                                                   | §11        |
| R-09.27 | Parent-trace-link: schedule_run's trace has `parent_trace_id` attribute pointing to schedule-creation trace                                                                                                                                                                   | §12        |

---

## 7. Failure Modes & Recovery

| Failure                                                                                           | Symptom                                  | Recovery                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Cron fires for deleted schedule                                                                   | Spawner checks status; refuses           | Audit logs; no job enqueued.                                                                             |
| Delegation expired between cron-fire and worker-pickup                                            | Worker step 2 validation fails           | Worker marks schedule paused; owner notified; spawner skips subsequent fires until owner renews.         |
| pg-boss retry of a job whose schedule was paused mid-flight                                       | Worker step 2 detects pause              | Retry still runs to completion if already past check (race); subsequent retries refused.                 |
| Cost ceiling exhausted mid-run                                                                    | `systemAbortController` fires            | `outcome: 'budget'`; partial-answer gate applies (plan 03); audit captures.                              |
| Worker crashes mid-LLM-call                                                                       | pg-boss retry                            | Retry with same pinned versions; up to 3 retries.                                                        |
| Event-payload schema changes in triggering domain                                                 | `TaintSeedDetector` may misclassify      | Conservative default = seed taint; prefer over-classify.                                                 |
| Invocation ceiling rate-limiting a legitimate bursty schedule (e.g. 5-min cron hitting daily cap) | Spawner refuses                          | Owner sees "ceiling exhausted" in notification; adjust schedule config or increase ceiling.              |
| Delegation max-active cap hit                                                                     | Create refuses with structured error     | Owner revokes unused delegations to free slots.                                                          |
| Orphaned delegation (schedule deleted but delegation still active)                                | Cleanup sweeper catches                  | Delegation revoked within 24h.                                                                           |
| Tenant-wide schedule runs with no configured recipients                                           | Synthesizer output has nowhere to go     | Fallback: post to generic `tenant_admin_notifications` channel; audit + alert.                           |
| Two concurrent cron fires for same schedule (rare race)                                           | pg-boss dedup or application-layer check | pg-boss job uniqueness based on `(schedule_id, fire_time)`; duplicate enqueue rejected.                  |
| Retry-with-pinned-versions but pinned-version artifact removed (aggressive prompt-store GC)       | Worker can't resolve prompt hashes       | Audit + mark run failed with `missing_pinned_artifacts`; operational alert — GC policy needs adjustment. |

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
- **Cross-tenant schedule fire.** pg-boss workers MUST verify `tenant_id` on every payload; buggy event router leaking across tenants would be caught by RLS on the first DB read but belt-and-suspenders verification at payload parse is cheap.

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

MVP. Ships with the MVP cut.

MVP constraint: read-only + notify + draft-to-inbox. Async autonomous writes are GA-gated.

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
