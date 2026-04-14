# Module: tasks

## Source -- entity, fields, scheduling

### Task entity (`src/core/models/task.py`)

| Column                    | Type                         | Constraints                                                         |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| `id`                      | BigInteger                   | PK, autoincrement                                                   |
| `reference_id`            | BigInteger                   | NOT NULL -- polymorphic FK to offboard form or contract             |
| `module`                  | Enum(`offboard`, `contract`) | NOT NULL -- discriminator for `reference_id`                        |
| `assignee_role`           | Text                         | NOT NULL -- role label (e.g. "hr", "it", "employee", position name) |
| `task`                    | Text                         | NOT NULL, default `""` -- human-readable task description           |
| `assigned_to_employee_id` | BigInteger                   | NOT NULL -- FK to employee                                          |
| `status`                  | Enum(`pending`, `completed`) | NOT NULL, default `pending`                                         |
| `url`                     | Text                         | nullable -- optional link (unused in current service code)          |
| `deadline`                | DateTime                     | NOT NULL                                                            |
| `completed_at`            | DateTime                     | nullable -- set when marked completed                               |
| `marked_by_employee_id`   | BigInteger                   | nullable -- who toggled the status                                  |
| `created_at`              | DateTime                     | server default `now()`                                              |
| `updated_at`              | DateTime                     | server default `now()`, auto-update                                 |

### TaskEvidence entity

| Column       | Type       | Constraints                         |
| ------------ | ---------- | ----------------------------------- |
| `id`         | BigInteger | PK, autoincrement                   |
| `task_id`    | BigInteger | NOT NULL -- FK to tasks             |
| `media_id`   | BigInteger | NOT NULL -- FK to media table       |
| `created_at` | DateTime   | server default `now()`              |
| `updated_at` | DateTime   | server default `now()`, auto-update |

### Enums

- **TaskModuleEnum**: `offboard`, `contract` (with commented-out `onboard`).
- **TaskStatusEnum**: `pending`, `completed`.

### Factory function

`init_task(reference_id, module, assignee_role, task, assigned_to_employee_id, deadline)` creates a `Task` with `status=PENDING`.

### Scheduling infrastructure

Tasks themselves are not scheduled via APScheduler. However, contract-expiry scanning is a **cron job** (`daily_scan_expiring_contracts`, `"00 07 * * *"`) managed by APScheduler 3.11.1 (`AsyncIOScheduler` with `SQLAlchemyJobStore`). That job calls `contract_service.scan_expiring_contracts()` which creates `TaskModuleEnum.CONTRACT` tasks for leaders when contracts are about to expire.

---

## Business Logic -- task CRUD, scheduling, assignment

### TaskService (`src/core/services/task_service.py`)

**Dependencies**: `TaskRepository`, `RoleRepository`, `MediaService`.

#### Create

- `create_tasks(tasks: list[Task])` -- batch insert. Tasks are always created by other modules (offboard, contract), never directly via a "create task" API endpoint.

#### Read

- `get_task_by_id(employee_id, task_id)` -- single task lookup with permission check.
- `get_tasks_by_reference(employee_id, module, reference_id)` -- all tasks for a given offboard/contract record; requires admin/HR/executive role.
- `get_tasks_by_reference_and_assignee(module, reference_id, assignee_id)` -- tasks for a specific assignee within a reference (used internally by contract service to check for duplicates).
- `get_my_task(employee_id, module?, reference_id?, status?, page, page_size)` -- paginated personal task list with optional filters.
- `get_my_tasks(employee_id, module?, status?)` -- unpaginated personal task list (simpler variant).
- `get_my_tasks_in_reference(employee_id, module, reference_id)` -- personal tasks within a specific reference.
- `get_task_statistics(module, reference_ids)` -- aggregate `{total, completed}` per reference_id (used by offboard list views).

#### Update / Mark

- `mark_task(employee_id, task_id, request)` -- toggle status to `completed` or back to `pending`. Sets `completed_at` and `marked_by_employee_id`. Optionally replaces evidence (`media_ids` list -- clears old, adds new).
- `mark_subtask_offboard(employee_id, request)` -- similar to `mark_task` but takes `task_id` inside the request body; supports a single `media_id` instead of a list. Offboard-specific endpoint.

#### Evidence upload

- `upload_evidence(employee_id, task_id, file)` -- async file upload via `MediaService`, creates `TaskEvidence` record.

#### Authorization model

- **View/Update**: assignee OR admin roles (`SUPER_ADMIN`, `HR`, `EXECUTIVE`).
- **View all reference tasks**: admin roles only.
- No separate "create" permission -- tasks are created programmatically by offboard/contract services.

### How tasks are created by other modules

1. **Offboard service** (`offboard_service.py`): When an offboard request is approved, tasks are bulk-created for each role (HR, IT, admin, employee) with role-specific task descriptions and deadlines.
2. **Contract service** (`contract_service.py`): The daily cron job `scan_expiring_contracts` finds contracts expiring within N days (configurable via system settings) and creates "Contract Evaluation" tasks assigned to the employee's leader.

---

## API Endpoints -- all routes

All routes under prefix `/tasks`.

| Method | Path                                        | Description                                                                              |
| ------ | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET`  | `/tasks/me`                                 | Get current user's tasks. Query params: `module?`, `status?`                             |
| `GET`  | `/tasks/me/reference-tasks/{reference_id}`  | Get current user's tasks within a reference. Query param: `type` (module enum, required) |
| `GET`  | `/tasks/references/{module}/{reference_id}` | Get all tasks for a reference (admin only)                                               |
| `GET`  | `/tasks/{task_id}`                          | Get single task by ID                                                                    |
| `POST` | `/tasks/{task_id}/mark`                     | Mark task completed/pending. Body: `{status, media_ids?}`                                |
| `POST` | `/tasks/mark`                               | Mark offboard subtask. Body: `{task_id, status, media_id?}`                              |
| `POST` | `/tasks/{task_id}/evidence`                 | Upload evidence file for a task                                                          |

### Request DTOs

- **MarkTaskRequestDTO**: `{status: TaskStatusEnum, media_ids?: list[int]}`
- **MarkSubtaskOffboardRequestDTO**: `{task_id: int, status: TaskStatusEnum, media_id?: int}`
- **CreateTaskRequestDTO**: `{reference_id, module, assignee_role, task, assigned_to_employee_id, deadline}` (defined but not used in any endpoint -- tasks are created internally)

### Response DTOs

- **TaskResponseDTO**: Full task with joined employee name, media details (id, file_name, file_path, media_url), and nested `evidences[]`.
- **TaskEvidenceDTO**: `{id, task_id, media_id, created_at}`.
- **TaskListResponseDTO**: `{items: TaskResponseDTO[], total: int}`.

---

## Target Overlap -- what exists in planner module

The `planner` module at `apps/api/src/modules/planner/` is a **scaffold with no implementation**:

| File                                          | Status                                                       |
| --------------------------------------------- | ------------------------------------------------------------ |
| `planner.module.ts`                           | Empty NestJS module, exports `PlannerQueryFacade`            |
| `infrastructure/schema/planner.schema.ts`     | Defines `pgSchema('planner')` with a TODO comment, no tables |
| `application/facades/planner-query.facade.ts` | Empty injectable class with TODO                             |
| `interface/trpc/planner.router.ts`            | Empty tRPC router with TODO                                  |
| `domain/entities/`                            | Empty directory                                              |
| `domain/repositories/`                        | Empty directory                                              |
| `domain/value-objects/`                       | Empty directory                                              |
| `application/commands/`                       | Empty directory                                              |
| `application/queries/`                        | Empty directory                                              |
| `application/event-handlers/`                 | Empty directory                                              |
| `infrastructure/repositories/`                | Empty directory                                              |
| `infrastructure/listeners/`                   | Empty directory                                              |

**Overlap**: Zero. The planner module is a blank skeleton. Per `CLAUDE.md`, the planner module owns "Task tracking, AI reminders, KPI linkage" -- this maps directly to the legacy tasks module but with expanded scope (AI reminders, KPI linkage are new features not present in legacy).

---

## Dependencies -- employee module

### Direct dependencies

| Dependency                                               | How used                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Employee** (`src/core/models/employee.py`)             | Joined in repository queries to get `full_name` for task assignee display                             |
| **RoleRepository** (`src/repository/role_repository.py`) | `role_in_org(employee_id)` -- checks if user is `SUPER_ADMIN`, `HR`, or `EXECUTIVE` for authorization |
| **MediaService** (`src/core/services/media_service.py`)  | Evidence file upload + URL generation for task attachments                                            |
| **Media** (`src/core/models/media.py`)                   | Joined in queries to resolve evidence file metadata                                                   |

### Inverse dependencies (modules that depend on tasks)

| Module              | How it uses tasks                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OffboardService** | Creates offboard tasks via `init_task()` + `task_service.create_tasks()`. Reads stats via `get_task_statistics()`. Views tasks via `get_tasks_by_reference()`. |
| **ContractService** | Creates contract evaluation tasks during daily cron scan. Checks for duplicates via `get_tasks_by_reference_and_assignee()`.                                   |

### Future module mapping

| Legacy                         | Future                                                     |
| ------------------------------ | ---------------------------------------------------------- |
| Employee model                 | `people` module (employment profiles)                      |
| RoleRepository (authorization) | `kernel` module (Authority -- role_grant, role_permission) |
| MediaService                   | `@future/storage` package or dedicated media handling      |
| OffboardService                | `people` module (offboarding)                              |
| ContractService                | `people` module or `finance` module (contracts)            |

---

## Migration Notes -- scheduling approach differences (APScheduler vs pg-boss)

### Legacy approach: APScheduler

- **Library**: APScheduler 3.11.1 (`AsyncIOScheduler`).
- **Job store**: `SQLAlchemyJobStore` backed by the same PostgreSQL database (stores jobs in `apscheduler_jobs` table, excluded from Alembic migrations).
- **Usage for tasks**: Only the contract-expiry scan is scheduled (`daily_scan_expiring_contracts`, cron `00 07 * * *`). Task CRUD itself is synchronous, not scheduled.
- **Architecture**: Global singleton `SchedulerManager` initialized at app startup. Supports both one-shot (`DateTrigger`) and recurring (`CronTrigger`) jobs.
- **Listener**: `schedule_listener.py` handles `EVENT_JOB_EXECUTED`, `EVENT_JOB_ERROR`, `EVENT_JOB_SUBMITTED` for logging.
- **Limitations**: In-process scheduler -- if the process dies, scheduled jobs are missed until restart. No multi-instance coordination (no distributed lock). Job state stored in the app's main database.

### Future approach: pg-boss

- **Library**: pg-boss (Node.js job queue on PostgreSQL with SKIP LOCKED).
- **Key differences**:
  - **Multi-instance safe**: pg-boss uses `SKIP LOCKED` for distributed job claiming -- multiple API instances can run without duplicate execution.
  - **Retry and expiration**: Built-in retry policies, exponential backoff, dead-letter queues.
  - **Schema isolation**: pg-boss uses its own schema (`pgboss`), cleanly separated from application schemas.
  - **Cron jobs**: pg-boss supports cron schedules natively (`boss.schedule(name, cron, data)`), replacing APScheduler's `CronTrigger`.
  - **One-shot jobs**: `boss.send(name, data, options)` with `startAfter` replaces APScheduler's `DateTrigger`.

### Migration considerations

1. **Contract-expiry cron job**: Replace `scan_expiring_contracts_job` APScheduler cron with a pg-boss scheduled job. The business logic (scan contracts, create tasks) moves into a command handler in the `people` or `planner` module, triggered by pg-boss.

2. **Task creation is event-driven in future**: Instead of offboard/contract services directly calling `task_service.create_tasks()`, the future architecture should use **domain events** (`OffboardApprovedEvent`, `ContractExpiringEvent`) published via the outbox pattern. The planner module listens for these events and creates tasks autonomously -- no cross-module write coupling.

3. **Authorization model change**: Legacy uses role name checks (`SUPER_ADMIN`, `HR`, `EXECUTIVE`) hardcoded in the service. Future uses kernel's Authority system (`role_grant`, `role_permission`, `delegation`) for permission checks.

4. **Polymorphic reference pattern**: Legacy uses `module` enum + `reference_id` as a polymorphic FK. In the future, consider a more explicit approach: either separate task-source columns or a `source_type`/`source_id` pattern with the `module` being a proper domain value object rather than a raw enum.

5. **Evidence/media handling**: Legacy tightly couples `TaskEvidence` to `Media` with direct joins. Future should use `@future/storage` for file handling and keep evidence as a value object within the planner bounded context, referencing storage keys rather than media table IDs.

6. **Multi-tenancy**: Legacy has no `tenant_id`. Every table in the future must include `tenant_id` with RLS enforcement. Task queries must be scoped by tenant.

7. **New capabilities in planner**: The future planner module adds "AI reminders" and "KPI linkage" that have no legacy equivalent. These are net-new features to design from scratch.
