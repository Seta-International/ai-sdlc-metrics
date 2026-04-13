# Planner Module — Schema, Domain & Core CQRS (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the planner module's Drizzle schema (all core tables), domain entities, repository interfaces, repository implementations, core CQRS commands/queries, facades, and tRPC service bridge. This is Phase 1-2 of the planner spec.

**Architecture:** Hexagonal DDD following `modules/people/` as the canonical pattern. Drizzle schema in `planner` PostgreSQL namespace. CQRS via `@nestjs/cqrs`. Repository ports in domain, Drizzle implementations in infrastructure. `PlannerQueryFacade` + `PlannerTrpcService` singleton bridge.

**Tech Stack:** Drizzle ORM, NestJS CQRS, vitest, `@future/core` (DomainException, shared types), `uuidv7`

**Prerequisite:** Plan A (@future/core refactoring) must be complete.

**Spec:** `docs/superpowers/specs/2026-04-13-planner-module-design.md` — Phase 1-2

**Pattern reference:** `modules/people/` — schema, entity, repository port, repository impl, command/handler, query/handler, facade, module wiring, tRPC service

---

## File Map

| Action | Path                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------ |
| Modify | `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts`                                 |
| Create | `apps/api/src/modules/planner/domain/entities/plan.entity.ts`                                          |
| Create | `apps/api/src/modules/planner/domain/entities/task.entity.ts`                                          |
| Create | `apps/api/src/modules/planner/domain/entities/bucket.entity.ts`                                        |
| Create | `apps/api/src/modules/planner/domain/entities/task-status.entity.ts`                                   |
| Create | `apps/api/src/modules/planner/domain/entities/task-assignee.entity.ts`                                 |
| Create | `apps/api/src/modules/planner/domain/entities/task-label.entity.ts`                                    |
| Create | `apps/api/src/modules/planner/domain/entities/checklist-item.entity.ts`                                |
| Create | `apps/api/src/modules/planner/domain/entities/task-relation.entity.ts`                                 |
| Create | `apps/api/src/modules/planner/domain/entities/task-activity.entity.ts`                                 |
| Create | `apps/api/src/modules/planner/domain/entities/task-evidence.entity.ts`                                 |
| Create | `apps/api/src/modules/planner/domain/entities/my-day-pin.entity.ts`                                    |
| Create | `apps/api/src/modules/planner/domain/exceptions/planner.exceptions.ts`                                 |
| Create | `apps/api/src/modules/planner/domain/repositories/plan.repository.ts`                                  |
| Create | `apps/api/src/modules/planner/domain/repositories/task.repository.ts`                                  |
| Create | `apps/api/src/modules/planner/domain/repositories/bucket.repository.ts`                                |
| Create | `apps/api/src/modules/planner/domain/repositories/task-status.repository.ts`                           |
| Create | `apps/api/src/modules/planner/domain/repositories/task-assignee.repository.ts`                         |
| Create | `apps/api/src/modules/planner/domain/repositories/tenant-task-sequence.repository.ts`                  |
| Create | `apps/api/src/modules/planner/infrastructure/repositories/drizzle-plan.repository.ts`                  |
| Create | `apps/api/src/modules/planner/infrastructure/repositories/drizzle-plan.repository.integration.spec.ts` |
| Create | `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task.repository.ts`                  |
| Create | `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task.repository.integration.spec.ts` |
| Create | `apps/api/src/modules/planner/infrastructure/repositories/drizzle-bucket.repository.ts`                |
| Create | `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-status.repository.ts`           |
| Create | `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task-assignee.repository.ts`         |
| Create | `apps/api/src/modules/planner/infrastructure/repositories/drizzle-tenant-task-sequence.repository.ts`  |
| Create | `apps/api/src/modules/planner/application/commands/create-plan.command.ts`                             |
| Create | `apps/api/src/modules/planner/application/commands/create-plan.handler.ts`                             |
| Create | `apps/api/src/modules/planner/application/commands/create-plan.handler.spec.ts`                        |
| Create | `apps/api/src/modules/planner/application/commands/create-task.command.ts`                             |
| Create | `apps/api/src/modules/planner/application/commands/create-task.handler.ts`                             |
| Create | `apps/api/src/modules/planner/application/commands/create-task.handler.spec.ts`                        |
| Create | `apps/api/src/modules/planner/application/commands/create-bucket.command.ts`                           |
| Create | `apps/api/src/modules/planner/application/commands/create-bucket.handler.ts`                           |
| Create | `apps/api/src/modules/planner/application/commands/create-bucket.handler.spec.ts`                      |
| Create | `apps/api/src/modules/planner/application/commands/update-task.command.ts`                             |
| Create | `apps/api/src/modules/planner/application/commands/update-task.handler.ts`                             |
| Create | `apps/api/src/modules/planner/application/commands/update-task.handler.spec.ts`                        |
| Create | `apps/api/src/modules/planner/application/commands/assign-task.command.ts`                             |
| Create | `apps/api/src/modules/planner/application/commands/assign-task.handler.ts`                             |
| Create | `apps/api/src/modules/planner/application/commands/assign-task.handler.spec.ts`                        |
| Create | `apps/api/src/modules/planner/application/commands/complete-task.command.ts`                           |
| Create | `apps/api/src/modules/planner/application/commands/complete-task.handler.ts`                           |
| Create | `apps/api/src/modules/planner/application/commands/complete-task.handler.spec.ts`                      |
| Create | `apps/api/src/modules/planner/application/queries/get-plan.query.ts`                                   |
| Create | `apps/api/src/modules/planner/application/queries/get-plan.handler.ts`                                 |
| Create | `apps/api/src/modules/planner/application/queries/get-plan.handler.spec.ts`                            |
| Create | `apps/api/src/modules/planner/application/queries/list-plans.query.ts`                                 |
| Create | `apps/api/src/modules/planner/application/queries/list-plans.handler.ts`                               |
| Create | `apps/api/src/modules/planner/application/queries/get-task.query.ts`                                   |
| Create | `apps/api/src/modules/planner/application/queries/get-task.handler.ts`                                 |
| Create | `apps/api/src/modules/planner/application/queries/get-task.handler.spec.ts`                            |
| Create | `apps/api/src/modules/planner/application/queries/list-tasks.query.ts`                                 |
| Create | `apps/api/src/modules/planner/application/queries/list-tasks.handler.ts`                               |
| Create | `apps/api/src/modules/planner/application/queries/my-tasks.query.ts`                                   |
| Create | `apps/api/src/modules/planner/application/queries/my-tasks.handler.ts`                                 |
| Create | `apps/api/src/modules/planner/application/queries/my-day.query.ts`                                     |
| Create | `apps/api/src/modules/planner/application/queries/my-day.handler.ts`                                   |
| Modify | `apps/api/src/modules/planner/application/facades/planner-query.facade.ts`                             |
| Create | `apps/api/src/modules/planner/interface/trpc/planner-trpc.service.ts`                                  |
| Modify | `apps/api/src/modules/planner/interface/trpc/planner.router.ts`                                        |
| Modify | `apps/api/src/modules/planner/planner.module.ts`                                                       |

---

## Task 1: Drizzle Schema — All Core Tables

**Files:**

- Modify: `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts`

- [ ] **Step 1: Write the complete schema**

Replace the entire content of `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts` with:

```typescript
import {
  pgSchema,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const plannerSchema = pgSchema('planner')

// ─── plan ──────────────────────────────────────────────────────────────────────

export const plan = plannerSchema.table('plan', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  ownerId: uuid('owner_id').notNull(),
  containerType: text('container_type', {
    enum: ['team', 'project', 'personal', 'general'],
  })
    .notNull()
    .default('general'),
  containerId: uuid('container_id'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── task_status ───────────────────────────────────────────────────────────────

export const taskStatus = plannerSchema.table('task_status', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  planId: uuid('plan_id'),
  name: text('name').notNull(),
  color: text('color').notNull(),
  position: integer('position').notNull(),
  category: text('category', {
    enum: ['draft', 'not_started', 'active', 'blocked', 'done', 'cancelled'],
  }).notNull(),
})

// ─── bucket ────────────────────────────────────────────────────────────────────

export const bucket = plannerSchema.table('bucket', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  planId: uuid('plan_id').notNull(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
})

// ─── task ──────────────────────────────────────────────────────────────────────

export const task = plannerSchema.table('task', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  planId: uuid('plan_id').notNull(),
  bucketId: uuid('bucket_id'),
  parentTaskId: uuid('parent_task_id'),
  sequenceNumber: integer('sequence_number'),
  title: text('title').notNull(),
  description: text('description'),
  statusId: uuid('status_id').notNull(),
  priority: text('priority', {
    enum: ['urgent', 'high', 'medium', 'low', 'none'],
  })
    .notNull()
    .default('none'),
  impactLevel: text('impact_level', {
    enum: ['project', 'company', 'strategic', 'none'],
  })
    .notNull()
    .default('none'),
  sourceType: text('source_type', {
    enum: ['manual', 'teams_meeting', 'voice_recording', 'email', 'pmo_report'],
  })
    .notNull()
    .default('manual'),
  sourceRef: jsonb('source_ref'),
  startDate: timestamp('start_date', { withTimezone: true }),
  dueDate: timestamp('due_date', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: uuid('completed_by'),
  createdBy: uuid('created_by').notNull(),
  recurrenceRule: text('recurrence_rule'),
  recurrenceParentId: uuid('recurrence_parent_id'),
  position: text('position'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── task_my_day_pin ───────────────────────────────────────────────────────────

export const taskMyDayPin = plannerSchema.table(
  'task_my_day_pin',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    taskId: uuid('task_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('uq_my_day_pin').on(t.tenantId, t.taskId, t.actorId)],
)

// ─── task_assignee ─────────────────────────────────────────────────────────────

export const taskAssignee = plannerSchema.table('task_assignee', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  taskId: uuid('task_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  assignedBy: uuid('assigned_by').notNull(),
})

// ─── task_label ────────────────────────────────────────────────────────────────

export const taskLabel = plannerSchema.table('task_label', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  planId: uuid('plan_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
})

// ─── task_label_assignment ─────────────────────────────────────────────────────

export const taskLabelAssignment = plannerSchema.table('task_label_assignment', {
  taskId: uuid('task_id').notNull(),
  labelId: uuid('label_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
})

// ─── task_checklist_item ───────────────────────────────────────────────────────

export const taskChecklistItem = plannerSchema.table('task_checklist_item', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  taskId: uuid('task_id').notNull(),
  title: text('title').notNull(),
  isChecked: boolean('is_checked').notNull().default(false),
  position: integer('position').notNull(),
})

// ─── task_relation ─────────────────────────────────────────────────────────────

export const taskRelation = plannerSchema.table('task_relation', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  sourceTaskId: uuid('source_task_id').notNull(),
  targetTaskId: uuid('target_task_id').notNull(),
  relationType: text('relation_type', {
    enum: ['related_to', 'blocks', 'blocked_by'],
  }).notNull(),
})

// ─── task_activity ─────────────────────────────────────────────────────────────

export const taskActivity = plannerSchema.table('task_activity', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  taskId: uuid('task_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  action: text('action').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── task_evidence ─────────────────────────────────────────────────────────────

export const taskEvidence = plannerSchema.table('task_evidence', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  taskId: uuid('task_id').notNull(),
  tier: text('tier', { enum: ['text', 'link', 'file'] }).notNull(),
  content: text('content').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── tenant_task_sequence ──────────────────────────────────────────────────────

export const tenantTaskSequence = plannerSchema.table('tenant_task_sequence', {
  tenantId: uuid('tenant_id').primaryKey(),
  lastSequence: integer('last_sequence').notNull().default(0),
})
```

- [ ] **Step 2: Generate migration**

```bash
cd apps/api && bunx drizzle-kit generate && cd ../..
```

Expected: a new SQL migration file is created under the migrations directory.

- [ ] **Step 3: Verify typecheck**

```bash
bun run --filter @future/api typecheck
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts
git add apps/api/src/modules/**/migrations/ 2>/dev/null || true
git commit -m "feat(planner): add Drizzle schema — 14 core tables in planner namespace"
```

---

## Task 2: Domain Entities

**Files:**

- Create: All entity files in `apps/api/src/modules/planner/domain/entities/`

- [ ] **Step 1: Write `plan.entity.ts`**

Create `apps/api/src/modules/planner/domain/entities/plan.entity.ts`:

```typescript
export type ContainerType = 'team' | 'project' | 'personal' | 'general'

export interface Plan {
  id: string
  tenantId: string
  title: string
  description: string | null
  ownerId: string
  containerType: ContainerType
  containerId: string | null
  isArchived: boolean
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Write `task.entity.ts`**

Create `apps/api/src/modules/planner/domain/entities/task.entity.ts`:

```typescript
export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
export type ImpactLevel = 'project' | 'company' | 'strategic' | 'none'
export type SourceType = 'manual' | 'teams_meeting' | 'voice_recording' | 'email' | 'pmo_report'

export interface Task {
  id: string
  tenantId: string
  planId: string
  bucketId: string | null
  parentTaskId: string | null
  sequenceNumber: number | null
  title: string
  description: string | null
  statusId: string
  priority: Priority
  impactLevel: ImpactLevel
  sourceType: SourceType
  sourceRef: unknown | null
  startDate: Date | null
  dueDate: Date | null
  completedAt: Date | null
  completedBy: string | null
  createdBy: string
  recurrenceRule: string | null
  recurrenceParentId: string | null
  position: string | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 3: Write `task-status.entity.ts`**

Create `apps/api/src/modules/planner/domain/entities/task-status.entity.ts`:

```typescript
export type StatusCategory = 'draft' | 'not_started' | 'active' | 'blocked' | 'done' | 'cancelled'

export interface TaskStatus {
  id: string
  tenantId: string
  planId: string | null
  name: string
  color: string
  position: number
  category: StatusCategory
}
```

- [ ] **Step 4: Write `bucket.entity.ts`**

Create `apps/api/src/modules/planner/domain/entities/bucket.entity.ts`:

```typescript
export interface Bucket {
  id: string
  tenantId: string
  planId: string
  name: string
  position: number
}
```

- [ ] **Step 5: Write remaining entity files**

Create `apps/api/src/modules/planner/domain/entities/task-assignee.entity.ts`:

```typescript
export interface TaskAssignee {
  id: string
  tenantId: string
  taskId: string
  actorId: string
  assignedAt: Date
  assignedBy: string
}
```

Create `apps/api/src/modules/planner/domain/entities/task-label.entity.ts`:

```typescript
export interface TaskLabel {
  id: string
  tenantId: string
  planId: string
  name: string
  color: string
}
```

Create `apps/api/src/modules/planner/domain/entities/checklist-item.entity.ts`:

```typescript
export interface ChecklistItem {
  id: string
  tenantId: string
  taskId: string
  title: string
  isChecked: boolean
  position: number
}
```

Create `apps/api/src/modules/planner/domain/entities/task-relation.entity.ts`:

```typescript
export type RelationType = 'related_to' | 'blocks' | 'blocked_by'

export interface TaskRelation {
  id: string
  tenantId: string
  sourceTaskId: string
  targetTaskId: string
  relationType: RelationType
}
```

Create `apps/api/src/modules/planner/domain/entities/task-activity.entity.ts`:

```typescript
export interface TaskActivity {
  id: string
  tenantId: string
  taskId: string
  actorId: string
  action: string
  oldValue: unknown | null
  newValue: unknown | null
  createdAt: Date
}
```

Create `apps/api/src/modules/planner/domain/entities/task-evidence.entity.ts`:

```typescript
export type EvidenceTier = 'text' | 'link' | 'file'

export interface TaskEvidence {
  id: string
  tenantId: string
  taskId: string
  tier: EvidenceTier
  content: string
  uploadedBy: string
  createdAt: Date
}
```

Create `apps/api/src/modules/planner/domain/entities/my-day-pin.entity.ts`:

```typescript
export interface MyDayPin {
  id: string
  tenantId: string
  taskId: string
  actorId: string
  pinnedAt: Date
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/planner/domain/entities/
git commit -m "feat(planner): add domain entities — Plan, Task, Bucket, TaskStatus, and 7 supporting entities"
```

---

## Task 3: Domain Exceptions

**Files:**

- Create: `apps/api/src/modules/planner/domain/exceptions/planner.exceptions.ts`

- [ ] **Step 1: Write exceptions**

Create `apps/api/src/modules/planner/domain/exceptions/planner.exceptions.ts`:

```typescript
import { DomainException } from '@future/core'

export class PlanNotFoundException extends DomainException {
  readonly code = 'PLAN_NOT_FOUND'
  constructor(id: string) {
    super(`Plan not found: ${id}`)
  }
}

export class TaskNotFoundException extends DomainException {
  readonly code = 'TASK_NOT_FOUND'
  constructor(id: string) {
    super(`Task not found: ${id}`)
  }
}

export class BucketNotFoundException extends DomainException {
  readonly code = 'BUCKET_NOT_FOUND'
  constructor(id: string) {
    super(`Bucket not found: ${id}`)
  }
}

export class InvalidSubtaskDepthException extends DomainException {
  readonly code = 'INVALID_SUBTASK_DEPTH'
  constructor() {
    super('Subtasks cannot have their own subtasks (max depth is 1)')
  }
}

export class InsufficientEvidenceException extends DomainException {
  readonly code = 'INSUFFICIENT_EVIDENCE'
  constructor(impactLevel: string, requiredTier: string) {
    super(`Impact level "${impactLevel}" requires at least "${requiredTier}" evidence tier`)
  }
}

export class InvalidStatusTransitionException extends DomainException {
  readonly code = 'INVALID_STATUS_TRANSITION'
  constructor(from: string, to: string) {
    super(`Invalid status transition: ${from} → ${to}`)
  }
}

export class DuplicateSequenceNumberException extends DomainException {
  readonly code = 'DUPLICATE_SEQUENCE_NUMBER'
  constructor(sequenceNumber: number, tenantId: string) {
    super(`Duplicate sequence number ${sequenceNumber} for tenant ${tenantId}`)
  }
}

export class PlanNotEmptyException extends DomainException {
  readonly code = 'PLAN_NOT_EMPTY'
  constructor(id: string) {
    super(`Cannot hard-delete plan ${id} — it has tasks`)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/planner/domain/exceptions/
git commit -m "feat(planner): add domain exceptions"
```

---

## Task 4: Repository Interfaces (Ports)

**Files:**

- Create: All repository files in `apps/api/src/modules/planner/domain/repositories/`

- [ ] **Step 1: Write `plan.repository.ts`**

Create `apps/api/src/modules/planner/domain/repositories/plan.repository.ts`:

```typescript
import type { Plan, ContainerType } from '../entities/plan.entity'

export const PLAN_REPOSITORY = Symbol('IPlanRepository')

export interface IPlanRepository {
  findById(id: string, tenantId: string): Promise<Plan | null>
  insert(data: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>): Promise<Plan>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<Plan, 'title' | 'description' | 'isArchived'>>,
  ): Promise<Plan>
  list(
    tenantId: string,
    filters?: {
      containerType?: ContainerType
      ownerId?: string
      isArchived?: boolean
      limit?: number
      offset?: number
    },
  ): Promise<Plan[]>
  count(
    tenantId: string,
    filters?: { containerType?: ContainerType; ownerId?: string; isArchived?: boolean },
  ): Promise<number>
  hasAnyTasks(id: string, tenantId: string): Promise<boolean>
  delete(id: string, tenantId: string): Promise<void>
}
```

- [ ] **Step 2: Write `task.repository.ts`**

Create `apps/api/src/modules/planner/domain/repositories/task.repository.ts`:

```typescript
import type { Task, Priority, SourceType } from '../entities/task.entity'

export const TASK_REPOSITORY = Symbol('ITaskRepository')

export interface ITaskRepository {
  findById(id: string, tenantId: string): Promise<Task | null>
  insert(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>
  update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        Task,
        | 'title'
        | 'description'
        | 'statusId'
        | 'priority'
        | 'impactLevel'
        | 'bucketId'
        | 'startDate'
        | 'dueDate'
        | 'position'
        | 'completedAt'
        | 'completedBy'
        | 'sequenceNumber'
      >
    >,
  ): Promise<Task>
  delete(id: string, tenantId: string): Promise<void>
  listByPlan(
    planId: string,
    tenantId: string,
    filters?: {
      bucketId?: string
      statusId?: string
      assigneeId?: string
      priority?: Priority
      limit?: number
      offset?: number
    },
  ): Promise<Task[]>
  listByAssignee(
    actorId: string,
    tenantId: string,
    filters?: { statusCategory?: string; limit?: number; offset?: number },
  ): Promise<Task[]>
  listSubtasks(parentTaskId: string, tenantId: string): Promise<Task[]>
  countByPlan(planId: string, tenantId: string): Promise<number>
  search(tenantId: string, query: string, limit: number, offset: number): Promise<Task[]>
}
```

- [ ] **Step 3: Write `bucket.repository.ts`**

Create `apps/api/src/modules/planner/domain/repositories/bucket.repository.ts`:

```typescript
import type { Bucket } from '../entities/bucket.entity'

export const BUCKET_REPOSITORY = Symbol('IBucketRepository')

export interface IBucketRepository {
  findById(id: string, tenantId: string): Promise<Bucket | null>
  insert(data: Omit<Bucket, 'id'>): Promise<Bucket>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<Bucket, 'name' | 'position'>>,
  ): Promise<Bucket>
  delete(id: string, tenantId: string): Promise<void>
  listByPlan(planId: string, tenantId: string): Promise<Bucket[]>
}
```

- [ ] **Step 4: Write `task-status.repository.ts`**

Create `apps/api/src/modules/planner/domain/repositories/task-status.repository.ts`:

```typescript
import type { TaskStatus, StatusCategory } from '../entities/task-status.entity'

export const TASK_STATUS_REPOSITORY = Symbol('ITaskStatusRepository')

export interface ITaskStatusRepository {
  findById(id: string, tenantId: string): Promise<TaskStatus | null>
  insert(data: Omit<TaskStatus, 'id'>): Promise<TaskStatus>
  insertMany(data: Omit<TaskStatus, 'id'>[]): Promise<TaskStatus[]>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<TaskStatus, 'name' | 'color' | 'position' | 'category'>>,
  ): Promise<TaskStatus>
  delete(id: string, tenantId: string): Promise<void>
  listForPlan(planId: string, tenantId: string): Promise<TaskStatus[]>
  listTenantDefaults(tenantId: string): Promise<TaskStatus[]>
  findFirstByCategory(
    category: StatusCategory,
    planId: string | null,
    tenantId: string,
  ): Promise<TaskStatus | null>
}
```

- [ ] **Step 5: Write `task-assignee.repository.ts`**

Create `apps/api/src/modules/planner/domain/repositories/task-assignee.repository.ts`:

```typescript
import type { TaskAssignee } from '../entities/task-assignee.entity'

export const TASK_ASSIGNEE_REPOSITORY = Symbol('ITaskAssigneeRepository')

export interface ITaskAssigneeRepository {
  insert(data: Omit<TaskAssignee, 'id' | 'assignedAt'>): Promise<TaskAssignee>
  delete(taskId: string, actorId: string, tenantId: string): Promise<void>
  listByTask(taskId: string, tenantId: string): Promise<TaskAssignee[]>
  listByActor(actorId: string, tenantId: string): Promise<TaskAssignee[]>
}
```

- [ ] **Step 6: Write `tenant-task-sequence.repository.ts`**

Create `apps/api/src/modules/planner/domain/repositories/tenant-task-sequence.repository.ts`:

```typescript
export const TENANT_TASK_SEQUENCE_REPOSITORY = Symbol('ITenantTaskSequenceRepository')

export interface ITenantTaskSequenceRepository {
  nextSequence(tenantId: string): Promise<number>
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/planner/domain/repositories/
git commit -m "feat(planner): add repository interfaces — Plan, Task, Bucket, TaskStatus, TaskAssignee, Sequence"
```

---

## Task 5: Repository Implementations (Drizzle)

**Files:**

- Create: All repository implementations in `apps/api/src/modules/planner/infrastructure/repositories/`

For brevity, each repository follows the exact same pattern as `DrizzleEmploymentProfileRepository` in the people module. The full implementation for each is:

- [ ] **Step 1: Write `drizzle-plan.repository.ts`**

Create `apps/api/src/modules/planner/infrastructure/repositories/drizzle-plan.repository.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { IPlanRepository } from '../../domain/repositories/plan.repository'
import type { Plan, ContainerType } from '../../domain/entities/plan.entity'
import { plan } from '../schema/planner.schema'

@Injectable()
export class DrizzlePlanRepository implements IPlanRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<Plan | null> {
    const rows = await this.db
      .select()
      .from(plan)
      .where(and(eq(plan.id, id), eq(plan.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as Plan | undefined) ?? null
  }

  async insert(data: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>): Promise<Plan> {
    const rows = await this.db.insert(plan).values(data).returning()
    return rows[0] as Plan
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Pick<Plan, 'title' | 'description' | 'isArchived'>>,
  ): Promise<Plan> {
    const rows = await this.db
      .update(plan)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(plan.id, id), eq(plan.tenantId, tenantId)))
      .returning()
    return rows[0] as Plan
  }

  async list(
    tenantId: string,
    filters?: {
      containerType?: ContainerType
      ownerId?: string
      isArchived?: boolean
      limit?: number
      offset?: number
    },
  ): Promise<Plan[]> {
    const conditions = [eq(plan.tenantId, tenantId)]
    if (filters?.containerType) conditions.push(eq(plan.containerType, filters.containerType))
    if (filters?.ownerId) conditions.push(eq(plan.ownerId, filters.ownerId))
    if (filters?.isArchived !== undefined) conditions.push(eq(plan.isArchived, filters.isArchived))

    const rows = await this.db
      .select()
      .from(plan)
      .where(and(...conditions))
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0)
    return rows as Plan[]
  }

  async count(
    tenantId: string,
    filters?: { containerType?: ContainerType; ownerId?: string; isArchived?: boolean },
  ): Promise<number> {
    const conditions = [eq(plan.tenantId, tenantId)]
    if (filters?.containerType) conditions.push(eq(plan.containerType, filters.containerType))
    if (filters?.ownerId) conditions.push(eq(plan.ownerId, filters.ownerId))
    if (filters?.isArchived !== undefined) conditions.push(eq(plan.isArchived, filters.isArchived))

    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(plan)
      .where(and(...conditions))
    return Number(result[0]?.count ?? 0)
  }

  async hasAnyTasks(id: string, tenantId: string): Promise<boolean> {
    // Import task schema inline to avoid circular
    const { task } = await import('../schema/planner.schema')
    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(task)
      .where(and(eq(task.planId, id), eq(task.tenantId, tenantId)))
      .limit(1)
    return Number(result[0]?.count ?? 0) > 0
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.db.delete(plan).where(and(eq(plan.id, id), eq(plan.tenantId, tenantId)))
  }
}
```

- [ ] **Step 2: Write `drizzle-task.repository.ts`**

Create `apps/api/src/modules/planner/infrastructure/repositories/drizzle-task.repository.ts`. Follow the same pattern as `drizzle-plan.repository.ts` — inject `DB_TOKEN`, implement each method from `ITaskRepository` using Drizzle queries against the `task` table. Key details:

- `listByAssignee` needs a join with `taskAssignee` table and `taskStatus` to filter by status category
- `search` uses `sql\`title ILIKE ${pattern} OR description ILIKE ${pattern}\`` for full-text search
- All queries filter by `tenantId`

- [ ] **Step 3: Write `drizzle-bucket.repository.ts`**

Implement `IBucketRepository`. Straightforward CRUD against `bucket` table.

- [ ] **Step 4: Write `drizzle-task-status.repository.ts`**

Implement `ITaskStatusRepository`. Key details:

- `listForPlan` returns plan-specific statuses if they exist, otherwise tenant defaults (`planId IS NULL`)
- `listTenantDefaults` filters `planId IS NULL`
- `findFirstByCategory` resolves plan-specific first, falls back to tenant defaults

- [ ] **Step 5: Write `drizzle-task-assignee.repository.ts`**

Implement `ITaskAssigneeRepository`. Straightforward CRUD against `taskAssignee` table.

- [ ] **Step 6: Write `drizzle-tenant-task-sequence.repository.ts`**

Create `apps/api/src/modules/planner/infrastructure/repositories/drizzle-tenant-task-sequence.repository.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { eq, sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { ITenantTaskSequenceRepository } from '../../domain/repositories/tenant-task-sequence.repository'
import { tenantTaskSequence } from '../schema/planner.schema'

@Injectable()
export class DrizzleTenantTaskSequenceRepository implements ITenantTaskSequenceRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async nextSequence(tenantId: string): Promise<number> {
    // Upsert + increment atomically using FOR UPDATE
    const result = await this.db.execute(sql`
      INSERT INTO planner.tenant_task_sequence (tenant_id, last_sequence)
      VALUES (${tenantId}, 1)
      ON CONFLICT (tenant_id)
      DO UPDATE SET last_sequence = planner.tenant_task_sequence.last_sequence + 1
      RETURNING last_sequence
    `)
    return (result as any).rows[0].last_sequence as number
  }
}
```

- [ ] **Step 7: Run typecheck**

```bash
bun run --filter @future/api typecheck
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/planner/infrastructure/repositories/
git commit -m "feat(planner): add Drizzle repository implementations — Plan, Task, Bucket, TaskStatus, TaskAssignee, Sequence"
```

---

## Task 6: Core CQRS Commands — CreatePlan, CreateTask, CreateBucket

**Files:**

- Create: Command + handler + spec for each in `apps/api/src/modules/planner/application/commands/`

- [ ] **Step 1: Write `create-plan.command.ts`**

Create `apps/api/src/modules/planner/application/commands/create-plan.command.ts`:

```typescript
import type { ContainerType } from '../../domain/entities/plan.entity'

export class CreatePlanCommand {
  constructor(
    readonly tenantId: string,
    readonly title: string,
    readonly ownerId: string,
    readonly description: string | null,
    readonly containerType: ContainerType,
    readonly containerId: string | null,
    readonly createdBy: string,
  ) {}
}
```

- [ ] **Step 2: Write failing test for CreatePlan handler**

Create `apps/api/src/modules/planner/application/commands/create-plan.handler.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreatePlanHandler } from './create-plan.handler'
import { CreatePlanCommand } from './create-plan.command'
import type { IPlanRepository } from '../../domain/repositories/plan.repository'
import type { ITaskStatusRepository } from '../../domain/repositories/task-status.repository'

describe('CreatePlanHandler', () => {
  let handler: CreatePlanHandler
  let planRepo: { insert: ReturnType<typeof vi.fn> }
  let statusRepo: {
    listTenantDefaults: ReturnType<typeof vi.fn>
    insertMany: ReturnType<typeof vi.fn>
  }
  let auditFacade: {
    recordEvent: ReturnType<typeof vi.fn>
    publishOutboxEvent: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    planRepo = { insert: vi.fn() }
    statusRepo = { listTenantDefaults: vi.fn(), insertMany: vi.fn() }
    auditFacade = { recordEvent: vi.fn(), publishOutboxEvent: vi.fn() }
    handler = new CreatePlanHandler(
      planRepo as unknown as IPlanRepository,
      statusRepo as unknown as ITaskStatusRepository,
      auditFacade as any,
    )
  })

  it('creates a plan and publishes PlanCreatedEvent', async () => {
    planRepo.insert.mockResolvedValue({
      id: 'plan-1',
      tenantId: 'tenant-1',
      title: 'Sprint 1',
      ownerId: 'actor-1',
      containerType: 'general',
    })
    statusRepo.listTenantDefaults.mockResolvedValue([])

    const result = await handler.execute(
      new CreatePlanCommand('tenant-1', 'Sprint 1', 'actor-1', null, 'general', null, 'actor-1'),
    )

    expect(planRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', title: 'Sprint 1' }),
    )
    expect(auditFacade.publishOutboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'planner.plan-created' }),
    )
    expect(result.id).toBe('plan-1')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run --filter @future/api test:unit -- --testPathPattern create-plan.handler.spec
```

- [ ] **Step 4: Write `create-plan.handler.ts`**

Create `apps/api/src/modules/planner/application/commands/create-plan.handler.ts`:

```typescript
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/repositories/plan.repository'
import {
  TASK_STATUS_REPOSITORY,
  type ITaskStatusRepository,
} from '../../domain/repositories/task-status.repository'
import { CreatePlanCommand } from './create-plan.command'
import type { Plan } from '../../domain/entities/plan.entity'

@CommandHandler(CreatePlanCommand)
export class CreatePlanHandler implements ICommandHandler<CreatePlanCommand, Plan> {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    @Inject(TASK_STATUS_REPOSITORY) private readonly statusRepo: ITaskStatusRepository,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: CreatePlanCommand): Promise<Plan> {
    const plan = await this.planRepo.insert({
      tenantId: command.tenantId,
      title: command.title,
      description: command.description,
      ownerId: command.ownerId,
      containerType: command.containerType,
      containerId: command.containerId,
      isArchived: false,
    })

    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.createdBy,
      eventType: 'plan.created',
      module: 'planner',
      subjectId: plan.id,
      payload: { title: command.title, containerType: command.containerType },
    })

    await this.auditFacade.publishOutboxEvent({
      tenantId: command.tenantId,
      eventName: 'planner.plan-created',
      payload: {
        tenantId: command.tenantId,
        actorId: command.createdBy,
        planId: plan.id,
        title: command.title,
        containerType: command.containerType,
      },
    })

    return plan
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun run --filter @future/api test:unit -- --testPathPattern create-plan.handler.spec
```

- [ ] **Step 6: Write `create-task.command.ts` + handler + spec**

Follow the same pattern. `CreateTaskHandler`:

1. Validates parent task (if `parentTaskId` provided, check it exists and doesn't already have a parent — max depth 1)
2. Resolves status (default to first `not_started` status for the plan)
3. Assigns sequence number via `ITenantTaskSequenceRepository.nextSequence()` (skip if status category is `draft`)
4. Inserts task
5. Records audit event
6. Publishes `TaskCreatedEvent` via outbox (skip if draft)

- [ ] **Step 7: Write `create-bucket.command.ts` + handler + spec**

Simple: inserts bucket with next position number, records audit event.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/planner/application/commands/
git commit -m "feat(planner): add CreatePlan, CreateTask, CreateBucket commands + handlers + tests"
```

---

## Task 7: Core CQRS Commands — UpdateTask, AssignTask, CompleteTask

Follow the same TDD pattern for each:

- [ ] **Step 1: Write `update-task.command.ts` + handler + spec**

`UpdateTaskHandler` updates allowed fields, records old/new values in `task_activity`, publishes `TaskUpdatedEvent`.

- [ ] **Step 2: Write `assign-task.command.ts` + handler + spec**

`AssignTaskHandler` adds/removes assignees via `ITaskAssigneeRepository`, publishes `TaskAssignedEvent`.

- [ ] **Step 3: Write `complete-task.command.ts` + handler + spec**

`CompleteTaskHandler`:

1. Validates evidence meets minimum tier for impact level (query `taskEvidence`)
2. Finds the first status with category `done` for the plan
3. Updates task status, sets `completedAt` and `completedBy`
4. Publishes `TaskCompletedEvent` via outbox

- [ ] **Step 4: Run all tests**

```bash
bun run --filter @future/api test:unit -- --testPathPattern planner
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/planner/application/commands/
git commit -m "feat(planner): add UpdateTask, AssignTask, CompleteTask commands + handlers + tests"
```

---

## Task 8: Core CQRS Queries — GetPlan, ListPlans, GetTask, ListTasks, MyTasks, MyDay

- [ ] **Step 1: Write query classes**

Create one file per query. Each is a plain class with `readonly` constructor params:

- `GetPlanQuery(planId, tenantId)`
- `ListPlansQuery(tenantId, filters?)`
- `GetTaskQuery(taskId, tenantId)`
- `ListTasksQuery(planId, tenantId, filters?)`
- `MyTasksQuery(actorId, tenantId, filters?)`
- `MyDayQuery(actorId, tenantId)`

- [ ] **Step 2: Write handlers + specs for each**

Each handler injects the relevant repositories and returns structured data:

- `GetPlanHandler` returns plan + buckets + statuses + task counts
- `GetTaskHandler` returns task + subtasks + assignees + checklist + labels + relations
- `MyTasksHandler` queries `taskAssignee` by actorId, joins with task, filters out `draft` category
- `MyDayHandler` queries tasks due today + pinned tasks from `taskMyDayPin`

- [ ] **Step 3: Run all tests**

```bash
bun run --filter @future/api test:unit -- --testPathPattern planner
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/planner/application/queries/
git commit -m "feat(planner): add core queries — GetPlan, ListPlans, GetTask, ListTasks, MyTasks, MyDay"
```

---

## Task 9: PlannerQueryFacade + PlannerTrpcService + Module Wiring

- [ ] **Step 1: Update `planner-query.facade.ts`**

Replace `apps/api/src/modules/planner/application/facades/planner-query.facade.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { GetPlanQuery } from '../queries/get-plan.query'
import { ListPlansQuery } from '../queries/list-plans.query'
import { GetTaskQuery } from '../queries/get-task.query'
import { ListTasksQuery } from '../queries/list-tasks.query'
import { MyTasksQuery } from '../queries/my-tasks.query'
import { MyDayQuery } from '../queries/my-day.query'

@Injectable()
export class PlannerQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

  getPlan(planId: string, tenantId: string) {
    return this.queryBus.execute(new GetPlanQuery(planId, tenantId))
  }

  listPlans(
    tenantId: string,
    filters?: {
      containerType?: string
      ownerId?: string
      isArchived?: boolean
      limit?: number
      offset?: number
    },
  ) {
    return this.queryBus.execute(new ListPlansQuery(tenantId, filters))
  }

  getTask(taskId: string, tenantId: string) {
    return this.queryBus.execute(new GetTaskQuery(taskId, tenantId))
  }

  listTasks(
    planId: string,
    tenantId: string,
    filters?: {
      bucketId?: string
      statusId?: string
      assigneeId?: string
      priority?: string
      limit?: number
      offset?: number
    },
  ) {
    return this.queryBus.execute(new ListTasksQuery(planId, tenantId, filters))
  }

  myTasks(
    actorId: string,
    tenantId: string,
    filters?: { statusCategory?: string; limit?: number; offset?: number },
  ) {
    return this.queryBus.execute(new MyTasksQuery(actorId, tenantId, filters))
  }

  myDay(actorId: string, tenantId: string) {
    return this.queryBus.execute(new MyDayQuery(actorId, tenantId))
  }

  // Cross-module facade methods (for goals, people, agents modules)
  getTaskCountsByStatus(tenantId: string, filters?: { planId?: string }) {
    return this.queryBus.execute(new ListTasksQuery(filters?.planId ?? '', tenantId))
  }

  getTasksCompletedInPeriod(tenantId: string, start: Date, end: Date) {
    // TODO: implement dedicated query in Phase 4
    return [] as any
  }

  getOverdueTasks(tenantId: string) {
    // TODO: implement dedicated query in Phase 4
    return [] as any
  }

  getTasksByActor(actorId: string, tenantId: string) {
    return this.myTasks(actorId, tenantId)
  }
}
```

- [ ] **Step 2: Create `planner-trpc.service.ts`**

Create `apps/api/src/modules/planner/interface/trpc/planner-trpc.service.ts`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'

let instance: PlannerTrpcService | null = null

@Injectable()
export class PlannerTrpcService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  onModuleInit() {
    instance = this
  }

  static getInstance(): PlannerTrpcService {
    if (!instance) throw new Error('PlannerTrpcService not initialized')
    return instance
  }

  command<T>(command: T): Promise<unknown> {
    return this.commandBus.execute(command as never)
  }

  query<T>(query: T): Promise<unknown> {
    return this.queryBus.execute(query as never)
  }
}
```

- [ ] **Step 3: Update `planner.module.ts`**

Replace `apps/api/src/modules/planner/planner.module.ts` with the full module wiring. Import all repositories (provide: SYMBOL, useClass: Drizzle impl), all command handlers, all query handlers, facades, and tRPC service. Export only `PlannerQueryFacade`.

- [ ] **Step 4: Run typecheck and tests**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api test:unit -- --testPathPattern planner
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/planner/
git commit -m "feat(planner): add PlannerQueryFacade, PlannerTrpcService, complete module wiring"
```
