# People & Projects Module Design

**Date:** 2026-04-11  
**Status:** Approved (revised after code review)  
**Scope:** Two separate implementation specs — People first, Projects second  
**Author:** Brainstorming session with Canh Ta

---

## Context

Future replaces SETA's legacy EMS (Employee Management System), which combined HR master data,
account/project staffing, contract administration, and offboarding into one Python/FastAPI monolith.

**Critical pain points driving this design:**

- EMS, Timesheet, Review, and Audit each maintain separate employee records — every
  create/update/delete must be done manually in all four tools
- No company-wide project/staffing dashboard — scattered across Google Sheets
- Manual onboarding/offboarding coordination via Jira tickets, Teams messages, and Outlook emails
- No template-driven contract generation

**Reference systems consulted:** Workday HCM, BambooHR, Personio, SAP SuccessFactors, Runn,
Harvest+Forecast, Teamwork, SAP RM

---

## Architecture Approach

**BambooHR-style, SME-first** — simple employment profile (no Position entity), field-level approval
for sensitive changes, configurable checklist templates for onboarding/offboarding. Can evolve to
position-based (Workday) model when headcount exceeds ~500.

One Personio borrowing: `employment_type` is a first-class field that drives checklist template
selection and sets up v2 contract lifecycle cleanly.

The kernel `actor` is the permanent identity. `people.employment_profile` is the engagement record
layered on top — following the Workday principle of separating person from employment.

**Single source of truth for org placement:** `department_id` and `manager_id` are **not** stored
on `employment_profile`. The kernel `core.org_placement` is the authoritative temporal record for
department and manager. People reads this via `KernelQueryFacade` at query time. No denormalized
copies.

---

## Kernel Schema Changes (applied before People/Projects implementation)

The following kernel schema additions are required and have already been applied:

| Change                                               | File                         | Reason                                                                       |
| ---------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| Added `comment` to `decision_outcome`                | `decision-outcome.schema.ts` | Rejection reason storage for profile change and offboarding approval flows   |
| Added `comment` to `decision_step`                   | `decision-step.schema.ts`    | Per-step reviewer notes                                                      |
| Added `project_manager` to `role_grant.roleKey` enum | `role-grant.schema.ts`       | PM scoped to a project; distinct from `staffing_owner` (resource allocation) |

**`actor.status` on termination:** When employment terminates, the offboarding handler must call
`KernelQueryFacade` to transition `actor.status → inactive` and `user_identity.status →
deprovisioned`. The kernel `actor` already supports `inactive`; `user_identity` already supports
`deprovisioned`. No schema change needed — only explicit handler responsibility documented here.

---

## People Module

### Schema: `people`

#### `employment_profile`

The engagement record — one per actor. Department and manager are **not** here; read from
`core.org_placement`.

| Column                     | Type      | Notes                                                         |
| -------------------------- | --------- | ------------------------------------------------------------- |
| `id`                       | uuid v7   | PK                                                            |
| `tenant_id`                | uuid      | notNull, RLS                                                  |
| `actor_id`                 | uuid      | soft ref to `core.actor` — no FK across schemas               |
| `employee_code`            | text      | human-readable, e.g. "SETA-0042"                              |
| `company_email`            | text      | generated on `seta-international.vn` domain                   |
| `employment_type`          | enum      | `permanent \| fixed_term \| contractor \| intern`             |
| `employment_status`        | enum      | `pre_hire \| active \| on_leave \| offboarding \| terminated` |
| `work_arrangement`         | enum      | `onsite \| hybrid \| remote`                                  |
| `hire_date`                | timestamp |                                                               |
| `termination_date`         | timestamp | nullable                                                      |
| `job_title`                | text      |                                                               |
| `job_level`                | text      | e.g. "L4", "Senior"                                           |
| `cost_center`              | text      | for Finance module integration                                |
| `created_at`, `updated_at` | timestamp |                                                               |

**Employment status state machine:**

```
pre_hire → active → on_leave → active   (return from leave)
                 → offboarding → terminated
on_leave → offboarding → terminated     (resign while on leave)
```

Terminal state: `terminated`. No transitions out.

#### `employment_profile_detail`

Sensitive fields — HR-only readable (RLS enforced). Employees can read their own via
`actor_id = self` check.

| Column                                              | Type                       |
| --------------------------------------------------- | -------------------------- | -------------------------------------------------------------- |
| `profile_id`                                        | FK to `employment_profile` |
| `national_id`                                       | text                       |
| `national_id_issued_date`                           | date                       |
| `national_id_issued_place`                          | text                       |
| `old_national_id`                                   | text                       | (prior identity number, Vietnam compliance)                    |
| `old_national_id_issued_date`                       | date                       |
| `old_national_id_issued_place`                      | text                       |
| `tax_id`                                            | text                       |
| `social_insurance_number`                           | text                       |
| `bank_account_number`, `bank_name`, `bank_branch`   | text                       |
| `dob`                                               | date                       |
| `gender`                                            | text                       |
| `marital_status`                                    | text                       |
| `permanent_address`                                 | text                       | Vietnam compliance — differs from current address              |
| `current_address`                                   | text                       |                                                                |
| `personal_phone`, `personal_email`                  | text                       |
| `emergency_contact_name`, `emergency_contact_phone` | text                       |
| `motorbike_plate`                                   | text                       | Vietnam compliance — used in some insurance/facility workflows |

#### `profile_section`

Free-form extensible sections (education, skills, languages, certifications, social links,
dependents).

| Column          | Type    | Notes                                                                         |
| --------------- | ------- | ----------------------------------------------------------------------------- |
| `id`            | uuid v7 |                                                                               |
| `tenant_id`     | uuid    |                                                                               |
| `profile_id`    | uuid    | FK to `employment_profile`                                                    |
| `section_type`  | enum    | `education \| certification \| skill \| language \| social_link \| dependent` |
| `payload`       | jsonb   | flexible schema per section type                                              |
| `display_order` | int     |                                                                               |

**`dependent` payload shape** (for Vietnam social insurance reporting):

```json
{ "fullName": "string", "dob": "date", "relationship": "child | spouse | parent" }
```

#### `profile_change_request`

Field-level approval — the Personio standard. Replaces the legacy EMS "full draft copy" pattern.

Uniqueness rule: only one `pending` request per `(profile_id, field_path)` at a time. A new
request on the same field supersedes the prior pending one (set prior to `superseded`, create new
`pending`).

| Column                        | Type      | Notes                                                |
| ----------------------------- | --------- | ---------------------------------------------------- |
| `id`                          | uuid v7   |                                                      |
| `tenant_id`                   | uuid      |                                                      |
| `profile_id`                  | uuid      |                                                      |
| `field_path`                  | text      | e.g. `"detail.bank_account_number"`                  |
| `old_value`, `new_value`      | jsonb     |                                                      |
| `status`                      | enum      | `pending \| approved \| rejected \| superseded`      |
| `decision_case_id`            | uuid      | soft ref to `core.decision_case` (approval envelope) |
| `requested_by`, `reviewed_by` | uuid      | soft refs to `core.actor`                            |
| `created_at`                  | timestamp |                                                      |

Rejection comment is stored on `core.decision_outcome.comment` (kernel already has this field).

**Field approval classification:**

| Field category                                      | Who can edit | Approval required                     |
| --------------------------------------------------- | ------------ | ------------------------------------- |
| Address, emergency contact, social links, hobbies   | Employee     | No — direct write                     |
| Bank account, tax ID, national ID, social insurance | Employee     | Yes — HR approval via `decision_case` |
| Salary, employment status, job title, department    | HR only      | N/A (no self-service)                 |
| Employee code, company email, hire date, actor ID   | System only  | N/A                                   |

#### `periodic_profile_review`

Scheduled prompt for employees to verify their profile data is current.

| Column         | Type      | Notes                             |
| -------------- | --------- | --------------------------------- |
| `id`           | uuid v7   |                                   |
| `tenant_id`    | uuid      |                                   |
| `profile_id`   | uuid      |                                   |
| `due_date`     | timestamp |                                   |
| `status`       | enum      | `pending \| completed \| skipped` |
| `completed_at` | timestamp | nullable                          |

Scheduled by pg-boss on a configurable cadence (default: every 3 months). Employee confirms or
submits changes via the normal profile-change flow.

#### Onboarding / Offboarding Tables

**`onboarding_template`** — configurable per `employment_type`; one `is_default` template per
tenant serves as fallback when no `employment_type` match exists.

| Column            | Type    | Notes                                       |
| ----------------- | ------- | ------------------------------------------- |
| `id`              | uuid v7 |                                             |
| `tenant_id`       | uuid    |                                             |
| `name`            | text    |                                             |
| `employment_type` | enum    | nullable — null = default/fallback template |
| `is_default`      | boolean | true = used when no employment_type match   |
| `is_active`       | boolean |                                             |

**`onboarding_task_template`** — tasks within a template

- `assignee_role`: `hr | it | project_manager | employee`
- `due_days_after_hire`: offset from hire_date
- `is_required`: blocks case completion if not done

**`onboarding_case`** — instantiated when actor enters `pre_hire`

- Status: `in_progress | completed`
- If no matching template exists and no default template is configured → case created with status
  `in_progress`, zero tasks, warning event fired to HR

**`onboarding_task`** — instantiated from template, with `due_date`, `completed_at`, `evidence_url`

**`offboarding_template`** — same structure as `onboarding_template`, adds `reason_category` for
matching:

- `reason_category`: `voluntary | involuntary | redundancy | end_of_contract | null` (null =
  applies to all reasons)
- Template matched by `employment_type` + `reason_category`. Falls back to null-category template
  if no specific match.

**`offboarding_task_template`** — same as onboarding, `assignee_role` adds `account_manager`

**`offboarding_case`**

- Status: `pending | approved | processing | completed | rejected`
- `pending → approved`: HR approves via `decision_case`
- `approved → processing`: triggered when all `offboarding_task` records are generated
- `processing → completed`: triggered when all `is_required` tasks are completed
- `pending → rejected`: HR rejects; rejection comment stored on `decision_outcome.comment`

**`offboarding_task`** — same structure as `onboarding_task`

**`account_membership`** — tracks which actors belong to which account independent of project
allocations

| Column       | Type      | Notes                                         |
| ------------ | --------- | --------------------------------------------- |
| `id`         | uuid v7   |                                               |
| `tenant_id`  | uuid      |                                               |
| `account_id` | uuid      | soft ref to `projects.account`                |
| `actor_id`   | uuid      | soft ref to `core.actor`                      |
| `role_key`   | text      | `account_manager \| staffing_owner \| member` |
| `joined_at`  | timestamp |                                               |
| `left_at`    | timestamp | nullable — null = current member              |

Account memberships are removed as part of offboarding completion (side effect, same transaction
as `employment_status → terminated`).

#### `contract_version` (stub — full lifecycle in People v2)

Minimal table to preserve contract data during EMS migration and block data loss at v1 launch.
Full contract lifecycle (template generation, expiry reminders, evaluation workflow) is v2 scope.

| Column               | Type      | Notes                                       |
| -------------------- | --------- | ------------------------------------------- |
| `id`                 | uuid v7   |                                             |
| `tenant_id`          | uuid      |                                             |
| `profile_id`         | uuid      | FK to `employment_profile`                  |
| `contract_type`      | text      | e.g. "Permanent", "Fixed-term 1 year"       |
| `status`             | enum      | `draft \| active \| expired \| terminated`  |
| `started_at`         | timestamp |                                             |
| `ended_at`           | timestamp | nullable — null = indefinite                |
| `probation_end_date` | timestamp | nullable                                    |
| `note`               | text      | free text until v2 template engine is built |
| `created_at`         | timestamp |                                             |

EMS remains authoritative for contract document generation until People v2 ships. The stub table
ensures migrated contract records have a home in Future's schema from day one.

---

### People tRPC Routes

```typescript
// Profile
people.getProfile(actorId)                    // RLS-enforced; detail fields filtered by role
people.listEmployees(filters)                 // paginated; hr_ops/line_manager scoped
people.updateProfileDirect(profileId, data)   // non-sensitive fields; employee self-service
people.requestProfileChange(fieldPath, newValue) // sensitive fields; creates decision_case
people.approveProfileChange(requestId)        // hr_ops only; writes decision_outcome
people.rejectProfileChange(requestId, comment) // hr_ops only; comment → decision_outcome
people.listProfileChangeRequests(filters)     // HR approval queue

// Onboarding
people.createOnboardingCase(profileId)        // manual trigger; also fired via OfferAcceptedEvent
people.listOnboardingTasks(caseId)
people.completeTask(taskId, evidence?)
people.listOnboardingTemplates()
people.createOnboardingTemplate(data)         // hr_ops only
people.updateOnboardingTemplate(id, data)     // hr_ops only

// Offboarding
people.triggerOffboarding(profileId, reason, reasonCategory)
people.approveOffboarding(caseId)             // hr_ops only
people.rejectOffboarding(caseId, comment)     // hr_ops only
people.listOffboardingTemplates()
people.createOffboardingTemplate(data)        // hr_ops only
people.updateOffboardingTemplate(id, data)    // hr_ops only

// Timeline & contracts
people.getEmploymentTimeline(actorId)         // org_placement history via KernelQueryFacade
people.listContractVersions(profileId)        // stub v1 — full lifecycle v2
people.createContractVersion(profileId, data) // stub v1

// Periodic review
people.listPeriodicReviews(filters)           // HR view — who is overdue
people.completePeriodicReview(reviewId)       // employee confirms profile is current
```

---

### People Workflows

#### Workflow 1: Employee Onboarding (Hiring → People)

```
1. Hiring fires OfferAcceptedEvent { actorId, tenantId, employmentType, hireDate }
2. People handler:
   - create employment_profile (status: pre_hire)
   - match onboarding_template by employment_type; fall back to is_default=true template
   - if no template found: create onboarding_case (0 tasks), fire HR warning notification
   - else: create onboarding_case + onboarding_task records with computed due_dates
3. pg-boss schedules notifications to each assignee (it, project_manager, hr, employee)
4. Assignees complete tasks → onboarding_task.status: completed
5. All is_required tasks done → employment_status: pre_hire → active
6. outbox_event fires EmployeeActivatedEvent { actorId, tenantId, employeeCode, companyEmail }
   → Time module: creates attendance profile
   → Review module: registers reviewer
   → Audit module: registers employee
```

#### Workflow 2: Field-Level Profile Change (Sensitive Field)

```
1. Employee submits change to sensitive field (e.g. bank_account_number)
2. Check: existing pending request on same field_path?
   - Yes: set existing to status: superseded
3. Create profile_change_request (status: pending)
   + create decision_case in kernel (module: "people", subject: actor_id)
   + create decision_step (approverId: any hr_ops actor)
4. HR sees pending requests in approval queue
5a. HR approves:
    - decision_step.status: approved
    - decision_outcome { finalAction: approved, decidedBy, comment? }
    - apply new_value to employment_profile_detail field
    - profile_change_request.status: approved
5b. HR rejects:
    - decision_step.status: rejected
    - decision_outcome { finalAction: rejected, decidedBy, comment: rejection reason }
    - profile_change_request.status: rejected
    - employee notified with comment
6. audit_event written in both cases (immutable INSERT-only)
```

#### Workflow 3: Offboarding

```
1. Employee or HR calls triggerOffboarding(profileId, reason, reasonCategory)
2. decision_case created — HR must approve before tasks are assigned
3a. HR approves:
    - employment_status: → offboarding
    - match offboarding_template by (employment_type, reason_category); fall back to null-category
    - offboarding_case.status: approved
    - generate offboarding_task records from template
    - offboarding_case.status: processing  (transition on task generation completion)
    - outbox_event fires OffboardingStartedEvent { actorId, tenantId, expectedLastDay }
      → Projects: flag active allocations (status: tentative); notify project_managers
      → Time: block future leave request creation
3b. HR rejects:
    - decision_outcome.comment: rejection reason
    - employee notified

4. Assignees complete tasks (pm, it, hr, employee, account_manager tasks)
5. All is_required tasks done → HR marks case complete
6. employment_status: → terminated  (atomic — all in one transaction):
    - termination_date set
    - KernelQueryFacade: actor.status → inactive
    - KernelQueryFacade: user_identity.status → deprovisioned  (session invalidation)
    - KernelQueryFacade: role_grants revoked (all grants for this actor)
    - account_membership.left_at set for all active memberships
    - offboarding_case.status: completed
7. outbox_event fires EmployeeTerminatedEvent { actorId, tenantId, terminationDate }
   → Projects: auto-close all confirmed allocations; reopen project_roles
   → Time: close attendance profile
   → Review: deactivate reviewer assignments
   → Audit: deactivate employee record
```

---

## Projects Module

### Schema: `projects`

#### `account`

Client/commercial container. One account → many projects.

| Column                   | Type      | Notes                                             |
| ------------------------ | --------- | ------------------------------------------------- |
| `id`                     | uuid v7   |                                                   |
| `tenant_id`              | uuid      |                                                   |
| `name`                   | text      |                                                   |
| `client_company`         | text      |                                                   |
| `description`            | text      | nullable                                          |
| `domain`                 | text      | e.g. "fintech", "healthcare"                      |
| `location`, `timezone`   | text      |                                                   |
| `billing_model`          | enum      | `fixed_price \| t_and_m \| dedicated \| retainer` |
| `status`                 | enum      | `active \| on_hold \| closed`                     |
| `account_manager_id`     | uuid      | soft ref to `core.actor`                          |
| `started_at`, `ended_at` | timestamp |                                                   |

#### `project`

Delivery unit under an account.

| Column                   | Type      | Notes                                      |
| ------------------------ | --------- | ------------------------------------------ |
| `id`                     | uuid v7   |                                            |
| `tenant_id`              | uuid      |                                            |
| `account_id`             | uuid      | soft ref to `projects.account`             |
| `name`, `code`           | text      | e.g. "PRJ-042"                             |
| `description`            | text      | nullable                                   |
| `delivery_model`         | enum      | `scrum \| kanban \| waterfall \| other`    |
| `status`                 | enum      | `active \| on_hold \| closed \| tentative` |
| `started_at`, `ended_at` | timestamp |                                            |
| `tags`                   | jsonb     |                                            |

#### `project_role`

Named demand slot — exists before a person is assigned (Runn pattern).

| Column            | Type    | Notes                                         |
| ----------------- | ------- | --------------------------------------------- |
| `id`              | uuid v7 |                                               |
| `tenant_id`       | uuid    |                                               |
| `project_id`      | uuid    |                                               |
| `role_name`       | text    | e.g. "Senior DevOps", "BA", "QA"              |
| `skills_required` | text[]  | used for text search (embedding search in v2) |
| `headcount`       | int     | how many people needed in this role           |
| `status`          | enum    | `open \| filled \| cancelled`                 |

#### `allocation`

Supply side — person assigned to a project role. Implements Runn's hours-per-day model.

One actor can have N simultaneous allocations across different projects, each with its own
`hours_per_day`, `billing_type`, PM, and date range.

| Column                   | Type      | Notes                                                           |
| ------------------------ | --------- | --------------------------------------------------------------- |
| `id`                     | uuid v7   |                                                                 |
| `tenant_id`              | uuid      |                                                                 |
| `project_id`             | uuid      |                                                                 |
| `project_role_id`        | uuid      |                                                                 |
| `actor_id`               | uuid      | nullable — null = placeholder (unassigned capacity slot)        |
| `position`               | text      | specific title this person holds in this slot, e.g. "Tech Lead" |
| `hours_per_day`          | decimal   | replaces legacy `effort %`; correct under leave/part-time       |
| `billing_type`           | enum      | `billable \| non_billable`                                      |
| `member_type`            | enum      | `core \| shadow \| backfill`                                    |
| `status`                 | enum      | `tentative \| confirmed`                                        |
| `started_at`, `ended_at` | timestamp |                                                                 |
| `note`                   | text      |                                                                 |

**Hierarchy:**

```
account (client)
  └── project[]              one account → many projects
        └── project_role[]   named demand slots
              └── allocation[]  person assigned (actor_id nullable = placeholder)
```

**Capacity calculation (computed, not stored):**

```
available_hours/day  = standard_daily_hours (from TimeQueryFacade) − leave_hours
utilization%         = Σ(confirmed allocation.hours_per_day) / available_hours × 100
bench                = actors where utilization% < 20% AND employment_status = active
over-allocated       = actors where utilization% > 100%
```

`standard_daily_hours` default: 8h if `TimeQueryFacade` is unavailable (Time module not yet
deployed).

`tentative` allocations appear in planning views but are **excluded** from the confirmed
utilization calculation.

---

### Projects tRPC Routes

```typescript
// Accounts
projects.listAccounts(filters)
projects.getAccount(accountId) // includes projects summary
projects.createAccount(data)
projects.updateAccount(accountId, data)

// Account memberships
projects.listAccountMembers(accountId)
projects.addAccountMember(accountId, actorId, roleKey)
projects.removeAccountMember(accountId, actorId)

// Projects
projects.listProjects(accountId, filters)
projects.getProject(projectId)
projects.createProject(accountId, data)
projects.updateProject(projectId, data)

// Roles & allocation
projects.listProjectRoles(projectId) // open/filled demand slots
projects.createProjectRole(projectId, data)
projects.updateProjectRole(roleId, data)
projects.createAllocation(roleId, data) // actor_id nullable = placeholder
projects.confirmAllocation(allocationId)
projects.updateAllocation(allocationId, data)
projects.closeAllocation(allocationId)

// Reporting
projects.getStaffingOverview(filters) // company-wide utilization; BOD/HR/CDO
projects.getPersonAllocations(actorId) // all projects for one person
projects.getCapacityReport(dateRange) // bench + over-allocated + available
projects.getAccountStaffing(accountId) // all members + allocations under one account
```

---

### Projects Workflows

#### Workflow 1: Project Staffing (Demand → Supply)

```
1. PM creates project_role ("Senior DevOps", headcount: 2, skills: ["k8s","terraform"])
   project_role.status: open (placeholder — no person yet)
2. Resource manager searches available actors:
   - text search on skills_required vs profile_section skill payloads (v1)
   - capacity filter: available hours_per_day in date range
3. Resource manager creates allocation:
   actor_id, position, hours_per_day, status: tentative
4. PM reviews and confirms → allocation.status: confirmed
5. If no internal match → PM escalates to Hiring module
   (open project_role can generate a Hiring requisition)
```

#### Workflow 2: Offboarding Impact on Projects

```
Triggered by OffboardingStartedEvent:
1. Find all confirmed allocations for actor within future date range
2. Set allocation.status: tentative (PM must decide replacement)
3. Notify each affected project's project_manager via pg-boss

Triggered by EmployeeTerminatedEvent:
1. Close all open/tentative allocations (ended_at = termination_date)
2. Reopen corresponding project_roles (status: open)
3. Remove account_memberships (left_at = termination_date) — also done in People atomically
```

---

## Cross-Module Event Contracts

Defined in `packages/event-contracts` — zero NestJS/Drizzle deps, plain TypeScript.

```typescript
// people → others
OfferAcceptedEvent       { actorId: string; tenantId: string; employmentType: string; hireDate: string }
EmployeeActivatedEvent   { actorId: string; tenantId: string; employeeCode: string; companyEmail: string }
OffboardingStartedEvent  { actorId: string; tenantId: string; expectedLastDay: string }
EmployeeTerminatedEvent  { actorId: string; tenantId: string; terminationDate: string }

// projects → hiring (future)
StaffingRequestCreatedEvent { projectRoleId: string; projectId: string; tenantId: string; roleName: string; skillsRequired: string[] }
AllocationConfirmedEvent    { allocationId: string; actorId: string; projectId: string; hoursPerDay: number }
```

---

## Testing Requirements

Per CLAUDE.md: ≥70% coverage (lines, functions, branches). TDD — test first.

| Scope                                | What to test                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Unit — `TriggerOffboardingHandler`   | success; duplicate active case blocked; profile not found; `on_leave → offboarding` transition allowed                           |
| Unit — `RequestProfileChangeHandler` | sensitive field → creates `decision_case`; non-sensitive → direct write; existing pending superseded                             |
| Unit — `ApproveProfileChangeHandler` | applies value to `employment_profile_detail`; writes `decision_outcome`; `audit_event` created                                   |
| Unit — `CompleteOffboardingHandler`  | all required tasks done check; atomic side effects: actor inactive, identity deprovisioned, grants revoked, memberships closed   |
| Unit — `CreateAllocationHandler`     | actor not found; placeholder (null actor_id) allowed; over-allocation warning logged                                             |
| Integration (real DB)                | Full onboarding flow: `OfferAcceptedEvent` → profile created → tasks generated → activated                                       |
| Integration (real DB)                | Field-change approval mutates `employment_profile_detail` correctly                                                              |
| Integration (real DB)                | Capacity math: Σ hours across multiple simultaneous allocations, leave hours deducted                                            |
| Integration (real DB)                | Offboarding: `actor.status → inactive`, `user_identity.status → deprovisioned`, grants revoked, memberships closed, events fired |
| Integration (real DB)                | Profile-change supersession: second pending on same field supersedes first                                                       |
| E2E Playwright                       | Employee submits bank account change → HR approval queue → field updated                                                         |
| E2E Playwright                       | PM creates project role → resource manager allocates person → confirmed → appears in staffing overview                           |

---

## What Is Deferred (Not v1)

| Feature                                                                              | Deferred to                     |
| ------------------------------------------------------------------------------------ | ------------------------------- |
| Contract template engine, document generation, expiry reminders, evaluation workflow | People v2                       |
| Salary management (time-series compensation history)                                 | People v2 / Finance             |
| Position-based org modeling (Workday-style headcount planning)                       | Future if scale demands         |
| Embedding-based skills search for staffing                                           | Projects v2 (text search in v1) |
| Developer tool integration per project (JIRA/GitHub/Slack)                           | Projects v2                     |
| Self-service leave requests                                                          | Time module                     |

**EMS decommission plan for contracts:** EMS remains authoritative for contract document generation
until People v2 ships. The `contract_version` stub table in v1 stores migrated contract records.
EMS and Future share the same employee via `external_identity_map` (provider: `ems`,
externalId: EMS integer employee ID). No dual-write; Future reads EMS contract state as read-only
via a migration import, not a live sync.

---

## Key Design Decisions Summary

| Decision                          | Choice                                                     | Rationale                                                   |
| --------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| Org placement source of truth     | `core.org_placement` only; no copy in `employment_profile` | Avoids divergence; kernel owns temporal org data            |
| Profile change model              | Field-level approval + supersession rule                   | Personio/Workday standard; avoids race conditions           |
| Sensitive field rejection comment | Stored on `core.decision_outcome.comment`                  | Kernel already has this field (added in this revision)      |
| `project_manager` roleKey         | Added to `core.role_grant` enum                            | Required for PM-scoped permission checks                    |
| Allocation unit                   | `hours_per_day` not `effort %`                             | Correct capacity math on leave/part-time (Runn standard)    |
| Staffing model                    | Demand (`project_role`) → Supply (`allocation`)            | Decouples planning from assignment                          |
| Multi-project allocation          | One actor → N allocations                                  | Confirmed requirement; each with own PM, hours, billing     |
| Account → Project                 | One-to-many (`project.account_id`)                         | Confirmed requirement                                       |
| Account membership                | Separate `account_membership` table                        | Account-level belonging independent of project allocations  |
| Placeholder allocations           | `actor_id` nullable                                        | Capacity planning before person is known                    |
| Onboarding/offboarding            | Configurable templates + fallback default                  | Industry standard; eliminates manual task creation          |
| Offboarding template matching     | `employment_type` + `reason_category`                      | Voluntary vs involuntary exit needs different checklists    |
| Employment status                 | Explicit enum, no booleans                                 | `on_leave → offboarding` edge case documented               |
| Contract lifecycle                | Stub table in v1; full engine in v2                        | EMS stays authoritative for docs; stub prevents data loss   |
| EMS migration bridge              | `external_identity_map` with `provider: ems`               | Standard kernel pattern for legacy ID bridging              |
| `actor.status` on termination     | Handler responsibility to call `KernelQueryFacade`         | No schema change needed; kernel already supports `inactive` |
| Cross-module sync                 | Domain events via `outbox_event`                           | Replaces unreliable EMS webhooks                            |
| No cross-schema FKs               | Soft UUID references only                                  | Enforced by CLAUDE.md architecture rules                    |
