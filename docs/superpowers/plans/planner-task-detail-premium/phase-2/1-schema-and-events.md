# Phase 2 / Plan 1 — Schema, Domain Events, and Repository Interfaces

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all five new Drizzle table definitions, four new domain events, and four repository interfaces that Phase 2 features depend on. This plan has no runnable tests yet (those live in per-feature plans) — it establishes the foundation.

**Architecture:** All new tables live in the existing `planner` Postgres schema via `pgSchema('planner')`. All tables include `tenant_id`. Per CLAUDE.md, the single migration file `0000_initial.sql` is the only migration file — no new numbered files. The migration procedure is at the end of this plan.

**Tech Stack:** Drizzle ORM, `uuidv7`, `pgSchema`, `packages/event-contracts`, `@nestjs/cqrs`

**Prereq:** Phase 1 merged. Branch `feat/planner-task-detail-ui-ux` is the working branch.

---

## Exit Criteria

- [ ] Five new Drizzle table definitions exported from `planner.schema.ts`
- [ ] Four new domain event classes added to `packages/event-contracts/src/planner/`
- [ ] All four new events exported from `packages/event-contracts/src/index.ts`
- [ ] Four new repository interfaces exist in `apps/api/src/modules/planner/domain/repositories/`
- [ ] `bun run --filter "@future/*" build` succeeds (event-contracts package builds)
- [ ] Migration procedure runs without errors on local dev DB

---

## File Map

**Modify:**

```
apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts
packages/event-contracts/src/index.ts
```

**Create:**

```
apps/api/src/modules/planner/infrastructure/schema/
  custom-field-def.table.ts          (re-exported from planner.schema.ts)
  task-custom-field-value.table.ts
  task-dependency.table.ts
  planner-sprint.table.ts
  task-history.table.ts

apps/api/src/modules/planner/domain/repositories/
  custom-field-def.repository.ts
  task-dependency.repository.ts
  sprint.repository.ts
  task-history.repository.ts

packages/event-contracts/src/planner/
  task-custom-field-updated.event.ts
  task-sprint-assigned.event.ts
  task-dependency-added.event.ts
  task-dependency-removed.event.ts
```

---

## Task 1: New Drizzle table definitions

**Files:**

- Modify: `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts`

Append five new table exports at the bottom of the existing schema file.

- [ ] **Step 1: Read the current schema file end to find the correct append point**

```bash
tail -20 apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts
```

- [ ] **Step 2: Append five new table definitions**

Add the following to the bottom of `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts`:

```ts
// ─── Phase 2: Custom fields ───────────────────────────────────────────────────

export const plannerCustomFieldDef = plannerSchema.table(
  'custom_field_def',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plannerPlan.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(), // 'text' | 'number' | 'date' | 'yes_no' | 'choice'
    choiceOptions: jsonb('choice_options').default(sql`'[]'::jsonb`),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    check(
      'chk_custom_field_kind',
      sql`${table.kind} IN ('text', 'number', 'date', 'yes_no', 'choice')`,
    ),
    index('idx_custom_field_def_plan').on(table.planId, table.position),
    check('chk_custom_field_name_length', sql`char_length(${table.name}) <= 100`),
  ],
)

export const plannerTaskCustomFieldValue = plannerSchema.table(
  'task_custom_field_value',
  {
    tenantId: uuid('tenant_id').notNull(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => plannerTask.id, { onDelete: 'cascade' }),
    fieldDefId: uuid('field_def_id')
      .notNull()
      .references(() => plannerCustomFieldDef.id, { onDelete: 'cascade' }),
    valueText: text('value_text'),
    valueNumber: text('value_number'), // stored as text to avoid float precision issues
    valueDate: date('value_date'),
    valueYesNo: boolean('value_yes_no'),
    valueChoice: text('value_choice'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.fieldDefId] }),
    index('idx_task_custom_field_value_tenant').on(table.tenantId, table.taskId),
  ],
)

// ─── Phase 2: Task dependencies ──────────────────────────────────────────────

export const plannerTaskDependency = plannerSchema.table(
  'task_dependency',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    fromTaskId: uuid('from_task_id')
      .notNull()
      .references(() => plannerTask.id, { onDelete: 'cascade' }), // predecessor
    toTaskId: uuid('to_task_id')
      .notNull()
      .references(() => plannerTask.id, { onDelete: 'cascade' }), // successor
    kind: text('kind').notNull(), // 'finish_to_start' | 'start_to_start' | 'finish_to_finish'
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    check(
      'chk_task_dependency_kind',
      sql`${table.kind} IN ('finish_to_start', 'start_to_start', 'finish_to_finish')`,
    ),
    check('chk_task_dependency_no_self', sql`${table.fromTaskId} <> ${table.toTaskId}`),
    uniqueIndex('uq_task_dependency').on(table.fromTaskId, table.toTaskId, table.kind),
    index('idx_task_dependency_to').on(table.tenantId, table.toTaskId),
    index('idx_task_dependency_from').on(table.tenantId, table.fromTaskId),
  ],
)

// ─── Phase 2: Sprint ─────────────────────────────────────────────────────────

export const plannerSprint = plannerSchema.table(
  'sprint',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plannerPlan.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    check('chk_sprint_name_length', sql`char_length(${table.name}) <= 100`),
    check('chk_sprint_dates', sql`${table.endDate} >= ${table.startDate}`),
    index('idx_sprint_plan_created').on(table.planId, table.createdAt),
  ],
)

// ─── Phase 2: Task history ────────────────────────────────────────────────────

export const plannerTaskHistory = plannerSchema.table(
  'task_history',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => plannerTask.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').notNull(),
    field: text('field').notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_task_history_task_changed').on(table.taskId, table.changedAt),
    index('idx_task_history_tenant_actor').on(table.tenantId, table.actorId),
  ],
)
```

Also add `sprintId` and `parentTaskId` columns to the existing `plannerTask` table (add inside the table definition):

```ts
// Inside plannerTask column definitions, add:
parentTaskId: uuid('parent_task_id'), // nullable — null for top-level tasks
sprintId: uuid('sprint_id'),           // nullable — FK added after plannerSprint created
```

Add the FK constraint for `sprintId` in the `plannerTask` table config:

```ts
// After other indexes in plannerTask, add:
// Note: FK to plannerSprint is declared as a separate constraint since plannerSprint is defined after plannerTask
```

Since `plannerTask` is defined before `plannerSprint`, we cannot use `.references()` for `sprintId` without a forward reference issue. Use a raw SQL constraint in the migration instead, or define `sprintId` as a plain uuid column without FK (FK enforced by application logic). Choose the plain uuid approach for Drizzle compatibility:

```ts
// plannerTask column (add these two after the existing columns):
parentTaskId: uuid('parent_task_id'), // app-enforced FK → planner.task(id)
sprintId: uuid('sprint_id'),           // app-enforced FK → planner.sprint(id)
```

Add an index for the new columns:

```ts
// In plannerTask table indexes:
index('idx_task_tenant_parent').on(table.tenantId, table.parentTaskId).where(sql`${table.parentTaskId} IS NOT NULL`),
index('idx_task_tenant_sprint').on(table.tenantId, table.sprintId).where(sql`${table.sprintId} IS NOT NULL`),
```

- [ ] **Step 3: Commit schema changes**

```bash
git add apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts
git commit -m "feat(planner): add phase-2 Drizzle table definitions (custom fields, deps, sprint, history)"
```

---

## Task 2: Repository interfaces (ports)

**Files:**

- Create: four new repository interface files in `apps/api/src/modules/planner/domain/repositories/`

Repository interface pattern: each file exports a `const REPO_TOKEN = Symbol(...)` and an `interface IXxxRepository { ... }`. See `checklist-item.repository.ts` as the reference pattern.

- [ ] **Step 1: Create ICustomFieldDefRepository**

Create `apps/api/src/modules/planner/domain/repositories/custom-field-def.repository.ts`:

```ts
export const CUSTOM_FIELD_DEF_REPOSITORY = Symbol('CUSTOM_FIELD_DEF_REPOSITORY')

export interface CustomFieldDefRow {
  id: string
  tenantId: string
  planId: string
  name: string
  kind: 'text' | 'number' | 'date' | 'yes_no' | 'choice'
  choiceOptions: { value: string; color: string }[]
  position: number
  createdAt: Date
}

export interface CustomFieldValueRow {
  taskId: string
  fieldDefId: string
  valueText: string | null
  valueNumber: string | null
  valueDate: string | null
  valueYesNo: boolean | null
  valueChoice: string | null
  updatedAt: Date
}

export interface ICustomFieldDefRepository {
  findByPlan(planId: string, tenantId: string): Promise<CustomFieldDefRow[]>
  findById(id: string, tenantId: string): Promise<CustomFieldDefRow | null>
  countByPlan(planId: string, tenantId: string): Promise<number>
  create(def: CustomFieldDefRow): Promise<void>
  update(
    id: string,
    tenantId: string,
    patch: Partial<Pick<CustomFieldDefRow, 'name' | 'choiceOptions' | 'position'>>,
  ): Promise<void>
  delete(id: string, tenantId: string): Promise<void>
  getValue(
    taskId: string,
    fieldDefId: string,
    tenantId: string,
  ): Promise<CustomFieldValueRow | null>
  getValuesByTask(taskId: string, tenantId: string): Promise<CustomFieldValueRow[]>
  upsertValue(value: CustomFieldValueRow): Promise<void>
}
```

- [ ] **Step 2: Create ITaskDependencyRepository**

Create `apps/api/src/modules/planner/domain/repositories/task-dependency.repository.ts`:

```ts
export const TASK_DEPENDENCY_REPOSITORY = Symbol('TASK_DEPENDENCY_REPOSITORY')

export type DependencyKind = 'finish_to_start' | 'start_to_start' | 'finish_to_finish'

export interface TaskDependencyRow {
  id: string
  tenantId: string
  fromTaskId: string
  toTaskId: string
  kind: DependencyKind
  createdBy: string
  createdAt: Date
}

export interface ITaskDependencyRepository {
  /** Returns all predecessors of `toTaskId` (rows where toTaskId = taskId) */
  findBlockedBy(taskId: string, tenantId: string): Promise<TaskDependencyRow[]>
  /** Returns all successors of `fromTaskId` (rows where fromTaskId = taskId) */
  findBlocks(taskId: string, tenantId: string): Promise<TaskDependencyRow[]>
  /** All deps in a plan — used for cycle detection */
  findByPlan(planId: string, tenantId: string): Promise<TaskDependencyRow[]>
  findById(id: string, tenantId: string): Promise<TaskDependencyRow | null>
  create(dep: TaskDependencyRow): Promise<void>
  delete(id: string, tenantId: string): Promise<void>
}
```

- [ ] **Step 3: Create ISprintRepository**

Create `apps/api/src/modules/planner/domain/repositories/sprint.repository.ts`:

```ts
export const SPRINT_REPOSITORY = Symbol('SPRINT_REPOSITORY')

export interface SprintRow {
  id: string
  tenantId: string
  planId: string
  name: string
  startDate: string // ISO date string YYYY-MM-DD
  endDate: string
  createdBy: string
  createdAt: Date
  completedAt: Date | null
}

export interface ISprintRepository {
  findByPlan(planId: string, tenantId: string): Promise<SprintRow[]>
  findById(id: string, tenantId: string): Promise<SprintRow | null>
  create(sprint: SprintRow): Promise<void>
  complete(id: string, tenantId: string, completedAt: Date): Promise<void>
  assignTask(taskId: string, sprintId: string, tenantId: string): Promise<void>
  unassignTask(taskId: string, tenantId: string): Promise<void>
  getTaskSprint(taskId: string, tenantId: string): Promise<SprintRow | null>
}
```

- [ ] **Step 4: Create ITaskHistoryRepository**

Create `apps/api/src/modules/planner/domain/repositories/task-history.repository.ts`:

```ts
export const TASK_HISTORY_REPOSITORY = Symbol('TASK_HISTORY_REPOSITORY')

export interface TaskHistoryRow {
  id: string
  tenantId: string
  taskId: string
  actorId: string
  field: string
  oldValue: unknown
  newValue: unknown
  changedAt: Date
}

export interface HistoryPage {
  rows: TaskHistoryRow[]
  nextCursor: string | null
}

export interface ITaskHistoryRepository {
  /** Cursor-based, newest-first, 20 rows per page */
  getPage(taskId: string, tenantId: string, cursor?: string, limit?: number): Promise<HistoryPage>
  append(row: TaskHistoryRow): Promise<void>
}
```

- [ ] **Step 5: Commit repository interfaces**

```bash
git add apps/api/src/modules/planner/domain/repositories/
git commit -m "feat(planner): add phase-2 repository interfaces (custom fields, deps, sprint, history)"
```

---

## Task 3: Domain events

**Files:**

- Create: four event classes in `packages/event-contracts/src/planner/`
- Modify: `packages/event-contracts/src/index.ts`

Follow the existing event class pattern: plain TypeScript class with `static readonly eventName` and `constructor` injecting all relevant fields.

- [ ] **Step 1: Create TaskCustomFieldUpdatedEvent**

Create `packages/event-contracts/src/planner/task-custom-field-updated.event.ts`:

```ts
export class TaskCustomFieldUpdatedEvent {
  static readonly eventName = 'planner.task-custom-field-updated'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    public readonly fieldDefId: string,
    public readonly fieldName: string,
    public readonly oldValue: unknown,
    public readonly newValue: unknown,
  ) {}
}
```

- [ ] **Step 2: Create TaskSprintAssignedEvent**

Create `packages/event-contracts/src/planner/task-sprint-assigned.event.ts`:

```ts
export class TaskSprintAssignedEvent {
  static readonly eventName = 'planner.task-sprint-assigned'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    /** null means unassigned from sprint */
    public readonly sprintId: string | null,
    public readonly sprintName: string | null,
  ) {}
}
```

- [ ] **Step 3: Create TaskDependencyAddedEvent**

Create `packages/event-contracts/src/planner/task-dependency-added.event.ts`:

```ts
import type { DependencyKind } from '../../../apps/api/src/modules/planner/domain/repositories/task-dependency.repository'

export class TaskDependencyAddedEvent {
  static readonly eventName = 'planner.task-dependency-added'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string, // the task being viewed (toTaskId or fromTaskId)
    public readonly planId: string,
    public readonly dependencyId: string,
    public readonly fromTaskId: string,
    public readonly toTaskId: string,
    public readonly kind: DependencyKind,
  ) {}
}
```

Note: Do NOT import from `apps/api` — that would violate package boundary. Instead define the type inline:

```ts
export type DependencyKind = 'finish_to_start' | 'start_to_start' | 'finish_to_finish'

export class TaskDependencyAddedEvent {
  static readonly eventName = 'planner.task-dependency-added'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    public readonly dependencyId: string,
    public readonly fromTaskId: string,
    public readonly toTaskId: string,
    public readonly kind: DependencyKind,
  ) {}
}
```

- [ ] **Step 4: Create TaskDependencyRemovedEvent**

Create `packages/event-contracts/src/planner/task-dependency-removed.event.ts`:

```ts
export type DependencyKind = 'finish_to_start' | 'start_to_start' | 'finish_to_finish'

export class TaskDependencyRemovedEvent {
  static readonly eventName = 'planner.task-dependency-removed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    public readonly dependencyId: string,
    public readonly fromTaskId: string,
    public readonly toTaskId: string,
    public readonly kind: DependencyKind,
  ) {}
}
```

- [ ] **Step 5: Export all four events from index.ts**

Append to `packages/event-contracts/src/index.ts`:

```ts
export { TaskCustomFieldUpdatedEvent } from './planner/task-custom-field-updated.event'
export { TaskSprintAssignedEvent } from './planner/task-sprint-assigned.event'
export { TaskDependencyAddedEvent } from './planner/task-dependency-added.event'
export { TaskDependencyRemovedEvent } from './planner/task-dependency-removed.event'
```

- [ ] **Step 6: Build event-contracts package**

```bash
bun run --filter @future/event-contracts build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add packages/event-contracts/
git commit -m "feat(event-contracts): add phase-2 planner domain events (custom field, sprint, deps)"
```

---

## Task 4: Run migration procedure

Per CLAUDE.md, there is **one migration file only**: `0000_initial.sql`. Never add numbered migrations.

- [ ] **Step 1: Regenerate the initial migration**

```bash
# From repo root:
cd apps/api

# Delete existing migration artifacts
rm -rf src/modules/planner/infrastructure/schema/migrations/*.sql \
       src/modules/planner/infrastructure/schema/migrations/meta/

# Or if migrations live in a shared path:
find . -path "*/drizzle/*" -name "*.sql" -delete
find . -path "*/drizzle/meta/*" -delete

# Regenerate
bun run db:generate --name initial
```

Expected: `0000_initial.sql` regenerated with all Phase 2 tables included.

- [ ] **Step 2: Apply migration to local dev DB**

```bash
bun run db:down -v && bun run db:up && bun run db:migrate
```

Expected: All migrations apply without errors.

- [ ] **Step 3: Verify new tables exist**

```bash
# Connect to local DB and check:
psql $DATABASE_URL -c "\dt planner.*" 2>/dev/null | grep -E "custom_field|task_dependency|sprint|task_history"
```

Expected: Four new table names printed.

- [ ] **Step 4: Commit migration artifacts**

```bash
git add apps/api/drizzle/ 2>/dev/null || git add apps/api/src/modules/planner/infrastructure/schema/migrations/
git commit -m "chore(db): regenerate initial migration with phase-2 tables"
```
