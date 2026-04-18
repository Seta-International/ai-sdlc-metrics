# 02 — Domain Model and Database Schema

Domain model is described at aggregate-level, then the Drizzle schema that persists it.

## Aggregate roots

Two roots: `Plan` and `Task`. Children load/mutate through their root.

| Aggregate root | Children                                                                         |
| -------------- | -------------------------------------------------------------------------------- |
| `Plan`         | `Bucket`, `Label`, `PlanMember`                                                  |
| `Task`         | `ChecklistItem`, `TaskAssignee`, `TaskAttachment`, `TaskComment`, `TaskEvidence` |

A `Task` references its `Plan` and `Bucket` by ID but does not load them. This matches MS Graph's top-level `/planner/tasks/{id}` endpoint.

## `Plan` aggregate

```
Plan
  id: PlanId (uuid v7)
  tenantId, name (1..255), description (0..32 000 plain text)
  container: PlanContainer  # {type: 'group'|'roster'|'none', externalId?}
  createdBy, createdAt, updatedAt, deletedAt?
  msPlanId?, msPlanEtag?
  --- children (lazy-loaded) ---
  buckets: Bucket[]         # ordered by orderHint, soft cap ~200
  labels: Label[]           # max 25 (hard)
  members: PlanMember[]     # {actorId, role: owner|editor|viewer}
```

Invariants:

- `labels.length <= 25`
- label `slot` ∈ `category1..category25`
- bucket `orderHint`s monotonic by string comparison
- at least one member with `role = owner`

## `Task` aggregate

```
Task
  id, tenantId, planId, bucketId
  title (1..255), description (0..32 000 plain text)
  progress: 0 | 50 | 100              # MS shape; Completed = 100
  priority: 1 | 3 | 5 | 9              # MS shape
  startDate?, dueDate?
  orderHint: MsOrderHint
  appliedLabels: Set<LabelSlot>        # subset of plan's defined labels
  coverAttachmentId?
  checklistItemCount, checklistCheckedCount  # denormalized counters (≤20)
  createdBy, createdAt, completedBy?, completedAt?, updatedAt, deletedAt?
  msTaskId?, msTaskEtag?, msTaskDetailsEtag?
  pendingMsAssignments: AadUserId[]    # unresolved imports (Phase 4 resolves)
  --- children ---
  assignees: TaskAssignee[]            # max 20
  checklist: ChecklistItem[]           # max 20
  attachments: TaskAttachment[]        # soft cap 50
  comments: TaskComment[]              # append-only; soft-delete only
  evidence: TaskEvidence[]             # Future-only; never synced
```

Invariants:

- `checklist.length <= 20`
- `assignees.length <= 20`
- `(progress === 100) ⟺ (completedAt !== null)`
- `coverAttachmentId` must reference a member of `attachments`
- `appliedLabels ⊆ plan.labels` (cross-aggregate; checked in command handler)

## Child entities / value objects (summary)

```
Bucket                   entity {id, planId, name, orderHint, msBucketId?, msBucketEtag?}
Label                    entity {slot: 'category1'..'category25', name (1..100), color}
ChecklistItem            VO     {id, title (1..255), isChecked, orderHint}
TaskAssignee             VO     {actorId, assignedBy, assignedAt}
TaskAttachment           entity {id, kind: 'file'|'link', file fields | link fields, createdBy/At}
TaskComment              entity {id, authorActorId, body (0..4000), postedAt, deletedAt?,
                                  msThreadId?, msPostId?, msPostEtag?}
TaskEvidence             entity {id, submittedBy/At, kind: 'file'|'link'|'note',
                                  content fields, caption (0..500),
                                  verifiedBy?, verifiedAt?, verificationNote?}
```

## Ordering — MS order hints

`MsOrderHint` is a string value object. We port Microsoft's documented [order hint algorithm](https://learn.microsoft.com/en-us/graph/api/resources/planner-order-hint-format) verbatim so hints round-trip to MS without recomputation in Phase 4. Static factory `MsOrderHint.between(before?, after?)` returns an opaque string that sorts lexicographically between the two neighbors (or extremes when absent). Shared implementation between api (`apps/api/src/modules/planner/domain/value-objects/ms-order-hint.vo.ts`) and web-planner (`apps/web-planner/src/lib/order-hint.ts`) with golden fixture tests in both.

## Identifier strategy

- All IDs are `uuid v7` (time-sortable, tenant-safe) — consistent with other modules.
- `ms*Id` fields are opaque strings (MS Graph GUIDs).

## AI reminders + KPI linkage — scope clarification

CLAUDE.md currently attributes "AI reminders" and "KPI linkage" to the `planner` module. Under strict lockstep, **these are not part of `planner`**. They become layered features in Sub-project #5, using separate tables joined at read time, never modifying syncable task fields.

This is a scope-boundary change versus CLAUDE.md; that document will be updated in the PR that completes Sub-project #1.

---

## Database Schema

Schema: `planner`. PostgreSQL 16. Drizzle ORM. RLS enabled on every table. No FK constraints to other schemas (CLAUDE.md rule).

### Tables

```sql
planner.plan
  id                       uuid pk (v7)
  tenant_id                uuid not null
  name                     text not null
  description              text not null default ''    -- plain text, ≤32 000
  container_type           text null                   -- 'group'|'roster' (null before sync)
  ms_group_id              text null
  ms_roster_id             text null
  ms_plan_id               text null
  ms_plan_etag             text null
  created_by               uuid not null               -- actor_id, no FK across schemas
  created_at               timestamptz not null default now()
  updated_at               timestamptz not null default now()
  deleted_at               timestamptz null

  check (char_length(description) <= 32000)
  check (
    (container_type is null and ms_group_id is null and ms_roster_id is null) or
    (container_type = 'group'  and ms_group_id  is not null and ms_roster_id is null) or
    (container_type = 'roster' and ms_roster_id is not null and ms_group_id  is null)
  )

  index  (tenant_id, deleted_at) where deleted_at is null
  index  (tenant_id, created_by)
  unique (tenant_id, ms_plan_id) where ms_plan_id is not null

planner.plan_label
  plan_id      uuid not null references planner.plan(id) on delete cascade
  slot         text not null                           -- 'category1'..'category25'
  name         text not null                           -- 1..100
  color        text not null
  tenant_id    uuid not null                           -- denormalized for RLS fast path
  primary key (plan_id, slot)
  check (slot ~ '^category([1-9]|1[0-9]|2[0-5])$')

planner.plan_member
  plan_id      uuid not null references planner.plan(id) on delete cascade
  actor_id     uuid not null
  role         text not null                           -- 'owner'|'editor'|'viewer'
  added_by     uuid not null
  added_at     timestamptz not null default now()
  tenant_id    uuid not null
  primary key (plan_id, actor_id)
  index (tenant_id, actor_id)

planner.bucket
  id              uuid pk (v7)
  tenant_id       uuid not null
  plan_id         uuid not null references planner.plan(id) on delete cascade
  name            text not null
  order_hint      text not null                        -- MS-compatible
  ms_bucket_id    text null
  ms_bucket_etag  text null
  created_at, updated_at timestamptz not null default now()
  deleted_at      timestamptz null

  index  (plan_id, deleted_at, order_hint) where deleted_at is null
  unique (tenant_id, ms_bucket_id) where ms_bucket_id is not null

planner.task
  id                       uuid pk (v7)
  tenant_id                uuid not null
  plan_id                  uuid not null references planner.plan(id) on delete cascade
  bucket_id                uuid not null references planner.bucket(id)
  title                    text not null                -- 1..255
  description              text not null default ''    -- ≤32 000
  progress                 smallint not null default 0 -- 0|50|100 (MS shape)
  priority                 smallint not null default 5 -- 1|3|5|9 (MS shape)
  start_date               date null
  due_date                 date null
  order_hint               text not null
  cover_attachment_id      uuid null                   -- ref to task_attachment.id (own constraint)
  checklist_item_count     smallint not null default 0 -- denormalized (≤20)
  checklist_checked_count  smallint not null default 0
  created_by               uuid not null
  created_at, updated_at   timestamptz not null default now()
  completed_by             uuid null
  completed_at             timestamptz null
  deleted_at               timestamptz null
  ms_task_id               text null
  ms_task_etag             text null
  ms_task_details_etag     text null
  pending_ms_assignments   jsonb not null default '[]'::jsonb

  check (progress in (0, 50, 100))
  check (priority in (1, 3, 5, 9))
  check (char_length(description) <= 32000)
  check (
    (progress = 100 and completed_at is not null) or
    (progress < 100 and completed_at is null)
  )

  index  (tenant_id, plan_id, bucket_id, deleted_at, order_hint) where deleted_at is null
  index  (tenant_id, due_date) where deleted_at is null and progress < 100
  unique (tenant_id, ms_task_id) where ms_task_id is not null

planner.task_assignee
  task_id      uuid not null references planner.task(id) on delete cascade
  actor_id     uuid not null
  assigned_by  uuid not null
  assigned_at  timestamptz not null default now()
  tenant_id    uuid not null
  primary key (task_id, actor_id)
  index (tenant_id, actor_id)

planner.task_applied_label
  task_id      uuid not null references planner.task(id) on delete cascade
  slot         text not null
  tenant_id    uuid not null
  plan_id      uuid not null                           -- denormalized for filter queries
  primary key (task_id, slot)
  index (tenant_id, plan_id, slot)

planner.task_checklist_item
  id           uuid pk (v7)
  task_id      uuid not null references planner.task(id) on delete cascade
  title        text not null                           -- 1..255
  is_checked   boolean not null default false
  order_hint   text not null
  tenant_id    uuid not null
  created_by   uuid not null
  created_at, updated_at timestamptz not null default now()
  index (task_id, order_hint)

planner.task_attachment
  id            uuid pk (v7)
  task_id       uuid not null references planner.task(id) on delete cascade
  kind          text not null                          -- 'file'|'link'
  storage_key   text null                              -- S3 key (@future/storage)
  size_bytes    bigint null
  content_type  text null
  filename      text null
  url           text null
  link_title    text null
  preview_type  text null                              -- 'noPreview'|'automatic'|'image'
  tenant_id     uuid not null
  created_by    uuid not null
  created_at    timestamptz not null default now()
  check (
    (kind = 'file' and storage_key is not null and url is null) or
    (kind = 'link' and url is not null and storage_key is null)
  )
  index (task_id)

planner.task_comment
  id               uuid pk (v7)
  task_id          uuid not null references planner.task(id) on delete cascade
  author_actor_id  uuid not null
  body             text not null                       -- ≤4000 plain text
  posted_at        timestamptz not null default now()
  deleted_at       timestamptz null                    -- soft delete; never hard-delete
  tenant_id        uuid not null
  ms_thread_id     text null
  ms_post_id       text null
  ms_post_etag     text null
  check (char_length(body) <= 4000)
  index (task_id, posted_at) where deleted_at is null

planner.task_evidence                                  -- LAYERED: Future-only, never synced to MS
  id                  uuid pk (v7)
  task_id             uuid not null references planner.task(id) on delete cascade
  submitted_by        uuid not null
  submitted_at        timestamptz not null default now()
  kind                text not null                    -- 'file'|'link'|'note'
  storage_key         text null
  size_bytes          bigint null
  content_type        text null
  filename            text null
  url                 text null
  link_title          text null
  body                text null                        -- 'note' kind only, ≤4000
  caption             text not null default ''        -- ≤500
  verified_by         uuid null
  verified_at         timestamptz null
  verification_note   text null                        -- ≤1000
  tenant_id           uuid not null
  check (
    (kind = 'file' and storage_key is not null) or
    (kind = 'link' and url is not null) or
    (kind = 'note' and body is not null)
  )
  check (char_length(caption) <= 500)
  check (body is null or char_length(body) <= 4000)
  check (
    (verified_by is null and verified_at is null) or
    (verified_by is not null and verified_at is not null)
  )
  index (task_id, submitted_at)
  index (tenant_id, submitted_by)
```

### Row-Level Security

Every table with `tenant_id` gets:

```sql
alter table planner.<t> enable row level security;
create policy <t>_tenant_isolation on planner.<t>
  using (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

`RlsMiddleware` (existing) checks out one `PoolClient` per request and sets the session variable. Handlers must not use `Promise.all` for concurrent DB queries (CLAUDE.md rule).

### Design rationale

- **Soft-delete** (`deleted_at`) on `plan`, `bucket`, `task`, `task_comment`. Everything else cascades hard. Retention: keep soft-deleted rows forever; a purge job can be added later per tenant retention policy.
- **Denormalized `tenant_id`** on every table (codebase convention; required for RLS fast path).
- **Denormalized `plan_id`** on `task_applied_label` for efficient "tasks with label Y in plan X" queries.
- **Denormalized checklist counters** on `task` — avoids reading 2 400 tasks × N checklist items for Board card rendering.
- **Labels modeled sparsely** — rows only exist for customized slots; UI renders defaults for uncustomized slots. Matches MS behavior, saves ~10× rows at scale.
- **`ms_*` fields inline with data**, no separate mapping table. Etag concurrency is task-local; a join per read would be wasteful.
- **Unique on `(tenant_id, ms_*_id) where ... is not null`** — enforces sync idempotency without requiring values in Phase 1.

### What is deliberately NOT in the schema

- No `activity_log` / `audit_log` table — outbox events are the audit trail.
- No tag system beyond MS labels.
- No `task_dependency`, `task_watcher`, `task_custom_field` — not in MS Graph.
- No `task.conversation_thread_id` column — Phase 4 decision; if needed, add then.

### Migration

One Drizzle migration creates all of the above. Phase 4 adds no schema — only uses the reserved fields.
