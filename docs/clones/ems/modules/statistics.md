# Module: statistics

## Source -- service methods, repository queries

### StatisticalService (5 methods)

| Method                              | Params                               | Returns                       | Description                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_statistics`                | `account_id: int`                    | `AccountStatisticalDTO`       | Aggregates full account dashboard: project counts, allocated headcount, billable/non-billable split, role distribution, resource breakdown by member_type, and per-project role stats |
| `project_statistics`                | `project_id: int`                    | `ProjectStatisticalDTO`       | Project-level dashboard: resource breakdown by member_type, billable/non-billable counts, role distribution                                                                           |
| `account_employee_trend_statistics` | `account_id, start_date?, end_date?` | `EmployeeTrendStatisticalDTO` | Daily time-series of employee churn in account's projects (total/joined/left per day). Defaults to last 30 days                                                                       |
| `project_employee_trend_statistics` | `project_id, start_date?, end_date?` | `EmployeeTrendStatisticalDTO` | Daily time-series of employee churn within a single project. Defaults to last 30 days                                                                                                 |
| `employee_overview_statistics`      | `employee_id: int`                   | `EmployeeOverviewDTO`         | Employee personal dashboard: active project count, total effort %, billable/non-billable breakdown, full list of project assignments with details                                     |

### StatisticalRepository (12 query methods)

| Method                                        | SQL Pattern                                                  | Joins                                      | Description                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `count_project`                               | `COUNT(*)` on `projects`                                     | None                                       | Count projects filtered by optional account_id and status                                                             |
| `get_employee_role_count_in_account_projects` | `GROUP BY role_name`, `COUNT(employee_id)`                   | `employee_roles -> projects`               | Role distribution across all projects in an account                                                                   |
| `count_allocated_in_account_projects`         | `COUNT(project_employee.id)`                                 | `project_employee -> projects`             | Total allocated resources in account's projects                                                                       |
| `count_billable_resources`                    | `COUNT(DISTINCT employee_id)` x2                             | `project_employee -> projects`             | Returns (billable, non_billable) tuple. BUG: non-billable filter uses string `!= "Billable"` instead of enum          |
| `count_account_managers`                      | `COUNT(DISTINCT employee_id)`                                | `employee_roles`                           | Account managers with role_type=ACCOUNT, role_name=ACCOUNT_MANAGER                                                    |
| `get_account_resource_statistics`             | `GROUP BY member_type`, `COUNT(DISTINCT employee_id)`        | `project_employee -> projects`             | Resource breakdown by member_type (Core/Shadow/Backfill) for account                                                  |
| `count_employees_in_project`                  | `COUNT(DISTINCT employee_id)`                                | `project_employee -> projects`             | Headcount in project, filtered by optional billing_type/member_type                                                   |
| `get_employee_role_count_in_project`          | `GROUP BY role_name`, `COUNT(employee_id)`                   | `employee_roles`                           | Role distribution within a single project                                                                             |
| `get_project_resource_statistics`             | `GROUP BY member_type`, `COUNT(DISTINCT employee_id)`        | `project_employee -> projects`             | Resource breakdown by member_type for a single project                                                                |
| `get_account_employee_trend_statistics`       | `date_trunc('day')`, `CASE/SUM`                              | `project_employee -> projects`             | Daily time-series. BUG: joined/left CASE conditions are tautologies (always true), so joined=left=total for every day |
| `get_project_employee_trend_statistics`       | `date_trunc('day')`, `CASE/SUM`                              | `project_employee -> projects`             | Same pattern as account trend. Same CASE tautology bug                                                                |
| `get_employee_project_assignments`            | Multi-column SELECT, `ORDER BY status DESC, created_at DESC` | `projects -> project_employee -> accounts` | Full assignment list for an employee with project/account details, effort %, billing, dates, status                   |
| `get_role_statistics_by_projects`             | `GROUP BY project_id, project_name, role_name`               | `projects -> employee_roles`               | Per-project role breakdown for all projects in an account (role_type=PROJECT only)                                    |

### DTOs (Pydantic models)

| DTO                           | Fields                                                                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StatisticalValueDTO`         | `date?: date, name: str, value: int` -- generic name/value pair used everywhere                                                                                                                            |
| `AccountStatisticalDTO`       | `total_project, account_manager_count, active_projects, total_allocated, billable, non_billable, role: [StatisticalValueDTO], resource: [StatisticalValueDTO], project_roles: [ProjectRoleStatisticalDTO]` |
| `ProjectStatisticalDTO`       | `resource: [StatisticalValueDTO], total_billable, total_non_billable, role: [StatisticalValueDTO]`                                                                                                         |
| `ProjectRoleStatisticalDTO`   | `project_id, project_name, roles: [StatisticalValueDTO]`                                                                                                                                                   |
| `EmployeeTrendDTO`            | `date: str, total: int, joined: int, left: int`                                                                                                                                                            |
| `EmployeeTrendStatisticalDTO` | `trends: [EmployeeTrendDTO]`                                                                                                                                                                               |
| `ProjectAssignmentDTO`        | `id, account_id, project_name, account_name, role, billing_type, effort: float, start_date?, end_date?, status`                                                                                            |
| `EmployeeOverviewDTO`         | `active_projects, total_effort: float, billable_count, non_billable_count, project_assignments: [ProjectAssignmentDTO]`                                                                                    |

Note: `EmployeeTrendDTO` is defined twice in the DTO file (lines 15-20 and lines 68-73) with different shapes. The second definition (used by the service) shadows the first.

## Business Logic -- what reports/analytics are generated

### 1. Account Dashboard (`GET /statistical/account/{account_id}`)

- **Total/active project counts** for the account
- **Headcount metrics**: total allocated resources, billable vs non-billable split
- **Account manager count** (role-based lookup)
- **Resource breakdown by member type**: Core, Shadow, Backfill counts across all account projects
- **Role distribution**: aggregated role counts (PM, Employee, etc.) across all account projects
- **Per-project role breakdown**: each project listed with its own role distribution

### 2. Account Employee Trend (`GET /statistical/account/{account_id}/employee-trends`)

- **Daily time-series** of employee movement within account projects
- Date range defaults to last 30 days if not specified
- Tracks total headcount, new joins, and departures per day
- Note: trend logic has a bug -- joined/left CASE expressions are tautologies, so they always equal total

### 3. Project Dashboard (`GET /statistical/project/{project_id}`)

- **Resource breakdown by member type** (Core/Shadow/Backfill)
- **Billable vs non-billable headcount**
- **Role distribution** within the project

### 4. Project Employee Trend (`GET /statistical/project/{project_id}/employee-trends`)

- Same as account trend but scoped to a single project
- Same tautology bug in joined/left calculations

### 5. Employee Overview (`GET /statistical/employee/overview`)

- **Active project count** for the authenticated employee
- **Total effort percentage** (sum of effort_percentage \* 100 across active projects)
- **Billable/non-billable assignment count**
- **Full project assignment list** with: project name, account name, role (member_type), billing type, effort %, start/end dates, project status
- Uses JWT-extracted employee_id from request context

## API Endpoints -- all routes

All routes under prefix `/statistical`.

| Method | Path                                                | Auth                                | Params                   | Response                      |
| ------ | --------------------------------------------------- | ----------------------------------- | ------------------------ | ----------------------------- |
| `GET`  | `/statistical/account/{account_id}`                 | Request (JWT)                       | `account_id: int` (path) | `AccountStatisticalDTO`       |
| `GET`  | `/statistical/account/{account_id}/employee-trends` | Request (JWT)                       | `account_id: int` (path) | `EmployeeTrendStatisticalDTO` |
| `GET`  | `/statistical/project/{project_id}`                 | Request (JWT)                       | `project_id: int` (path) | `ProjectStatisticalDTO`       |
| `GET`  | `/statistical/project/{project_id}/employee-trends` | Request (JWT)                       | `project_id: int` (path) | `EmployeeTrendStatisticalDTO` |
| `GET`  | `/statistical/employee/overview`                    | Request (JWT, extracts employee_id) | None                     | `EmployeeOverviewDTO`         |

Notes:

- No authorization checks beyond JWT authentication -- any authenticated user can query any account/project stats
- The `account/{account_id}` endpoint handler is confusingly named `upload_avatar` (copy-paste error)
- Trend endpoints accept no query params for date range despite the service supporting them
- No pagination on any endpoint

## Target Overlap -- what exists in insights module

The `insights` module at `apps/api/src/modules/insights/` is a **skeleton with no implementation**:

| File                                           | Status                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `insights.module.ts`                           | Registers `InsightsQueryFacade` only                                                                                                        |
| `application/facades/insights-query.facade.ts` | Empty `@Injectable()` class with a TODO comment                                                                                             |
| `interface/trpc/insights.router.ts`            | Empty `router({})` with a TODO comment                                                                                                      |
| `infrastructure/schema/insights.schema.ts`     | Declares `pgSchema('insights')` with explicit comment: "No tables -- insights is a proxy-only module that delegates all queries to Cube.js" |
| `application/commands/`                        | `.gitkeep` only                                                                                                                             |
| `application/queries/`                         | `.gitkeep` only                                                                                                                             |
| `application/event-handlers/`                  | `.gitkeep` only                                                                                                                             |
| `domain/entities/`                             | `.gitkeep` only                                                                                                                             |
| `domain/value-objects/`                        | `.gitkeep` only                                                                                                                             |
| `domain/repositories/`                         | `.gitkeep` only                                                                                                                             |
| `infrastructure/repositories/`                 | `.gitkeep` only                                                                                                                             |

**Architecture mismatch**: The legacy `statistics` module runs direct SQL aggregation queries against the operational DB. The future `insights` module is designed as an analytics proxy to Athena (see CLAUDE.md: "Analytics: Glue ETL -> S3 Parquet -> Iceberg -> Athena"). The insights schema comment references Cube.js but CLAUDE.md says Athena. Either way, insights is not meant to hold tables or run direct DB queries.

**Key implication**: Legacy statistics queries run against `projects`, `project_employee`, `employee_roles`, and `accounts` tables. In the future architecture, these tables belong to the `projects` and `kernel` modules. The statistics functionality should either:

1. Live as query facades within the `projects` module (for project/account dashboards) and `people` module (for employee overview), or
2. Be served via the `insights` module as an Athena/analytics proxy once the ETL pipeline is operational

## Dependencies -- employee, contract, project data

### Database Tables Read (all in legacy single-schema)

| Table              | Owned By (Future)           | Fields Used                                                                                         |
| ------------------ | --------------------------- | --------------------------------------------------------------------------------------------------- |
| `projects`         | `projects` module           | `id, account_id, name, status, start_date, end_date, created_at`                                    |
| `project_employee` | `projects` module           | `id, employee_id, project_id, effort_percentage, billing_type, member_type, created_at, updated_at` |
| `employee_roles`   | `kernel` module (authority) | `id, employee_id, project_id, account_id, role_type, role_name`                                     |
| `accounts`         | `projects` module           | `id, name`                                                                                          |

### Enums

| Enum              | Values                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `ProjectStatus`   | `ACTIVE, ON_HOLD, CLOSED`                                                                    |
| `BillingTypeEnum` | `Billable, Non-Billable`                                                                     |
| `MemberTypeEnum`  | `Core, Shadow, Backfill`                                                                     |
| `RoleType`        | `Organization, Project, Account`                                                             |
| `RoleName`        | `Super Admin, HR, Executive, Account Manager, Project Manager, Employee, External/Part-time` |

### Cross-Module Reads Required (Future)

| Consumer          | Provider Module | Data Needed                                                    |
| ----------------- | --------------- | -------------------------------------------------------------- |
| Account dashboard | `projects`      | Project counts, project_employee aggregations, account details |
| Account dashboard | `kernel`        | Employee role counts (via `employee_roles`)                    |
| Project dashboard | `projects`      | project_employee aggregations                                  |
| Project dashboard | `kernel`        | Employee role counts                                           |
| Employee overview | `projects`      | Project assignments, effort %, billing type                    |
| Employee overview | `projects`      | Account name (via account join)                                |
| Trend statistics  | `projects`      | project_employee created_at for time-series                    |

### Service Dependencies

| Dependency              | Usage                                                        |
| ----------------------- | ------------------------------------------------------------ |
| `StatisticalRepository` | All data access (12 query methods)                           |
| `RoleRepository`        | Injected but **never used** in the service (dead dependency) |

## Migration Notes -- query translation from SQLAlchemy to Drizzle

### Architecture Decision Required

The legacy statistics module is a read-only aggregation layer over operational tables. In the future architecture, two paths exist:

**Option A: Query facades in owning modules** (recommended for MVP)

- `ProjectsQueryFacade` exposes aggregation methods for account/project dashboards
- `PeopleQueryFacade` or the projects facade exposes employee overview data
- `KernelQueryFacade` exposes role distribution queries
- The `insights` tRPC router orchestrates calls to these facades
- Pros: no cross-schema joins, respects module boundaries, works immediately
- Cons: multiple facade calls per dashboard (N+1 risk without careful batching)

**Option B: Athena analytics layer** (target architecture)

- ETL pipeline replicates project/employee/role data to S3 Parquet
- Athena queries replace all 12 repository methods
- `insights` module proxies to Athena via the analytics stack
- Pros: offloads analytical queries from operational DB, scales independently
- Cons: requires ETL pipeline, data latency, higher infrastructure complexity

### Query Translation Patterns (SQLAlchemy to Drizzle)

| SQLAlchemy Pattern               | Drizzle Equivalent                                                    |
| -------------------------------- | --------------------------------------------------------------------- |
| `db.query(Model).filter(...)`    | `db.select().from(table).where(...)`                                  |
| `func.count(func.distinct(col))` | `countDistinct(col)`                                                  |
| `func.count(col)`                | `count(col)`                                                          |
| `func.sum(case(...))`            | `sum(sql\`CASE WHEN ... THEN 1 ELSE 0 END\`)`or Drizzle`sql` template |
| `func.date_trunc('day', col)`    | `sql\`date_trunc('day', ${col})\``                                    |
| `.group_by(col)`                 | `.groupBy(col)`                                                       |
| `.order_by(col.desc())`          | `.orderBy(desc(col))`                                                 |
| `.join(B, A.col == B.col)`       | `.innerJoin(tableB, eq(tableA.col, tableB.col))`                      |
| `.scalar() or 0`                 | Result access via `rows[0]?.count ?? 0`                               |
| `Numeric(5,4)` column            | `numeric({ precision: 5, scale: 4 })` in Drizzle schema               |

### Bugs to Fix During Migration

1. **Trend tautology bug**: `get_account_employee_trend_statistics` and `get_project_employee_trend_statistics` have CASE expressions that compare `date_trunc('day', created_at) == date_trunc('day', created_at)` -- always true. The intent was likely to compare against a specific join/leave date column. Fix: use proper `start_date`/`end_date` or a status change event log.

2. **Non-billable filter inconsistency**: `count_billable_resources` uses `BillingTypeEnum.BILLABLE` for billable count but raw string `!= "Billable"` for non-billable. Fix: use `BillingTypeEnum.NON_BILLABLE` enum consistently.

3. **Dead dependency**: `RoleRepository` is injected into `StatisticalService` but never called. Remove.

4. **Duplicate DTO**: `EmployeeTrendDTO` defined twice with different shapes. The first definition (with `employee_name` and `trend` list) is shadowed by the second (with `total`, `joined`, `left`).

5. **Missing authorization**: No permission checks -- any authenticated user can view any account/project statistics. Future implementation must use kernel authority (RLS + role_permission checks).

6. **Missing date range params**: Router does not pass `start_date`/`end_date` query params to trend endpoints despite the service supporting them.

7. **Missing tenant_id**: All queries lack tenant scoping. Future queries must include `tenant_id` filtering (enforced via RLS in the future architecture).

8. **Handler naming**: `upload_avatar` function name on the account statistics endpoint is a copy-paste error.

9. **Effort calculation**: `total_effort = effort_percentage * 100` suggests `effort_percentage` is stored as a decimal (e.g., 0.75 = 75%). Verify the storage format matches the future schema and adjust calculation accordingly.
