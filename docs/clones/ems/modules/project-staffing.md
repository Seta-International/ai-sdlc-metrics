# Module: project-staffing

## Source

### Path and key files

| File                                          | Purpose                                                                                                | Size       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| `src/core/models/project.py`                  | SQLAlchemy models: `Project`, `ProjectEmployee`, `ProjectDeveloperSetting`, `EmployeeDeveloperSetting` | ~163 lines |
| `src/core/services/project_service.py`        | Business logic: CRUD, employee allocation, role lookup                                                 | ~337 lines |
| `src/repository/project_repository.py`        | Database queries: list/filter/paginate projects and project-employees                                  | ~425 lines |
| `src/repository/project_developer_setting.py` | CRUD for developer tool integrations (JIRA, GitHub, Slack, etc.)                                       | ~53 lines  |
| `src/present/routers/project_router.py`       | FastAPI endpoints under `/accounts/{account_id}/projects`                                              | ~433 lines |
| `src/present/routers/account_router.py`       | FastAPI endpoints under `/accounts` (account CRUD, employee-account membership)                        | ~397 lines |
| `src/present/dto/project/project.py`          | Pydantic DTOs for project and project-employee operations                                              | ~87 lines  |
| `src/core/enums/project.py`                   | `BillingTypeEnum`, `MemberTypeEnum`                                                                    | ~13 lines  |
| `src/core/mapper/project.py`                  | DTO-to-model mappers for create/update/add-employee                                                    | ~33 lines  |

---

## Domain Model

### Project entity

| Field            | Type                                          | Notes                                     |
| ---------------- | --------------------------------------------- | ----------------------------------------- |
| `id`             | `BigInteger` (auto)                           | Primary key                               |
| `account_id`     | `BigInteger`                                  | FK to account (no DB-level FK constraint) |
| `name`           | `String(255)`                                 | Required, unique per account              |
| `description`    | `Text`                                        | Optional                                  |
| `tags`           | `JSONB` (mutable list)                        | Default `[]`                              |
| `start_date`     | `DateTime`                                    | Optional                                  |
| `end_date`       | `DateTime`                                    | Optional                                  |
| `delivery_model` | Enum: `Scrum`, `Kanban`, `Waterfall`, `Other` | Default `Other`                           |
| `status`         | Enum: `Active`, `On Hold`, `Closed`           | Default `Active`, indexed                 |
| `created_at`     | `DateTime`                                    | server_default `now()`                    |
| `updated_at`     | `DateTime`                                    | server_default `now()`, auto-update       |

### ProjectEmployee (allocation join table)

| Field               | Type                | Notes                               |
| ------------------- | ------------------- | ----------------------------------- |
| `id`                | `BigInteger` (auto) | Primary key                         |
| `employee_id`       | `BigInteger`        | References employee                 |
| `project_id`        | `BigInteger`        | References project                  |
| `effort_percentage` | `Numeric(5,4)`      | e.g. 1.0000 = 100%, 0.5000 = 50%    |
| `position`          | `String(255)`       | Optional free-text position title   |
| `billing_type`      | `String(50)`        | Default `"Billable"`                |
| `member_type`       | `String(50)`        | Default `"Core"`                    |
| `updated_by`        | `BigInteger`        | Employee who last edited            |
| `created_at`        | `DateTime`          | server_default `now()`              |
| `updated_at`        | `DateTime`          | server_default `now()`, auto-update |

### ProjectDeveloperSetting

| Field        | Type                                                         | Notes                          |
| ------------ | ------------------------------------------------------------ | ------------------------------ |
| `id`         | `BigInteger` (auto)                                          | Primary key                    |
| `project_id` | `BigInteger`                                                 | References project             |
| `type`       | Enum: `JIRA`, `GITHUB`, `SLACK`, `GITLAB`, `TEAMS`, `OTHERS` |                                |
| `github_url` | `String(255)`                                                | For GITHUB type                |
| `github_id`  | `BigInteger`                                                 | For GITHUB type                |
| `jira_url`   | `String(255)`                                                | For JIRA type                  |
| `pat`        | `String(255)`                                                | Personal access token (GITHUB) |
| `username`   | `String(255)`                                                | For JIRA                       |
| `password`   | `String(255)`                                                | For JIRA                       |

### EmployeeDeveloperSetting

| Field         | Type                                         | Notes                  |
| ------------- | -------------------------------------------- | ---------------------- |
| `id`          | `BigInteger` (auto)                          | Primary key            |
| `project_id`  | `BigInteger`                                 | References project     |
| `employee_id` | `BigInteger`                                 | References employee    |
| `type`        | Enum (same as `ProjectDeveloperSettingType`) |                        |
| `username`    | `String(255)`                                | Tool-specific username |

### Account relationship

Projects are nested under accounts. The router prefix is `/accounts/{account_id}/projects`. Creating a project requires an `account_id`. Deleting an account cascades to remove all its projects (via `remove_all_project_in_account`). When an employee is added to a project, they are auto-added to the parent account with `EMPLOYEE` role if not already present.

### Enums

**BillingTypeEnum** (`src/core/enums/project.py`):

- `Billable`
- `Non-Billable`

**MemberTypeEnum** (`src/core/enums/project.py`):

- `Core`
- `Shadow`
- `Backfill`

**ProjectStatus** (in `models/project.py`):

- `Active`
- `On Hold`
- `Closed`

**DeliveryModel** (in `models/project.py`):

- `Scrum`
- `Kanban`
- `Waterfall`
- `Other`

**ProjectDeveloperSettingType** (in `models/project.py`):

- `JIRA`
- `GITHUB`
- `SLACK`
- `GITLAB`
- `TEAMS`
- `OTHERS`

---

## Business Logic

### Project CRUD (`ProjectService`)

- **Create**: Validates name uniqueness within account, maps DTO to model, sets `account_id`, persists. Returns `ProjectResponseDTO`.
- **Get**: Lookup by ID, 404 if not found.
- **List**: Paginated with filters (`status`, `search`, `name`, `tags`), sorting, and **permission-aware visibility**:
  - `SUPER_ADMIN`, `HR`, `EXECUTIVE` see all projects for the account.
  - `ACCOUNT_MANAGER` sees all projects in their managed account.
  - Regular employees see only projects they are allocated to (joins through `project_employee`).
- **Update**: Partial update via `model_dump(exclude_unset=True)`.
- **Delete**: Verifies project belongs to the specified account, removes all employee allocations and roles first, then deletes the project.

### Employee allocation/deallocation

- **Add employees** (`add_employees`): Batch operation. For each employee:
  1. Validates employee exists.
  2. Checks employee not already in project (409 conflict).
  3. Auto-adds employee to parent account if not present (with `EMPLOYEE` role).
  4. Creates `ProjectEmployee` record with `effort_percentage`, `billing_type`, `member_type`.
  5. Creates `EmployeeRole` record with project-scoped role.
  6. Commits as a single transaction (manual rollback on failure).
- **Update employee**: Updates `effort_percentage`, `billing_type`, `member_type`, and/or project role. Role update and allocation update happen in separate commits.
- **Remove employee**: Deletes `ProjectEmployee` and `EmployeeRole` records. Self-removal is blocked (`CANNOT_REMOVE_YOUR_SELF`).
- **Bulk remove**: Used during project deletion. Removes all `ProjectEmployee` and `EmployeeRole` records for given employee IDs.

### Effort tracking

- `effort_percentage` is `Numeric(5,4)` -- 4 decimal places.
- Displayed in project employee listings alongside role, billing type, and member type.
- No server-side validation that total effort across projects <= 100%.
- Employee effort report available at `/accounts/{account_id}/employees/efforts`.

### Delivery model management

- Set during project creation (default `Other`).
- Can be updated via project update endpoint.
- No business rules tied to delivery model -- purely informational.

### Role management

- Roles are stored in a separate `employee_roles` table with `role_type = PROJECT`.
- `get_project_role_me`: Returns the current user's role in a specific project.
- Role values used: `PROJECT_MANAGER`, `EMPLOYEE`, `EXTERNAL_PARTIME`.

---

## API Endpoints

### Account routes (`/accounts`)

| Method   | Path                                             | Auth                                                                                | Description                                                        |
| -------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `POST`   | `/accounts`                                      | `SUPER_ADMIN`                                                                       | Create account                                                     |
| `GET`    | `/accounts`                                      | Any authenticated                                                                   | List accounts (paginated, filtered by name/tags)                   |
| `GET`    | `/accounts/{account_id}`                         | `ACCOUNT_MANAGER`, `EMPLOYEE`, `EXTERNAL_PARTIME`, `SUPER_ADMIN`, `HR`, `EXECUTIVE` | Get account details                                                |
| `PUT`    | `/accounts/{account_id}`                         | `SUPER_ADMIN`, `ACCOUNT_MANAGER`                                                    | Update account                                                     |
| `DELETE` | `/accounts/{account_id}`                         | `SUPER_ADMIN`                                                                       | Delete account (cascades to projects)                              |
| `POST`   | `/accounts/{account_id}/employees`               | `SUPER_ADMIN`, `HR`, `ACCOUNT_MANAGER`                                              | Add employee to account                                            |
| `PUT`    | `/accounts/{account_id}/employees`               | `SUPER_ADMIN`, `HR`, `ACCOUNT_MANAGER`                                              | Update employee role in account                                    |
| `DELETE` | `/accounts/{account_id}/employees/{employee_id}` | `SUPER_ADMIN`, `HR`, `ACCOUNT_MANAGER`                                              | Remove employee from account                                       |
| `GET`    | `/accounts/{account_id}/employees`               | `SUPER_ADMIN`, `HR`, `EXECUTIVE`, `ACCOUNT_MANAGER`                                 | List account employees (paginated, filters: id, name, email, role) |
| `GET`    | `/accounts/{account_id}/employees/efforts`       | `SUPER_ADMIN`, `HR`, `EXECUTIVE`, `ACCOUNT_MANAGER`                                 | Employee effort report for account                                 |
| `GET`    | `/accounts/{account_id}/role/me`                 | Any authenticated                                                                   | Get current user's role in account                                 |

### Project routes (`/accounts/{account_id}/projects`)

| Method   | Path                                                                   | Auth                                                      | Description                                                    |
| -------- | ---------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `POST`   | `/accounts/{account_id}/projects`                                      | `SUPER_ADMIN`, `HR`, `ACCOUNT_MANAGER`                    | Create project                                                 |
| `GET`    | `/accounts/{account_id}/projects`                                      | Any authenticated                                         | List projects (paginated, filters: status, search, name, tags) |
| `GET`    | `/accounts/{account_id}/projects/{project_id}`                         | Org admins, account members, project members              | Get project details                                            |
| `PUT`    | `/accounts/{account_id}/projects/{project_id}`                         | `SUPER_ADMIN`, `HR`, `ACCOUNT_MANAGER`, `PROJECT_MANAGER` | Update project                                                 |
| `DELETE` | `/accounts/{account_id}/projects/{project_id}`                         | `SUPER_ADMIN`, `HR`, `ACCOUNT_MANAGER`, `PROJECT_MANAGER` | Delete project                                                 |
| `POST`   | `/accounts/{account_id}/projects/{project_id}/employees`               | `SUPER_ADMIN`, `HR`, `ACCOUNT_MANAGER`, `PROJECT_MANAGER` | Add employees to project (batch)                               |
| `PUT`    | `/accounts/{account_id}/projects/{project_id}/employees`               | `SUPER_ADMIN`, `HR`, `ACCOUNT_MANAGER`, `PROJECT_MANAGER` | Update project employee (single)                               |
| `DELETE` | `/accounts/{account_id}/projects/{project_id}/employees/{employee_id}` | `SUPER_ADMIN`, `HR`, `ACCOUNT_MANAGER`, `PROJECT_MANAGER` | Remove employee from project                                   |
| `GET`    | `/accounts/{account_id}/projects/{project_id}/role/me`                 | `SUPER_ADMIN`, `HR`, `ACCOUNT_MANAGER`, `PROJECT_MANAGER` | Get current user's role in project                             |

---

## Target Overlap

### What exists in the target `projects` module

The target module at `apps/api/src/modules/projects/` has four domain entities and a comprehensive command/query structure:

**Entities:**

- `Account` -- richer than legacy: adds `clientCompany`, `domain`, `location`, `timezone`, `billingModel` (fixed_price, t_and_m, dedicated, retainer), `accountManagerId`.
- `Project` -- adds `code` field, adds `tentative` status not in legacy.
- `ProjectRole` -- **new concept not in legacy**. Represents a demand slot with `roleName`, `skillsRequired`, `headcount`, and status (`open`/`filled`/`cancelled`).
- `Allocation` -- replaces legacy `ProjectEmployee`. Linked to `ProjectRole` via `projectRoleId`.

**Commands (10):**

- `create-account`, `update-account`
- `create-project`, `update-project`
- `create-project-role`, `update-project-role`
- `create-allocation`, `update-allocation`, `confirm-allocation`, `close-allocation`

**Queries (8):**

- `get-account`, `list-accounts`
- `get-project`, `list-projects`
- `get-account-staffing` -- staffing view per account
- `get-person-allocations` -- all allocations for a person
- `get-staffing-overview` -- date-range staffing overview
- `get-capacity-report` -- date-range capacity report

### Key differences

| Aspect                     | Legacy (EMS)                                                                       | Target (Future)                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **IDs**                    | `BigInteger` auto-increment                                                        | `uuid` (UUIDv7)                                                                                         |
| **Multi-tenancy**          | None (single tenant)                                                               | `tenant_id` on every table, RLS                                                                         |
| **Allocation unit**        | `effort_percentage` (`Numeric(5,4)` -- 0.0000 to 1.0000)                           | `hoursPerDay` (`Numeric(4,2)` -- e.g. 8.00)                                                             |
| **Allocation status**      | None (implicitly active)                                                           | `tentative` / `confirmed` with explicit `confirm-allocation` and `close-allocation` commands            |
| **Allocation time bounds** | None (no start/end on allocation)                                                  | `startedAt` (required), `endedAt` (optional)                                                            |
| **Allocation note**        | None                                                                               | `note` field                                                                                            |
| **Demand modeling**        | None -- employees assigned directly to projects                                    | `ProjectRole` (demand slot): `roleName`, `skillsRequired`, `headcount`, status. Allocations fill roles. |
| **Project status values**  | `Active`, `On Hold`, `Closed`                                                      | `active`, `on_hold`, `closed`, `tentative`                                                              |
| **Account model**          | Minimal (not shown in these files but referenced)                                  | Rich: `clientCompany`, `domain`, `location`, `timezone`, `billingModel`, `accountManagerId`             |
| **Account billing model**  | None (billing_type is on allocation)                                               | Account-level `billingModel`: `fixed_price`, `t_and_m`, `dedicated`, `retainer`                         |
| **Project code**           | None                                                                               | `code` field                                                                                            |
| **Developer settings**     | `ProjectDeveloperSetting` + `EmployeeDeveloperSetting` (JIRA, GitHub, Slack, etc.) | Not present -- out of scope for target                                                                  |
| **Role system**            | `EmployeeRole` table with `role_type = PROJECT`, role names like `PROJECT_MANAGER` | Authority managed by `kernel` module (`role_grant`, `role_permission`). Not in projects module.         |
| **Enum casing**            | PascalCase values (`"Billable"`, `"Core"`)                                         | snake_case values (`"billable"`, `"core"`)                                                              |
| **Staffing analytics**     | Basic effort listing (`/employees/efforts`)                                        | Dedicated queries: `get-staffing-overview`, `get-capacity-report`, `get-person-allocations`             |

### What the target has that legacy does not

1. **ProjectRole (demand slots)**: A structured way to define what roles a project needs before people are assigned. Legacy directly assigns employees.
2. **Allocation lifecycle**: `tentative` -> `confirmed` -> `closed` with dedicated commands.
3. **Time-bounded allocations**: `startedAt`/`endedAt` on each allocation.
4. **Staffing analytics queries**: `get-staffing-overview`, `get-capacity-report`, `get-person-allocations`.
5. **Account-level billing model**: `fixed_price`, `t_and_m`, `dedicated`, `retainer`.
6. **Richer account entity**: client company, domain, location, timezone fields.
7. **`tentative` project status**.

### What the target is missing vs legacy

1. **Delete project** -- no `delete-project` command exists yet.
2. **Delete account** -- no `delete-account` command exists yet.
3. **Remove allocation / remove employee from project** -- no explicit deallocation command (only `close-allocation`).
4. **Developer settings** (JIRA/GitHub/Slack integration) -- intentionally excluded from target scope.
5. **Batch add employees** -- legacy supports adding multiple employees in one call; target creates allocations one at a time.
6. **Self-removal guard** -- legacy prevents users from removing themselves from a project.
7. **Project name uniqueness validation** -- legacy enforces unique names per account.
8. **Auto-add to parent account** -- legacy auto-adds employee to account when assigned to project.
9. **Permission-aware project listing** -- legacy filters projects by user role; target delegates this to kernel authority.

---

## Dependencies

### Legacy dependencies

- **Employee module**: `EmployeeRepository.get_employee_by_id()` validates employee existence during allocation.
- **Account module**: `AccountRepository.get()`, `get_employee_in_account()`, `add_employee()` -- manages account membership when assigning to projects.
- **Role module**: `RoleRepository` manages `EmployeeRole` records for project-scoped roles. `check_permission()` for authorization.
- **MinIO (S3)**: `MinioClient.get_media_url()` resolves employee avatar URLs in project employee listings.

### Target dependencies

- **People module**: For actor (person) references in allocations (`actorId`).
- **Kernel module**: For authority/permission checks (role_grant, role_permission).

---

## Migration Notes

### Account/Project hierarchy

- Legacy: flat `account_id` on project, basic account model.
- Target: enriched `Account` entity with client metadata, billing model, account manager. Projects still nested under accounts but with richer context.
- Legacy account employee management (`add_employee_to_account`, role assignment) is handled differently in target -- account membership may be implicit through allocations rather than explicit join-table management.

### Allocation model differences

| Legacy                                     | Target                                           |
| ------------------------------------------ | ------------------------------------------------ |
| `effort_percentage` (0.0000 -- 1.0000)     | `hoursPerDay` (0.00 -- e.g. 8.00)                |
| No lifecycle states                        | `tentative` -> `confirmed` -> `closed`           |
| No time bounds                             | `startedAt` required, `endedAt` optional         |
| Direct employee-to-project assignment      | Employee -> Allocation -> ProjectRole -> Project |
| `billing_type` string default `"Billable"` | `billing_type` enum `"billable"` (snake_case)    |
| `member_type` string default `"Core"`      | `member_type` enum `"core"` (snake_case)         |
| `position` on allocation                   | `position` on allocation (preserved)             |
| `updated_by` tracks who modified           | No `updated_by` -- audit via event sourcing      |

### Data migration considerations

- **Effort-to-hours conversion**: `effort_percentage` must be converted to `hoursPerDay`. Requires a conversion factor (e.g., 8h workday: `effort * 8 = hoursPerDay`). A value of `1.0000` (100%) becomes `8.00` hours/day.
- **ProjectRole backfill**: Legacy has no demand slots. Each unique `(project_id, position)` combination should generate a `ProjectRole` with `headcount` set to the count of employees in that position and `status = filled`.
- **Allocation status**: All legacy allocations are implicitly active/confirmed. Migrate as `status = confirmed`.
- **Enum value casing**: Transform `"Billable"` -> `"billable"`, `"Non-Billable"` -> `"non_billable"`, `"Core"` -> `"core"`, `"Shadow"` -> `"shadow"`, `"Backfill"` -> `"backfill"`.
- **ID type change**: `BigInteger` auto-increment -> UUIDv7. Requires ID mapping table during migration.
- **Tenant ID**: All migrated records need `tenant_id` assigned.
- **Developer settings**: `ProjectDeveloperSetting` and `EmployeeDeveloperSetting` have no equivalent in target. Data will not be migrated (credentials should not be ported anyway).
- **Role records**: Legacy `EmployeeRole` with `role_type = PROJECT` data moves to kernel's authority system, not into the projects module.
