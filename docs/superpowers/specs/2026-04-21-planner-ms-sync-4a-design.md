# Sub-project #4a — Microsoft 365 Planner Two-Way Core Sync

**Status:** Design approved 2026-04-21. Implementation pending.
**Scope:** Core sync of plans, buckets, tasks, assignments, attachments. Comments are deferred to Sub-project #4b.
**Predecessors:** Sub-project #1 (planner-core), Sub-project #2 (planner-views), Sub-project #3 (personal-hubs) — all shipped.
**Briefing source:** [`docs/superpowers/plans/2026-04-18-planner-future-sub-projects.md`](../plans/2026-04-18-planner-future-sub-projects.md) — Sub-project #4 section.

---

## 1. Scope

### 1.1 What ships in #4a

- Per-tenant app-only OAuth integration with Microsoft Graph (tenant owns its AAD app registration).
- Tenant admin links M365 Groups; every current and future plan in the Group auto-syncs bidirectionally.
- Tenant admin may link or mint standalone Rosters (MS Graph beta API, flag-gated).
- Plan, bucket, task, taskDetails, assignments synchronization in both directions.
- Attachment round-trip via SharePoint `/drives` API; files live in both S3 and the Group's default SharePoint document library.
- Conflict resolution via pure last-writer-wins with Microsoft-tiebreak, driven by etag + `If-Match`.
- Soft-delete when Microsoft deletes a task, with layered Future features preserved (evidence, goal links, AI drafts).
- Admin observability: linked Groups / Rosters list with per-plan sync status, conflict log viewer, backfill progress, quota-limit surfacing.
- Pause / Destroy disconnect.

### 1.2 What is explicitly out of scope in #4a

- **Task comments** — deferred to Sub-project #4b. MS comments live on Outlook group conversations, not task-native; the comment subsystem is architecturally separable and significant on its own.
- **Premium / Project-for-the-Web** (timeline/Gantt, dependencies, goals) — Microsoft does not expose these via the Planner Graph API. They live in Dataverse behind a different API. Future builds these as layered features in Sub-project #5 with no sync path.
- **Delegated OAuth** — `web-admin` credential entry is the only auth mode. No per-user delegated flow.
- **Webhooks / change notifications** — Microsoft Graph does not publish change notifications for Planner resources as of April 2026. Polling is the only option.
- **Guest user sync** — guest assignees from MS plans sit in the unresolved-pending queue until the `identity` module adds guest-actor support.

### 1.3 Locked principles

| Principle                                     | Scope                                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **1:1 parity on the synced surface**          | Fields that MS Graph defines must round-trip exactly. Layered Future features stack on top without altering synced fields.                    |
| **Per-tenant AAD app registration**           | Each client tenant registers its own Entra app and stores `client_id` + `client_secret_ref` + `tenant_ad_id` in Future.                       |
| **Group-level linking**                       | Admin links a Group; every current and future plan in that Group auto-syncs. No per-plan opt-out in #4a.                                      |
| **Hard-block push on unresolvable assignees** | If a Future user has no AAD counterpart, assignments on MS-linked plans are rejected at the command-handler layer. Prevents asymmetric state. |
| **Soft-delete MS-originated deletes**         | MS task deletion → Future sets `ms_soft_deleted_at`; layered data preserved for audit.                                                        |
| **Last-writer-wins, MS-tiebreak**             | Pure LWW per field, driven by `If-Match` + 412 recovery. On collision, MS wins.                                                               |

## 2. Key Microsoft Graph facts (research-validated 2026-04-21)

| Fact                                                                                                                                                                                                                                                                                                                                    | Source / implication                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App-only permissions (`Tasks.Read.All`, `Tasks.ReadWrite.All`) **are supported** for plannerTask GET/POST/PATCH.                                                                                                                                                                                                                        | [`plannertask-update`](https://learn.microsoft.com/en-us/graph/api/plannertask-update?view=graph-rest-1.0) permissions table.                                                     |
| PATCH and DELETE require `If-Match: <etag>`. POST does not.                                                                                                                                                                                                                                                                             | Same page, Request headers section.                                                                                                                                               |
| plannerTask and plannerTaskDetails have **separate** etags (dual-etag).                                                                                                                                                                                                                                                                 | [`plannertaskdetails-update`](https://learn.microsoft.com/en-us/graph/api/plannertaskdetails-update?view=graph-rest-1.0).                                                         |
| **No** `/delta` or webhooks for Planner resources.                                                                                                                                                                                                                                                                                      | [Change notifications overview](https://learn.microsoft.com/en-us/graph/change-notifications-overview) — Planner absent from supported list.                                      |
| Rosters remain in `/beta`.                                                                                                                                                                                                                                                                                                              | [`plannerRoster` beta docs](https://learn.microsoft.com/en-us/graph/api/resources/plannerroster?view=graph-rest-beta).                                                            |
| Microsoft publishes **no Planner-specific throttling limits**. 429 + `Retry-After` is universal.                                                                                                                                                                                                                                        | [Graph throttling limits](https://learn.microsoft.com/en-us/graph/throttling-limits).                                                                                             |
| `$filter` not documented on plannerTask — etag diff is the only reliable change-detection.                                                                                                                                                                                                                                              | Absence from [plannerTask resource docs](https://learn.microsoft.com/en-us/graph/api/resources/plannertask?view=graph-rest-1.0).                                                  |
| Attachments are `taskDetails.references` → SharePoint URLs. Files store in the Group's default document library under `Planner/`.                                                                                                                                                                                                       | [Planner concept overview](https://learn.microsoft.com/en-us/graph/planner-concept-overview).                                                                                     |
| Documented 403 limit codes: `MaximumPlannerPlans` (200/group), `MaximumTasksInProject`, `MaximumActiveTasksInProject`, `MaximumBucketsInProject`, `MaximumReferencesOnTask`, `MaximumChecklistItemsOnTask` (20), `MaximumAssigneesInTasks`, `MaximumUsersSharedWithProject`, `MaximumTasksCreatedByUser`, `MaximumTasksAssignedToUser`. | [`planner-overview` common errors](https://learn.microsoft.com/en-us/graph/api/resources/planner-overview?view=graph-rest-1.0).                                                   |
| Order-hint values cannot be echoed back — must be computed.                                                                                                                                                                                                                                                                             | Same page; 400 error conditions.                                                                                                                                                  |
| Comments are Outlook group conversation posts, not native to the task.                                                                                                                                                                                                                                                                  | [Planner concept overview](https://learn.microsoft.com/en-us/graph/planner-concept-overview) — "Planner comments are based on Outlook group conversations."                       |
| Premium plans/tasks are inaccessible via `/planner`.                                                                                                                                                                                                                                                                                    | [`planner-overview`](https://learn.microsoft.com/en-us/graph/api/resources/planner-overview?view=graph-rest-1.0) — "Premium plans and tasks aren't available on the Planner API." |

## 3. Module architecture

### 3.1 Layout

Two modules receive new code. No new top-level module.

```
apps/api/src/modules/
├── identity/                           (MINIMAL additions — Plan 4.0)
│   ├── domain/
│   │   ├── entities/idp-group-member.entity.ts              (new)
│   │   └── ports/directory-provider.port.ts                 (extend: listGroupsWithMembers)
│   ├── application/
│   │   ├── facades/identity-query.facade.ts                 (+ listGroupMembers, getGraphCredential)
│   │   └── commands/sync-idp-groups.handler.ts              (populate idp_group_member)
│   ├── infrastructure/
│   │   ├── providers/microsoft-graph.provider.ts            (fill stub — real Graph client)
│   │   ├── repositories/idp-group-member.repository.ts      (new)
│   │   └── schema.ts                                        (+ idp_group_member)
│
└── planner/                            (SIGNIFICANT additions — Plans 4.1–4.7)
    ├── domain/
    │   ├── entities/
    │   │   ├── ms-linked-group.entity.ts, ms-linked-roster.entity.ts   (new)
    │   │   ├── ms-sync-conflict.entity.ts                              (new)
    │   │   ├── roster-member.entity.ts                                 (new)
    │   │   └── (existing plan/bucket/task entities)                    (+ ms_* value objects)
    │   ├── ports/
    │   │   ├── ms-planner-client.port.ts                               (extended; Phase-1 stub replaced)
    │   │   └── ms-sharepoint-client.port.ts                            (new — drives API)
    │   └── repositories/ (new repo interfaces per new entity)
    ├── application/
    │   ├── commands/ms-sync/
    │   │   ├── link-ms-group.handler.ts, unlink-ms-group.handler.ts
    │   │   ├── pause-tenant-sync.handler.ts, resume-tenant-sync.handler.ts
    │   │   ├── destroy-tenant-sync.handler.ts
    │   │   ├── mint-ms-roster.handler.ts, link-ms-roster.handler.ts
    │   │   ├── backfill-linked-group.handler.ts
    │   │   ├── poll-tenant.handler.ts
    │   │   ├── push-task.handler.ts, push-plan.handler.ts, push-bucket.handler.ts
    │   │   ├── push-attachment.handler.ts
    │   │   └── resolve-pending-assignments.handler.ts
    │   ├── event-handlers/ (MsSyncPushListener)
    │   └── facades/ (existing PlannerQueryFacade unchanged; no new cross-module export)
    ├── infrastructure/
    │   ├── ms-graph/
    │   │   ├── ms-graph-client.ts                            (thin-fetch, etag-aware)
    │   │   ├── ms-sharepoint-client.ts
    │   │   ├── ms-planner-client.adapter.ts                  (fills MsPlannerClientPort)
    │   │   ├── ms-sharepoint-client.adapter.ts
    │   │   ├── mappers/                                       (MS shape ↔ domain)
    │   │   ├── pull/                                          (pull workers)
    │   │   ├── push/                                          (push workers)
    │   │   └── backoff/                                        (retry policy, 429 tenant pause)
    │   ├── jobs/
    │   │   ├── ms-sync-poll-tenant.job.ts                     (recurring, per tenant)
    │   │   ├── ms-sync-push-task.job.ts                       (debounced, per task)
    │   │   ├── ms-sync-push-attachment.job.ts
    │   │   ├── ms-sync-backfill-group.job.ts                  (one-shot, per link)
    │   │   ├── ms-sync-pull-attachment.job.ts
    │   │   └── ms-sync-resolve-pending.job.ts                 (recurring, per tenant)
    │   ├── listeners/                                          (planner events → push enqueues)
    │   ├── repositories/
    │   └── schema.ts                                          (+ new tables, extend existing)
    └── interface/trpc/ (+ ms-sync router subtree for web-admin)

apps/web-admin/src/app/integrations/microsoft/                 (NEW)
├── page.tsx                       (connect/disconnect + status dashboard)
├── groups/page.tsx                (link/unlink Groups)
├── rosters/page.tsx               (flag-gated; Rosters tab)
├── conflicts/page.tsx             (ms_sync_conflict viewer)
└── backfill/[jobId]/page.tsx      (progress for one-shot backfill)

apps/web-planner/                                              (SMALL additions)
├── components/plan-header/ms-sync-badge.tsx
├── components/task-card/assignee-blocked-indicator.tsx
└── (existing new-plan form) (+ container picker)

packages/event-contracts/src/planner/ms-sync/                  (NEW)
├── ms-sync-enabled.event.ts, ms-sync-disabled.event.ts
├── ms-plan-linked.event.ts, ms-plan-unlinked.event.ts
├── ms-sync-conflict-raised.event.ts
├── ms-task-push-failed.event.ts
├── ms-sync-credential-invalidated.event.ts
└── ms-group-backfill-completed.event.ts, backfill-progress.event.ts
```

### 3.2 Data-flow overview

**Pull path (MS → Future, per tenant every 3 min):**

```
pg-boss cron (singletonKey=tenantId, 3 min, jittered)
     ↓
poll-tenant.handler
     1. Load ms_graph_credential; skip if status ≠ active.
     2. Acquire app-only token (tenant_ad_id + client_id + client_secret).
     3. For each ms_linked_group where sync_enabled AND NOT paused:
          a. GET /groups/{id}/planner/plans       (diff plans)
          b. For each plan: poll-plan subroutine   (§5)
          c. Delegate membership to IdentityQueryFacade.listGroupMembers
     4. For each ms_linked_roster (if flag on):
          a. GET /beta/planner/rosters/{id}/plans
          b. Per-plan loop as above
          c. GET /beta/planner/rosters/{id}/members → upsert roster_member
     5. On 429: set poll_paused_until per plan.
     6. Update ms_plan_sync_state bookkeeping.
     ↓
Mappers (MS → domain) write to planner repositories with origin='ms-sync-pull'
     ↓
outbox_event (for analytics / Athena); MsSyncPushListener skips origin=ms-sync-pull
```

**Push path (Future → MS, outbox-driven):**

```
planner command handler mutates DB and emits event
     ↓
outbox-relay (existing)
     ↓
MsSyncPushListener filters (skip future-only plans, skip origin=ms-sync-pull)
     ↓
boss.send('ms-sync-push-task', {...}, {singletonKey: taskId, startAfter: 2000})
     ↓
push-task.handler (after 2s debounce, bursts collapsed)
     1. Reload task; compute dirty fields from recent outbox events.
     2. Resolve assignees; hard-block if any unresolvable (§7).
     3. Build taskScopePatch + detailsScopePatch (only dirty fields).
     4. PATCH /planner/tasks/{id} with If-Match, then /details similarly.
     5. On 412 → recovery subroutine (re-GET, re-merge MS-tiebreak, retry once).
     6. On 429 → pause tenant push queue; honor Retry-After.
     7. On 403 quota, 401 auth, 5xx → routed to ms_sync_conflict with appropriate kind.
     ↓
Update inline etags on task row
```

### 3.3 Cross-module boundaries (DDD compliance)

- **Planner → Identity:** `IdentityQueryFacade` only:
  - `getExternalUserId(actorId, tenantId)` (existing)
  - `getActorIdByExternalUserId(aadUserId, tenantId)` (existing)
  - `listGroupMembers(externalGroupId, tenantId)` (NEW — Plan 4.0)
  - `getGraphCredential(tenantId)` (NEW — Plan 4.0)
- **Planner → Kernel:** `KernelAuditFacade` for authority events on link/unlink/disconnect.
- **Planner → Notifications:** via existing facade / events for credential-invalidation alerts.
- **Web-admin zone → API:** tRPC only. New `msSync.*` router subtree.
- Planner module `exports` stays facade-only per CLAUDE.md.

### 3.4 Graph client layer

**Thin direct-`fetch` client**, no Microsoft SDK:

- Avoids the SDK's `isomorphic-fetch` global patching and NodeNext+CJS compatibility friction.
- Full control over etag header formats (both `"..."` and `W/"..."` forms must be supported).
- Single TypeScript dependency: `@microsoft/microsoft-graph-types` (types only).

`MsGraphClient` is stateless. Every call: `{ tenantId, path, method, body?, etag? }`. Token acquisition caches per-tenant tokens in memory (1-hour TTL minus 5-min skew). Multi-replica behavior: acceptable for each replica to hold its own cache (tokens are independent and idempotent to re-acquire).

## 4. Data model

### 4.1 Identity schema additions (Plan 4.0)

```sql
CREATE TABLE identity.ms_graph_credential (
  tenant_id         UUID PRIMARY KEY REFERENCES core.tenant(id) ON DELETE CASCADE,
  client_id         TEXT NOT NULL,
  client_secret_ref TEXT NOT NULL,                  -- AWS Secrets Manager ARN
  tenant_ad_id      TEXT NOT NULL,                  -- AAD tenant GUID
  scopes            TEXT[] NOT NULL,                -- ['Tasks.ReadWrite.All','Files.ReadWrite.All','Group.Read.All','GroupMember.Read.All']
  status            TEXT NOT NULL DEFAULT 'active', -- active | invalid | paused
  consented_at      TIMESTAMPTZ NOT NULL,
  last_validated_at TIMESTAMPTZ,
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity.idp_group_member (
  tenant_id          UUID NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  external_group_id  TEXT NOT NULL,
  sso_subject        TEXT NOT NULL,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, external_group_id, sso_subject)
);
CREATE INDEX idx_idp_group_member_lookup ON identity.idp_group_member (tenant_id, external_group_id);
```

RLS: standard tenant-scoped policy. `ms_graph_credential` read/write by tenant admins; platform_admin read-only.

### 4.2 Planner schema additions

```sql
CREATE TABLE planner.ms_linked_group (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL,
  ms_group_id             TEXT NOT NULL,
  display_name            TEXT NOT NULL,                  -- cached; refreshed on poll
  linked_by_actor_id      UUID NOT NULL,
  linked_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_enabled            BOOLEAN NOT NULL DEFAULT true,  -- false when tenant-paused
  backfilling_at          TIMESTAMPTZ,                    -- non-null while initial backfill runs
  unlinked_at             TIMESTAMPTZ,                    -- soft-unlink
  UNIQUE (tenant_id, ms_group_id)
);

CREATE TABLE planner.ms_linked_roster (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL,
  ms_roster_id            TEXT NOT NULL,
  display_name            TEXT NOT NULL,
  linked_by_actor_id      UUID NOT NULL,
  linked_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_enabled            BOOLEAN NOT NULL DEFAULT true,
  minted_by_future_at     TIMESTAMPTZ,                    -- distinguishes "we created" from "admin linked existing"
  unlinked_at             TIMESTAMPTZ,
  UNIQUE (tenant_id, ms_roster_id)
);

CREATE TABLE planner.roster_member (
  tenant_id      UUID NOT NULL,
  ms_roster_id   TEXT NOT NULL,
  actor_id       UUID,                                    -- nullable while pending resolution
  sso_subject    TEXT NOT NULL,                           -- AAD OID; always present
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ms_roster_id, sso_subject)
);

CREATE TABLE planner.ms_plan_sync_state (
  plan_id                  UUID PRIMARY KEY REFERENCES planner.plan(id) ON DELETE CASCADE,
  tenant_id                UUID NOT NULL,
  ms_plan_id               TEXT NOT NULL,
  ms_plan_etag             TEXT,
  last_polled_at           TIMESTAMPTZ,
  last_successful_poll_at  TIMESTAMPTZ,
  consecutive_error_count  INTEGER NOT NULL DEFAULT 0,
  last_error_code          TEXT,
  last_error_message       TEXT,
  poll_paused_until        TIMESTAMPTZ,                   -- set on 429
  UNIQUE (tenant_id, ms_plan_id)
);

CREATE TABLE planner.ms_sync_conflict (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  kind              TEXT NOT NULL,
    -- 'field_lww' | 'push_412_exhausted' | 'push_403_quota' | 'push_failed'
    -- | 'pull_unresolved_assignee' | 'credential_invalidated' | 'attachment_upload_failed'
  task_id           UUID,
  plan_id           UUID,
  field             TEXT,
  mine_value        JSONB,
  theirs_value      JSONB,
  mine_changed_at   TIMESTAMPTZ,
  theirs_changed_at TIMESTAMPTZ,
  resolution        TEXT,
    -- 'applied_theirs' | 'applied_mine' | 'deferred' | 'dropped' | null
  resolved_by_actor_id UUID,
  resolved_at       TIMESTAMPTZ,
  raw_error         JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ms_sync_conflict_tenant
  ON planner.ms_sync_conflict (tenant_id, resolved_at NULLS FIRST, created_at DESC);
```

All new planner tables tenant-scoped with standard RLS.

### 4.3 Extensions to existing planner tables

Sub-project #1 reserved most of these. `#4a` assumes present or adds via migration.

**`planner.plan`**: `container_type` enum (`'future_only' | 'ms_group' | 'ms_roster'`), `container_ref TEXT` (holds `ms_group_id` or `ms_roster_id` per type, NULL for `future_only`), `ms_plan_id TEXT`, `ms_plan_etag TEXT` (mirror of sync_state for fast reads; pull worker is single writer), `is_ms_archived BOOLEAN` (set when plan disappeared from MS for N polls).

**`planner.bucket`**: `ms_bucket_id TEXT`, `ms_bucket_etag TEXT`.

**`planner.task`**: `ms_task_id TEXT`, `ms_task_etag TEXT` (plannerTask resource etag), `ms_details_etag TEXT` (plannerTaskDetails resource etag — dual-etag), `pending_ms_assignments JSONB` (array of unresolved AAD OIDs), `ms_soft_deleted_at TIMESTAMPTZ`, `ms_conversation_thread_id TEXT` (reserved for #4b, unused in #4a), `last_pushed_at TIMESTAMPTZ` (push cursor).

**`planner.task_comment`**: `ms_thread_id, ms_post_id, ms_post_etag` — reserved for #4b, unused in #4a.

**`planner.task_attachment`**: `ms_reference_url TEXT`, `ms_sharepoint_drive_id TEXT`, `ms_sharepoint_item_id TEXT`, `ms_sync_state TEXT` (`'synced' | 'pending_upload' | 'pending_download' | 'not_syncable'`).

### 4.4 Layered feature tables — unchanged

`task_evidence`, `task_goal_link` (Sub-project #5), `task_ai_draft` (Sub-project #5) receive no modifications. Soft-deleted synced tasks (`ms_soft_deleted_at IS NOT NULL`) retain their layered data; admin UI for deleted tasks surfaces this.

## 5. Pull engine

### 5.1 Job topology

One recurring pg-boss job per tenant. `singletonKey: tenant_id`, 3-minute cadence, jittered start offset 0–180s per tenant. If a run exceeds 3 min, next tick is skipped rather than queued. Registered on `MsSyncEnabledEvent`; cancelled on pause/destroy.

### 5.2 Worker sequence

```
poll-tenant.handler (tenantId)
  1. Load credential; exit if status ≠ 'active'.
  2. Acquire or reuse cached token.
  3. For each ms_linked_group where sync_enabled AND backfilling_at IS NULL:
       a. GET /groups/{id}/planner/plans
          - new plans → create planner.plan + ms_plan_sync_state; enqueue per-plan backfill
          - missing plans → mark is_ms_archived=true; soft-delete
       b. For each plan: poll-plan subroutine.
       c. Membership: IdentityQueryFacade.listGroupMembers (no planner-owned materialization).
  4. For each ms_linked_roster (flag on):
       a. GET /beta/planner/rosters/{id}/plans; per-plan loop.
       b. GET /beta/planner/rosters/{id}/members → upsert roster_member (planner-owned).
  5. Update ms_plan_sync_state cursors and error state.
```

### 5.3 Poll-plan subroutine

```
poll-plan (planId, ms_plan_etag)
  1. GET /planner/plans/{ms_plan_id} with If-None-Match
       - 304 → skip plan-scope
       - 200 → upsert plan, update etag
  2. GET /planner/plans/{ms_plan_id}/buckets
       - list; compare each @odata.etag to ms_bucket_etag; upsert changed
  3. GET /planner/plans/{ms_plan_id}/tasks  (paged via @odata.nextLink)
       - for each task, compare etag → upsert if changed
       - for tasks with dirty plannerTask etag or missing details etag:
           GET /planner/tasks/{id}/details with If-None-Match → upsert on 200
       - deletions: any local task with ms_task_id not in the current MS list → set ms_soft_deleted_at=now()
  4. Assignee resolution:
       for each assignment's AAD OID:
         actorId = IdentityQueryFacade.getActorIdByExternalUserId(aadOid, tenantId)
         resolved → write to task.assignees
         unresolved → append to pending_ms_assignments JSONB
  5. Attachment references:
       for references present in taskDetails but missing from task_attachment:
         enqueue ms-sync-pull-attachment (non-blocking)
       for task_attachment rows with ms_reference_url missing from current references:
         MS deleted → soft-delete local task_attachment
```

### 5.4 Attachment pull (non-blocking)

```
ms-sync-pull-attachment ({ taskAttachmentId, msReferenceUrl })
  1. Parse URL → siteId, driveId, itemId.
  2. GET /sites/{siteId}/drives/{driveId}/items/{itemId}/content → binary stream.
  3. Stream-upload to S3 via @future/storage.
  4. Update task_attachment: s3_key, sharepoint_ids, ms_sync_state='synced'.
  5. On failure: ms_sync_state='pending_download'; retried by nightly cron.
```

### 5.5 Rate-limit & error handling

- **429**: parse `Retry-After`; set `poll_paused_until` for every plan being polled in this run; exit handler cleanly. Next 3-min tick checks `poll_paused_until` per plan.
- **401 / invalid_grant**: mark `ms_graph_credential.status='invalid'`; cancel cron; emit `MsSyncCredentialInvalidatedEvent`; notifications module emails tenant admins.
- **403 with documented limit code**: log to `ms_sync_conflict(kind='pull_quota')` with the limit code; continue polling other plans.
- **5xx / network**: exponential back-off within the run; persistent failure increments `consecutive_error_count`. After 10 consecutive failures a plan auto-pauses for 1 hour and emits an admin banner.

### 5.6 Backfill (one-shot, per Group link)

Triggered by `msSync.groups.link`:

```
ms-sync-backfill-group (tenantId, msLinkedGroupId)
  Target rate: 3 RPS (gentler than steady poll).
  Emits BackfillProgressEvent { jobId, total, processed } every N tasks.
  On completion: MsGroupBackfillCompletedEvent; clear ms_linked_group.backfilling_at.
  On pause or fail: admin UI shows "Resume backfill".
```

While `backfilling_at IS NOT NULL`, the steady-state poll worker skips this Group to prevent double-fetch thrash.

### 5.7 Echo suppression

- Pull worker writes through repositories; outbox events emitted carry `origin: 'ms-sync-pull'` inside the event payload JSONB (the existing `core.outbox_event` schema has no `origin` column — we use the payload rather than migrate).
- `MsSyncPushListener` inspects `payload.origin` and skips events whose origin begins with `ms-sync-`.
- All planner command handlers already pass through outbox; Plan 4.3 standardizes the `origin` field in all payload emitters so the listener can dedupe reliably.

### 5.8 Membership semantics

Per linked-Group plans, membership is derived on-demand from `identity.idp_group_member`. Planner does not own a copy. Per linked-Roster plans, membership is synced by planner into `planner.roster_member`. Future-only plans use the existing explicit member list.

```
plan_member(plan_id) =
  CASE plan.container_type
    WHEN 'ms_group'      THEN SELECT actor_id FROM identity group-member join on container_ref
    WHEN 'ms_roster'     THEN SELECT actor_id FROM planner.roster_member WHERE ms_roster_id = container_ref
    WHEN 'future_only'   THEN SELECT actor_id FROM planner.plan_member_explicit WHERE plan_id = plan.id
  END
```

RLS policies on `plan` and `task` join through this derivation. Staleness window matches identity's directory-sync cadence — acceptable.

## 6. Push engine

### 6.1 Job topology

Push is event-driven, not cron-driven. Separate pg-boss jobs per entity kind, each with `singletonKey` equal to the entity ID and `startAfter: 2000ms` for debounce. (Attachments use `startAfter: 500ms`.)

| Job                       | Key                  |
| ------------------------- | -------------------- |
| `ms-sync-push-task`       | `task_id`            |
| `ms-sync-push-plan`       | `plan_id`            |
| `ms-sync-push-bucket`     | `bucket_id`          |
| `ms-sync-push-attachment` | `task_attachment_id` |

Subsequent `boss.send` calls with the same key while a job is scheduled dedupe silently. No hand-rolled debounce.

### 6.2 Listener

`MsSyncPushListener` subscribes to every planner outbox event:

```
on planner.task.* event:
  if plan.container_type == 'future_only' → skip.
  if event.origin begins with 'ms-sync-' → skip.
  if credential status ≠ active or tenant_push_paused_until > now() → requeue-later or skip.
  else boss.send('ms-sync-push-task', {taskId, tenantId}, {singletonKey: taskId, startAfter: 2000}).
```

Same for plan/bucket/attachment events.

### 6.3 push-task worker

Runs 2 s after first event. By then, bursts have consolidated.

```
ms-sync-push-task.handler ({ taskId, tenantId })
  1. Load task (current DB state).
  2. Confirm plan still MS-linked and tenant not paused.
  3. Compute dirty field set from outbox events since last_pushed_at (origin ≠ 'ms-sync-*').
  4. Assignee resolution (if 'assignees' dirty):
       for each assignee: if getExternalUserId returns null → throw AssigneeBlockedError.
       AssigneeBlockedError surfaces as a conflict row with kind='push_failed', human-readable cause;
       task shows assignee-blocked badge in web-planner.
  5. Attachment changes (if 'attachments' dirty):
       enqueue push-attachment per changed row; continue with task push.
  6. Build taskScopePatch and detailsScopePatch (only dirty fields).
  7. PATCH /planner/tasks/{id} with If-Match: <ms_task_etag>, Content-Type, Prefer: return=representation.
       On 200 → update ms_task_etag from response.
  8. PATCH /planner/tasks/{id}/details with If-Match: <ms_details_etag>.
       On 200 → update ms_details_etag.
  9. 412 → 412-recovery subroutine (§6.4).
 10. 429 → tenant-scoped pause (§6.5).
 11. 403 + limit-code → ms_sync_conflict(kind='push_403_quota'); exit.
 12. 401 / invalid_grant → credential invalidation cascade (§7.4).
 13. 5xx / network → exponential retry up to 5 attempts / 30 min; then ms_sync_conflict(kind='push_failed').
 14. Update task.last_pushed_at.
```

### 6.4 412 recovery subroutine

Pure LWW with MS-tiebreak. No pre-check; let the 412 tell us.

```
412-recovery (taskId, whichResource, originalPatch, prePushValues)
  1. GET fresh resource (plannerTask or plannerTaskDetails) with new etag.
  2. For each field in originalPatch:
       if MS's current value == prePushValues[field]:
         field is ours to write — keep in merge
       else:
         MS changed this field too — MS-tiebreak wins; drop from merge;
         log ms_sync_conflict(kind='field_lww', field, mine_value, theirs_value,
                               resolution='applied_theirs')
  3. If merged body empty → done.
  4. Re-PATCH with new If-Match + merged body.
  5. On second 412 → do NOT retry further; log ms_sync_conflict(kind='push_412_exhausted'); exit.
```

`prePushValues` is captured at step 1 of push-task.handler before any network I/O; passed through as handler local state. No new table needed.

### 6.5 429 tenant-scoped throttle

```
On 429 anywhere in tenant's push jobs:
  1. Parse Retry-After.
  2. Set tenant_push_paused_until = now() + retry_after (on ms_graph_credential or a dedicated column).
  3. Requeue current job with matching delay via boss error.
  4. MsSyncPushListener checks tenant_push_paused_until and skips enqueue during the window,
     or enqueues with startAfter matching pause.
  5. On first successful push post-pause: clear tenant_push_paused_until.
```

### 6.6 Plan / bucket push

Simpler bodies. Plan containers are immutable in MS — `container` is never pushed. Bucket orderHint follows MsOrderHint algorithm (ported in Sub-project #1, contract-tested nightly per §9.3).

**Create flows** (Future-originated plan or bucket, container ≠ future_only):

- **Plan**: POST `/planner/plans` with `{ container: {@odata.type:'microsoft.graph.plannerGroupContainer', containerId: ms_group_id, type:'group'}, title }`. Rosters use container type `'roster'`. POST does not require `If-Match`. Store `ms_plan_id` and `ms_plan_etag` on success.
- **Bucket**: POST `/planner/buckets` with `{ planId: ms_plan_id, name, orderHint }`.

### 6.7 Attachment push (SharePoint round-trip)

```
ms-sync-push-attachment ({ attachmentId, tenantId })
  Only for kind='file' with ms_sync_state='pending_upload'.
  1. Resolve Group's default SharePoint drive:
       GET /groups/{ms_group_id}/sites/root → siteId
       GET /sites/{siteId}/drive → driveId
  2. Ensure /Planner/{plan_title}/ folder; create if missing.
  3. Upload:
       < 4 MB:  PUT /drives/{driveId}/items/root:/Planner/{plan}/{filename}:/content
       ≥ 4 MB:  createUploadSession + chunked PUT
     Stream body from S3 via @future/storage.
  4. Response carries { webUrl, id, parentReference.driveId, ... }.
  5. PATCH /planner/tasks/{ms_task_id}/details with If-Match:
       { references: { "<encoded_url>": {
           "@odata.type": "#microsoft.graph.plannerExternalReference",
           alias: filename, type: "Other" } } }
  6. Update task_attachment: ms_sharepoint_{drive_id,item_id}, ms_reference_url, ms_sync_state='synced'.
  7. Failure → ms_sync_state='pending_upload'; nightly retry.

Roster-container plans have no SharePoint site. For rosters, attachments are marked
ms_sync_state='not_syncable'. UX banner communicates the limitation — matches MS itself
(MS Planner on rosters also offers no attachment surface).
```

### 6.8 Dead-letter / manual retry

Every terminal push failure lands in `ms_sync_conflict` with the appropriate kind. Admin UI's conflict viewer has Retry / Accept-MS-state actions per row.

## 7. Conflict resolution & error surfacing

### 7.1 Conflict taxonomy

All conflicts land in `planner.ms_sync_conflict` with a `kind` tag.

| `kind`                     | Emitted when                                                   | Initial `resolution` | Admin action                        |
| -------------------------- | -------------------------------------------------------------- | -------------------- | ----------------------------------- |
| `field_lww`                | 412 recovery finds both sides changed the same field; MS wins. | `applied_theirs`     | View (audit)                        |
| `push_412_exhausted`       | Two consecutive 412s on the same resource.                     | null                 | Retry or Accept MS state            |
| `push_403_quota`           | MS returned 403 with documented limit code.                    | null                 | Tenant admin must remediate in MS   |
| `push_failed`              | Non-retryable push error after all attempts.                   | null                 | Retry                               |
| `pull_unresolved_assignee` | Assignee AAD OID unknown to identity.                          | `deferred`           | Auto-resolves on next identity sync |
| `credential_invalidated`   | 401 / invalid_grant on token acquire.                          | null                 | Admin reconnects                    |
| `attachment_upload_failed` | SharePoint round-trip failed after retries.                    | null                 | Retry or delete attachment          |

### 7.2 LWW mechanics

Only asserted in 412 recovery. No proactive LWW comparison. When MS wins: `ms_sync_conflict(kind='field_lww', resolution='applied_theirs')`. When Future wins (MS changed an unrelated field): second PATCH succeeds; no conflict row because no collision occurred.

### 7.3 Quota-limit routing

- `MaximumPlannerPlans` (200 per Group), `MaximumTasksInProject`, etc. — row in `ms_sync_conflict` with humanreadable hint.
- Per-task caps (`MaximumChecklistItemsOnTask`, `MaximumAssigneesInTasks`, `MaximumReferencesOnTask`) additionally surface an inline banner on the task in `web-planner` so the owning user trims without routing through admin.

### 7.4 Credential invalidation cascade

1. Mark `ms_graph_credential.status='invalid'`, populate `last_error`.
2. Cancel `ms-sync-poll-tenant` cron; fail all pending push jobs.
3. Emit `MsSyncCredentialInvalidatedEvent`; notifications module emails tenant admins.
4. `web-admin/integrations/microsoft` shows red banner with **Reconnect** action.
5. On successful reconnect: `status='active'`, re-register cron, queued work resumes naturally.

### 7.5 Pending assignee resolution

- `ms-sync-resolve-pending` job runs after every `identity.run-directory-sync` completion and as a nightly fallback.
- Iterates `task.pending_ms_assignments`; attempts `getActorIdByExternalUserId` per OID.
- Resolved → add to `task.assignees` (local only; MS already has these).
- Still unresolved → stay in the queue.
- **Roster members.** Same job iterates `planner.roster_member WHERE actor_id IS NULL AND sso_subject IS NOT NULL`; on resolution, writes `actor_id` so the member starts seeing the plan (plan_member derivation filters NULL actor_id rows).

### 7.6 Loop prevention

- Push workers do not emit domain events on successful push. If push observability events are needed, they use `origin='ms-sync-push'` in a separate outbox row the push listener filters out.
- Pull workers always emit `origin='ms-sync-pull'`.
- Conflict row writes do not trigger any listener that would re-enqueue push.
- Attachment upload → task-details PATCH → push cycle is intentional (adds the reference); not an echo.

### 7.7 Observability

Structured logs per sync action include `tenant_id`, entity IDs, `direction`, `http_status`, `etag_before/after`, `outcome`. Outbox events for analytics: `MsSyncPollCompletedEvent`, `MsSyncPushCompletedEvent`, `MsSyncConflictRaisedEvent`, `MsSyncCredentialInvalidatedEvent`, `MsGroupBackfillCompletedEvent`. Downstream Glue ETL picks them up.

Dedicated Grafana dashboards are a follow-up once operational data exists.

## 8. Admin & user UX

All UI uses `@future/ui` primitives + DESIGN.md tokens. Icons from `lucide-react`. Cross-zone navigation (`web-admin` ↔ `web-planner`) is hard `<a>` reload per CLAUDE.md.

### 8.1 web-admin states

**Not connected:** Card prompting admin to Connect Microsoft 365. Click → modal for `Tenant (directory) ID`, `Application (client) ID`, `Client secret` (with Paste action); server validates via `GET /v1.0/groups?$top=1` before writing the credential.

**Active:** Dashboard with linked Groups table (Name, Plans count, Status dot, Last poll, Actions), Rosters tab (flag-gated), Conflicts tab with open-count badge, and a **Disconnect ▾** dropdown (`Pause` default, `Disconnect (keep data, convert to Future-only)`).

**Invalid:** Red banner replaces the card with a Reconnect action.

### 8.2 Link Groups drawer

Pulls AAD groups via `identity.listGroups`. Admin picks; row created; backfill job queued. Slide-over opens with SSE-driven progress.

### 8.3 Rosters tab (flag-gated)

- **+ New Roster** form: roster name + member picker. POSTs `/beta/planner/rosters` with the inviting admin's AAD OID.
- **+ Link existing Roster**: paste roster ID (rosters aren't enumerable by tenant — only by owner+ID).
- Yellow banner if `/beta/planner/rosters` returns 4xx indicating MS disabled rosters globally.

### 8.4 Conflicts tab

Table over `ms_sync_conflict WHERE resolved_at IS NULL`, with History toggle. Per-row View drawer; Retry / Accept MS state actions.

### 8.5 Backfill progress slide-over

Progress bar + estimate + Pause action. Auto-opens on link. Closes on completion; toast summary.

### 8.6 web-planner additions

**New plan form:** Container dropdown (Future-only / MS Groups / Rosters). Hidden if no containers available.

**Plan header badges:** sync status dot with tooltip (synced, paused, error).

**Task card badges:** `Assignee can't be synced` (push-blocked), `Attachment pending upload`. No badges on happy-path synced tasks.

**Task detail "Microsoft 365 sync" section:** last sync time, MS task ID, `Force re-sync from MS` (tenant_admin-gated, destructive confirmation).

### 8.7 Personal Hubs interaction

My Plans / My Tasks / My Day unchanged in #4a. MS-linked plans appear alongside Future-only plans. Layered features (evidence, goal links) remain usable on MS-linked tasks per Q8.

### 8.8 DESIGN.md compliance highlights

Destructive actions behind `<ConfirmDialog>` with explicit type-to-confirm on irreversible paths (`Disconnect-destroy`). Status dots use `status/success`, `status/warning`, `status/danger` DESIGN.md tokens. Tables use `<DataTable>`. Empty states use DESIGN.md iconography.

## 9. Feature flags, testing, rollout

### 9.1 Flag hierarchy

```
planner.core.enabled                          (shipped in #1)
 └─ planner.ms_sync.enabled                   (NEW — gates all of #4a)
     ├─ planner.ms_sync.rosters.enabled       (NEW — beta-API safety valve)
     └─ planner.ms_sync.attachments.enabled   (NEW — SharePoint kill-switch)
```

Per-tenant. Hierarchy enforced at render and handler layers.

### 9.2 Kernel permissions

`planner.ms_sync.connect`, `planner.ms_sync.link_group`, `planner.ms_sync.conflict.resolve`, `planner.ms_sync.force_resync`. Tenant_admin assigned by default.

### 9.3 Testing

**Unit (Vitest, co-located `.spec.ts`):** every command handler (happy + each error path); mappers exhaustively (null, missing, max-length, open-type `@odata.type`); `MsGraphClient` with mocked fetch (all retry paths, both etag wrap forms, pagination); conflict resolution subroutine (table-driven test matrix). ≥70% coverage per CLAUDE.md.

**Integration (Testcontainers + real Postgres + mocked Graph):** full pull cycle; full push cycle; echo suppression; backfill end-to-end; credential invalidation cascade.

**Contract test against SETA sandbox tenant (nightly CI):** dedicated MS developer tenant + SETA-owned app. Exercises full Graph client + mappers against live endpoints. Specifically validates the MsOrderHint algorithm still agrees with MS. Failure files a GitHub issue + Slack alert; does not block main.

**E2E (Playwright, `apps/e2e`):** admin connect flow; backfill progress SSE; conflict resolution; container picker; end-to-end sync against a test MS tenant.

**Performance budgets (CI-enforced):**

- `poll-tenant` at 100 plans × 100 avg tasks: p95 < 60 s.
- `push-task` outbox event → ACK: p95 < 5 s.
- Backfill throughput: ≥ 2 tasks/s sustained.

### 9.4 Rollout sequence

Each plan's final commit flips its flag on for SETA internal tenant only. Gates:

1. Internal SETA tenant green for 2 weeks after each plan merged.
2. One pilot external tenant per plan, feedback captured.
3. Tenant-by-tenant opt-in; no bulk flip.
4. Platform_admin dashboard gains per-tenant sync health row.

**Kill switches:**

- `planner.ms_sync.enabled` → false: poll crons cancelled; push jobs drain; credential preserved; admin UI shows "Sync disabled by SETA."
- `planner.ms_sync.attachments.enabled` → false: new uploads marked `not_syncable`; task sync continues.

### 9.5 Security review checkpoints

**Before Plan 4.0 merge:** credential stored **by reference** in AWS Secrets Manager; only ARN in Postgres. Log redaction verified. RLS policies audited.

**Before Plan 4.2 merge:** pen review on token acquisition failure paths; CORS/referrer policies on the integrations page.

## 10. Phasing into implementation plans

### 10.1 Plan list

| #   | Plan                                                  | Module(s)                             | Size | Depends on                           |
| --- | ----------------------------------------------------- | ------------------------------------- | ---- | ------------------------------------ |
| 4.0 | Identity — Microsoft Graph completion                 | `identity`                            | M    | —                                    |
| 4.1 | Tenant connect flow + token acquisition + admin shell | `identity`, `planner`, `web-admin`    | M    | 4.0                                  |
| 4.2 | Link Groups + one-shot backfill (pull-only)           | `planner`, `web-admin`                | L    | 4.1                                  |
| 4.3 | Pull engine (steady-state polling)                    | `planner`                             | L    | 4.2                                  |
| 4.4 | Push engine (field-dirty + 412 + conflict log)        | `planner`                             | L    | 4.3                                  |
| 4.5 | Attachments (SharePoint round-trip)                   | `planner`, `web-admin`, `web-planner` | M    | 4.4                                  |
| 4.6 | Rosters (beta, flag-gated)                            | `planner`, `web-admin`, `web-planner` | M    | 4.4                                  |
| 4.7 | Conflict viewer + force-resync + polish + E2E rollout | `planner`, `web-admin`, `web-planner` | M    | 4.4 (core), 4.5 / 4.6 (for coverage) |

**Parallelism:** Plans 4.5 and 4.6 may be worked in parallel by different contributors once 4.4 merges. Plan 4.7 requires both ready.

### 10.2 Plan exit criteria

**Plan 4.0 — Identity module Microsoft Graph completion.**

- `identity.ms_graph_credential` and `identity.idp_group_member` migrations applied with RLS.
- `MicrosoftGraphProvider` fully implemented (`listUsers`, `listGroupsWithMembers`) against real Graph.
- `IdentityQueryFacade` extended with `listGroupMembers(externalGroupId, tenantId)` and `getGraphCredential(tenantId)`.
- `sync-idp-groups.handler` populates `idp_group_member`.
- tRPC surface for admin credential write (validation only — no linking yet).
- **Exit:** `listGroupMembers` returns correct members for a live AAD group. Unit + integration tests green.

**Plan 4.1 — Connect flow + admin shell.**

- `web-admin/integrations/microsoft/page.tsx` with all three states.
- tRPC `msSync.connect`, `msSync.disconnect.pause`, `msSync.disconnect.destroy`.
- `MsSyncEnabledEvent`, `MsSyncDisabledEvent`, `MsSyncCredentialInvalidatedEvent` contracts.
- Notifications wiring for credential invalidation.
- Kernel permissions registered.
- **Exit:** Admin can connect/disconnect; no syncing yet.

**Plan 4.2 — Link Groups + backfill (pull-only mode).**

- Migrations for `ms_linked_group`, `ms_plan_sync_state`, extensions to `plan/bucket/task`.
- `MsGraphClient` production implementation.
- tRPC `msSync.groups.{listAvailable, link, unlink}`.
- `ms-sync-backfill-group.job.ts` with progress events.
- Mappers `msPlanToFuture`, `msBucketToFuture`, `msTaskToFuture`, `msTaskDetailsToFuture`.
- web-admin Linked Groups UI + backfill slide-over with SSE.
- **Pull-only mode:** Future-side edits do not push to MS in this plan. Documented limitation resolved in 4.4.
- **Exit:** Linking a Group imports plans + tasks within ~5 min; membership reads via `IdentityQueryFacade.listGroupMembers`.

**Plan 4.3 — Pull engine.**

- `ms-sync-poll-tenant.job.ts` cron with jittered offset.
- Poll + poll-plan subroutines; etag diffing; deletion detection with layered preservation.
- Rate-limit handling (429/401/403); echo-suppression plumbing (standardize `payload.origin` across planner outbox emitters — no schema migration needed).
- Pending-assignee queue + `ms-sync-resolve-pending.job.ts` (task-level only in 4.3; roster-level resolution added in 4.6).
- **Exit:** Sustained polls against a live MS tenant; MS changes appear in Future within 3 min.

**Plan 4.4 — Push engine.**

- `MsSyncPushListener`; push-task / push-plan / push-bucket handlers.
- Dirty-field tracking in outbox event payloads.
- 412 recovery with pre-push value capture.
- Field-level LWW + MS-tiebreak + `ms_sync_conflict` writes.
- 429 tenant-scoped pause; 403-quota surfacing.
- Creation pushes (POST /planner/plans, /planner/tasks).
- **Exit:** Bidirectional task sync end-to-end; 412 recovers cleanly once then logs; conflicts appear in DB.

**Plan 4.5 — Attachments (SharePoint round-trip).**

- `MsSharePointClient` thin-fetch; chunked upload support.
- `ms-sync-push-attachment.job.ts`; pull-attachment integrated into poll.
- `planner.ms_sync.attachments.enabled` kill-switch.
- Roster-plan `not_syncable` UX.
- **Exit:** File attached in Future appears in MS Planner (and SharePoint); file attached in MS appears in Future (downloaded to S3); kill-switch disables cleanly.

**Plan 4.6 — Rosters.**

- Migrations for `ms_linked_roster`, `roster_member`.
- tRPC `msSync.rosters.{listLinked, linkExisting, mint, unlink}`.
- Beta API client surface for `/beta/planner/rosters/*`.
- Roster-scoped poll delegated to 4.3 with member sync.
- web-admin Rosters tab + web-planner container picker extension.
- `planner.ms_sync.rosters.enabled` flag + global-disable banner.
- **Exit:** Admin can mint a roster + plan from Future; flag-off disables gracefully.

**Plan 4.7 — Conflict viewer + polish + rollout.**

- web-admin conflicts page with Retry / Accept actions.
- Force re-sync (admin-gated) in task detail.
- Sync status badges on plan header + task card.
- Contract test against SETA sandbox + GitHub issue bot on failure.
- Full E2E Playwright coverage.
- Performance budget CI tests enforced.
- Platform_admin dashboard sync-health row.
- Flip `planner.ms_sync.enabled` on for SETA internal; 2-week watch window; invite first external pilot.
- **Exit:** SETA tenant green 2 weeks; zero unresolved conflicts; all test suites green.

### 10.3 Decisions deferred into plan execution

- Plan 4.1: exact OAuth redirect allow-list (SETA ops input).
- Plan 4.2: backfill RPS target (default 3; tune after first real tenant).
- Plan 4.3: contract-test cadence + sandbox provisioning runbook.
- Plan 4.5: chunked-upload threshold tuning (Graph switches at 4 MB).
- Plan 4.7: external pilot tenant selection.

### 10.4 Out of scope, for clarity

- Comments sync (#4b).
- Group-level throttles — we rely on MS's 429 response, not our own pre-throttle.
- Webhook migration — if MS ships Planner change notifications in future, add a subscription adapter behind a flag; all polling code stays as fallback.
- Guest users — depend on identity's future guest-actor support; until then unresolved-queue.

---

## Appendix A — Source research

- [Planner API overview (v1.0)](https://learn.microsoft.com/en-us/graph/api/resources/planner-overview?view=graph-rest-1.0)
- [Planner concept overview](https://learn.microsoft.com/en-us/graph/planner-concept-overview)
- [Update plannerTask (v1.0)](https://learn.microsoft.com/en-us/graph/api/plannertask-update?view=graph-rest-1.0)
- [Create plannerTask (v1.0)](https://learn.microsoft.com/en-us/graph/api/planner-post-tasks?view=graph-rest-1.0)
- [Get plannerTask (v1.0)](https://learn.microsoft.com/en-us/graph/api/plannertask-get?view=graph-rest-1.0)
- [Create plannerRoster (beta)](https://learn.microsoft.com/en-us/graph/api/planner-post-rosters?view=graph-rest-beta)
- [plannerRoster resource type (beta)](https://learn.microsoft.com/en-us/graph/api/resources/plannerroster?view=graph-rest-beta)
- [Microsoft Graph throttling](https://learn.microsoft.com/en-us/graph/throttling)
- [Microsoft Graph service-specific throttling limits](https://learn.microsoft.com/en-us/graph/throttling-limits)
- [Change notifications overview (Planner absent)](https://learn.microsoft.com/en-us/graph/change-notifications-overview)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)

## Appendix B — Decision log (brainstorm 2026-04-21)

Key question-by-question outcomes from the brainstorm that produced this spec.

| #    | Question                                                                   | Decision                                                                                                          |
| ---- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1    | Scope split: comments in or out?                                           | Split — #4a (core), #4b (comments deferred).                                                                      |
| 2    | AAD app registration model                                                 | B — per-tenant app registrations.                                                                                 |
| 3    | Linking granularity                                                        | A — Group-level; auto-sync all plans in linked Group.                                                             |
| 4    | Future-side plan creation container picker                                 | A — picker at create time.                                                                                        |
| 4.2  | Push-time author attribution (app-only makes everything look like the bot) | 1 — accept. MS's native behavior with app integrations.                                                           |
| 5    | Attachment sync                                                            | A — full SharePoint round-trip.                                                                                   |
| 6    | Rosters                                                                    | Flag-gated; mintable from Future; owner via `IdentityQueryFacade`.                                                |
| 7    | Conflict policy                                                            | A — pure LWW, MS-tiebreak, driven by etag / 412.                                                                  |
| 8    | Layered features on MS-linked plans                                        | A — layered features work everywhere; additive asymmetry acceptable.                                              |
| 9    | Assignee reconciliation                                                    | Pull: pending queue; Push: hard-block.                                                                            |
| 10   | MS-originated deletes                                                      | B — soft-delete in Future; preserve layered data.                                                                 |
| 11   | Poll architecture                                                          | Per-tenant job; 3-min fixed; etag diff; inline task etags + separate `ms_plan_sync_state`.                        |
| 12   | Push architecture                                                          | Debounced per-task job; field-dirty PATCH; 412 single-retry then conflict; 429 tenant-pause; 403-quota surfacing. |
| 13.1 | Membership sync model                                                      | C — identity for AAD Groups (extended to support it); planner for Rosters.                                        |
| 13.2 | Initial backfill                                                           | Queued pg-boss job with SSE progress.                                                                             |
| 13.3 | Disconnect semantics                                                       | Pause default; Destroy option converts to Future-only.                                                            |

Key principle affirmed throughout: **1:1 parity with MS365 is paramount; refactor effort is secondary.**
