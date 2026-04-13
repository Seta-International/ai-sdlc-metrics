# Planner Module Design Spec

**Date:** 2026-04-13
**Status:** Draft
**Module:** `planner` (schema: `planner`)
**Owns:** Task tracking, AI reminders (data layer), template-driven automation, recurring tasks, evidence-based completion
**Requirements source:** `docs/requirements/planner.md` (Action Intelligence Platform v2.0)

---

## Overview

The planner is a **horizontal task layer** serving the entire Future platform. It provides task management that any module can leverage — HR onboarding, project delivery, finance operations, performance reviews, and personal to-dos. Other modules create tasks via event-driven template instantiation. The goals module queries planner data for KPI computation. The agents module consumes planner events for AI reminders and notifications.

Tasks can originate from multiple sources: manual creation, Teams meetings, voice recordings, emails, or automated template instantiation. Each task tracks its source type for audit and analytics. Completed tasks require evidence (text note, link, or file) based on impact level, per the requirements doc.

The planner does **not** own KPI logic, notifications, user profiles, permissions, voice transcription, or email parsing. It exposes data and events for those modules to consume. The agents module handles AI extraction from voice/email and writes back to planner via commands.

### Tech Stack

| Concern    | Technology                                 | Notes                                               |
| ---------- | ------------------------------------------ | --------------------------------------------------- |
| Schema     | Drizzle ORM (`pgSchema('planner')`)        | Index third arg uses array syntax                   |
| CQRS       | `@nestjs/cqrs`                             | `CommandHandler`, `QueryHandler`, `EventsHandler`   |
| API        | tRPC with Zod validation                   | Singleton `PlannerTrpcService` bridges NestJS DI    |
| Jobs       | pg-boss                                    | `createQueue` required before sending (v10+)        |
| Recurrence | `rrule` npm package                        | RFC 5545 RRULE parsing, next-occurrence computation |
| Timestamps | `timestamp('col', { withTimezone: true })` | All timestamps use timezone-aware columns           |

### Prerequisites

- `@future/core` package must exist (exports `DomainException` base class). All module exceptions extend from `@future/core` — NOT from `kernel/domain/exceptions/`.
- `@future/stt` package must exist before the recording pipeline (Phase 5).
- `rrule` npm package: `bun add rrule` in `apps/api`.

### Pattern Reference

Follow `modules/people/` as the canonical implementation reference:

- Schema: `infrastructure/schema/people.schema.ts`
- Entity: `domain/entities/employment-profile.entity.ts`
- Repository port: `domain/repositories/employment-profile.repository.ts` (Symbol + interface)
- Repository impl: `infrastructure/repositories/drizzle-employment-profile.repository.ts`
- Command: `application/commands/create-employment-profile.command.ts`
- Handler: `application/commands/create-employment-profile.handler.ts`
- Query: `application/queries/get-profile.query.ts`
- Facade: `application/facades/people-query.facade.ts`
- Module: `people.module.ts` (providers + exports pattern)
- tRPC service: `interface/trpc/people-trpc.service.ts` (singleton bridge)

### Implementation Order

**Phase 1 — Schema & Domain (no dependencies)**

1. Drizzle schema: all core tables (`plan`, `task`, `task_status`, `bucket`, etc.)
2. Run `bunx drizzle-kit generate` to create migration
3. Domain entities (TypeScript interfaces)
4. Domain types (enums/unions)
5. Repository interfaces (Symbol + interface per entity)
6. Domain exceptions (extending `DomainException` from `@future/core`)

**Phase 2 — Application Layer (depends on Phase 1)**

7. Repository implementations (Drizzle)
8. CQRS commands + handlers: `CreatePlan`, `CreateTask`, `CreateBucket`, `AssignTask`, `CompleteTask`, `UpdateTask`
9. CQRS queries + handlers: `GetPlan`, `ListPlans`, `GetTask`, `ListTasks`, `MyTasks`, `MyDay`
10. `PlannerQueryFacade` + `PlannerTrpcService`

**Phase 3 — tRPC & Integration (depends on Phase 2)**

11. tRPC router: plan, task, bucket, assignee, checklist, label, status procedures
12. Wire into `app-router.ts`
13. Module wiring in `planner.module.ts`

**Phase 4 — Advanced Features (depends on Phase 3)**

14. Template tables (schema + entities + repos)
15. `InstantiatePlanTemplate`, `CreatePlanTemplate` commands
16. Recurring tasks: `CreateRecurringTask` command, pg-boss `planner.process-recurrences` job
17. Evidence model: `task_evidence` table, `AddEvidence`, `CompleteTask` with validation
18. Draft tasks: `ConfirmDraft`, `RejectDraft`, `ListDrafts`
19. Event-to-template automation: `event_template_mapping` table, generic event handler

**Phase 5 — Recording Pipeline (depends on `@future/stt` package)**

20. `recording` table + entity + repository
21. `IActionExtractor` port + `OpenAiActionExtractor` infrastructure adapter
22. STT provider wiring (from `@future/stt`)
23. `RequestUploadUrl`, `SubmitRecording`, `ProcessRecording` commands
24. pg-boss `planner.process-recording` job
25. Recording tRPC procedures

**Phase 6 — Frontend (depends on Phase 3+)**

26. Board view, List view, Calendar view
27. My Tasks, My Day views
28. Task detail sheet
29. Charts, Timeline views
30. Template management, Draft review, Recording page

---

## Data Model

All tables live in the `planner` PostgreSQL schema. Every table has `tenant_id` (uuid, NOT NULL). Primary keys are uuid v7.

### Core Tables

#### `plan`

| Column         | Type      | Notes                                                |
| -------------- | --------- | ---------------------------------------------------- |
| id             | uuid v7   | PK                                                   |
| tenant_id      | uuid      | NOT NULL                                             |
| title          | text      | NOT NULL                                             |
| description    | text      | nullable                                             |
| owner_id       | uuid      | creator/owner actor                                  |
| container_type | enum      | `team`, `project`, `personal`, `general`             |
| container_id   | uuid      | nullable — FK-less ref to org unit, project, or null |
| is_archived    | boolean   | default false                                        |
| created_at     | timestamp | default now                                          |
| updated_at     | timestamp | default now                                          |

#### `task_status`

Configurable statuses. Rows with `plan_id = NULL` are tenant defaults. Plans without custom statuses inherit tenant defaults.

| Column    | Type    | Notes                                                            |
| --------- | ------- | ---------------------------------------------------------------- |
| id        | uuid v7 | PK                                                               |
| tenant_id | uuid    | NOT NULL                                                         |
| plan_id   | uuid    | nullable — null = tenant default                                 |
| name      | text    | e.g. "In Review", "Blocked"                                      |
| color     | text    | hex color                                                        |
| position  | integer | sort order                                                       |
| category  | enum    | `draft`, `not_started`, `active`, `blocked`, `done`, `cancelled` |

Default tenant statuses seeded on tenant creation:

- To Do (not_started, position 0)
- In Progress (active, position 1)
- Blocked (blocked, position 2)
- In Review (active, position 3)
- Done (done, position 4)
- Cancelled (cancelled, position 5)

#### `bucket`

| Column    | Type    | Notes      |
| --------- | ------- | ---------- |
| id        | uuid v7 | PK         |
| tenant_id | uuid    | NOT NULL   |
| plan_id   | uuid    | FK to plan |
| name      | text    | NOT NULL   |
| position  | integer | sort order |

#### `task`

| Column               | Type      | Notes                                                                    |
| -------------------- | --------- | ------------------------------------------------------------------------ |
| id                   | uuid v7   | PK                                                                       |
| tenant_id            | uuid      | NOT NULL                                                                 |
| plan_id              | uuid      | FK to plan                                                               |
| bucket_id            | uuid      | nullable FK to bucket                                                    |
| parent_task_id       | uuid      | nullable — self-ref for subtasks (max depth 1)                           |
| sequence_number      | integer   | tenant-scoped auto-increment (#1, #2...)                                 |
| title                | text      | NOT NULL                                                                 |
| description          | text      | nullable                                                                 |
| status_id            | uuid      | FK to task_status                                                        |
| priority             | enum      | `urgent`, `high`, `medium`, `low`, `none`                                |
| impact_level         | enum      | `project`, `company`, `strategic`, `none` — determines evidence tier     |
| source_type          | enum      | `manual`, `teams_meeting`, `voice_recording`, `email`, `pmo_report`      |
| source_ref           | jsonb     | nullable — source metadata: `{ audioUrl, transcript, emailThreadId, … }` |
| start_date           | timestamp | nullable (with timezone)                                                 |
| due_date             | timestamp | nullable (with timezone)                                                 |
| completed_at         | timestamp | nullable                                                                 |
| completed_by         | uuid      | nullable                                                                 |
| created_by           | uuid      | actor who created                                                        |
| recurrence_rule      | text      | nullable — RFC 5545 RRULE                                                |
| recurrence_parent_id | uuid      | nullable — links instances to original                                   |
| position             | text      | string-based order hint for drag-and-drop                                |
| created_at           | timestamp | default now                                                              |
| updated_at           | timestamp | default now                                                              |

#### `task_my_day_pin`

| Column    | Type      | Notes         |
| --------- | --------- | ------------- |
| id        | uuid v7   | PK            |
| tenant_id | uuid      | NOT NULL      |
| task_id   | uuid      | FK to task    |
| actor_id  | uuid      | who pinned it |
| pinned_at | timestamp | default now   |

Unique constraint on `(tenant_id, task_id, actor_id)`.

#### `task_assignee`

| Column      | Type      | Notes           |
| ----------- | --------- | --------------- |
| id          | uuid v7   | PK              |
| tenant_id   | uuid      | NOT NULL        |
| task_id     | uuid      | FK to task      |
| actor_id    | uuid      | assigned person |
| assigned_at | timestamp | default now     |
| assigned_by | uuid      | who assigned    |

#### `task_label`

| Column    | Type    | Notes      |
| --------- | ------- | ---------- |
| id        | uuid v7 | PK         |
| tenant_id | uuid    | NOT NULL   |
| plan_id   | uuid    | FK to plan |
| name      | text    |            |
| color     | text    | hex        |

#### `task_label_assignment`

| Column    | Type | Notes    |
| --------- | ---- | -------- |
| task_id   | uuid | FK       |
| label_id  | uuid | FK       |
| tenant_id | uuid | NOT NULL |

Composite PK on `(task_id, label_id)`.

#### `task_checklist_item`

| Column     | Type    | Notes         |
| ---------- | ------- | ------------- |
| id         | uuid v7 | PK            |
| tenant_id  | uuid    | NOT NULL      |
| task_id    | uuid    | FK to task    |
| title      | text    | NOT NULL      |
| is_checked | boolean | default false |
| position   | integer | sort order    |

#### `task_relation`

| Column         | Type    | Notes                                |
| -------------- | ------- | ------------------------------------ |
| id             | uuid v7 | PK                                   |
| tenant_id      | uuid    | NOT NULL                             |
| source_task_id | uuid    | FK                                   |
| target_task_id | uuid    | FK                                   |
| relation_type  | enum    | `related_to`, `blocks`, `blocked_by` |

#### `task_activity`

| Column     | Type      | Notes                                                    |
| ---------- | --------- | -------------------------------------------------------- |
| id         | uuid v7   | PK                                                       |
| tenant_id  | uuid      | NOT NULL                                                 |
| task_id    | uuid      | FK                                                       |
| actor_id   | uuid      | who made the change                                      |
| action     | text      | `created`, `status_changed`, `assigned`, `comment`, etc. |
| old_value  | jsonb     | nullable                                                 |
| new_value  | jsonb     | nullable                                                 |
| created_at | timestamp | default now                                              |

#### `task_evidence`

Evidence-based completion model (per requirements REQ-07). Impact level determines required evidence tier.

| Column      | Type      | Notes                                            |
| ----------- | --------- | ------------------------------------------------ |
| id          | uuid v7   | PK                                               |
| tenant_id   | uuid      | NOT NULL                                         |
| task_id     | uuid      | FK to task                                       |
| tier        | enum      | `text` (note), `link` (URL), `file` (attachment) |
| content     | text      | NOT NULL — completion note, URL, or storage key  |
| uploaded_by | uuid      | actor who submitted evidence                     |
| created_at  | timestamp | default now                                      |

Evidence tier requirements by impact level:

- `none` / `project` — Tier 1 (text note) minimum
- `company` — Tier 2 (link to deliverable) minimum
- `strategic` — Tier 3 (file attachment) required

Completing a task validates that evidence meets the minimum tier for its impact level.

### Template Tables

Separate from live tables. Same columns minus runtime fields (assignees, completed_at, sequence_number, recurrence fields).

#### `plan_template`

| Column         | Type      | Notes                               |
| -------------- | --------- | ----------------------------------- |
| id             | uuid v7   | PK                                  |
| tenant_id      | uuid      | NOT NULL                            |
| title          | text      | NOT NULL                            |
| description    | text      | nullable                            |
| container_type | enum      | nullable — suggested container type |
| created_by     | uuid      |                                     |
| created_at     | timestamp |                                     |
| updated_at     | timestamp |                                     |

#### `template_bucket`

| Column      | Type    | Notes               |
| ----------- | ------- | ------------------- |
| id          | uuid v7 | PK                  |
| tenant_id   | uuid    | NOT NULL            |
| template_id | uuid    | FK to plan_template |
| name        | text    | NOT NULL            |
| position    | integer |                     |

#### `template_task`

| Column                | Type    | Notes                                             |
| --------------------- | ------- | ------------------------------------------------- |
| id                    | uuid v7 | PK                                                |
| tenant_id             | uuid    | NOT NULL                                          |
| template_id           | uuid    | FK to plan_template                               |
| bucket_id             | uuid    | nullable FK to template_bucket                    |
| parent_task_id        | uuid    | nullable — self-ref for subtasks                  |
| title                 | text    | NOT NULL                                          |
| description           | text    | nullable                                          |
| priority              | enum    | `urgent`, `high`, `medium`, `low`, `none`         |
| default_assignee_role | text    | nullable — e.g. "manager", "new_hire", "hr_admin" |
| due_day_offset        | integer | nullable — days from instantiation date           |
| position              | text    | order hint                                        |

#### `template_checklist_item`

| Column    | Type    | Notes               |
| --------- | ------- | ------------------- |
| id        | uuid v7 | PK                  |
| tenant_id | uuid    | NOT NULL            |
| task_id   | uuid    | FK to template_task |
| title     | text    | NOT NULL            |
| position  | integer |                     |

#### `template_status`

Custom statuses for templates that need non-default workflows.

| Column      | Type    | Notes                                                   |
| ----------- | ------- | ------------------------------------------------------- |
| id          | uuid v7 | PK                                                      |
| tenant_id   | uuid    | NOT NULL                                                |
| template_id | uuid    | FK to plan_template                                     |
| name        | text    |                                                         |
| color       | text    |                                                         |
| position    | integer |                                                         |
| category    | enum    | `not_started`, `active`, `blocked`, `done`, `cancelled` |

### Sequence Table

#### `tenant_task_sequence`

| Column        | Type    | Notes               |
| ------------- | ------- | ------------------- |
| tenant_id     | uuid    | PK                  |
| last_sequence | integer | NOT NULL, default 0 |

One row per tenant. Incremented via `SELECT ... FOR UPDATE` when creating tasks to guarantee unique, gapless sequence numbers per tenant.

### Event-to-Template Mapping

#### `event_template_mapping`

| Column             | Type      | Notes                                                               |
| ------------------ | --------- | ------------------------------------------------------------------- |
| id                 | uuid v7   | PK                                                                  |
| tenant_id          | uuid      | NOT NULL                                                            |
| event_name         | text      | e.g. `hiring.person-hired`                                          |
| template_id        | uuid      | FK to plan_template                                                 |
| role_mapping_rules | jsonb     | Maps event payload to template roles: `{ "new_hire": "$.actorId" }` |
| is_active          | boolean   | default true                                                        |
| created_at         | timestamp |                                                                     |

---

## Domain Layer

All entities are **TypeScript interfaces** (not classes), following the established codebase pattern. Type unions for enums, no decorators.

### Entities

All in `domain/entities/`. Each file exports the interface + related type unions.

```
task.entity.ts           — Task interface (aggregate root)
plan.entity.ts           — Plan interface (aggregate root)
bucket.entity.ts         — Bucket interface
task-assignee.entity.ts  — TaskAssignee interface
task-relation.entity.ts  — TaskRelation interface
task-activity.entity.ts  — TaskActivity interface
checklist-item.entity.ts — ChecklistItem interface
task-label.entity.ts     — TaskLabel interface
task-evidence.entity.ts  — TaskEvidence interface
plan-template.entity.ts  — PlanTemplate interface (aggregate root)
```

### Domain Types (type aliases, not classes)

Defined alongside their entity files, following the codebase convention of type unions (not value object classes):

```typescript
// In task.entity.ts
export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
export type ImpactLevel = 'project' | 'company' | 'strategic' | 'none'
export type SourceType = 'manual' | 'teams_meeting' | 'voice_recording' | 'email' | 'pmo_report'
export type EvidenceTier = 'text' | 'link' | 'file'

// In plan.entity.ts
export type ContainerType = 'team' | 'project' | 'personal' | 'general'

// In task-status.entity.ts
export type StatusCategory = 'draft' | 'not_started' | 'active' | 'blocked' | 'done' | 'cancelled'

// In task-relation.entity.ts
export type RelationType = 'related_to' | 'blocks' | 'blocked_by'
```

### Domain Rules

1. **Sequence number** is immutable once assigned. Generated via a `tenant_task_sequence` table with `SELECT ... FOR UPDATE` to ensure uniqueness per tenant.
2. **Subtasks** are tasks with `parentTaskId` set. Max nesting depth = 1 (task -> subtask only). Subtasks inherit `planId` from parent but have their own bucket, assignees, status.
3. **Status resolution**: task's `statusId` references `task_status`. When querying available statuses for a plan, check plan-specific rows first (`plan_id = planId`), fall back to tenant defaults (`plan_id IS NULL`).
4. **Completing a parent task** does not auto-complete subtasks. They are independent work items.
5. **Archiving a plan** soft-hides it from default list queries. Tasks remain queryable for My Tasks and reporting.
6. **Deleting a plan** is only allowed if it has no tasks (hard delete) or is archived (soft delete via `is_archived`).
7. **Evidence validation** — completing a task requires evidence meeting the minimum tier for the task's impact level. The `CompleteTask` command validates this.
8. **Draft tasks** — tasks with status category `draft` are pending human review (created from email, voice recording, or transcript AI extraction). Draft tasks do NOT consume a sequence number until confirmed. They are excluded from My Tasks, Charts, and Timeline by default. A `ConfirmDraft` command promotes the task: assigns sequence number, sets status to `not_started`, publishes `TaskCreatedEvent`.
9. **Draft visibility** — drafts appear in a dedicated "Review Drafts" section in the planner UI, grouped by source type (email, teams_meeting, voice_recording).

### Repository Interfaces

All in `domain/repositories/`. Each file exports a Symbol token + interface, following the codebase convention:

```typescript
// Example: domain/repositories/task.repository.ts
export const TASK_REPOSITORY = Symbol('ITaskRepository')
export interface ITaskRepository {
  findById(id: string, tenantId: string): Promise<Task | null>
  // ...
}
```

Files:

```
plan.repository.ts                  — PLAN_REPOSITORY / IPlanRepository
task.repository.ts                  — TASK_REPOSITORY / ITaskRepository
bucket.repository.ts                — BUCKET_REPOSITORY / IBucketRepository
task-status.repository.ts           — TASK_STATUS_REPOSITORY / ITaskStatusRepository
task-assignee.repository.ts         — TASK_ASSIGNEE_REPOSITORY / ITaskAssigneeRepository
task-label.repository.ts            — TASK_LABEL_REPOSITORY / ITaskLabelRepository
task-relation.repository.ts         — TASK_RELATION_REPOSITORY / ITaskRelationRepository
task-activity.repository.ts         — TASK_ACTIVITY_REPOSITORY / ITaskActivityRepository
checklist-item.repository.ts        — CHECKLIST_ITEM_REPOSITORY / IChecklistItemRepository
my-day-pin.repository.ts            — MY_DAY_PIN_REPOSITORY / IMyDayPinRepository
task-evidence.repository.ts         — TASK_EVIDENCE_REPOSITORY / ITaskEvidenceRepository
plan-template.repository.ts         — PLAN_TEMPLATE_REPOSITORY / IPlanTemplateRepository
template-task.repository.ts         — TEMPLATE_TASK_REPOSITORY / ITemplateTaskRepository
template-bucket.repository.ts       — TEMPLATE_BUCKET_REPOSITORY / ITemplateBucketRepository
event-template-mapping.repository.ts — EVENT_TEMPLATE_MAPPING_REPOSITORY / IEventTemplateMappingRepository
tenant-task-sequence.repository.ts  — TENANT_TASK_SEQUENCE_REPOSITORY / ITenantTaskSequenceRepository
```

### Exceptions

In `domain/exceptions/planner.exceptions.ts`, extending `DomainException`:

```typescript
TaskNotFoundException                    — code: 'TASK_NOT_FOUND'
PlanNotFoundException                    — code: 'PLAN_NOT_FOUND'
InvalidSubtaskDepthException             — code: 'INVALID_SUBTASK_DEPTH'
InsufficientEvidenceException            — code: 'INSUFFICIENT_EVIDENCE'
InvalidStatusTransitionException         — code: 'INVALID_STATUS_TRANSITION'
DuplicateSequenceNumberException         — code: 'DUPLICATE_SEQUENCE_NUMBER'
TemplateNotFoundException                — code: 'TEMPLATE_NOT_FOUND'
PlanNotEmptyException                    — code: 'PLAN_NOT_EMPTY'
```

---

## Application Layer (CQRS)

### Commands

| Command                   | Description                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `CreatePlan`              | Create plan with optional container, buckets, custom statuses                         |
| `UpdatePlan`              | Update title, description, archive/unarchive                                          |
| `DeletePlan`              | Soft delete (archive) or hard delete if no tasks                                      |
| `CreateBucket`            | Add bucket to plan                                                                    |
| `UpdateBucket`            | Rename, reorder                                                                       |
| `DeleteBucket`            | Remove bucket, optionally reassign tasks to another bucket                            |
| `CreateTask`              | Create task or subtask, auto-assign sequence number                                   |
| `UpdateTask`              | Update title, description, priority, dates, bucket, status, position                  |
| `AssignTask`              | Add/remove assignees                                                                  |
| `CompleteTask`            | Set status to done category, stamp completed_at/completed_by                          |
| `MoveTask`                | Move task between plans or buckets                                                    |
| `CreateChecklistItem`     | Add checklist item to task                                                            |
| `UpdateChecklistItem`     | Update title or position                                                              |
| `ToggleChecklistItem`     | Check/uncheck a checklist item                                                        |
| `DeleteChecklistItem`     | Remove checklist item                                                                 |
| `CreateTaskRelation`      | Link two tasks                                                                        |
| `RemoveTaskRelation`      | Unlink tasks                                                                          |
| `CreateLabel`             | Create label on a plan                                                                |
| `UpdateLabel`             | Update label name/color                                                               |
| `DeleteLabel`             | Remove label from plan                                                                |
| `AssignLabel`             | Add label to a task                                                                   |
| `RemoveLabel`             | Remove label from a task                                                              |
| `ConfigureStatuses`       | Set custom statuses for a plan                                                        |
| `InstantiatePlanTemplate` | Clone template into live plan with role-based assignee resolution                     |
| `CreatePlanTemplate`      | Create template from scratch or snapshot from existing plan                           |
| `UpdatePlanTemplate`      | Edit template structure                                                               |
| `DeletePlanTemplate`      | Remove template                                                                       |
| `CreateRecurringTask`     | Create task with RRULE                                                                |
| `ConfirmDraft`            | Promote draft task: assign sequence number, set not_started, publish TaskCreatedEvent |
| `RejectDraft`             | Delete a draft task that was incorrectly extracted                                    |
| `AddEvidence`             | Attach evidence (text/link/file) to a task                                            |
| `DeleteEvidence`          | Remove evidence from a task                                                           |
| `PinToMyDay`              | Pin a task to My Day for the current actor                                            |
| `UnpinFromMyDay`          | Unpin a task from My Day                                                              |

### Queries

| Query           | Description                                                          |
| --------------- | -------------------------------------------------------------------- |
| `GetPlan`       | Plan with buckets, statuses, labels, task counts                     |
| `ListPlans`     | Plans for a tenant, filterable by container, owner, archived         |
| `GetTask`       | Full task with subtasks, checklist, assignees, labels, relations     |
| `ListTasks`     | Tasks in a plan, filterable by bucket/status/assignee/priority/dates |
| `MyTasks`       | All tasks assigned to actor across all plans                         |
| `MyDay`         | Tasks due today + pinned tasks for actor                             |
| `TaskActivity`  | Activity log for a task                                              |
| `PlanCharts`    | Aggregated stats by status, assignee, priority, overdue              |
| `Timeline`      | Tasks with dates and relations for Gantt rendering                   |
| `ListTemplates` | Available templates for a tenant                                     |
| `GetTemplate`   | Full template structure                                              |
| `SearchTasks`   | Full-text search across task titles/descriptions                     |
| `ListDrafts`    | Draft tasks for tenant, grouped by source type, for review UI        |

### Event Handlers (inbound — consuming other modules' events)

| Event            | Action                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- |
| Any mapped event | Look up `event_template_mapping` for tenant + event name, instantiate matching template |

This is generic — no hardcoded event handlers per module. Tenant admin configures which events trigger which templates.

### Facades

**`PlannerQueryFacade`** (exported to other modules):

| Method                                            | Description                                  |
| ------------------------------------------------- | -------------------------------------------- |
| `getTaskCountsByStatus(tenantId, filters?)`       | Task completion rates for goals/insights     |
| `getTasksCompletedInPeriod(tenantId, start, end)` | KPI score computation for goals              |
| `getOverdueTasks(tenantId)`                       | Overdue tasks for agents (reminder triggers) |
| `getTasksByActor(actorId, tenantId)`              | Workload data for people module              |

---

## Event Contracts (outbound — published by planner)

### Updated events

- **`TaskCreatedEvent`** — fields: `tenantId`, `actorId`, `taskId`, `title`, `dueDate` (nullable). Remove existing `kpiId` field.
- **`TaskCompletedEvent`** — fields: `tenantId`, `actorId`, `taskId`, `completedAt`. No changes.

### New events

| Event               | Fields                                              |
| ------------------- | --------------------------------------------------- |
| `TaskUpdatedEvent`  | tenantId, actorId, taskId, changes (partial object) |
| `TaskDeletedEvent`  | tenantId, actorId, taskId                           |
| `TaskAssignedEvent` | tenantId, actorId, taskId, assigneeIds              |
| `TaskOverdueEvent`  | tenantId, taskId, dueDate, assigneeIds              |
| `PlanCreatedEvent`  | tenantId, actorId, planId, title, containerType     |
| `PlanArchivedEvent` | tenantId, actorId, planId                           |

---

## tRPC Router

Uses the singleton `PlannerTrpcService` pattern (same as `PeopleTrpcService`). Service bridges NestJS DI → tRPC via `static getInstance()`. Router is a factory function receiving facades.

```typescript
// interface/trpc/planner-trpc.service.ts
@Injectable()
export class PlannerTrpcService implements OnModuleInit {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}
  onModuleInit() { instance = this }
  static getInstance(): PlannerTrpcService { ... }
  command<T>(cmd: T) { return this.commandBus.execute(cmd as never) }
  query<T>(q: T) { return this.queryBus.execute(q as never) }
}
```

### Procedures

```
planner.
  plan.create           — mutation
  plan.update           — mutation
  plan.delete           — mutation
  plan.get              — query
  plan.list             — query
  plan.charts           — query
  bucket.create         — mutation
  bucket.update         — mutation
  bucket.delete         — mutation
  task.create           — mutation
  task.update           — mutation
  task.complete         — mutation
  task.move             — mutation
  task.delete           — mutation
  task.get              — query
  task.list             — query
  task.search           — query
  task.timeline         — query
  task.assignee.assign  — mutation
  task.assignee.remove  — mutation
  task.checklist.create — mutation
  task.checklist.update — mutation
  task.checklist.toggle — mutation
  task.checklist.delete — mutation
  task.label.assign     — mutation
  task.label.remove     — mutation
  task.relation.create  — mutation
  task.relation.remove  — mutation
  task.activity.list    — query
  task.evidence.add     — mutation
  task.evidence.list    — query
  task.evidence.delete  — mutation
  draft.list            — query (drafts grouped by source type)
  draft.confirm         — mutation (promote to real task)
  draft.reject          — mutation (delete draft)
  myTasks               — query
  myDay.list            — query
  myDay.pin             — mutation
  myDay.unpin           — mutation
  status.configure      — mutation
  status.list           — query
  label.create          — mutation
  label.update          — mutation
  label.delete          — mutation
  label.list            — query
  template.create       — mutation
  template.update       — mutation
  template.delete       — mutation
  template.get          — query
  template.list         — query
  template.instantiate  — mutation
```

---

## Permissions

Follows existing `module:resource:action` pattern via `KernelQueryFacade.canDo()`.

| Permission                 | Who                                    |
| -------------------------- | -------------------------------------- |
| `planner:plan:create`      | Any employee                           |
| `planner:plan:manage`      | Plan owner + tenant admin              |
| `planner:task:create`      | Plan members                           |
| `planner:task:update`      | Task assignees + plan owner + managers |
| `planner:task:read`        | Plan members                           |
| `planner:task:delete`      | Task creator + plan owner              |
| `planner:template:manage`  | Tenant admin + HR admin                |
| `planner:status:configure` | Plan owner + tenant admin              |

"Plan members" = anyone assigned to a task in the plan, the plan owner, or actors within the plan's container scope.

---

## Module Wiring

```typescript
// planner.module.ts
@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    // Repositories: { provide: SYMBOL, useClass: DrizzleImplementation }
    { provide: PLAN_REPOSITORY, useClass: DrizzlePlanRepository },
    { provide: TASK_REPOSITORY, useClass: DrizzleTaskRepository },
    // ... all repositories

    // Command handlers (direct class refs)
    CreatePlanHandler,
    CreateTaskHandler,
    CompleteTaskHandler /* ... */,

    // Query handlers
    GetPlanHandler,
    ListTasksHandler,
    MyTasksHandler /* ... */,

    // Event handlers
    OnMappedEventHandler, // generic handler for event-to-template mapping

    // Facades & services
    PlannerQueryFacade,
    PlannerTrpcService,
  ],
  exports: [PlannerQueryFacade], // ONLY facade exported
})
export class PlannerModule {}
```

---

## Recurring Tasks

**Storage:** Task with `recurrence_rule` set (RFC 5545 RRULE string, e.g. `FREQ=WEEKLY;BYDAY=FR`).

**Library:** `rrule` npm package for parsing and computing next occurrences:

```typescript
import { rrulestr } from 'rrule'
const rule = rrulestr(task.recurrenceRule)
const nextOccurrence = rule.after(new Date()) // Date | null
const upcoming = rule.between(windowStart, windowEnd) // Date[]
```

**Processing:** pg-boss job `planner.process-recurrences` (requires `createQueue('planner.process-recurrences')` at startup):

- **Schedule:** `boss.schedule('planner.process-recurrences', '0 0 * * *', {}, { tz: tenantTimezone })`
- **Logic:**

1. Find tasks with active `recurrence_rule` where status category != done/cancelled
2. Parse RRULE via `rrulestr()`, compute next occurrence with `rule.after(lastCreatedAt)`
3. If next occurrence is within 24 hours, create new task instance
4. New instance copies title, description, priority, bucket, assignees from parent
5. Set `recurrence_parent_id` to original task, fresh status (not_started), new sequence number
6. Publish `TaskCreatedEvent`
7. Use `singletonKey: 'recurrence-${taskId}'` to prevent duplicate processing

Skips offboarded assignees. Supports daily, weekly, monthly, yearly frequencies with end date or count. Always use `rule.between()` or limit iterators — never `rule.all()` on infinite rules.

---

## Template Instantiation

**Input:** templateId, tenantId, actorId, roleMapping (`{ "new_hire": "uuid", "manager": "uuid" }`), optional overrides (title, dates, container).

**Steps:**

1. Load full template (buckets, tasks, subtasks, checklist items, custom statuses)
2. Create `plan` from template fields + overrides
3. Clone statuses (if template has custom) or use tenant defaults
4. Clone buckets preserving position
5. Clone tasks, resolve `default_assignee_role` to real actor IDs via roleMapping
6. Clone subtasks under parent tasks
7. Clone checklist items
8. Assign sequence numbers to all tasks
9. Compute real due dates from `due_day_offset` + instantiation date
10. Publish `PlanCreatedEvent` + `TaskCreatedEvent` per task

---

## Cross-Module Integration

### Event-to-template mapping

`event_template_mapping` table maps event names to templates with JSONPath role resolution rules. Fully generic — no hardcoded per-module handlers.

### pg-boss Jobs

| Job                           | Schedule                   | Description                                    |
| ----------------------------- | -------------------------- | ---------------------------------------------- |
| `planner.process-recurrences` | Daily midnight (tenant TZ) | Generate recurring task instances              |
| `planner.detect-overdue`      | Hourly                     | Find overdue tasks, publish `TaskOverdueEvent` |

### What planner does NOT own

- **Notifications** — agents module handles delivery
- **KPI computation** — goals module queries planner via facade
- **User profiles** — people module, planner stores actor IDs only
- **Permissions** — kernel module via `canDo()`
- **File attachments** — deferred (add via `@future/storage` later)

---

## Frontend (web-planner)

### Routes

```
/planner                      → My Tasks (default landing)
/planner/my-day               → My Day view
/planner/plans                → Plan list
/planner/plans/[id]           → Plan Board view (default)
/planner/plans/[id]/list      → Plan List/Grid view
/planner/plans/[id]/calendar  → Plan Calendar view
/planner/plans/[id]/timeline  → Plan Timeline view
/planner/plans/[id]/charts    → Plan Charts view
/planner/drafts               → Review draft tasks (from email, voice, transcripts)
/planner/templates            → Template management (admin)
/planner/task/[seq]           → Task detail (full page)
```

### Views

**Board (Kanban):** Columns grouped by status (default), bucket, assignee, or priority. Cards show #sequence, title, priority dot, assignee avatars, due date, checklist progress, label dots. Drag-and-drop reordering.

**List (Grid):** Spreadsheet rows, inline-editable. Columns: #, title, status, assignees, priority, due date, labels, checklist. Sortable, bulk actions.

**Calendar:** Month/week view. Tasks by due date. Drag to reschedule. Color by priority or status.

**My Tasks:** Aggregated across all plans. Group by plan/status/priority/due date. Filters for plan, status category, priority, date range.

**My Day:** Today's due tasks + pinned tasks. Checklist-style focus view. Pin/unpin from any view.

**Charts:** Status distribution (donut), assignee workload (bar), priority breakdown (bar), overdue count (number), completion trend (line over time).

**Timeline (Gantt):** Horizontal bars by start/due date. Relation lines between linked tasks. Grouped by bucket. Read-only in v1 (edit via task detail).

### Task Detail

Opens as a right-side Sheet from any view, or full page at `/planner/task/[seq]`. Shows all fields, subtasks, checklist, activity log, relations, labels. All fields inline-editable.

### Shared UI

Leverages `packages/ui`: DataTable, Card, Calendar, Dialog/Sheet, Badge, Avatar, Tabs for view switching.

---

## Event-to-Template Automation (Admin Configuration)

The `event_template_mapping` table (defined in Data Model above) enables tenant admins to configure automatic plan/task creation when events occur across the platform. This section covers the admin UI and configuration flow.

### Admin UI

Route: `/admin/planner/automations` (in web-admin zone, not web-planner)

| View              | Description                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automation list   | All configured event-to-template mappings for the tenant. Shows: event name (human-readable), template name, active/inactive toggle, last triggered |
| Create automation | Pick an event from available events → pick a template → configure role mapping rules → activate                                                     |
| Edit automation   | Modify role mapping rules, change template, toggle active                                                                                           |

### Available events

The system discovers available events from `@future/event-contracts`. Each event class declares `static readonly eventName` which is used for matching. The admin UI shows a curated list with human-readable descriptions:

| Event                              | Display Name         | Module      |
| ---------------------------------- | -------------------- | ----------- |
| `hiring.person-hired`              | New hire onboarded   | Hiring      |
| `performance.review-cycle-created` | Review cycle started | Performance |
| `projects.project-created`         | New project created  | Projects    |
| `time.leave-approved`              | Leave approved       | Time        |
| `planner.task-overdue`             | Task overdue         | Planner     |

This list is maintained as a registry in the planner module — a simple array of `{ eventName, displayName, module, payloadFields }`. New events are added by updating the registry.

### Role mapping configuration

When creating an automation, the admin maps template roles to event payload fields using a simple UI:

```
Template role: "new_hire"     → Event field: "actorId"
Template role: "manager"      → Event field: "managerId"
Template role: "hr_admin"     → Fixed value: (pick from actor list)
```

Stored as JSONPath rules in `role_mapping_rules`:

```json
{
  "new_hire": "$.actorId",
  "manager": "$.managerId",
  "hr_admin": "fixed:uuid-of-hr-admin"
}
```

### Default automations (seeded on tenant creation)

None by default — automations are opt-in. But the template management UI suggests pairing templates with events:

> "This template has roles 'new_hire' and 'manager'. Would you like to auto-trigger it when a new hire is onboarded?"

### Validation

- Template must exist and be active
- All template roles must have a mapping (either JSONPath or fixed value)
- JSONPath expressions are validated against the event's declared payload fields
- Duplicate mappings (same event + same template) are rejected

### tRPC procedures (in planner router)

```
planner.
  automation.create    — mutation
  automation.update    — mutation
  automation.delete    — mutation
  automation.list      — query
  automation.test      — mutation (dry-run: show what would be created for a sample event payload)
```

### Permissions

| Permission                  | Who               |
| --------------------------- | ----------------- |
| `planner:automation:manage` | Tenant admin only |

---

## Verification Criteria

You know the planner module is working when:

1. **Plan CRUD**: Create a plan with custom statuses and 3 buckets → `plan.get` returns plan with statuses and buckets
2. **Task lifecycle**: Create task → assign 2 people → move to "In Progress" status → complete with evidence → task has `completed_at`, `completed_by`, sequence number is permanent
3. **Subtask depth**: Create task → create subtask → attempt to create sub-subtask → should throw `InvalidSubtaskDepthException`
4. **Evidence gating**: Create task with `impact_level: 'company'` → attempt to complete without Tier 2 evidence → should throw `InsufficientEvidenceException`
5. **Status resolution**: Plan without custom statuses → `status.list` returns tenant defaults. Plan with custom statuses → returns plan-specific statuses only.
6. **My Tasks**: Assign tasks across 3 different plans → `myTasks` query returns all, grouped by plan
7. **My Day**: Pin 2 tasks + 1 task due today → `myDay.list` returns all 3
8. **Template instantiation**: Create template with roles "manager" + "new_hire" → instantiate with role mapping → plan created with real assignees and computed due dates
9. **Recurring task**: Create task with `FREQ=WEEKLY;BYDAY=FR` → pg-boss job fires → new task instance created with `recurrence_parent_id` set
10. **Draft flow**: Create task with status category `draft` (no sequence number) → `ConfirmDraft` → task gets sequence number, status changes to `not_started`, `TaskCreatedEvent` published
11. **Sequence numbers**: Create 3 tasks in tenant A, 2 tasks in tenant B → tenant A has #1, #2, #3; tenant B has #1, #2 (independent sequences)
12. **Event-to-template**: Configure automation: `hiring.person-hired` → onboarding template → publish event → plan auto-created with tasks
