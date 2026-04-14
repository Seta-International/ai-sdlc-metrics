# Module: offboarding

## Source — all entities, fields, relationships, enums

### `form_offboards` (table)

| Column                | Type              | Nullable | Default        |
| --------------------- | ----------------- | -------- | -------------- |
| id                    | BigInteger (PK)   | no       | autoincrement  |
| employee_id           | BigInteger (FK\*) | no       |                |
| reason                | Text              | no       |                |
| description           | Text              | no       |                |
| status                | Enum (string)     | no       | `pending`      |
| offboard_date         | DateTime          | no       |                |
| marked_by_employee_id | BigInteger (FK\*) | yes      |                |
| rejected_reason       | Text              | yes      |                |
| created_at            | DateTime          |          | `now()`        |
| updated_at            | DateTime          |          | `now()` / auto |

_FK references are logical only; no declared SQLAlchemy relationships._

### `subtask_offboards` (table, UNUSED at runtime)

Declared in `offboard.py` but never used by service or router code. The service creates offboarding tasks via the generic `tasks` table instead (see below).

| Column                  | Type            | Nullable | Default        |
| ----------------------- | --------------- | -------- | -------------- |
| id                      | BigInteger (PK) | no       | autoincrement  |
| form_offboard_id        | BigInteger      | no       |                |
| type                    | Enum (string)   | no       |                |
| task                    | Text            | no       | `""`           |
| assigned_to_employee_id | BigInteger      | no       |                |
| status                  | Enum (string)   | no       | `pending`      |
| deadline                | DateTime        | no       |                |
| completed_at            | DateTime        | yes      |                |
| marked_by_employee_id   | BigInteger      | yes      |                |
| media_id                | BigInteger      | yes      |                |
| created_at              | DateTime        |          | `now()`        |
| updated_at              | DateTime        |          | `now()` / auto |

### `tasks` (generic task table, shared with contract module)

| Column                  | Type            | Nullable | Default            |
| ----------------------- | --------------- | -------- | ------------------ |
| id                      | BigInteger (PK) | no       | autoincrement      |
| reference_id            | BigInteger      | no       | (form_offboard.id) |
| module                  | Enum (string)   | no       | `offboard`         |
| assignee_role           | Text            | no       |                    |
| task                    | Text            | no       | `""`               |
| assigned_to_employee_id | BigInteger      | no       |                    |
| status                  | Enum (string)   | no       | `pending`          |
| url                     | Text            | yes      |                    |
| deadline                | DateTime        | no       |                    |
| completed_at            | DateTime        | yes      |                    |
| marked_by_employee_id   | BigInteger      | yes      |                    |
| created_at              | DateTime        |          | `now()`            |
| updated_at              | DateTime        |          | `now()` / auto     |

### `task_evidences`

| Column     | Type            | Nullable |
| ---------- | --------------- | -------- |
| id         | BigInteger (PK) | no       |
| task_id    | BigInteger      | no       |
| media_id   | BigInteger      | no       |
| created_at | DateTime        |          |
| updated_at | DateTime        |          |

### `handover_status` (configuration table)

| Column     | Type         | Nullable |
| ---------- | ------------ | -------- |
| id         | Integer (PK) | no       |
| name       | String(255)  | no       |
| created_at | DateTime     |          |
| updated_at | DateTime     |          |

CRUD-only lookup table managed by `HandoverStatusRepository`. Not directly joined to offboarding tables. Used by the UI for configuring handover status labels.

### Enums

| Enum                        | Values                                                       |
| --------------------------- | ------------------------------------------------------------ |
| `OffboardStatusEnum`        | `pending`, `approved`, `processing`, `rejected`, `completed` |
| `OffboardAssigneeRoleEnum`  | `pm`, `hr`, `employee`, `it`, `assignee`                     |
| `SubtaskOffboardStatusEnum` | `pending`, `completed`                                       |
| `TaskModuleEnum`            | `offboard`, `contract`                                       |
| `TaskStatusEnum`            | `pending`, `completed`                                       |

---

## Business Logic — workflow steps, handover tracking, form generation

### Offboarding workflow (state machine)

```
PENDING ──approve──> APPROVED ──assign tasks──> PROCESSING ──complete──> COMPLETED
   │                                                                         │
   └──reject──> REJECTED                                    (employee deactivated)
```

### Step-by-step

1. **Submit offboard request** (`create_offboard` / `create_offboard_employee`)
   - Employee self-submits OR admin/HR creates on their behalf.
   - Guards: employee must not already have an active offboarding (status in `pending`, `approved`, `processing`).
   - Creates `FormOffboard` with status `PENDING`.
   - Sends email notification to hardcoded `admin_email`.

2. **Mark (approve/reject/complete)** (`mark_form_offboard`)
   - Admin/HR calls with `form_offboard_id` + target `status` + optional `comment`.
   - Sets `marked_by_employee_id` to the acting user.
   - On **REJECTED**: sends rejection email to the offboarding employee (with optional CC list).
   - On **COMPLETED**: calls `_deactivate_employee`.

3. **Assign offboarding tasks** (`create_offboard_tasks`)
   - Only allowed when form status is `APPROVED` and no tasks already assigned.
   - Admin provides task lists grouped by role (PM, HR, IT, Employee, Assignee).
   - Each role group has: `assigned_to_employee_id`, `tasks[]` (strings), `deadline`.
   - Creates `Task` rows in the generic `tasks` table with `module=offboard`, `reference_id=form_offboard.id`.
   - Transitions form to `PROCESSING`.
   - **Side effects (async)**:
     - Sends role-specific email to each assignee (different templates per role).
     - Schedules digest reminders at 2 weeks, 1 week, 2 days, 1 day before each role's deadline.

4. **Complete / deactivate** (`_deactivate_employee`)
   - Sets employee status to `INACTIVE`.
   - Fires `EMPLOYEE_DEACTIVED` webhook.
   - Removes employee from all roles.
   - Removes employee from all accounts.
   - Revokes all sessions.

### Task tracking

- Tasks are created ad-hoc per case (no template system).
- Task completion tracked via `TaskService.get_task_statistics` returning `{total, completed}` per `reference_id`.
- Progress percentage exposed on the form list endpoint.

### Handover tracking

`HandoverStatus` is a standalone configuration entity with basic CRUD. It is **not wired** into the offboarding workflow or any offboarding table. Its purpose appears to be a tenant-configurable lookup for handover status labels shown in the UI. The repository provides: `create`, `get`, `list`, `count`, `update`, `delete`, `get_by_name`.

### My tasks

Employees can list offboarding forms where they have at least one assigned task (`get_my_offboard_forms`). Returns form + employee info for the "My Tasks" view, excluding completed forms.

---

## API Endpoints — all routes with roles

| Method | Path                                    | Roles Required         | Description                                        |
| ------ | --------------------------------------- | ---------------------- | -------------------------------------------------- |
| POST   | `/offboarding/requests`                 | Authenticated employee | Employee self-submits offboarding request          |
| POST   | `/offboarding/create-offboard-employee` | SUPER_ADMIN, HR        | Admin/HR creates offboarding for another employee  |
| POST   | `/offboarding/requests/mark`            | SUPER_ADMIN, HR        | Approve / reject / complete an offboarding form    |
| GET    | `/offboarding/form-offboards`           | SUPER_ADMIN, HR        | List all offboarding forms (paginated, filterable) |
| GET    | `/offboarding/{offboard_id}/subtasks`   | SUPER_ADMIN, HR        | Get tasks for a specific offboarding form          |
| POST   | `/offboarding/subtask-offboards`        | SUPER_ADMIN, HR        | Assign offboarding tasks (grouped by role)         |
| GET    | `/offboarding/my-tasks/forms`           | Authenticated employee | List forms where current user has assigned tasks   |

### Query parameters for `GET /form-offboards`

`page`, `page_size`, `employee_id`, `status`, `offboard_date_from`, `offboard_date_to`, `requested_on_from`, `requested_on_to`, `sort_by`, `sort_direction`

### Request DTOs

- **SubmitOffboardRequestDTO**: `reason?`, `description?`, `offboard_date`
- **CreateOffboardRequestDTO**: `employee_id`, `reason?`, `description?`, `offboard_date`
- **MarkFormOffboardRequestDTO**: `form_offboard_id`, `status`, `comment?`, `cc_emails?`
- **CreateOffboardTasksRequestDTO**: `form_offboard_id`, plus optional role groups (`pm`, `hr`, `employee`, `it`, `assignee`) each containing `assigned_to_employee_id`, `tasks[]`, `deadline`

### Response DTOs

- **FormOffboardResponseDTO**: form fields + employee name/email/avatar/position + `is_task_assigned` + `progress`
- **OffboardTaskGroupDTO**: form id + employee info + task list
- **MyTaskFormDTO**: form id + employee name/email/avatar + `offboard_date`
- All list endpoints return paginated wrappers (`total`, `page`, `page_size`)

---

## Target Overlap — what exists vs what's missing

### Exists in Future (people module)

| Concept              | Legacy                           | Future                                                      | Notes                                                                                                                                            |
| -------------------- | -------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Offboarding form     | `FormOffboard`                   | `OffboardingCase`                                           | Renamed; adds `templateId`, `reasonCategory`, `decisionCaseId`; drops `description`, `offboard_date`, `marked_by_employee_id`, `rejected_reason` |
| Offboarding status   | enum 5 values                    | Same 5 values                                               | Identical                                                                                                                                        |
| Tasks                | Generic `Task` table             | `OffboardingTask` (dedicated)                               | Dedicated entity; adds `isRequired`, `evidenceUrl`, `skipped` status; drops `url`, `marked_by_employee_id`                                       |
| Assignee roles       | `pm, hr, employee, it, assignee` | `hr, it, project_manager, employee, account_manager`        | `pm` renamed to `project_manager`; `assignee` renamed to `account_manager`                                                                       |
| Task templates       | None (ad-hoc)                    | `OffboardingTemplate` + `OffboardingTaskTemplate`           | Template-driven task generation with `dueDaysBeforeLastDay`, `displayOrder`, `isRequired`                                                        |
| Reason categories    | None                             | `voluntary`, `involuntary`, `redundancy`, `end_of_contract` | New concept for template matching                                                                                                                |
| Decision integration | None                             | `KernelDecisionFacade` creates/resolves decision cases      | Approval routed through kernel authority                                                                                                         |
| Trigger command      | `create_offboard`                | `TriggerOffboardingHandler`                                 | Validates profile status; creates decision case; sets profile to `offboarding`                                                                   |
| Approve command      | `mark_form_offboard` (approve)   | `ApproveOffboardingHandler`                                 | Auto-matches template; generates tasks from template; resolves decision; emits outbox event                                                      |
| Reject command       | `mark_form_offboard` (reject)    | `RejectOffboardingHandler`                                  | Resolves decision case; no email yet                                                                                                             |
| Complete command     | `mark_form_offboard` (complete)  | `CompleteOffboardingHandler`                                | Terminates profile; closes memberships; deactivates actor; deprovisions identity; revokes roles; emits event                                     |
| Self-submit          | Employee can self-submit         | Not yet implemented (trigger requires `requestedBy` actor)  |                                                                                                                                                  |

### Missing in Future

| Feature                              | Priority | Notes                                                                                                                                                                                             |
| ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Offboard date / last working day** | High     | Legacy stores `offboard_date` on the form; Future has no equivalent field on `OffboardingCase`. `expectedLastDay` is referenced in the outbox event payload but not persisted.                    |
| **Description / free-text notes**    | Medium   | Legacy `description` field on form; Future has only `reason` string.                                                                                                                              |
| **Email notifications**              | High     | Legacy sends 6+ email types: new request to admin, rejection to employee, role-specific task assignment emails, scheduled digest reminders. Future emits outbox events but has no email handlers. |
| **Scheduled task reminders**         | Medium   | Legacy schedules reminders at 2w/1w/2d/1d before deadline via `ScheduleService`. Future has no equivalent.                                                                                        |
| **Task progress tracking**           | Medium   | Legacy computes `progress` percentage and `is_task_assigned` boolean per form. Future has `getRequiredTasks` but no aggregate progress query.                                                     |
| **List / filter offboarding cases**  | High     | Legacy has paginated, filterable, sortable list endpoint with date range filters. Future has no query handler for listing cases.                                                                  |
| **My tasks view**                    | Medium   | Legacy lets employees see forms where they have assigned tasks. Future has no equivalent query.                                                                                                   |
| **Admin-initiated offboarding**      | Medium   | Legacy has separate endpoint for admin to create offboarding for another employee. Future's trigger command covers this but lacks the admin-specific DTO flow.                                    |
| **Rejection email with CC**          | Low      | Legacy supports CC list on rejection emails.                                                                                                                                                      |
| **Webhook on deactivation**          | Low      | Legacy fires `EMPLOYEE_DEACTIVED` webhook. Future uses outbox event `people.employee-terminated`.                                                                                                 |
| **Handover status configuration**    | Low      | Legacy has CRUD for handover status labels. Not needed in Future (no handover tracking in either system).                                                                                         |
| **Task evidence (media upload)**     | Low      | Legacy has `TaskEvidence` table + `media_id` on subtask. Future has `evidenceUrl` on `OffboardingTask` (simpler approach).                                                                        |
| **tRPC router for offboarding**      | High     | No tRPC procedures exist yet for any offboarding operation.                                                                                                                                       |

---

## Dependencies — employee, contract modules

### Legacy dependencies

| Dependency                     | Usage in offboarding                                                              |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `EmployeeRepository`           | Look up employee by ID, update status to INACTIVE                                 |
| `RoleRepository`               | Delete employee from all roles on completion                                      |
| `AccountRepository`            | Remove employee from all accounts on completion                                   |
| `SessionRepository`            | Revoke all sessions on completion                                                 |
| `MediaService` / `MinioClient` | Avatar URL resolution for list responses                                          |
| `TaskService`                  | Generic task CRUD, statistics, and evidence management                            |
| `ScheduleService`              | Schedule digest reminder emails (APScheduler)                                     |
| `WebhookService`               | Fire `EMPLOYEE_DEACTIVED` webhook                                                 |
| `MailChannel`                  | Send 6+ email templates (offboard request, rejection, task assignment, reminders) |
| `HandoverStatusRepository`     | CRUD for handover status config (loosely coupled)                                 |

### Future dependencies

| Dependency                       | Usage in offboarding                                                       |
| -------------------------------- | -------------------------------------------------------------------------- |
| `IEmploymentProfileRepository`   | Find profile, validate status, update status to `offboarding`/`terminated` |
| `IOffboardingCaseRepository`     | Case CRUD, task insertion, task status updates                             |
| `IOffboardingTemplateRepository` | Template matching by employment type + reason category                     |
| `IAccountMembershipRepository`   | Close all memberships on completion                                        |
| `KernelDecisionFacade`           | Create/resolve decision cases (approval authority)                         |
| `KernelAuditFacade`              | Publish outbox events                                                      |
| `KernelActorFacade`              | Deactivate actor, revoke all roles                                         |
| `KernelUserIdentityFacade`       | Deprovision user identity (SSO/login removal)                              |

### Contract module overlap

Legacy's `Task` table is shared between offboarding and contract modules (`TaskModuleEnum`). In Future, offboarding has its own dedicated `OffboardingTask` entity, so no cross-module table sharing.

---

## Migration Notes — workflow differences, handover tracking

### Workflow differences

1. **Template-driven vs ad-hoc tasks**: Legacy creates tasks ad-hoc at assignment time (admin manually specifies task strings per role). Future auto-generates tasks from `OffboardingTemplate` + `OffboardingTaskTemplate` when the case is approved. This is a major architectural improvement but means the admin task assignment endpoint is no longer needed.

2. **Approval authority**: Legacy uses simple role checks (SUPER_ADMIN, HR). Future routes approvals through `KernelDecisionFacade` with proper decision case tracking and resolution. The legacy "mark" endpoint that accepts any status transition is replaced by three separate commands (approve, reject, complete).

3. **Status transitions**: Legacy allows direct jumps (e.g., `PENDING` -> `COMPLETED`). Future enforces proper state machine: trigger sets `pending`, approve moves to `approved` then immediately to `processing`, complete requires `processing` status.

4. **Profile status**: Legacy sets employee to `INACTIVE`. Future uses `offboarding` (intermediate) and `terminated` (final) statuses, giving better visibility into in-progress offboardings.

5. **Deactivation scope**: Legacy deactivates employee + removes roles + removes from accounts + revokes sessions. Future does the same plus deprovisions user identity (SSO removal) through `KernelUserIdentityFacade`.

6. **Event system**: Legacy fires synchronous webhooks. Future emits outbox events (`people.offboarding-started`, `people.employee-terminated`) for async consumption.

### Handover tracking

Neither legacy nor Future implements actual handover tracking as a workflow feature. Legacy has `HandoverStatus` as a configuration table and the unused `subtask_offboards` table (dead code -- the service uses the generic `tasks` table instead). Future has no handover concept. If handover tracking is needed, it should be modeled as a first-class concept within `OffboardingTask` or as a separate entity linked to the case.

### Key migration actions

1. **Add `expectedLastDay` (or `offboardDate`) to `OffboardingCase`** -- this is a critical missing field that legacy depends on for deadline calculation, email content, and list display.
2. **Build tRPC router** for offboarding with procedures: `trigger`, `approve`, `reject`, `complete`, `listCases`, `getCaseDetail`, `getTasksByCaseId`, `updateTaskStatus`.
3. **Implement query handlers** for listing/filtering offboarding cases (paginated, by status, by date range).
4. **Add email notification event handlers** that react to outbox events and send the appropriate templates.
5. **Implement task reminder scheduling** via `pg-boss` jobs rather than legacy's APScheduler.
6. **Map role names**: `pm` -> `project_manager`, `assignee` -> `account_manager` in any data migration.
7. **Drop `subtask_offboards`** -- it is dead code in legacy. Do not migrate it.
8. **Drop `handover_status`** -- it is a loose configuration table with no workflow integration. If needed later, model it properly.
