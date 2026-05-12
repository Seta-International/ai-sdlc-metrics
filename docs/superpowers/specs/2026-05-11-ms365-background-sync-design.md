# Design — MS365 Background Delta Sync (Epic 3)

**Status**: Draft for review · approved-section-by-section in brainstorm
**Author**: Canh Ta (with Claude)
**Date**: 2026-05-11
**Source brainstorm**: `docs/plans/MS365 Epics Brainstorm.md` — Epic 3
**Depends on**:
  - Epic 1 (`2026-05-11-ms365-auth-design.md`) — `TokenVault`, `OAuthProvider.acquireAppOnly`, `ConnectorRegistry`, audit, `tenant_connectors`
  - Epic 2 (`2026-05-11-ms365-planner-crud-design.md`) — `connector_ms365_planner` cache schema, `sync_watermarks`, write-through helpers
**Forward dependency on Epic 4**: `TeamsChannelAlertSink` (P1 fallback uses CloudWatch-only)

---

## 1. Goal

Planner + Directory data is mirrored from Microsoft Graph into the local Postgres caches (Epic 2 schemas) by a background worker that polls Graph's delta endpoints on an adaptive schedule. Result: agent reads are sub-200ms p95 from cache; reads survive Graph throttling or transient outages; sync is recoverable from delta-token expiry without admin intervention; per-tenant sync failure does not block other tenants.

## 2. Non-goals

- Cache schema, read-through, write-through (delivered by Epic 2).
- Multi-instance worker. P1 ships one worker process; P2 adds horizontal scale with Postgres advisory locks per `(job_id, tenant_id)`.
- LISTEN/NOTIFY-based queue. P1 polls `worker.job_queue` on a 30s tick; P2 adds NOTIFY for cold-start sub-second latency.
- Daily digest scheduler. Lives in Epic 4 and reuses this worker's scheduler.
- Tenant-admin sync UI / status dashboard (P2 Studio).

## 3. Packages added

```
apps/worker/                                  NEW deployable (composition only)
  src/instrumentation.ts                      OTel preload (same pattern as apps/api)
  src/main.ts                                 Boots Scheduler, registers connector sync jobs,
                                              exposes /healthz
  src/env.ts                                  Zod-validated env

platform/worker/                              NEW package — job/scheduler primitives
  src/job.ts                                  Job<TArgs>, JobContext, JobResult
  src/scheduler.ts                            Scheduler: register, start, stop, enqueueNow, health
  src/schedule.ts                             Schedule = adaptive | cron | once
  src/adaptive.ts                             Adaptive interval state machine
  src/health.ts                               Hono /healthz factory
  src/runtime.ts                              p-queue per-job dispatcher; graceful shutdown
  src/schema.ts                               Drizzle: worker.job_queue (schema `worker`)

platform/observability/src/alert-sink.ts      NEW — AlertSink interface, CloudWatchAlertSink, MultiSink
                                              (TeamsChannelAlertSink lands in Epic 4)

modules/connectors/ms365-planner/src/sync.ts        NEW — plannerSyncJob: Job
modules/connectors/ms365-directory/src/sync.ts      NEW — directorySyncJob: Job

connector_ms365_planner.sync_state            NEW (per-(tenant, scope) delta-token + failure counts)
connector_ms365_directory.sync_state          NEW (same shape)
tenant.tenant_activity                        NEW (per-tenant agent-activity timestamp)
worker.job_queue                              NEW (cold-start enqueue, owned by @seta/worker)
```

## 4. Worker primitives (`platform/worker`)

### 4.1 Job + JobContext

```ts
interface JobContext {
  tenantId: string                       // SET LOCAL app.tenant_id; RLS enforced
  jobId: string
  scope?: { kind: string; id: string }
  logger: Logger
  signal: AbortSignal
  audit: AuditWriter
}

interface JobResult { itemsProcessed: number; errors: number; metadata?: Record<string, unknown> }

interface Job<TArgs = void> {
  id: string                             // 'sync.ms365-planner', 'sync.ms365-directory', 'digest.daily' (Epic 4)
  schedule: Schedule
  scope: 'per-tenant' | 'per-tenant-per-connector' | 'global'
  concurrency?: number                   // default 3
  run(ctx: JobContext, args: TArgs): Promise<JobResult>
}

type Schedule =
  | { kind: 'adaptive'; bands: AdaptiveBands }
  | { kind: 'cron';     expr: string;  tz?: 'tenant' | string }   // Epic 4 daily digest
  | { kind: 'once';     after: Date }
```

**Job is a value, not a class.** Registration is static at boot. Consistent with CLAUDE.md "no plugin loaders."

### 4.2 Scheduler

```ts
interface Scheduler {
  register<TArgs>(job: Job<TArgs>): void
  start(): Promise<void>
  stop(timeoutMs?: number): Promise<void>
  enqueueNow<TArgs>(jobId: string, tenantId: string, args: TArgs): Promise<void>
  health(): { ready: boolean; activeJobs: number; lastTick: Date }
}
```

**Tick** every 30s per job (smallest band interval is 60s, so 30s tick gives ≤30s jitter on dispatch):

```sql
-- per (tenant, connector) pair, dispatch if due:
SELECT tc.tenant_id, tc.connector_id,
       ta.last_agent_invocation_at,
       ss.last_run_at, ss.consecutive_failures
  FROM tenant.tenant_connectors tc
  LEFT JOIN tenant.tenant_activity ta USING (tenant_id)
  LEFT JOIN connector_<X>.sync_state ss
         ON ss.tenant_id = tc.tenant_id AND ss.scope_kind = 'global'
 WHERE tc.status IN ('active', 'degraded')
   AND tc.connector_id = $1
   AND age(now(), coalesce(ss.last_run_at, 'epoch')) > <current-band-interval-for-this-row>
```

`enqueueNow` writes `worker.job_queue`; the same tick loop drains it before processing adaptive schedules.

**Concurrency** is per-job (`p-queue` instance per `job.id`). Prevents a slow tenant from starving others under the same job.

### 4.3 Composition root — `apps/worker/src/main.ts`

```ts
import { createScheduler } from "@seta/worker"
import { plannerSyncJob }   from "@seta/connector-ms365-planner"
import { directorySyncJob } from "@seta/connector-ms365-directory"
import { CloudWatchAlertSink, MultiSink } from "@seta/observability"

const scheduler = createScheduler({
  alertSink: new MultiSink([
    new CloudWatchAlertSink({ region: env.AWS_REGION, namespace: "seta/worker" }),
    // TeamsChannelAlertSink wired in once Epic 4 lands
  ]),
})

scheduler.register(plannerSyncJob)
scheduler.register(directorySyncJob)
// Epic 4 adds: scheduler.register(dailyDigestJob)

await scheduler.start()
serve({ fetch: healthApp.fetch, port: env.PORT })
```

## 5. Per-connector sync implementations

### 5.1 Planner — `plannerSyncJob`

```ts
export const plannerSyncJob: Job = {
  id: 'sync.ms365-planner',
  scope: 'per-tenant-per-connector',
  schedule: { kind: 'adaptive', bands: PLANNER_BANDS },
  concurrency: 5,
  async run(ctx) {
    const token = await vault.acquireAppOnly(ctx.tenantId, ['Tasks.Read.All', 'Group.Read.All'])

    // 1. Tasks — delta loop (beta endpoint until v1.0 GA — see §5.3 footgun)
    await syncTasksDelta(ctx, token)

    // 2. Plans — no delta endpoint; periodic full scan via app-only iteration over groups
    await syncPlansFull(ctx, token)

    // 3. Buckets — no delta; reconcile per plan
    await syncBucketsFull(ctx, token)

    return { itemsProcessed, errors }
  }
}
```

### 5.2 Delta loop (works for tasks, users, groups)

```ts
async function deltaLoop(ctx, endpoint, persistRow, persistedState) {
  let url = persistedState.delta_token
    ? `${endpoint}?$deltatoken=${persistedState.delta_token}`
    : endpoint

  while (url) {
    let res
    try {
      res = await graph.call({ token, method:'GET', path:url,
        actor:{ type:'system', label:'sync' }, connectorId })
    } catch (e) {
      if (e instanceof GraphNotFound /* 410 Gone — delta token expired */) {
        await syncState.markFullResync(ctx.tenantId, persistedState.scope)
        return deltaLoop(ctx, endpoint, persistRow, { ...persistedState, delta_token: null })
      }
      throw e
    }

    for (const row of res.data.value) {
      if (row['@removed']) await persistRow.softDelete(ctx.tenantId, row.id)
      else                 await persistRow.upsert(ctx.tenantId, row)
    }

    if (res.data['@odata.deltaLink']) {
      await syncState.persistDeltaToken(ctx.tenantId, persistedState.scope,
        extractDeltaToken(res.data['@odata.deltaLink']))
      url = null
    } else if (res.data['@odata.nextLink']) {
      url = res.data['@odata.nextLink']
    }
  }
}
```

### 5.3 Planner-specific gotcha (from May 2026 research)

Planner `tasks/delta` is currently **only in `/beta`**, not `/v1.0`.

**Decision: use `/beta/planner/tasks/delta` now; v1.0 when GA.** Beta endpoints are stable enough for sync; the alternative is N× more Graph quota burn. Tracked in `docs/runbooks/graph-version-migration.md` as a 1-PR change (swap URL prefix).

### 5.4 Directory — `directorySyncJob`

Same delta-loop shape against `/v1.0/users/delta` + `/v1.0/groups/delta` (both stable). Persists into `connector_ms365_directory.directory_users` / `directory_groups`. Reconciles `auth.users` via the JIT mapper (insert new; mark `status='orphaned'` for users removed from directory — no hard delete in P1).

Group membership: `/groups/delta?$expand=members($select=id)`. Wrapper's `paginate()` handles `members` pagination separately for large groups.

### 5.5 `sync_state` schema (per connector schema)

```
connector_<vendor>.sync_state
  tenant_id              uuid
  scope_kind             text                  -- 'tasks' | 'users' | 'groups' | 'global'
  scope_id               text                  -- 'global' for tenant-wide
  delta_token            text                  -- nullable; null triggers initial full sync
  last_run_at            timestamptz
  last_success_at        timestamptz
  last_full_sync_at      timestamptz
  consecutive_failures   smallint default 0
  last_error             text
  status                 text                  -- 'active' | 'degraded'
  PRIMARY KEY (tenant_id, scope_kind, scope_id)
```

RLS-enforced on `tenant_id`.

## 6. Adaptive polling

Bands match brainstorm Q-2/Q-3 resolutions:

```ts
const PLANNER_BANDS: AdaptiveBands = {
  active:  { intervalSec: 60,    promoteIf: 'agent activity in last 24h' },
  idle:    { intervalSec: 900,   promoteIf: '24h-7d since last agent activity' },
  dormant: { intervalSec: 86400, promoteIf: '>7d since last agent activity' },
}

const DIRECTORY_BANDS: AdaptiveBands = {
  active:  { intervalSec: 300,   promoteIf: 'agent activity in last 24h' },
  idle:    { intervalSec: 3600,  promoteIf: '24h-7d' },
  dormant: { intervalSec: 86400, promoteIf: '>7d' },
}
```

### 6.1 Activity signal — `tenant.tenant_activity`

```
tenant.tenant_activity
  tenant_id pk
  last_agent_invocation_at  timestamptz
```

The agent product (Epic 2) writes this on every tool invocation via a middleware:

```ts
// modules/products/agent/src/middleware/activity.ts
await db.execute(sql`
  INSERT INTO tenant.tenant_activity(tenant_id, last_agent_invocation_at)
  VALUES (${tenantId}, now())
  ON CONFLICT (tenant_id) DO UPDATE SET last_agent_invocation_at = excluded.last_agent_invocation_at
`)
```

### 6.2 Wake-on-activity

The activity write doesn't *itself* trigger sync — the next scheduler tick (≤30s later) sees the fresh `last_agent_invocation_at`, recomputes the band, and dispatches. Sub-30s freshness is already handled by Epic 2's write-through (commit tools update the cache directly).

## 7. Alert sink + health monitoring

### 7.1 AlertSink interface

```ts
// platform/observability/src/alert-sink.ts
type Severity = 'info' | 'warning' | 'critical'

interface AlertSink {
  alert(input: {
    severity: Severity
    summary: string
    details?: Record<string, unknown>
    tenantId?: string
    connectorId?: string
  }): Promise<void>
}

class CloudWatchAlertSink implements AlertSink { /* PutMetricData + composite CW alarms */ }
class MultiSink implements AlertSink {
  // Fan-out to N sinks. Per-sink errors logged but not thrown — a failing
  // alert pathway must not cascade into a sync-job failure.
}
// TeamsChannelAlertSink — modules/channels/teams/src/alert-sink.ts (Epic 4 ships this)
```

### 7.2 Failure escalation

Per brainstorm AC-8:

```
On every sync run:
  Success → reset consecutive_failures=0; status='active'
  Failure → increment consecutive_failures; persist last_error

If consecutive_failures >= 5:
  alertSink.alert({ severity:'critical',
    summary:`Sync degraded for ${tenantId}/${connectorId}`,
    details:{ consecutive_failures, last_error, last_success_at } })
  UPDATE tenant.tenant_connectors SET status='degraded'
   WHERE (tenant_id, connector_id) = …
  audit.recordAudit({ op:'sync.degraded', tenantId, connectorId, result:'failure' })
```

**Agent fallback (Epic 2):** when `tenant_connectors.status='degraded'`, the cache-first read auto-promotes to live Graph; the agent surfaces a soft notice if cache > 1h stale.

### 7.3 Health endpoint

`/healthz`:
- 200 if `scheduler.health().ready === true` AND last tick < 60s ago
- 503 otherwise — ECS pulls task out of the load balancer

## 8. Cold-start bootstrap

The first sync after tenant onboarding shouldn't wait for the next adaptive tick (up to 1 min Planner, 5 min Directory).

### 8.1 `worker.job_queue`

```
worker.job_queue
  id              bigserial pk
  job_id          text
  tenant_id       uuid
  args            jsonb
  scheduled_for   timestamptz default now()
  consumed_at     timestamptz
  consumed_by     text                       -- worker instance id
  attempts        smallint default 0
  last_error      text
  created_at      timestamptz default now()
INDEX (job_id, consumed_at, scheduled_for) WHERE consumed_at IS NULL
```

Owned by `@seta/worker`; lives in `worker` schema.

### 8.2 Wiring into Epic 1's admin-consent callback

```ts
// platform/oauth/src/routes.ts — extending step 4i from Epic 1 spec §7
async function adminConsentCallback(...) {
  // ... existing steps 4a-4i ...

  // 4j: enqueue cold-start sync for each consented connector
  for (const connectorId of state.connector_ids) {
    const def = registry.get(connectorId)
    if (def.capabilities.syncable) {
      await scheduler.enqueueNow(`sync.${connectorId}`, tenantId, { trigger: 'cold-start' })
    }
  }
}
```

API and worker share Postgres — no cross-process IPC. The worker tick (30s) drains `worker.job_queue` before processing adaptive schedules.

**Expected cold-start time** (AC-9): < 10 min for a tenant with <500 tasks. Initial `tasks/delta` fetches ~1-2 pages at 100/page; plans + buckets are smaller.

## 9. Error model (Epic 3 additions)

| Class | Use | Trigger |
|---|---|---|
| `SyncDegraded` | internal | 5 consecutive failures; surfaced as agent disclaimer |
| `DeltaTokenExpired` | internal | Graph 410 on delta call; triggers full re-sync; no user surface |
| `WorkerShuttingDown` | internal | Scheduler draining; new dispatches refused; in-flight completes |

## 10. Observability

**Spans:**
- `job.<id>` per invocation; attrs: `tenant_id`, `connector_id`, `delta_token_used`, `items_processed`, `errors`, `duration_ms`
- `scheduler.tick` per tick; attrs: `eligible_count`, `dispatched_count`
- `graph.<op>` (from §6 of Epic 2)

**Metrics:**
- `sync_runs_total{connector,result}` where result ∈ {ok, failure, partial, degraded_threshold_hit}
- `sync_items_processed_total{connector,kind}` where kind ∈ {upsert, soft_delete}
- `sync_delta_token_expired_total{connector}` — 410-triggered full resyncs
- `sync_band_transition_total{connector,from,to}` — active↔idle↔dormant
- `worker_job_queue_depth{job_id}` — backlog gauge
- `worker_job_duration_seconds{job_id}` — histogram
- `alert_sink_calls_total{sink,severity,result}`

## 11. Testing strategy

TDD per CLAUDE.md.

### 11.1 Unit

| Package | Tests |
|---|---|
| `platform/worker/scheduler` | tick dispatches due jobs; per-job concurrency cap; `stop()` drains in-flight |
| `platform/worker/adaptive` | band transitions on 24h, 7d boundaries; promoteIf logic |
| `platform/worker/runtime` | graceful shutdown flushes queue; `enqueueNow` writes job_queue row |
| `platform/observability/alert-sink` | MultiSink fan-out swallows per-sink errors; CloudWatch payload shape |
| `modules/connectors/ms365-planner/sync` | delta loop persists token; 410 → full re-sync; @removed → soft-delete; nextLink pagination |
| `modules/connectors/ms365-directory/sync` | users/groups delta; group membership reconciliation; orphaned-user marking |

### 11.2 Integration

- Real Postgres; msw-recorded Graph delta responses.
- **Failure escalation E2E**: 5 sustained errors → `tenant_connectors.status='degraded'` + alert sink called + audit row.
- **Cold start**: `enqueueNow` → tick within 30s → job runs → cache rows present.
- **Adaptive transition**: rig `last_agent_invocation_at` at 23h59m (active, 60s); advance to 24h01m → next tick treats as idle (15min).
- **Multi-tenant isolation**: kill sync for tenant A; verify tenant B continues.

### 11.3 E2E

Dev tunnel + real Entra dev app + real Planner dev tenant → bootstrap → wait 10 min → verify cache populated; agent reads < 200ms.

## 12. Acceptance criteria mapping

| AC (brainstorm Epic 3) | Where |
|---|---|
| AC-1: read p95 < 200ms from cache | Epic 2 cache + this epic populates it |
| AC-2: freshness < 5 min for active tenants | §6 PLANNER_BANDS.active = 60s |
| AC-3: 5-min outage recovery | §4 scheduler restart resumes from `sync_state.delta_token` |
| AC-4: app-only token, read-only | §5.1 `acquireAppOnly` with `Tasks.Read.All` only |
| AC-5: delta-token expiry → silent full re-sync | §5.2 410 handler |
| AC-6: per-tenant isolation | §4 per-job p-queue; RLS-scoped reads |
| AC-7: read-after-write same-user | Epic 2 write-through |
| AC-8: 5-failure alert + degraded status | §7.2 escalation |
| AC-9: cold start < 10 min for <500 tasks | §8 `enqueueNow` + delta initial pages |

## 13. Dependencies & version pins

Kernel paper contracts:
- `@seta/middleware/errors` + `DomainError`
- `@seta/tenant` context + `SET LOCAL` middleware
- `@seta/observability` logger + OTel SDK + AlertSink interface
- `@seta/db` migration runner including new `worker` schema
- `@seta/audit` writer

Epic 1+2 surfaces:
- `OAuthProvider.acquireAppOnly` (Epic 1 §6.1)
- `TokenVault` (Epic 1 §5.1)
- `ConnectorRegistry` (Epic 1 §8)
- Cache schemas + write-through (Epic 2 §5)

Third-party (additions):
- `p-queue@9.2.0` — per-job dispatcher
- (no new pins beyond Epic 1+2)

## 14. Deferrals

To Epic 4:
- `TeamsChannelAlertSink` (proactive message to `#seta-os-ops`).
- `dailyDigestJob` registered with the same scheduler.

To P2:
- **Multi-instance worker** with Postgres advisory locks per `(job_id, tenant_id)`.
- **LISTEN/NOTIFY queue** for sub-second cold-start dispatch.
- **Per-job dead-letter retention** beyond `attempts` count.
- **Tenant-admin sync status dashboard** in Studio.

To P3:
- Multi-region worker.

## 15. CLAUDE.md changes implied

None beyond Epic 1+2 — operates within established boundaries. Adds one new app under `apps/*` and one new package under `platform/*`; both follow existing tier rules.

## 16. References

- Epic 1 design: `docs/superpowers/specs/2026-05-11-ms365-auth-design.md`
- Epic 2 design: `docs/superpowers/specs/2026-05-11-ms365-planner-crud-design.md`
- Microsoft Learn — [plannerTask delta (beta)](https://learn.microsoft.com/en-us/graph/api/plannertask-delta?view=graph-rest-beta)
- Microsoft Learn — [users delta (v1.0)](https://learn.microsoft.com/en-us/graph/api/user-delta?view=graph-rest-1.0)
- Microsoft Learn — [groups delta (v1.0)](https://learn.microsoft.com/en-us/graph/api/group-delta?view=graph-rest-1.0)
