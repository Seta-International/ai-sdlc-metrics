# People & Projects Module Design

**Date:** 2026-04-11  
**Status:** Approved  
**Scope:** Two separate implementation specs — People first, Projects second  
**Author:** Brainstorming session with Canh Ta

---

## Context

Future replaces SETA's legacy EMS (Employee Management System), which combined HR master data, account/project staffing, contract administration, and offboarding into one Python/FastAPI monolith.

**Critical pain points driving this design:**

- EMS, Timesheet, Review, and Audit each maintain separate employee records — every create/update/delete must be done manually in all four tools
- No company-wide project/staffing dashboard — scattered across Google Sheets
- Manual onboarding/offboarding coordination via Jira tickets, Teams messages, and Outlook emails
- No template-driven contract generation

**Reference systems consulted:** Workday HCM, BambooHR, Personio, SAP SuccessFactors, Runn, Harvest+Forecast, Teamwork, SAP RM

---

## Architecture Approach

**BambooHR-style, SME-first** — simple employment profile (no Position entity), field-level approval for sensitive changes, configurable checklist templates for onboarding/offboarding. Can evolve to position-based (Workday) model when headcount exceeds ~500.

One Personio borrowing: `employment_type` is a first-class field that drives checklist template selection and sets up v2 contract lifecycle cleanly.

The kernel `actor` is the permanent identity. `people.employment_profile` is the engagement record layered on top — following the Workday principle of separating person from employment.

---

## People Module

### Schema: `people`

#### `employment_profile`

The engagement record — one per actor.

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
| `department_id`            | uuid      | soft ref to `core.department`                                 |
| `cost_center`              | text      | for Finance module integration                                |
| `manager_id`               | uuid      | soft ref to `core.actor` (line manager)                       |
| `created_at`, `updated_at` | timestamp |                                                               |

**Employment status state machine:**

```
pre_hire → active → on_leave → active (return from leave)
                 → offboarding → terminated
```

Terminal states: `terminated`. No transitions out of `terminated`.

#### `employment_profile_detail`

Sensitive fields — HR-only readable (RLS enforced). Employees can read their own via `actor_id = self` check.

| Column                                              | Type                       |
| --------------------------------------------------- | -------------------------- |
| `profile_id`                                        | FK to `employment_profile` |
| `national_id`, `tax_id`, `social_insurance_number`  | text                       |
| `bank_account_number`, `bank_name`, `bank_branch`   | text                       |
| `dob`                                               | date                       |
| `gender`                                            | text                       |
| `marital_status`                                    | text                       |
| `personal_phone`, `personal_email`                  | text                       |
| `emergency_contact_name`, `emergency_contact_phone` | text                       |

#### `profile_section`

Free-form extensible sections (education, skills, languages, certifications, social links).

| Column          | Type    | Notes                                                            |
| --------------- | ------- | ---------------------------------------------------------------- |
| `id`            | uuid v7 |                                                                  |
| `tenant_id`     | uuid    |                                                                  |
| `profile_id`    | uuid    | FK to `employment_profile`                                       |
| `section_type`  | enum    | `education \| certification \| skill \| language \| social_link` |
| `payload`       | jsonb   | flexible schema per section type                                 |
| `display_order` | int     |                                                                  |

#### `profile_change_request`

Field-level approval — the Personio standard. Replaces the legacy EMS "full draft copy" pattern.

| Column                        | Type      | Notes                               |
| ----------------------------- | --------- | ----------------------------------- |
| `id`                          | uuid v7   |                                     |
| `tenant_id`                   | uuid      |                                     |
| `profile_id`                  | uuid      |                                     |
| `field_path`                  | text      | e.g. `"detail.bank_account_number"` |
| `old_value`, `new_value`      | jsonb     |                                     |
| `status`                      | enum      | `pending \| approved \| rejected`   |
| `decision_case_id`            | uuid      | soft ref to `core.decision_case`    |
| `requested_by`, `reviewed_by` | uuid      | soft refs to `core.actor`           |
| `created_at`                  | timestamp |                                     |

**Field approval classification:**

| Field category                                      | Who can edit | Approval required                     |
| --------------------------------------------------- | ------------ | ------------------------------------- |
| Address, emergency contact, social links, hobbies   | Employee     | No — direct write                     |
| Bank account, tax ID, national ID, social insurance | Employee     | Yes — HR approval via `decision_case` |
| Salary, employment status, job title, department    | HR only      | N/A (no self-service)                 |
| Employee code, company email, hire date, actor ID   | System only  | N/A                                   |

#### Onboarding / Offboarding Tables

**`onboarding_template`** — configurable per `employment_type`  
**`onboarding_task_template`** — tasks within a template

- `assignee_role`: `hr | it | manager | employee`
- `due_days_after_hire`: offset from hire_date
- `is_required`: blocks case completion if not done

**`onboarding_case`** — instantiated when actor enters `pre_hire`  
**`onboarding_task`** — instantiated from template, with `due_date`, `completed_at`, `evidence_url`

**`offboarding_template`**, **`offboarding_task_template`** — same structure as onboarding  
**`offboarding_case`** — status: `pending | approved | processing | completed | rejected`  
**`offboarding_task`** — same structure as onboarding_task

---

### People tRPC Routes

```typescript
people.getProfile(actorId)                   // RLS-enforced; detail fields filtered by role
people.listEmployees(filters)                // paginated; HR/manager scoped
people.requestProfileChange(fieldPath, newValue)
people.approveProfileChange(requestId)       // hr_ops role only
people.listProfileChangeRequests()           // HR queue
people.createOnboardingCase(profileId)       // manual trigger; also fired via event
people.listOnboardingTasks(caseId)
people.completeTask(taskId, evidence?)
people.triggerOffboarding(profileId, reason)
people.approveOffboarding(caseId)            // hr_ops role only
people.getEmploymentTimeline(actorId)        // org_placement history from kernel via KernelQueryFacade
```

---

### People Workflows

#### Workflow 1: Employee Onboarding (Hiring → People)

```
1. Hiring fires OfferAcceptedEvent (actor_id, employment_type)
2. People handler: create employment_profile (status: pre_hire)
   + create onboarding_case from matching template (matched by employment_type)
   + generate onboarding_task records with computed due_dates
3. pg-boss schedules notifications to each assignee (IT, manager, HR, employee)
4. Assignees complete tasks → onboarding_task.status: completed
5. All required tasks done → employment_status: pre_hire → active
6. outbox_event fires EmployeeActivatedEvent
   → Time module creates attendance profile
   → Review module registers reviewer
   → Audit module registers employee
```

#### Workflow 2: Field-Level Profile Change (Sensitive Field)

```
1. Employee submits change to sensitive field (e.g. bank_account_number)
2. System creates profile_change_request (status: pending)
   + creates decision_case in kernel (module: "people", subject: actor_id)
3. HR sees pending requests in approval queue
4. HR approves → decision_case resolved → change applied to employment_profile_detail
   HR rejects → decision_case rejected → employee notified with comment
5. audit_event written in both cases (immutable, INSERT-only)
```

#### Workflow 3: Offboarding

```
1. Employee or HR triggers offboarding (triggerOffboarding command)
2. decision_case created — HR must approve before tasks are assigned
3. HR approves:
   - employment_status: active → offboarding
   - offboarding_case created from template (matched by employment_type)
   - offboarding_task records generated
4. outbox_event fires OffboardingStartedEvent
   → Projects: flag actor's active allocations (PM notified to reassign)
   → Time: block future leave requests
5. All required tasks completed → HR marks case complete
6. employment_status: offboarding → terminated
   - role_grants revoked in kernel (via KernelQueryFacade command)
   - EmployeeTerminatedEvent fired
   → Projects: auto-close open allocations
   → Time, Review, Audit: deactivate records
```

---

## Projects Module

### Schema: `projects`

#### `account`

Client/commercial container.

| Column                   | Type      | Notes                                             |
| ------------------------ | --------- | ------------------------------------------------- |
| `id`                     | uuid v7   |                                                   |
| `tenant_id`              | uuid      |                                                   |
| `name`                   | text      |                                                   |
| `client_company`         | text      |                                                   |
| `domain`                 | text      | e.g. "fintech", "healthcare"                      |
| `location`, `timezone`   | text      |                                                   |
| `billing_model`          | enum      | `fixed_price \| t_and_m \| dedicated \| retainer` |
| `status`                 | enum      | `active \| on_hold \| closed`                     |
| `account_manager_id`     | uuid      | soft ref to `core.actor`                          |
| `started_at`, `ended_at` | timestamp |                                                   |

One account → many projects (1:N via `project.account_id`).

#### `project`

Delivery unit under an account.

| Column                   | Type      | Notes                                      |
| ------------------------ | --------- | ------------------------------------------ |
| `id`                     | uuid v7   |                                            |
| `tenant_id`              | uuid      |                                            |
| `account_id`             | uuid      | soft ref to `projects.account`             |
| `name`, `code`           | text      | e.g. "PRJ-042"                             |
| `delivery_model`         | enum      | `scrum \| kanban \| waterfall \| other`    |
| `status`                 | enum      | `active \| on_hold \| closed \| tentative` |
| `started_at`, `ended_at` | timestamp |                                            |
| `tags`                   | jsonb     |                                            |

#### `project_role`

Named demand slot — exists before a person is assigned (Runn pattern).

| Column            | Type    | Notes                            |
| ----------------- | ------- | -------------------------------- |
| `id`              | uuid v7 |                                  |
| `tenant_id`       | uuid    |                                  |
| `project_id`      | uuid    |                                  |
| `role_name`       | text    | e.g. "Senior DevOps", "BA", "QA" |
| `skills_required` | text[]  | used for embedding-based search  |
| `headcount`       | int     | how many people needed           |
| `status`          | enum    | `open \| filled \| cancelled`    |

#### `allocation`

Supply side — person assigned to a project role. Implements Runn's hours-per-day model.

| Column                   | Type      | Notes                                      |
| ------------------------ | --------- | ------------------------------------------ |
| `id`                     | uuid v7   |                                            |
| `tenant_id`              | uuid      |                                            |
| `project_id`             | uuid      |                                            |
| `project_role_id`        | uuid      |                                            |
| `actor_id`               | uuid      | nullable — null = placeholder (unassigned) |
| `hours_per_day`          | decimal   | replaces legacy `effort %`                 |
| `billing_type`           | enum      | `billable \| non_billable`                 |
| `member_type`            | enum      | `core \| shadow \| backfill`               |
| `status`                 | enum      | `tentative \| confirmed`                   |
| `started_at`, `ended_at` | timestamp |                                            |
| `note`                   | text      |                                            |

**Multi-project rule:** One actor can have N simultaneous `allocation` records across different projects, each with its own `hours_per_day`, `billing_type`, PM, and date range.

**Capacity calculation (computed, not stored):**

```
available_hours/day  = standard_daily_hours − leave_hours  (leave from TimeQueryFacade)
utilization %        = Σ(confirmed allocation hours_per_day) / available_hours × 100
bench                = actors where utilization% < 20% AND employment_status = active
over-allocated       = actors where utilization% > 100%
```

`tentative` allocations appear in planning views but are excluded from the confirmed utilization calculation.

---

### Projects tRPC Routes

```typescript
projects.listAccounts(filters)
projects.getAccount(accountId) // includes projects summary
projects.createAccount(data)
projects.updateAccount(accountId, data)
projects.listProjects(accountId, filters)
projects.getProject(projectId)
projects.createProject(accountId, data)
projects.updateProject(projectId, data)
projects.listProjectRoles(projectId) // open/filled demand slots
projects.createProjectRole(projectId, data)
projects.createAllocation(roleId, data) // actor_id nullable = placeholder
projects.confirmAllocation(allocationId)
projects.updateAllocation(allocationId, data)
projects.closeAllocation(allocationId)
projects.getStaffingOverview(filters) // company-wide utilization table (BOD/HR)
projects.getPersonAllocations(actorId) // all projects for one person
projects.getCapacityReport(dateRange) // bench + over-allocated + available
```

---

### Projects Workflows

#### Workflow 1: Project Staffing (Demand → Supply)

```
1. PM creates project_role ("Senior DevOps", headcount: 2, skills: ["k8s","terraform"])
   project_role.status: open (placeholder — no person yet)
2. Resource manager searches available actors:
   - embedding similarity on skills_required vs profile_section skills
   - capacity filter: available hours_per_day in date range
3. Resource manager creates allocation:
   actor_id, hours_per_day, status: tentative
4. PM reviews and confirms → allocation.status: confirmed
5. If no internal match → PM escalates to Hiring module
   (open project_role can generate a Hiring requisition)
```

#### Workflow 2: Offboarding Impact on Projects

```
Triggered by OffboardingStartedEvent from People module:
1. Find all confirmed allocations for actor within future date range
2. Set allocation.status: tentative (not closed — PM must decide)
3. Fire notification to each affected project's PM via pg-boss
4. PM reassigns → creates new allocation for replacement actor
   or extends placeholder → project_role.status: open again

Triggered by EmployeeTerminatedEvent:
1. Close all open/tentative allocations for actor
2. Reopen corresponding project_roles (status: open)
```

---

## Cross-Module Event Contracts

Defined in `packages/event-contracts` — zero NestJS/Drizzle deps, plain TypeScript.

```typescript
// people → others
OfferAcceptedEvent          { actorId, tenantId, employmentType, hireDate }
EmployeeActivatedEvent      { actorId, tenantId, employeeCode, companyEmail }
OffboardingStartedEvent     { actorId, tenantId, expectedLastDay }
EmployeeTerminatedEvent     { actorId, tenantId, terminationDate }

// projects → others (future)
StaffingRequestCreatedEvent { projectRoleId, tenantId, roleNam, skillsRequired }
AllocationConfirmedEvent    { allocationId, actorId, projectId, hoursPerDay }
```

---

## Testing Requirements

Per CLAUDE.md: ≥70% coverage (lines, functions, branches). TDD — test first.

| Scope                   | What to test                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Unit — command handlers | Happy path + every error path per handler                                                            |
| Unit — key handlers     | `TriggerOffboardingHandler`: success, duplicate active offboarding blocked, profile not found        |
| Unit — key handlers     | `RequestProfileChangeHandler`: sensitive field → creates decision_case; non-sensitive → direct write |
| Unit — key handlers     | `CreateAllocationHandler`: actor not found, over-allocation warning, placeholder allowed             |
| Integration (real DB)   | Full onboarding flow end-to-end with real PostgreSQL                                                 |
| Integration (real DB)   | Field-change approval mutates `employment_profile_detail` correctly                                  |
| Integration (real DB)   | Capacity math: Σ hours across multiple allocations, leave blocks deducted                            |
| Integration (real DB)   | Offboarding: role_grants revoked, allocations flagged, events fired                                  |
| E2E Playwright          | Employee submits bank account change → HR approval queue → field updated                             |
| E2E Playwright          | PM creates project role → resource manager allocates person → confirmed                              |

---

## What Is Deferred (Not v1)

| Feature                                                                                    | Deferred to                         |
| ------------------------------------------------------------------------------------------ | ----------------------------------- |
| Contract lifecycle (versioned contracts, template-driven doc generation, expiry reminders) | People v2                           |
| Salary management (time-series compensation history)                                       | People v2 / Finance                 |
| Position-based org modeling (Workday-style headcount planning)                             | Future if scale demands             |
| Embedding-based skills search for staffing                                                 | Projects v2 (use text search in v1) |
| Developer tool integration per project (JIRA/GitHub/Slack per ProjectDeveloperSetting)     | Projects v2                         |
| Self-service leave requests                                                                | Time module                         |

---

## Key Design Decisions Summary

| Decision                 | Choice                                          | Rationale                                                               |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------- |
| Profile change model     | Field-level approval                            | Personio/Workday standard; avoids race conditions of full-draft copy    |
| Allocation unit          | `hours_per_day` not `effort %`                  | Correct capacity math on leave/part-time (Runn standard)                |
| Staffing model           | Demand (`project_role`) → Supply (`allocation`) | Decouples planning from assignment; enables hiring pipeline integration |
| Multi-project allocation | One actor → N allocations                       | Confirmed requirement; each has own PM, hours, billing, dates           |
| Account → Project        | One-to-many (`project.account_id`)              | Confirmed requirement                                                   |
| Tentative allocations    | Excluded from confirmed utilization             | Prevents over-commitment on speculative projects                        |
| Placeholder allocations  | `actor_id` nullable                             | Capacity planning before person is known                                |
| Onboarding/offboarding   | Configurable template-driven checklists         | Industry standard; eliminates manual task creation                      |
| Employment status        | Explicit enum, no booleans                      | Avoids ambiguity; each state has defined transitions                    |
| Cross-module sync        | Domain events via `outbox_event`                | Replaces unreliable webhooks that caused EMS pain                       |
| No cross-schema FKs      | Soft UUID references only                       | Enforced by CLAUDE.md architecture rules                                |
