# Planner Core + Board View — Design Spec

Date: 2026-04-18
Sub-project: #1 of the MS 365 Planner clone initiative
Owner module: `planner`
Status: Draft for review

---

## 1. Overview and Context

Future is cloning Microsoft 365 Planner across all features and screens, with bidirectional sync to MS Graph Planner. This spec covers **Sub-project #1**: the core data model, the Board view, the Drizzle schema, the tRPC API, and the `web-planner` zone.

The full initiative is decomposed into five sub-projects; this spec covers the first one only.

| #   | Sub-project                                                                   | Covered here? |
| --- | ----------------------------------------------------------------------------- | ------------- |
| 1   | Core data model + Board view (sync-aware)                                     | **Yes**       |
| 2   | Grid / Schedule / Charts views, filter bar, group-by                          | No            |
| 3   | Personal hubs (My Day / My Tasks / My Plans)                                  | No            |
| 4   | MS 365 2-way sync engine (polling, push/pull, conflict resolution, import UX) | No            |
| 5   | Timeline/Gantt, dependencies, Goals/KPI linkage, AI Planner Agent             | No            |

### Locked design decisions (from brainstorming)

These are load-bearing decisions made before this spec was written. They drive every concrete detail below.

1. **Strict lockstep with MS Planner's data model.** Our task/plan/bucket/label schema matches MS's exactly: 25 labels max per plan, 20 checklist items max per task, plain-text descriptions ≤32 000 chars, flat checklists, no custom fields, no task-native comments from MS (we build them to map to Group threads). No supersets, no feature drift from MS. Layered features that _never modify syncable fields_ are allowed (e.g., evidence).
2. **Plan is the top-level container.** No intermediate `workspace` entity. A plan is optionally linked to a project (`projectId`, metadata only) and optionally synced to MS (mapping to M365 Group or Roster at sync-enable time). Membership is explicit per plan.
3. **`identity` module owns user/OAuth mapping.** Future `actorId` ↔ AAD `userId` mapping lives in `identity`. Consumed by `planner` via `IdentityQueryFacade`. No user linking logic in `planner`.
4. **App-only MS Graph auth.** One admin-consented service principal per tenant; no per-user delegated OAuth. Sync is a background service workload.
5. **Comments are built in Phase 1** with MS-compatible shape (single thread per task, flat, plain text, author+timestamp, ≤4000 chars). Schema reserves MS Group-thread sync fields.

### Non-goals even at full initiative completion (consequences of Decision #1)

- No markdown / rich-text descriptions
- No nested subtasks
- No custom fields
- No >25 labels, no >20 checklist items
- No task watchers
- No per-task ACLs (plan-level only)
- No task dependencies unless we later add a Dataverse integration (out of scope)

---

## 2. Scope and Non-Goals for Sub-project #1

### In scope

- Drizzle schema for plans, buckets, tasks, labels, checklists, assignees, attachments, comments, evidence — with nullable `ms_*` fields reserved for Phase 4 sync.
- Board view in `web-planner` zone: Kanban, drag-drop, inline edits, task-detail side panel.
- Full CRUD via tRPC for all above entities.
- Permissions via `KernelQueryFacade` + plan-local membership roles.
- Outbox domain events emitted (consumed by `notifications` module).
- Task-assigned email notifications via existing `notifications` module.
- Tests per CLAUDE.md TDD rules (≥70% coverage, co-located, real DB for integration).

### Explicitly out of scope

| Deferred to    | What                                                                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sub-project #2 | Grid view, Schedule view, Charts view, filter bar, group-by picker UI. (Phase 1's backend ships the field-mutation commands that a group-by-drag would call, but the frontend only renders group-by-Bucket in Phase 1.) |
| Sub-project #3 | My Day / My Tasks / My Plans hubs                                                                                                                                                                                       |
| Sub-project #4 | MS Graph 2-way sync engine, import-from-MS UX, OAuth admin page, Group-thread comment sync                                                                                                                              |
| Sub-project #5 | Timeline/Gantt, dependencies, goals/KPI linkage, AI Planner Agent, evidence verification workflow                                                                                                                       |

### Schema reservations from day 1

Even though Phase 4 builds the sync engine, Phase 1's schema reserves the sync fields so Phase 4 is additive, not a migration:

```
plan.container_type, ms_group_id, ms_roster_id, ms_plan_id, ms_plan_etag
bucket.ms_bucket_id, ms_bucket_etag
task.ms_task_id, ms_task_etag, ms_task_details_etag
task.pending_ms_assignments (jsonb, default [])
task_comment.ms_thread_id, ms_post_id, ms_post_etag
```

Note: `bucket.order_hint` and `task.order_hint` are the MS-compatible order hints. There is no separate `ms_order_hint` column — the single `order_hint` column serves both local ordering and MS round-trip since we implement MS's exact algorithm.

All nullable. Zero code interacts with these in Phase 1.

---

## 3. DDD Module Layout

Following CLAUDE.md's Hexagonal + DDD rules strictly. One module (`planner`) with one schema (`planner`). Exactly one exported facade.

### Directory structure

```
apps/api/src/modules/planner/
├── domain/
│   ├── entities/
│   │   ├── plan.entity.ts              # aggregate root
│   │   ├── bucket.entity.ts            # child of plan
│   │   ├── task.entity.ts              # aggregate root (MS treats tasks as top-level)
│   │   ├── label.entity.ts
│   │   ├── checklist-item.value-object.ts
│   │   ├── task-attachment.entity.ts
│   │   ├── task-comment.entity.ts
│   │   ├── task-evidence.entity.ts
│   │   └── task-assignee.value-object.ts
│   ├── value-objects/
│   │   ├── progress.vo.ts              # 0 | 50 | 100 (MS shape)
│   │   ├── priority.vo.ts              # 1 | 3 | 5 | 9 (MS shape)
│   │   ├── ms-order-hint.vo.ts         # MS-compatible ordering
│   │   ├── label-slot.vo.ts            # 'category1'..'category25'
│   │   └── plan-container.vo.ts        # { type: 'group'|'roster'|'none', externalId? }
│   ├── repositories/                   # interfaces only; no .port suffix (CLAUDE.md rule)
│   │   ├── plan.repository.ts
│   │   ├── bucket.repository.ts
│   │   ├── task.repository.ts
│   │   ├── task-attachment.repository.ts
│   │   ├── task-comment.repository.ts
│   │   └── task-evidence.repository.ts
│   ├── ports/
│   │   └── ms-planner-client.port.ts   # defined, unimplemented in Phase 1 (Phase 4 wires)
│   ├── events/
│   │   └── index.ts                    # re-exports from @future/event-contracts
│   └── exceptions/
│       ├── plan-not-found.exception.ts
│       ├── task-not-found.exception.ts
│       ├── bucket-limit-reached.exception.ts
│       ├── label-limit-reached.exception.ts          # 25 per plan
│       ├── checklist-limit-reached.exception.ts      # 20 per task
│       ├── description-too-long.exception.ts         # 32 000 chars
│       ├── concurrent-modification.exception.ts
│       └── unauthorized-plan-access.exception.ts
├── application/
│   ├── commands/
│   │   ├── plans/          # create, rename, delete, add-member, remove-member
│   │   ├── buckets/        # create, rename, reorder, delete
│   │   ├── tasks/          # create, update, move, set-progress, set-priority, set-dates,
│   │   │                   # assign, unassign, apply-label, remove-label, delete
│   │   ├── checklist/      # add-item, update-item, toggle-item, remove-item
│   │   ├── attachments/    # request-upload, finalize-upload, set-cover, remove
│   │   ├── comments/       # post, delete (soft)
│   │   ├── evidence/       # request-upload, finalize-upload, create-note, create-link, remove
│   │   └── labels/         # rename-plan-label, recolor-plan-label
│   ├── queries/
│   │   ├── get-plan.handler.ts
│   │   ├── list-plans-for-actor.handler.ts
│   │   ├── get-board.handler.ts                      # plan + buckets + tasks in one snapshot
│   │   ├── get-task-detail.handler.ts
│   │   ├── list-task-comments.handler.ts
│   │   └── list-task-evidence.handler.ts
│   ├── event-handlers/
│   │   └── on-task-assigned.handler.ts               # enqueues notification job
│   ├── services/
│   │   └── plan-authorization.service.ts             # wraps Kernel calls; single source of auth logic
│   └── facades/
│       └── planner-query.facade.ts                   # ONLY export of this module
├── infrastructure/
│   ├── repositories/                                 # Drizzle implementations of domain repos
│   ├── schema/
│   │   └── planner.schema.ts                         # Drizzle tables, RLS, constraints
│   ├── ms-graph/                                     # empty in Phase 1; reserved for Phase 4
│   │   └── .gitkeep
│   └── listeners/
│       └── .gitkeep
├── interface/
│   └── trpc/
│       ├── plan.router.ts
│       ├── bucket.router.ts
│       ├── task.router.ts
│       ├── checklist.router.ts
│       ├── attachment.router.ts
│       ├── comment.router.ts
│       ├── evidence.router.ts
│       ├── label.router.ts
│       └── index.ts                                  # composes into plannerRouter
├── testing/
│   ├── build-plan.ts
│   ├── build-task.ts
│   └── with-tenant.ts
└── planner.module.ts                                 # exports: [PlannerQueryFacade] only
```

### Cross-module import rules (ESLint-enforced)

| Direction                                                                                                    | Allowed? |
| ------------------------------------------------------------------------------------------------------------ | -------- |
| `planner.application` → `IdentityQueryFacade`, `PeopleQueryFacade`, `KernelQueryFacade`                      | Yes      |
| `planner.infrastructure` → `@future/storage`, `@future/event-contracts`                                      | Yes      |
| `planner.domain` → anything outside `planner.domain`                                                         | **No**   |
| Any module → `planner.domain.*` or `planner.infrastructure.*` or `planner.application.*` (except the facade) | **No**   |

### Module exports (Phase 1 surface)

Exactly one class: `PlannerQueryFacade`. Phase 1 methods (kept minimal, grow as consumers need):

- `countOpenTasksForActor(actorId): Promise<number>`
- `listPlansForActor(actorId): Promise<PlanSummary[]>`

No write facade in Phase 1. Cross-module writes not needed until Sub-project #5.

### Event contracts added to `packages/event-contracts`

Plain TypeScript, zero Nest deps. Published via outbox.

```
TaskCreatedEvent, TaskAssignedEvent, TaskUnassignedEvent, TaskCompletedEvent,
TaskMovedEvent, TaskPriorityChangedEvent, TaskDueDateChangedEvent,
TaskDeletedEvent, TaskCommentPostedEvent, TaskCommentDeletedEvent,
TaskEvidenceSubmittedEvent, (TaskEvidenceVerifiedEvent reserved for Phase 5),
PlanCreatedEvent, PlanRenamedEvent, PlanDeletedEvent,
PlanMemberAddedEvent, PlanMemberRemovedEvent,
BucketCreatedEvent, BucketRenamedEvent, BucketReorderedEvent, BucketDeletedEvent
```

All carry `{ tenantId, actorId (performer), <entityId>, <changed fields>, occurredAt }`.

---

## 4. Domain Model

### Aggregate roots

Two roots: `Plan` and `Task`. Children load/mutate through their root.

| Aggregate root | Children                                                                         |
| -------------- | -------------------------------------------------------------------------------- |
| `Plan`         | `Bucket`, `Label`, `PlanMember`                                                  |
| `Task`         | `ChecklistItem`, `TaskAssignee`, `TaskAttachment`, `TaskComment`, `TaskEvidence` |

A `Task` references its `Plan` and `Bucket` by ID but does not load them.

### `Plan` aggregate shape

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

### `Task` aggregate shape

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

### Child entities / value objects (summary)

```
Bucket                   entity {id, planId, name, orderHint, msBucketId?, msBucketEtag?}
Label                    entity {slot: 'category1'..'category25', name (1..100), color}
ChecklistItem            VO     {id, title (1..255), isChecked, orderHint}
TaskAssignee             VO     {actorId, assignedBy, assignedAt}
TaskAttachment           entity {id, kind: 'file'|'link', file fields | link fields, createdBy/At}
TaskComment              entity {id, authorActorId, body (0..4000), postedAt, deletedAt?, msThreadId?, msPostId?, msPostEtag?}
TaskEvidence             entity {id, submittedBy/At, kind: 'file'|'link'|'note',
                                  content fields, caption (0..500), verifiedBy?, verifiedAt?, verificationNote?}
```

### Ordering — MS order hints

`MsOrderHint` is a string value object. We port Microsoft's documented [order hint algorithm](https://learn.microsoft.com/en-us/graph/api/resources/planner-order-hint-format) verbatim so hints round-trip to MS without recomputation in Phase 4. Static factory `MsOrderHint.between(before?, after?)` returns an opaque string that sorts lexicographically between the two neighbors (or extremes when absent). Shared implementation between api (`apps/api/src/modules/planner/domain/value-objects/ms-order-hint.vo.ts`) and web-planner (`apps/web-planner/src/lib/order-hint.ts`) via a sourced-in-both copy with golden fixture tests in both.

### Identifier strategy

- All IDs are `uuid v7` (time-sortable, tenant-safe) — consistent with other modules.
- `ms*Id` fields are opaque strings (MS Graph GUIDs).

### AI reminders + KPI linkage

CLAUDE.md attributes "AI reminders" and "KPI linkage" to the `planner` module. Under strict lockstep, **these are not part of `planner` as of this spec**. They become layered features in Sub-project #5, using separate tables joined at read time, never modifying syncable task fields.

This is a scope-boundary change versus CLAUDE.md; that document should be updated in the PR that completes Sub-project #1.

---

## 5. Database Schema

Schema: `planner`. PostgreSQL 16. Drizzle ORM. RLS enabled on every table. No FK constraints to other schemas (CLAUDE.md rule).

### Tables

```
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
  cover_attachment_id      uuid null                   -- ref to task_attachment.id, FK added in own constraint
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

Every table with `tenant_id` gets the standard policy:

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

One Drizzle migration (`0000_planner_core_schema.sql` or similar, auto-generated). Phase 4 adds no schema — only uses the reserved fields.

---

## 6. tRPC API Surface

Composed at `apps/api/src/modules/planner/interface/trpc/index.ts`:

```
plannerRouter
├── plans, buckets, tasks, checklist, attachments, comments, evidence, labels
```

Routers are thin: zod-parse input, resolve auth context, dispatch to Nest CQRS handler.

### The Board read — single snapshot

```ts
tasks.getBoard(input: { planId: string }) -> {
  plan:    { id, name, description, labels: Label[], members: PlanMember[], container, msPlanId?, updatedAt },
  buckets: Bucket[],                                // sorted by orderHint
  tasks:   Array<{
    id, bucketId, title, progress, priority, startDate, dueDate,
    orderHint, checklistItemCount, checklistCheckedCount, coverAttachmentId,
    appliedLabels: LabelSlot[],
    assignees: Array<{ actorId, displayName, avatarUrl }>,  // PeopleQueryFacade batch-resolved
    attachmentCount, commentCount, evidenceCount,
    msTaskId?, updatedAt,
  }>                                                // sorted by bucketId, orderHint
}
```

- Three underlying SQL queries (plan+labels+members, buckets, tasks). No N+1.
- Assignee display names resolved via one `PeopleQueryFacade.getActorsByIds(actorIds)` batch.
- Counts are `count(*)` aggregates in the same SQL as the task query.
- Task description, full checklist, attachments, comments, evidence loaded only when the user opens a task.

### Task detail reads

```
tasks.getDetail({ taskId }) -> { task, checklist, attachments, assignees (rich) }
comments.list({ taskId, cursor? }) -> paginated TaskComment[], newest first
evidence.list({ taskId }) -> TaskEvidence[]
```

### Command shape — optimistic concurrency via `expectedVersion`

Every mutation on existing entities takes `expectedVersion: string` (the current `updatedAt` ISO). Handler compares; mismatch → `ConcurrentModificationException` → tRPC `CONFLICT`. Client refetches and retries.

This is orthogonal to MS etag concurrency, which Phase 4 layers on at the sync boundary.

### Move / reorder

```ts
tasks.move({ taskId, toBucketId, orderHintAfter?, orderHintBefore?, expectedVersion }) -> Task
buckets.reorder({ bucketId, orderHintAfter?, orderHintBefore?, expectedVersion }) -> Bucket
```

Server computes final `orderHint` via `MsOrderHint.between(before, after)`. Client never invents order hints.

### Group-by drag-drop → field mutations

When the Board is grouped by something other than Bucket, the frontend dispatches the correct command:

| Grouped by | Drag calls                                          |
| ---------- | --------------------------------------------------- |
| Bucket     | `tasks.move(toBucketId: X)`                         |
| Progress   | `tasks.setProgress(progress: X)`                    |
| Priority   | `tasks.setPriority(priority: X)`                    |
| Due date   | `tasks.setDates(dueDate: X)`                        |
| Assignee   | `tasks.assign(actorId: X)` (with separate unassign) |
| Label      | `tasks.applyLabel(slot: X)` (with separate remove)  |

(The group-by picker UI is Sub-project #2, but the backend commands for all grouping dimensions ship in Phase 1 so drag-drop works when Sub-project #2 surfaces the picker.)

### Attachments — presigned upload (two-step)

```
attachments.requestUpload({ taskId, filename, contentType, sizeBytes })
  -> { uploadUrl, storageKey, expiresAt }
attachments.finalizeUpload({ taskId, storageKey, filename, contentType, sizeBytes, setAsCover? })
  -> TaskAttachment
```

Evidence uses identical `evidence.requestUpload`/`finalizeUpload` + `caption` field. Link attachments/evidence are single-call (no S3).

### Input validation — zod at the boundary

Every input zod-parsed with MS caps encoded:

```ts
const CreateTaskInput = z.object({
  planId: z.string().uuid(),
  bucketId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(32_000).optional(),
  priority: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(9)]).optional(),
  // ...
})
```

Caps enforced twice (zod + domain entity) — cheap edge rejection + authoritative invariant guard.

### Error → tRPC mapping

| Exception                                               | tRPC code             | HTTP |
| ------------------------------------------------------- | --------------------- | ---- |
| `*NotFoundException`                                    | `NOT_FOUND`           | 404  |
| `*LimitReachedException`, `DescriptionTooLongException` | `PRECONDITION_FAILED` | 412  |
| `ConcurrentModificationException`                       | `CONFLICT`            | 409  |
| `UnauthorizedPlanAccessException`                       | `FORBIDDEN`           | 403  |
| zod validation                                          | `BAD_REQUEST`         | 400  |

### Not shipped in Phase 1

- Bulk operations
- `plans.copy`
- `plans.export` to Excel
- `tasks.search` (browser-side filtering over Board snapshot suffices)

---

## 7. Frontend — `web-planner` zone

### Routing

```
apps/web-planner/src/app/
├── layout.tsx                       # shell + <GlobalNav/> from @future/ui
├── page.tsx                         # -> /plans
└── plans/
    ├── page.tsx                     # plan list
    ├── new/page.tsx                 # create flow
    └── [planId]/
        ├── layout.tsx               # loads plan membership + labels, provides context
        ├── page.tsx                 # -> /board
        └── board/
            ├── page.tsx             # Board view
            └── tasks/[taskId]/page.tsx   # intercepting route (modal)
```

### State management

- Server cache: React Query via `@trpc/react-query`. Same pattern as other zones.
- UI state: React local + URL search params (`?group=bucket&filter=due:today&task=<id>`). Deep-linkable. No Redux / Zustand.
- Task detail uses Next.js **intercepting routes** — side-panel modal on client navigation, full page on direct hit / refresh.

### Components

```
components/
├── board/           BoardColumn, TaskCard, TaskCardCover, QuickAddTask, AddBucketButton, BoardDragContext
├── task-detail/     TaskDetailPanel, TaskPropertyStrip, TaskDescription, TaskChecklist,
│                    TaskAttachments, TaskComments, TaskEvidence
├── labels/          LabelPill, LabelPicker, LabelEditor
├── assignees/       AssigneeAvatarStack, AssigneePicker
└── primitives/      PriorityIcon, ProgressIcon, DueBadge
lib/
├── trpc.ts
├── hooks/           useBoardSnapshot, useTaskDetail, useOptimisticMove, usePlanMembership
├── order-hint.ts    # client-side MsOrderHint.between() helper
└── ms-order-hint-format.ts  # shared logic with api domain
```

### Drag-and-drop — `@dnd-kit`

Chosen over deprecated `react-beautiful-dnd` and older `react-dnd`. Accessible (keyboard drag), tree-shakable, works with virtualization.

Flow:

1. `onDragEnd` computes `orderHintAfter` / `orderHintBefore` from neighbor cards.
2. Optimistic React Query cache patch (card moves immediately).
3. Fire `tasks.move` (or the field-mutation equivalent for other groupings).
4. Success: cache replaced with authoritative response. Failure: rollback + toast.

Single hook `useOptimisticMove` encapsulates the pattern.

### Virtualization

Not in Phase 1. Target plans <200 tasks. Document the limit. If QA finds jank, add `@tanstack/react-virtual` per column in a Sub-project #2 spike.

### Optimistic update policy

- **Optimistic:** task create, move, assign, label, progress toggle, checklist toggle, priority change, date change, delete.
- **Non-optimistic** (spinner OK): attachment upload, evidence upload, plan creation, member add/remove.
- Error recovery: cache rollback + toast. No intrusive modals.

### Design tokens (from `DESIGN.md`)

- Page bg `#0f1011`; column `rgba(255,255,255,0.02)`; card `rgba(255,255,255,0.02)` with `1px solid rgba(255,255,255,0.08)`, radius 8px.
- Inter Variable. Card title weight 510, 14/20. Properties weight 450, 12/16.
- Indigo accent `#5e6ad2` bg / `#7170ff` interactive. Drag-over, primary buttons, focused borders (ring-3 per FINDING-007).
- Status: `#27a644` in-progress, `#10b981` completed. Overdue pill `#e5484d` with `#e5484d22` bg.
- Label palette: 25 Radix UI dark-palette scales mapped to `category1..category25` (pink, red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, plum, slate, sand, mauve, and 5 additional). All accessibility-checked against card bg.
- 8px spacing grid. Column gutter 12, card padding 12.

### Accessibility (non-negotiable)

- `@dnd-kit` keyboard drag (space pick-up, arrows move, space drop). `aria-live` announcements.
- Interactive targets ≥36px hit area.
- Focus rings: ring-3 indigo.
- Color never sole signal: due dates use icon + text, progress uses shape + color, labels have text + color.

### Not in Phase 1

- Filter bar / group-by picker UI (Sub-project #2)
- Bulk selection
- Drag across plans
- Real-time presence / cursors

---

## 8. Board Interaction Details

### Quick-add task

- `+ Add task` at the **top** of each bucket (MS pattern).
- Inline input; Enter creates + keeps input open; Escape closes.
- Shift+Enter surfaces inline due-date picker before submit.
- Optimistic prepend. Title length indicator at 240/255; hard block at 255.

### Card checkmark

- Small checkmark top-left, visible on hover (desktop) / always (touch).
- Toggles NotStarted/InProgress → Completed; second click reverts to InProgress (not NotStarted).
- Completed: 60% opacity, strike-through title, sorted to bottom of bucket by `completedAt desc`, "Completed Xh ago" footer.

### Card cover

- If `coverAttachmentId` points at an image attachment: render 16:9 header on card, content below.
- Non-image cover ID: ignored visually.
- "Set as cover" menu in task detail attachments.

### Label pills on cards

- Up to 4 pills + `+N` overflow chip.
- Pill click → filters Board to that label (consistent with Sub-project #2 filter bar).
- `+N` hover → popover with all labels.

### Label picker in task detail

- Popover lists **all 25 slots** (plan-scoped), even uncustomized ones (with default names/colors).
- Checkbox for applied state; pencil-on-hover for inline rename + color picker (plan-scoped write).
- Teaches users the slot model.

### Due date

- Badge color:
  - Overdue (`dueDate < today`, progress ≠ 100): `#e5484d` red
  - Today: amber
  - This week: neutral outline
  - Future: subtle gray text, no pill
- Click → inline date picker with "Clear" option.

### Task detail panel — autosave + concurrency

- Text inputs: autosave on blur.
- Dropdowns, dates, assignees, labels: autosave on change.
- "Saving…" / "Saved" indicator in panel header.
- On `CONFLICT`: toast with "Refresh" button; refetch replaces panel state, preserving user edits on untouched fields; conflicting-field-only UI shows "Keep mine / Keep theirs."

### Checklist

- Click checkbox: instant optimistic toggle. Counter updates in cache.
- Enter on item title: creates item below + focus.
- Drag to reorder (vertical `@dnd-kit`).
- At 20 items: input disabled with "Maximum 20 items (Microsoft Planner limit)" hint.

### Bucket rename / reorder

- Click title: contenteditable, Enter saves, Escape cancels.
- Drag bucket header horizontally to reorder.
- `+ Add bucket` rightmost; inline.
- Delete: context menu; confirm if bucket has tasks ("5 tasks will be deleted. Continue?"). No "move elsewhere" option in Phase 1.

### Comments

- Enter posts (not Shift+Enter; matches Slack/Teams).
- ≤4000 chars; countdown at 3800.
- Optimistic append with pending indicator.
- Author-only soft delete; "Comment deleted" gravestone remains.

### Evidence

- Section below Comments.
- "Add evidence" composer: kind selector (file/link/note), content, **caption required**, optional notes.
- Rendered as card stack: submitter avatar, kind icon, caption, timestamp, preview, verified badge when applicable.
- Verify button present but disabled with tooltip "Verification workflow in Phase 5."

### Rich content paste

- When user pastes rich text (from Word, Slack, etc.) into description: silently strip formatting; one-time toast "Rich text is not supported — formatting was removed."

### Loading states

- Board: shell layout + skeleton columns on first load.
- Task detail: skeleton while loading, but title from Board cache immediately.

---

## 9. Permissions Model

### Two layers

| Layer                    | Source                            | Purpose                                            |
| ------------------------ | --------------------------------- | -------------------------------------------------- |
| **Tenant capability**    | `kernel.role_permission` registry | Can this actor do X in this tenant at all?         |
| **Plan membership role** | `planner.plan_member.role`        | Within this specific plan, what can this actor do? |

Both must pass.

### Permissions registered in kernel (Phase 1)

```
planner.plan.create
planner.plan.delete-any
planner.plan.read-any              # platform_admin, insights
planner.plan.manage-members-any    # reserved for future bulk ops
planner.task.complete-any          # admin override
```

Default grants: tenant_admin gets all; member gets `planner.plan.create`; `platform_admin` gets `read-any`. Seeded via kernel's registry migration pattern.

### Plan membership roles

| Role     | Read | Create/edit tasks | Manage buckets/labels | Add/remove members | Delete plan |
| -------- | ---- | ----------------- | --------------------- | ------------------ | ----------- |
| `owner`  | ✓    | ✓                 | ✓                     | ✓                  | ✓           |
| `editor` | ✓    | ✓                 | ✓                     | ✗                  | ✗           |
| `viewer` | ✓    | ✗                 | ✗                     | ✗                  | ✗           |

Any plan member can **comment and submit evidence** on tasks they can see (viewer included).

**Viewer-assignee exception:** A viewer assigned to a task can update **their own** progress on that task (NotStarted → InProgress → Completed) — but not other fields.

### Where checks live

```
tRPC router
  -> handler
      -> PlanAuthorizationService (the single source of auth logic)
          -> KernelQueryFacade.hasPermission(actorId, capability)
          -> planRepo.getMemberRole(planId, actorId)
```

Service surface:

```ts
assertCanCreatePlan(actorId)
assertCanReadPlan(actorId, planId)
assertCanEditPlan(actorId, planId) // >= editor
assertCanAdminPlan(actorId, planId) // owner
assertCanManageMembers(actorId, planId) // owner
assertCanEditTask(actorId, taskId) // resolves task -> plan
assertCanUpdateOwnTaskProgress(actorId, taskId) // viewer-assignee exception
assertCanCommentOnTask(actorId, taskId) // any member
```

Every mutation handler calls exactly one assertion up front.

### Repository-level enforcement

`DrizzlePlanRepository.findForActor(actorId)` always joins `plan_member` (plus `OR exists` on `read-any`). Zero-trust reads: even if a handler forgets to check, the repo won't return unauthorized rows.

### `platform_admin` and `web-admin`

- `platform_admin` gets `planner.plan.read-any`.
- Phase 1 ships **no** SETA-operator UI for planner. Platform admins use API with elevated auth.

### Guest access

Not in Phase 1. Blocker for Phase 4 import of MS plans with external guests: `pending_ms_assignments` holds unresolved AAD IDs until `identity` adds a guest-actor type (separate future feature).

### Delegation (kernel feature)

Kernel delegation (e.g., CEO → EA) passes through `KernelQueryFacade.hasPermission` transparently. Nothing extra for `planner`.

### Audit trail

Every permission-gated mutation emits its outbox event with `actorId` (performer). Auditors trace via `insights`.

---

## 10. Testing Strategy

Per CLAUDE.md: TDD, ≥70% coverage (lines/functions/branches), co-located specs, no `__tests__/`.

### Pyramid

| Layer           | Runner                         | Est. count | Scope                                                                        |
| --------------- | ------------------------------ | ---------- | ---------------------------------------------------------------------------- |
| Unit — domain   | Jest                           | ~120       | Entities, VOs, invariants, order-hint math                                   |
| Unit — handlers | Jest + in-memory repo fakes    | ~80        | Every command handler: happy + each error + auth-reject                      |
| Integration     | Jest + Testcontainers Postgres | ~40        | Real DB with RLS, real tRPC router, fakes for identity/people/kernel facades |
| E2E             | Playwright                     | 8 flows    | Full browser against ephemeral stack                                         |

### Domain unit specs

For each aggregate: every invariant throws the right exception; every state transition; order-hint round-trip against MS Graph-documented examples; VO exhaustive coverage.

### Handler unit specs (template)

```
describe('CreateTaskHandler', () => {
  it('creates task at top of bucket with computed orderHint')
  it('rejects when title empty / > 255')
  it('rejects when description > 32 000')
  it('rejects when actor lacks auth')
  it('rejects when bucketId does not belong to planId')
  it('rejects when plan soft-deleted')
  it('rejects when applying label slot not defined on plan')
  it('emits TaskCreatedEvent to outbox')
  it('writes pending_ms_assignments as empty array')
})
```

### Integration specs

- RLS isolation: tenant A cannot read tenant B's rows via any procedure.
- Permissions end-to-end: viewer update → 403; non-member read → 404 (no existence leak).
- `tasks.getBoard`: 50 tasks, 6 buckets, 12 labels → shape, ordering, no N+1 (query counter asserts ≤3 queries).
- Optimistic concurrency: two concurrent updates with same `expectedVersion`; one succeeds, one 409.
- Cascades: plan delete cascades buckets, tasks, children; soft-delete hides from listings.
- Outbox emission for each command.
- Order-hint stress: 1 000 sequential inserts at same position; hint length stays under documented ceiling.
- Checklist counter denormalization: add/toggle/remove concurrent; counters remain accurate.

### Performance budgets (test-enforced)

- `tasks.getBoard` with 200 tasks + 10 buckets: p95 < 150 ms on CI box.
- Drag-drop round trip: p95 < 200 ms.

Regressions fail the PR.

### E2E flows (Playwright)

1. Create plan → bucket → task → Board renders.
2. Drag task between buckets (persisted across refresh).
3. Toggle task completion via card checkmark → moves to bottom of bucket, strike-through applied.
4. Open detail, edit description, autosave, refresh, persisted.
5. Assign teammate → notification email fired.
6. Add checklist item, check it → card counter updates.
7. Upload file → appears → set-as-cover → card shows image.
8. Submit evidence with caption → appears in evidence section.

Against docker-compose ephemeral stack: Postgres, Redis, api, web-planner.

### Frontend component tests (Vitest + RTL)

- `TaskCard`: badges, overdue styling, cover image.
- `BoardColumn` + `@dnd-kit`: keyboard drag → correct mutation call.
- `TaskDetailPanel`: autosave-on-blur payload; 409 conflict toast.
- `LabelPicker`: 25 slots, apply/remove.
- `MsOrderHint.between`: golden fixture parity with api domain.

### Fixtures

```
apps/api/src/modules/planner/testing/
  build-plan.ts       (withLabels, withMembers, withBuckets)
  build-task.ts       (withAssignees, withChecklist, withLabels, overdue, ...)
  with-tenant.ts      (seeds tenant + platform admin + member actors)
```

Shared across unit + integration.

### CI gates

- Specs pass.
- Coverage ≥70% on new code (planner module; not diluted).
- ESLint module-boundary rules.
- Type check (NodeNext + CJS, no `.js` relative-import suffixes).
- Integration + E2E run on PRs touching `modules/planner/**` or `apps/web-planner/**`.

### Not tested (on purpose)

- MS Graph adapter (not written yet; Phase 4).
- Third-party UI library internals.
- Drizzle migrations beyond "applies cleanly + RLS active."

---

## 11. Phasing and Progress Tracking

### Phase structure (internal to Sub-project #1)

| #   | Phase                    | Ships                                                      | Backend deliverables                                                                                                                                                           | Frontend deliverables                                                                |
| --- | ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1.0 | Foundation               | Nothing user-visible                                       | Migration; `MsOrderHint` VO + tests; aggregates + invariants; repositories + fakes; `PlanAuthorizationService`; kernel permission registrations; `PlannerQueryFacade` skeleton | `web-planner` shell, tRPC wiring, empty `/plans`                                     |
| 1.1 | Plans & Members          | Create plan, add teammates                                 | `plans.*` + `labels.*` routers; handlers; outbox events                                                                                                                        | `/plans` list + create flow; plan settings drawer                                    |
| 1.2 | Buckets & Board skeleton | Add/rename/reorder/delete buckets                          | `buckets.*` + `tasks.getBoard` (empty)                                                                                                                                         | `BoardColumn`, `AddBucketButton`, inline rename, bucket reorder                      |
| 1.3 | Tasks core               | CRUD, drag-drop, assign, labels, priority, dates, progress | `tasks.*` full; optimistic concurrency; events                                                                                                                                 | `TaskCard`, `QuickAddTask`, `useOptimisticMove`, due-date/label/assignee quick menus |
| 1.4 | Task detail panel        | Click card → panel, autosave, description                  | `tasks.getDetail`; property update handlers                                                                                                                                    | Intercepting route modal; `TaskPropertyStrip`, `TaskDescription`; conflict toast     |
| 1.5 | Checklist                | 20-item checklist, drag-reorder, counter on card           | `checklist.*`; counter maintenance                                                                                                                                             | `TaskChecklist`; add-on-Enter; drag-reorder                                          |
| 1.6 | Attachments & cover      | File/link attachments; set as cover                        | `attachments.*`; `@future/storage`                                                                                                                                             | Upload widget; link paste; cover menu; card cover rendering                          |
| 1.7 | Comments                 | Post, soft-delete, list                                    | `comments.*` with reserved `ms_*` fields                                                                                                                                       | `TaskComments`                                                                       |
| 1.8 | Evidence                 | Submit file/link/note with caption                         | `evidence.*`; constraints; events                                                                                                                                              | `TaskEvidence` section; composer; disabled "Verify" button                           |
| 1.9 | Notifications & polish   | Assignees get email; E2E green; ship                       | `OnTaskAssignedHandler` into notifications; perf assertions                                                                                                                    | Empty states, skeletons, a11y audit; Playwright; design review                       |

### Dependencies

- Strictly sequential **1.0 → 1.1 → 1.2 → 1.3**.
- **1.4–1.8** mostly independent after 1.3; could parallelize but sequential is recommended (reviewer bandwidth).
- **1.9** is terminal.

### Rollout / feature flag

- One flag `planner.core.enabled` in `admin` (tenant-scoped). Off by default until 1.9.
- Internal SETA tenant gets the flag early for dogfooding.
- No per-phase flags within 1.x; incomplete phases just render as "Coming soon" sections.

### Cross-sub-project dependency

Pre-Phase-1.0 PR on `identity`: add `externalUserId` column + `IdentityQueryFacade.getExternalUserId` / `getActorIdByExternalUserId`. Tiny PR; unblocks Phase 4 without forcing a `planner` refactor later.

### CLAUDE.md update

CLAUDE.md currently attributes "AI reminders" and "KPI linkage" to `planner`. Under strict lockstep, these are layered features for Sub-project #5 and do not belong in the `planner` module. The PR that completes Sub-project #1 updates CLAUDE.md's domain-modules table to reflect this.

### Progress checklist

Last updated: 2026-04-18

- [ ] Pre-Phase-1.0 — `identity` adds `externalUserId` + facade methods
- [ ] **Phase 1.0 — Foundation**
  - [ ] Drizzle schema migration applied with RLS active
  - [ ] `MsOrderHint` VO ported from MS algorithm + golden fixtures
  - [ ] Aggregate entities with invariants; unit tests green
  - [ ] Repository interfaces + Drizzle implementations + in-memory fakes
  - [ ] `PlanAuthorizationService` wired through `KernelQueryFacade`
  - [ ] Kernel permission registrations seeded
  - [ ] `PlannerQueryFacade` skeleton exported from `PlannerModule`
  - [ ] `web-planner` shell renders; tRPC client connects; `/plans` empty page
  - [ ] Coverage ≥70% on new code
- [ ] **Phase 1.1 — Plans & Members**
  - [ ] Create / rename / delete plan
  - [ ] Add / remove members
  - [ ] Label rename + recolor
  - [ ] `PlanCreated/Renamed/Deleted`, `PlanMemberAdded/Removed` outbox events
  - [ ] Plans list page + create flow + plan settings drawer
  - [ ] Unit + integration ≥70%
- [ ] **Phase 1.2 — Buckets & Board skeleton**
  - [ ] `buckets.create/rename/reorder/delete`
  - [ ] `tasks.getBoard` returning plan + buckets + empty tasks
  - [ ] Bucket drag-reorder (`@dnd-kit`)
  - [ ] `BucketCreated/Renamed/Reordered/Deleted` events
- [ ] **Phase 1.3 — Tasks core**
  - [ ] `tasks.create/update/move/setProgress/setPriority/setDates/assign/unassign/applyLabel/removeLabel/delete`
  - [ ] Optimistic concurrency via `expectedVersion`
  - [ ] All corresponding outbox events
  - [ ] `TaskCard` with badges, drag-drop between buckets, quick-add
  - [ ] `useOptimisticMove` hook
- [ ] **Phase 1.4 — Task detail panel**
  - [ ] `tasks.getDetail`
  - [ ] Property edits return full `Task`
  - [ ] Intercepting-route modal
  - [ ] Autosave-on-blur; conflict toast with keep-mine/theirs
- [ ] **Phase 1.5 — Checklist**
  - [ ] `checklist.*` handlers with denormalized counter maintenance
  - [ ] `TaskChecklist` component with add-on-Enter + drag-reorder
  - [ ] Card counter badge
- [ ] **Phase 1.6 — Attachments & cover**
  - [ ] `attachments.requestUpload / finalizeUpload / setCover / remove`
  - [ ] `@future/storage` integration with presigned URLs
  - [ ] Upload widget + link paste
  - [ ] Cover rendering on `TaskCard`
- [ ] **Phase 1.7 — Comments**
  - [ ] `comments.post / delete / list`
  - [ ] `TaskCommentPosted/Deleted` events
  - [ ] `TaskComments` component with soft-delete author-only
- [ ] **Phase 1.8 — Evidence**
  - [ ] `evidence.requestUpload / finalizeUpload / createNote / createLink / list / remove`
  - [ ] `TaskEvidenceSubmittedEvent` (verify event reserved)
  - [ ] Composer + list + disabled Verify button with Phase 5 tooltip
- [ ] **Phase 1.9 — Notifications & polish**
  - [ ] `OnTaskAssignedHandler` → notification email
  - [ ] Performance integration tests green
  - [ ] Empty states + loading skeletons
  - [ ] Keyboard a11y audit
  - [ ] Playwright 8 flows green
  - [ ] Design review against DESIGN.md
  - [ ] CLAUDE.md domain-modules table updated (remove "AI reminders, KPI linkage" from `planner`)
  - [ ] Feature flag `planner.core.enabled` flipped on for internal tenant

---

## 12. Confirmed Decisions (Open Items, Resolved)

| #   | Item                                 | Decision                                                                               |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| 1   | AI reminders + KPI linkage ownership | Moved out of `planner` to Sub-project #5 as layered features. CLAUDE.md updated in 1.9 |
| 2   | Label color palette                  | 25 Radix dark-palette scales mapped to `category1..category25`                         |
| 3   | Soft-delete retention                | Keep forever; purge job added later per tenant policy                                  |
| 4   | Rich content paste                   | Silently strip; show one-time toast                                                    |
| 5   | `platform_admin` UI                  | None in Phase 1; API-only access                                                       |
| 6   | `web-admin` MS 365 connection page   | Phase 4 deliverable                                                                    |
| 7   | Guest access                         | Not in Phase 1; blocker documented for Phase 4                                         |
| 8   | Description length cap               | 32 000 chars; re-verify in Phase 4 against Graph                                       |
| 9   | Performance targets                  | `tasks.getBoard` <150 ms p95, drag-drop <200 ms p95, test-enforced                     |
| 10  | Outbox consumers                     | Only `notifications` in Phase 1; `insights` + Phase 4 sync later                       |

---

## 13. Risks and Mitigations

| Risk                                                      | Likelihood | Impact         | Mitigation                                                                                  |
| --------------------------------------------------------- | ---------- | -------------- | ------------------------------------------------------------------------------------------- |
| MS order-hint algorithm drift                             | Medium     | High           | Port MS algorithm verbatim; golden fixtures from MS docs                                    |
| Order-hint string growth under heavy inserts              | Low        | Medium         | Documented ceiling; rebalance routine in Phase 4                                            |
| Checklist counter race                                    | Low        | Low            | Same-txn atomic `UPDATE ... SET count = count + 1`                                          |
| 32 KB description cap mismatch with real MS limit         | Medium     | Low            | Documented assumption; Phase 4 validates against Graph                                      |
| 2 400-task plans performance cliff                        | Low        | Medium         | Target <200 in Phase 1; virtualization spike in Sub-project #2 if needed                    |
| `identity.externalUserId` pre-Phase-1.0 PR delay          | Low        | Low            | Trivial PR; gate Phase 1.0 on its merge                                                     |
| `@dnd-kit` + virtualization integration                   | Medium     | Low            | Spike task in Sub-project #2 before committing                                              |
| Strict (A) backfires with users                           | Unknown    | High (product) | Ship to SETA internal tenant first; feedback loop before external rollout                   |
| Evidence scope creep toward approval workflow             | Medium     | Low            | Verify button disabled with Phase 5 tooltip to set expectation                              |
| Comment sync-shape divergence from Group threads          | Medium     | Medium         | Match known MS shape; Phase 4 contract tests against sandbox Graph                          |
| Soft-delete confusion (deleted rows leaking into queries) | Low        | Low            | Default `deleted_at IS NULL` filter in every repo query; lint rule requires opt-out comment |

---

## 14. Cross-Sub-Project Dependencies Flagged

| Sub-project        | Dependency on Phase 1                                                                                  | Dependency from Phase 1                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| #2 (more views)    | Builds on `tasks.getBoard` and field-mutation commands already shipped in 1.3                          | None                                                                                          |
| #3 (personal hubs) | Uses `PlannerQueryFacade.listPlansForActor` and a new `listTasksForActor` method (added in #3's spec)  | None                                                                                          |
| #4 (sync)          | Uses all `ms_*` schema reservations; consumes outbox events; adds sync workers                         | Adds `ms-graph/` implementation inside `planner.infrastructure`; adds admin UI in `web-admin` |
| #5 (premium)       | Layered tables joined at read time: `task_goal_link`, `task_dependency`, etc. Evidence verification UI | None directly; may add `PlannerQueryFacade` read methods                                      |

---

## Appendix A — References

- MS Graph Planner API overview — https://learn.microsoft.com/en-us/graph/api/resources/planner-overview
- MS Planner order-hint format — https://learn.microsoft.com/en-us/graph/api/resources/planner-order-hint-format
- `@dnd-kit` — https://docs.dndkit.com/
- Project CLAUDE.md — repository root
- Project DESIGN.md — repository root
