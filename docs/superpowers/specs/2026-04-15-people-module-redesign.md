# People Module Redesign — Enterprise-Grade Employee Management

**Date:** 2026-04-15
**Status:** Approved design, pending implementation plan
**Scope:** Full refactor of the `people` module — no backward compatibility, no legacy shims

---

## 1. Business Purpose

Core HRM lifecycle management from pre-hire to termination/rehire, replacing the current people module with an enterprise-grade, multi-country design informed by best practices from Workday, SAP SuccessFactors, BambooHR, and HiBob.

**Key differences from current module:**

- Multi-country from day one (country-configurable fields, probation, documents)
- Managed job profile catalog (no free-text titles)
- Effective-dated job history (temporal job assignments)
- Richer state machine (suspended, notice_period, first-class termination reasons)
- Hybrid country fields (universal columns + country JSONB)
- Structured name fields with country-configurable display order
- Document storage delegated to documents module (DDD boundary)
- Profile sections and custom fields kept as separate concerns

---

## 2. Module Boundaries — Single Source of Truth

This section defines what the people module owns and what it does NOT own, ensuring no duplication with other modules.

### 2.1 What People Owns (Source of Truth)

| Domain Concept                                                     | People Owns                                    | Other Modules React Via                 |
| ------------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------- |
| **Person identity** (name, DOB, gender, nationality)               | `person_profile`                               | Facade reads                            |
| **Employment relationship** (hire, status, termination)            | `employment`                                   | Events                                  |
| **Org structure** (who reports to whom, department assignment)     | `job_assignment` (effective-dated)             | `JobAssignmentChangedEvent`             |
| **Job history** (promotions, transfers, role changes)              | `job_assignment` timeline                      | Events + facade reads                   |
| **Employment details** (national ID, bank, contacts, country data) | `employment_detail`                            | Events                                  |
| **Contract terms** (type, salary, duration)                        | `contract_version`                             | `ContractVersionCreatedEvent` → finance |
| **Probation tracking**                                             | `probation_record` + `probation_policy`        | Events → finance, notifications         |
| **Employee document metadata** (category, expiry, acknowledgment)  | `employee_document`                            | Facade reads                            |
| **Profile sections** (education, skills, certifications)           | `profile_section`                              | Facade reads                            |
| **Profile change approval workflow**                               | `profile_change_request` + `field_edit_policy` | Events                                  |
| **Onboarding/offboarding workflows**                               | `onboarding_*`, `offboarding_*` tables         | Events                                  |
| **Field access control** (who sees what fields)                    | `field_visibility_config`                      | Applied at query layer                  |
| **Custom fields**                                                  | `custom_field_definition` + JSONB values       | N/A                                     |
| **Company email generation**                                       | `email_generation_config` + algorithm          | N/A                                     |
| **Directory search**                                               | `directory_search_index`                       | N/A                                     |

### 2.2 What People Does NOT Own

| Domain Concept                                     | Owned By      | People's Relationship                                                                                                |
| -------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Authentication** (SSO, magic link, IdP)          | identity      | People references `actorId` from kernel/identity. Never stores credentials.                                          |
| **Departments** (hierarchy, cost centers)          | kernel        | People references `department_id` in job_assignment. Validates via `KernelQueryFacade`.                              |
| **Permissions & role grants**                      | kernel        | People uses kernel's `role_permission` for access checks. Never creates its own permission system.                   |
| **Actor lifecycle** (invited, active, inactive)    | kernel        | People emits `EmploymentTerminatedEvent` → kernel listens and deactivates actor. People never writes to actor table. |
| **Candidates, offers, interviews**                 | hiring        | People only listens to `CandidateHiredEvent`. Never manages pre-hire pipeline.                                       |
| **Project staffing & allocations**                 | projects      | People emits `JobAssignmentChangedEvent` → projects adjusts allocations. People never writes to project tables.      |
| **Account membership** (project/account teams)     | projects      | Projects owns `allocation` and `account.accountManagerId`. People does not track account teams.                      |
| **Payroll execution** (calculations, disbursement) | finance       | People stores contractual terms on `contract_version`. Finance handles actual payroll runs.                          |
| **Leave accrual & policy**                         | time          | People tracks employment status (`on_leave`). Time owns leave balances, requests, policies.                          |
| **Performance evaluations**                        | performance   | People does not own periodic reviews. Completeness reminders handled via `completeness_rule`.                        |
| **Task management** (generic to-dos, KPIs)         | planner       | People owns domain-specific onboarding/offboarding tasks only. Generic task tracking is planner.                     |
| **File storage** (S3, signed URLs, retention)      | documents     | People stores metadata (`employee_document`). Documents handles storage, URLs, retention.                            |
| **Notification delivery** (email, SMS, in-app)     | notifications | People emits domain events. Notifications consumes and delivers.                                                     |

### 2.3 Kernel org_placement Resolution

Kernel currently has `org_placement` (maps actor → department with manager and effective dates). With the people redesign:

- **People's `job_assignment`** becomes the authoritative source for org structure (who reports to whom, which department, effective dates).
- **Kernel's `org_placement`** becomes a read-only projection, updated by kernel listening to `JobAssignmentChangedEvent`. Kernel never writes to org_placement directly from user actions — it derives from people events.
- **Why:** Job assignment is inherently an employment/HR concept (promotions, transfers, reorgs). Kernel's role is authority/permissions, not org management. The org_placement projection lets kernel resolve "who are the subordinates of actor X?" without cross-module queries.

### 2.4 Entities Removed from People Module

These entities exist in the current people module but are removed in the redesign:

| Entity                    | Reason                                                         | Replacement                                               |
| ------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `account_membership`      | Account/project team composition is a projects concern         | Projects owns `allocation` + `account.accountManagerId`   |
| `periodic_profile_review` | Confuses profile data completeness with performance evaluation | `completeness_rule` + `completeness-reminder` pg-boss job |

---

## 3. Core Domain Model

### 3.1 Entity Relationship Overview

```
Reference Tables
  job_family, job_profile, country_field_config, probation_policy,
  contract_policy, field_edit_policy, completeness_rule,
  document_requirement, email_generation_config

person_profile (1 per actorId per tenant)
  └── employment (1:N — one person can have multiple employments)
        ├── job_assignment (1:N — effective-dated history)
        ├── employment_detail (1:1 — universal + country + custom fields)
        ├── contract_version (1:N — effective-dated contracts)
        ├── probation_record (1:1 per employment)
        ├── employee_document (1:N — metadata, storage in documents module)
        ├── profile_section (1:N — education, skills, certifications, etc.)
        ├── profile_change_request (1:N — approval workflow)
        ├── onboarding_case (0:1)
        ├── offboarding_case (0:1)
        └── profile_share_link (1:N)

Operational Tables
  directory_search_index, bulk_operation, import_job, custom_field_definition
```

### 3.2 Person Profile

One per person per tenant. Owns identity-level data that doesn't change across employments.

```
person_profile:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  actor_id              UUID NOT NULL      -- links to kernel identity

  -- Structured name
  family_name           TEXT NOT NULL
  middle_name           TEXT NULL
  given_name            TEXT NOT NULL
  full_name             TEXT NOT NULL       -- computed by name_display_order
  full_name_unaccented  TEXT NOT NULL       -- ASCII transliteration for search/email
  preferred_name        TEXT NULL           -- nickname or chosen name

  -- Display config
  name_display_order    TEXT NOT NULL       -- 'family_first' | 'given_first'
                                           -- default derived from employment country_code

  -- Personal
  date_of_birth         DATE NULL
  gender                TEXT NULL           -- 'male' | 'female' | 'other' | 'undisclosed'
  nationality           TEXT NULL           -- ISO 3166-1 alpha-2
  marital_status        TEXT NULL           -- 'single' | 'married' | 'divorced' | 'widowed' | 'undisclosed'
  photo_document_id     UUID NULL           -- reference to documents module

  created_at            TIMESTAMP NOT NULL
  updated_at            TIMESTAMP NOT NULL

  UNIQUE (tenant_id, actor_id)
```

**Name computation:**

- `family_first`: full_name = family_name + middle_name + given_name (Vietnamese, Japanese, Korean, Chinese)
- `given_first`: full_name = given_name + middle_name + family_name (Western)
- `full_name_unaccented`: NFC normalize, strip diacritics/tone marks, Vietnamese-specific (D->d), lowercase. Used for search indexing and email generation.

### 3.3 Employment

The employment relationship. One per legal entity per person. Owns the state machine.

```
employment:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  person_profile_id     UUID NOT NULL      -- FK to person_profile
  employee_code         TEXT NULL           -- company-assigned identifier
  company_email         TEXT NULL

  -- Classification
  worker_type           TEXT NOT NULL       -- 'employee' | 'contingent'
  employment_type       TEXT NOT NULL       -- 'permanent' | 'fixed_term' | 'intern'
  country_code          TEXT NOT NULL       -- ISO 3166-1 alpha-2, drives config lookups

  -- State machine
  employment_status     TEXT NOT NULL       -- see Section 3
  termination_date      DATE NULL
  termination_reason    TEXT NULL           -- see Section 3

  -- Timeline
  hire_date             DATE NOT NULL
  original_hire_date    DATE NULL           -- for rehires, preserves first-ever hire date

  created_at            TIMESTAMP NOT NULL
  updated_at            TIMESTAMP NOT NULL

  UNIQUE (tenant_id, company_email) WHERE employment_status != 'terminated'
```

### 3.4 Job Assignment (Effective-Dated)

Every change to role, department, manager, or location creates a new row. Current assignment has `effective_to IS NULL`.

```
job_assignment:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  employment_id         UUID NOT NULL      -- FK to employment

  -- Timeline
  effective_from        DATE NOT NULL
  effective_to          DATE NULL           -- NULL = current

  -- What they do
  job_profile_id        UUID NOT NULL      -- FK to job_profile

  -- Where they sit
  department_id         UUID NULL           -- references kernel.department
  location_id           UUID NULL
  cost_center_id        UUID NULL
  work_arrangement      TEXT NOT NULL       -- 'onsite' | 'hybrid' | 'remote'

  -- Who they report to
  manager_id            UUID NULL           -- references another employment (not person_profile)

  -- Why this row exists
  event_type            TEXT NOT NULL       -- 'hire' | 'promotion' | 'lateral_transfer'
                                           -- | 'demotion' | 'reorg' | 'location_change' | 'correction'
  reason                TEXT NULL

  created_by            UUID NOT NULL
  created_at            TIMESTAMP NOT NULL
```

**Query patterns:**

- Current: `WHERE employment_id = @id AND effective_to IS NULL`
- As-of: `WHERE employment_id = @id AND effective_from <= @date AND (effective_to IS NULL OR effective_to > @date)`
- History: `WHERE employment_id = @id ORDER BY effective_from DESC`

**Future-dated changes:**

- Insert row with future `effective_from` and `effective_to = NULL`
- `pg-boss` job `apply-scheduled-assignments` runs daily to close current / activate scheduled
- Future changes can be cancelled (delete row, reopen current assignment)

### 3.5 Employment Detail

1:1 with employment. Universal typed columns + country JSONB + custom fields JSONB.

```
employment_detail:
  id                      UUID v7 PK
  tenant_id               UUID NOT NULL
  employment_id           UUID NOT NULL    -- FK to employment

  -- Universal fields (3+ countries need these)
  national_id             TEXT NULL
  national_id_type        TEXT NULL         -- 'citizen_id', 'national_registration_id', etc.
  national_id_issued_date DATE NULL
  national_id_expiry_date DATE NULL
  tax_id                  TEXT NULL
  social_insurance_id     TEXT NULL
  passport_number         TEXT NULL
  passport_expiry_date    DATE NULL

  -- Bank
  bank_account_number     TEXT NULL
  bank_name               TEXT NULL
  bank_branch             TEXT NULL
  bank_account_holder     TEXT NULL         -- uppercase ASCII
  bank_swift_code         TEXT NULL

  -- Contact
  personal_email          TEXT NULL
  personal_phone          TEXT NULL

  -- Addresses
  permanent_address       JSONB NULL        -- { line1, line2, city, state, postal, country }
  current_address         JSONB NULL

  -- Emergency contacts
  emergency_contacts      JSONB NULL        -- [{ name, relationship, phone, email }]

  -- Country-specific (validated by country_field_config)
  country_data            JSONB NULL

  -- Tenant-specific (validated by custom_field_definition)
  custom_fields           JSONB NULL

  UNIQUE (tenant_id, employment_id)
```

### 3.6 Job Profile Catalog

Managed reference data. No free-text titles.

```
job_family:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  name                  TEXT NOT NULL       -- 'Engineering', 'Sales'
  description           TEXT NULL
  parent_id             UUID NULL           -- self-referential hierarchy
  is_active             BOOLEAN NOT NULL DEFAULT true
  created_at            TIMESTAMP NOT NULL

job_profile:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  job_family_id         UUID NOT NULL      -- FK to job_family
  title                 TEXT NOT NULL       -- 'Senior Software Engineer'
  level                 TEXT NULL           -- 'L5' or tenant-defined scale
  description           TEXT NULL
  is_active             BOOLEAN NOT NULL DEFAULT true
  created_at            TIMESTAMP NOT NULL
  updated_at            TIMESTAMP NOT NULL
```

---

## 3. Employment Status State Machine

### 3.1 States

| State           | Description                                                                |
| --------------- | -------------------------------------------------------------------------- |
| `pre_hire`      | Employment record created, start date not reached or onboarding incomplete |
| `active`        | Currently employed and working                                             |
| `on_leave`      | Approved leave of absence                                                  |
| `suspended`     | Disciplinary or investigation suspension                                   |
| `notice_period` | Resignation or employer notice given, working notice                       |
| `terminated`    | Employment ended                                                           |

### 3.2 Transitions

| From            | To              | Command               | Guards                                                 |
| --------------- | --------------- | --------------------- | ------------------------------------------------------ |
| `pre_hire`      | `active`        | `ActivateEmployment`  | Start date reached, required onboarding tasks complete |
| `pre_hire`      | `terminated`    | `TerminateEmployment` | Reason: no_show                                        |
| `active`        | `on_leave`      | `StartLeave`          | Leave type required, expected return date              |
| `active`        | `suspended`     | `SuspendEmployment`   | Reason required, review date required                  |
| `active`        | `notice_period` | `GiveNotice`          | Last working day required, notice type                 |
| `active`        | `terminated`    | `TerminateEmployment` | Direct: deceased, failed_probation, gross_misconduct   |
| `on_leave`      | `active`        | `ReturnFromLeave`     | Actual return date                                     |
| `on_leave`      | `terminated`    | `TerminateEmployment` | Rare: company closure                                  |
| `suspended`     | `active`        | `ReinstateSuspension` | Reinstatement reason                                   |
| `suspended`     | `terminated`    | `TerminateEmployment` | Investigation concluded                                |
| `notice_period` | `terminated`    | `CompleteTermination` | Last working day reached                               |

### 3.3 Termination Reasons (First-Class Enum)

`voluntary_resignation`, `involuntary_performance`, `involuntary_misconduct`, `redundancy`, `end_of_contract`, `mutual_agreement`, `retirement`, `deceased`, `failed_probation`, `no_show`, `company_closure`

### 3.4 Domain Events

- `EmploymentActivatedEvent` (tenantId, employmentId, actorId, effectiveDate)
- `EmployeeOnLeaveEvent` (tenantId, employmentId, leaveType, expectedReturnDate)
- `EmployeeSuspendedEvent` (tenantId, employmentId, reason, reviewDate)
- `EmployeeNoticeGivenEvent` (tenantId, employmentId, lastWorkingDay, noticeType)
- `EmployeeReinstatedEvent` (tenantId, employmentId, reason)
- `EmployeeReturnedFromLeaveEvent` (tenantId, employmentId, actualReturnDate)
- `EmploymentTerminatedEvent` (tenantId, employmentId, actorId, terminationReason, terminationDate)
- `JobAssignmentChangedEvent` (tenantId, employmentId, actorId, eventType, effectiveFrom, changes: { old/new for jobProfileId, departmentId, managerId, locationId, workArrangement })

### 3.5 Boundary with Hiring Module

- People module does NOT manage candidates, offers, or interviews
- `CandidateHiredEvent` (from hiring) creates employment in `pre_hire` state
- `pre_hire` is the entry state created by the event handler, not a user action
- Offer withdrawal is a hiring concern — hiring emits event, people deletes/cancels pre_hire record
- Rehire: hiring module re-engages with existing person, people creates new employment on same person_profile

---

## 4. Country Configuration

### 4.1 Country Field Config

Drives UI rendering and validation for country-specific fields stored in `employment_detail.country_data`.

```
country_field_config:
  id                    UUID v7 PK
  country_code          TEXT NOT NULL       -- ISO 3166-1 alpha-2
  field_key             TEXT NOT NULL       -- language-neutral: 'citizen_id', 'vehicle_plate'
  label                 TEXT NOT NULL
  label_locale          JSONB NULL          -- { "vi": "So CCCD", "en": "Citizen ID" }
  field_type            TEXT NOT NULL       -- 'text' | 'number' | 'date' | 'boolean' | 'select'
  field_group           TEXT NOT NULL       -- 'identity' | 'tax' | 'social_insurance' | 'vehicle' | 'other'
  is_required           BOOLEAN NOT NULL
  sort_order            INTEGER NOT NULL
  validation            JSONB NULL          -- { regex, min_length, max_length, format }
  options               JSONB NULL          -- for select: [{ value, label }]
```

**Field key naming convention:** English, snake_case, describes the concept not the local acronym. Examples:

- `citizen_id` (not cccd_number), `legacy_citizen_id` (not cmnd_number)
- `registered_address` (not ho_khau_address), `vehicle_plate` (not motorbike_plate)
- `tax_religion` (DE), `income_tax_class` (DE), `pension_fund_id` (SG)
- `work_eligibility_status` (US), `biometric_id` (IN)

### 4.2 Vietnam Seed

| field_key                | label                          | type   | required | group    | validation                       |
| ------------------------ | ------------------------------ | ------ | -------- | -------- | -------------------------------- |
| `citizen_id`             | Citizen ID                     | text   | yes      | identity | `{ regex: "^\\d{12}$" }`         |
| `legacy_citizen_id`      | Legacy Citizen ID              | text   | no       | identity | `{ regex: "^\\d{9}$" }`          |
| `citizen_id_issue_place` | Citizen ID Issue Place         | text   | no       | identity |                                  |
| `registered_address`     | Permanent Registration Address | text   | no       | identity |                                  |
| `vehicle_plate`          | Vehicle Plate                  | text   | no       | vehicle  |                                  |
| `vehicle_type`           | Vehicle Type                   | select | no       | vehicle  | options: motorbike, car, bicycle |

### 4.3 Adding a New Country

Insert `country_field_config` rows + `probation_policy` rows + `document_requirement` rows + `contract_policy` rows. Zero code changes.

---

## 5. Field-Level Access Control

### 5.1 Three-Tier Visibility Model

| Tier           | Fields                                                                                  | Who Can See                 |
| -------------- | --------------------------------------------------------------------------------------- | --------------------------- |
| `public`       | Name, company email, job title, department, location, work arrangement, skills, photo   | All authenticated employees |
| `restricted`   | Personal email, phone, DOB, address, emergency contacts, marital status, nationality    | Self + direct manager + HR  |
| `confidential` | National ID, tax ID, social insurance, bank details, country_data, disciplinary records | Self + HR only              |

### 5.2 Field Visibility Config

```
field_visibility_config:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  field_path            TEXT NOT NULL       -- 'person_profile.date_of_birth', 'country_data.vehicle_plate'
  visibility_tier       TEXT NOT NULL       -- 'public' | 'restricted' | 'confidential'
```

Seeded with defaults. Tenant can customize (e.g., move DOB from restricted to public).

### 5.3 Access Resolution Logic

```
resolveVisibility(viewer, targetEmployment):
  if self                                    → public + restricted + confidential
  if viewer has 'people:confidential:read'   → public + restricted + confidential (HR, super admin)
  if direct_manager                          → public + restricted
  if viewer has 'people:restricted:read'     → public + restricted (executive with explicit grant)
  else                                       → public only
```

### 5.4 Enforcement

- Applied at the query handler level via `FieldVisibilityFilter` service (not DB-level RLS)
- Strips unauthorized fields before returning response
- Applied to: GetProfileQuery, ListEmployeesQuery, SearchDirectoryQuery, ExportEmployeesQuery, GetSharedProfileQuery
- Custom fields respect their `visibility_tier` from `custom_field_definition`
- Shared profile links always return public tier only
- Manager relationship resolved via `job_assignment.manager_id`
- Integrates with kernel's `role_permission` — no separate permission system

---

## 6. Profile Change Requests & Approval Workflows

### 6.1 Field Edit Policy

```
field_edit_policy:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  field_path            TEXT NOT NULL
  edit_mode             TEXT NOT NULL       -- 'self_service' | 'manager_approval' | 'hr_approval' | 'hr_only'
```

| Edit Mode          | Behavior                                              |
| ------------------ | ----------------------------------------------------- |
| `self_service`     | Employee changes directly, no approval. Audit logged. |
| `manager_approval` | Creates change request, manager approves/rejects      |
| `hr_approval`      | Creates change request, HR approves/rejects           |
| `hr_only`          | Only HR can change. Employee cannot request.          |

**Defaults:** preferred_name, current_address, emergency_contacts → self_service. Bank account, legal name → hr_approval. Employment type, job assignment → hr_only.

### 6.2 Profile Change Request (Enhanced)

```
profile_change_request:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  employment_id         UUID NOT NULL
  batch_id              UUID NULL           -- groups changes submitted together

  field_path            TEXT NOT NULL
  old_value             JSONB NULL
  new_value             JSONB NOT NULL

  effective_date        DATE NULL           -- NULL = immediate on approval
  status                TEXT NOT NULL       -- 'pending' | 'approved' | 'rejected' | 'superseded' | 'scheduled' | 'applied'

  requested_by          UUID NOT NULL
  reviewed_by           UUID NULL
  reviewed_at           TIMESTAMP NULL
  review_note           TEXT NULL
  decision_case_id      UUID NULL           -- kernel integration

  created_at            TIMESTAMP NOT NULL
```

**Status flow:** pending → approved → applied (immediate) | pending → approved → scheduled → applied (future-dated) | pending → rejected | pending → superseded (newer request for same field)

**Batch operations:** `RequestProfileChangesCommand` accepts array of changes with shared `batch_id`. `BatchApproveChangesCommand` / `BatchRejectChangesCommand` operate atomically. Any validation failure blocks entire batch.

**Effective dating:** `effective_date = NULL` → applied immediately on approval. Future date → `scheduled` status, `pg-boss` job `apply-scheduled-changes` runs daily.

**Superseding:** New change request for same `field_path + employment_id` while previous is `pending` automatically supersedes the old one.

**Section-level changes:** `field_path = 'profile_section:{sectionType}:{sectionId}'`, old/new value = entire section entry JSONB.

**Event:** `ProfileChangeAppliedEvent` (employmentId, fieldPath, oldValue, newValue, effectiveDate) — consumed by modules reacting to data changes (e.g., bank account change → finance).

---

## 7. Employee Directory & Search

### 7.1 Denormalized Search Index

```
directory_search_index:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  employment_id         UUID NOT NULL

  -- Denormalized (updated async via events)
  full_name             TEXT
  full_name_unaccented  TEXT
  company_email         TEXT
  job_title             TEXT
  job_level             TEXT
  department_name       TEXT
  location_name         TEXT NULL
  manager_name          TEXT NULL
  work_arrangement      TEXT
  employment_status     TEXT
  hire_date             DATE
  skills                TEXT[]
  country_code          TEXT

  search_vector         TSVECTOR
  updated_at            TIMESTAMP
```

Rebuilt async on: `JobAssignmentChangedEvent`, `ProfileChangeAppliedEvent`, `EmploymentActivatedEvent`, `EmploymentTerminatedEvent`. PostgreSQL `tsvector` sufficient for <100K employees per tenant.

### 7.2 Vietnamese Diacritic Search

`search_vector` includes both `full_name` and `full_name_unaccented`. Query input is normalized (strip diacritics, lowercase). Searching "nguyen van an" matches "Nguyen Van An".

### 7.3 Filters

departmentId (recursive sub-departments), jobProfileId, jobFamilyId, jobLevel, managerId (direct/indirect), employmentStatus (default excludes terminated), employmentType, workerType, workArrangement, locationId, countryCode, hiredAfter/Before, skillName (partial match), custom fields (is_filterable only).

### 7.4 Response Shapes

- **ListItem**: employmentId, fullName, photoUrl, jobTitle, departmentName, companyEmail, locationName
- **Card**: ListItem + workArrangement, hireDate, managerName
- **Detail**: full profile filtered by viewer's access tier

### 7.5 tRPC Procedures

- `people.directory.search` — full-text + filters → ListItem[]
- `people.directory.list` — paginated browse + filters → ListItem[] | Card[]
- `people.directory.export` — CSV/XLSX, respects access control
- `people.profile.get` — full detail, respects field visibility
- `people.profile.getOwn` — self-view, all tiers

### 7.6 Access Control in Search

Results always return public tier fields. Detail view applies full visibility. Export applies per-row visibility. Terminated excluded by default (opt-in filter).

---

## 8. Employee Documents

### 8.1 Document Metadata (People Module)

```
employee_document:
  id                      UUID v7 PK
  tenant_id               UUID NOT NULL
  employment_id           UUID NOT NULL
  document_id             UUID NOT NULL    -- reference to documents module

  category                TEXT NOT NULL     -- 'identity' | 'contract' | 'tax' | 'insurance'
                                           -- | 'certificate' | 'visa' | 'policy_ack'
                                           -- | 'health_check' | 'background_check' | 'other'
  subcategory             TEXT NULL
  title                   TEXT NOT NULL

  expiry_date             DATE NULL
  is_confidential         BOOLEAN NOT NULL
  requires_acknowledgment BOOLEAN NOT NULL
  acknowledged_at         TIMESTAMP NULL
  acknowledged_by         UUID NULL

  version                 INTEGER NOT NULL
  parent_document_id      UUID NULL         -- previous version

  status                  TEXT NOT NULL     -- 'active' | 'archived' | 'pending_deletion'
  uploaded_by             UUID NOT NULL
  created_at              TIMESTAMP NOT NULL
```

### 8.2 Document Requirements (Per Country + Employment Type)

```
document_requirement:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  country_code          TEXT NOT NULL
  employment_type       TEXT NULL           -- NULL = all types
  category              TEXT NOT NULL
  title                 TEXT NOT NULL
  is_required           BOOLEAN NOT NULL
  deadline_days         INTEGER NULL        -- days after hire
  sort_order            INTEGER NOT NULL
```

### 8.3 Interactions with Documents Module

| Action   | Flow                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Upload   | UI → documents module stores in S3 → returns document_id → people creates employee_document                                    |
| Download | People checks visibility → DocumentsQueryFacade.getSignedUrl(documentId)                                                       |
| Delete   | People sets status archived → documents module handles retention                                                               |
| Generate | People emits ContractGenerationRequestedEvent → documents renders template → DocumentGeneratedEvent → people creates reference |

### 8.4 Expiry Tracking

`pg-boss` job `check-document-expiry` runs weekly. Emits `DocumentExpiringEvent` at 30/14/7 day marks → notifications module. Dashboard: `ListExpiringDocumentsQuery`.

### 8.5 Document Completeness

Query `document_requirement` for employee's country + type, compare against actual documents. Returns `{ required, submitted, missing[] }`. Feeds into profile completeness score.

---

## 9. Custom Fields

### 9.1 Field Definitions

```
custom_field_definition:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  field_key             TEXT NOT NULL       -- unique per tenant
  label                 TEXT NOT NULL
  field_type            TEXT NOT NULL       -- 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select'
  field_group           TEXT NULL           -- UI tab grouping
  is_required           BOOLEAN NOT NULL
  is_searchable         BOOLEAN NOT NULL
  is_filterable         BOOLEAN NOT NULL
  sort_order            INTEGER NOT NULL
  validation            JSONB NULL          -- { min, max, max_length, regex }
  options               JSONB NULL          -- for select/multi_select
  visibility_tier       TEXT NOT NULL       -- 'public' | 'restricted' | 'confidential'
  is_active             BOOLEAN NOT NULL    -- soft deactivation preserves data
  created_at            TIMESTAMP NOT NULL
  updated_at            TIMESTAMP NOT NULL

  UNIQUE (tenant_id, field_key)
```

### 9.2 Storage

Values in `employment_detail.custom_fields` JSONB. GIN-indexed. Validated on write against definitions.

### 9.3 Rules

- Soft-deactivation: setting `is_active = false` hides field from UI but preserves existing data
- No `field_key` renaming after creation
- Required field grandfathering: existing employees without the value get a warning, not an error
- Searchable/filterable fields fed into `directory_search_index` rebuild

---

## 10. Probation Management

### 10.1 Probation Policy (Country-Configurable)

```
probation_policy:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  country_code          TEXT NOT NULL
  job_level_category    TEXT NOT NULL       -- 'executive' | 'professional' | 'technical' | 'general'

  default_duration_days INTEGER NOT NULL
  max_duration_days     INTEGER NOT NULL
  allow_extension       BOOLEAN NOT NULL    -- Vietnam: false
  max_extensions        INTEGER NOT NULL    -- Vietnam: 0
  extension_days        INTEGER NULL
  min_salary_percentage NUMERIC NOT NULL    -- Vietnam: 85, others: 100
  auto_confirm          BOOLEAN NOT NULL
  created_at            TIMESTAMP NOT NULL
  updated_at            TIMESTAMP NOT NULL
```

### 10.2 Probation Record

```
probation_record:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  employment_id         UUID NOT NULL

  start_date            DATE NOT NULL
  original_end_date     DATE NOT NULL
  current_end_date      DATE NOT NULL
  extension_count       INTEGER NOT NULL DEFAULT 0

  status                TEXT NOT NULL       -- 'active' | 'passed' | 'failed' | 'extended' | 'not_applicable'
  outcome_date          DATE NULL
  outcome_by            UUID NULL
  outcome_note          TEXT NULL

  probation_policy_id   UUID NOT NULL
  salary_percentage     NUMERIC NOT NULL

  created_at            TIMESTAMP NOT NULL
  updated_at            TIMESTAMP NOT NULL
```

### 10.3 Commands & Guards

| Command                   | Guards                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `SetProbationCommand`     | Auto-triggered on EmploymentActivatedEvent. Looks up policy by country + job level.               |
| `ConfirmProbationCommand` | Status must be active or extended. Sets passed.                                                   |
| `ExtendProbationCommand`  | policy.allow_extension = true. extension_count < max_extensions. new_end <= start + max_duration. |
| `FailProbationCommand`    | Status must be active or extended. Sets failed. Triggers TerminateEmployment (failed_probation).  |

### 10.4 Automated Reminders

`pg-boss` job `probation-reminder` runs daily. Emits `ProbationEndingEvent` at 30/14/7 days before `current_end_date`. Auto-confirms if `policy.auto_confirm = true` and overdue. Emits `ProbationOverdueEvent` if overdue and not auto-confirm.

### 10.5 Integration

- `EmploymentActivatedEvent` → auto-creates probation record
- `FailProbationCommand` → `EmploymentTerminatedEvent` (failed_probation)
- `ProbationConfirmedEvent` → finance (salary adjustment to 100%)

---

## 11. Contract Versions

### 11.1 Schema

```
contract_version:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  employment_id         UUID NOT NULL

  contract_type         TEXT NOT NULL       -- 'indefinite' | 'fixed_term' | 'seasonal'
                                           -- | 'probation' | 'internship' | 'consultancy'
  start_date            DATE NOT NULL
  end_date              DATE NULL           -- NULL for indefinite
  status                TEXT NOT NULL       -- 'draft' | 'active' | 'expired' | 'terminated' | 'superseded'

  probation_end_date    DATE NULL
  notice_period_days    INTEGER NULL
  work_hours_per_week   NUMERIC NULL

  -- Compensation terms (contractual, not payroll execution)
  base_salary           NUMERIC NULL
  salary_currency       TEXT NULL           -- ISO 4217
  salary_frequency      TEXT NULL           -- 'monthly' | 'biweekly' | 'weekly' | 'annual'

  document_id           UUID NULL           -- signed contract via documents module

  note                  TEXT NULL
  created_by            UUID NOT NULL
  created_at            TIMESTAMP NOT NULL
  signed_at             TIMESTAMP NULL
  signed_by             UUID NULL
```

### 11.2 Contract Policy (Country-Specific)

```
contract_policy:
  id                          UUID v7 PK
  tenant_id                   UUID NOT NULL
  country_code                TEXT NOT NULL

  max_fixed_term_months       INTEGER NULL    -- VN: 36, DE: 24
  max_fixed_term_renewals     INTEGER NULL    -- VN: 1
  force_indefinite_after      BOOLEAN NOT NULL -- VN: true after 2nd fixed-term
  probation_requires_contract BOOLEAN NOT NULL -- VN: true
```

### 11.3 Lifecycle & Events

- `ContractVersionCreatedEvent` → finance (new payroll terms)
- `ContractExpiringEvent` (emitted by `pg-boss` job at 60/30/14 days) → notifications
- `ContractTerminatedEvent` → finance (final pay trigger)
- Status flow: draft → active → expired/terminated/superseded

---

## 12. Company Email Generation & Share Links

### 12.1 Email Generation Config

```
email_generation_config:
  tenant_id             UUID PK
  domain                TEXT NOT NULL       -- 'seta-international.vn'
  pattern               TEXT NOT NULL       -- '{given}.{family}'
  transliteration       TEXT NOT NULL       -- 'strip_diacritics' | 'custom_map'
```

### 12.2 Generation Algorithm

1. Transliterate name to ASCII (NFC normalize, strip diacritics, Vietnamese D->d)
2. Generate candidates: `given.family` → `given.familymiddle` → `givenmiddle.family` → `given.family2` ... up to 10 attempts
3. Check uniqueness against active employments + identity module
4. Return suggestion — HR can override

### 12.3 Profile Share Links

```
profile_share_link:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  employment_id         UUID NOT NULL

  token                 TEXT NOT NULL       -- JWT with { shareId, tenantId, exp }
  expires_at            TIMESTAMP NOT NULL
  max_views             INTEGER NULL
  view_count            INTEGER NOT NULL DEFAULT 0

  status                TEXT NOT NULL       -- 'active' | 'revoked'
  created_by            UUID NOT NULL
  created_at            TIMESTAMP NOT NULL
  revoked_at            TIMESTAMP NULL
```

Public tier fields only. JWT signed with per-tenant secret. Default 7-day expiry, configurable up to 90 days.

---

## 13. Bulk Operations & CSV Import

### 13.1 Bulk Operations

```
bulk_operation:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  operation_type        TEXT NOT NULL       -- 'department_transfer' | 'status_change' | 'manager_reassign'

  employment_ids        UUID[] NOT NULL
  payload               JSONB NOT NULL

  status                TEXT NOT NULL       -- 'pending' | 'validating' | 'previewed' | 'processing'
                                           -- | 'completed' | 'partially_completed' | 'failed'
  total_count           INTEGER NOT NULL
  success_count         INTEGER NOT NULL DEFAULT 0
  failure_count         INTEGER NOT NULL DEFAULT 0
  errors                JSONB NULL

  requested_by          UUID NOT NULL
  created_at            TIMESTAMP NOT NULL
  completed_at          TIMESTAMP NULL
```

Flow: submit → validate → preview (dry-run) → confirm → async pg-boss processing → complete. Each change goes through full domain logic (state machine guards, edit policies, events).

### 13.2 CSV Import

```
import_job:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL

  file_document_id      UUID NOT NULL
  file_name             TEXT NOT NULL
  row_count             INTEGER NOT NULL

  column_mapping        JSONB NULL
  mapping_profile       TEXT NULL

  status                TEXT NOT NULL       -- 'uploaded' | 'mapped' | 'validated' | 'previewed'
                                           -- | 'committed' | 'partially_committed' | 'failed'

  valid_count           INTEGER NULL
  error_count           INTEGER NULL
  warning_count         INTEGER NULL
  validation_report     JSONB NULL

  created_count         INTEGER NULL
  updated_count         INTEGER NULL
  skipped_count         INTEGER NULL
  error_details         JSONB NULL

  requested_by          UUID NOT NULL
  created_at            TIMESTAMP NOT NULL
  completed_at          TIMESTAMP NULL
```

Flow: upload → map columns (fuzzy suggestion, saveable profiles) → validate (format, required, referential, uniqueness, business rules) → preview (X valid, Y errors, Z warnings) → commit (async if >100 rows) → report.

### 13.3 Export

Respects field visibility per viewer. Configurable columns. Formats: CSV (UTF-8 BOM for Excel), XLSX. Large exports async with download link.

---

## 14. Profile Completeness & Duplicate Validation

### 14.1 Completeness Rules

```
completeness_rule:
  id                    UUID v7 PK
  tenant_id             UUID NOT NULL
  field_path            TEXT NOT NULL       -- 'person_profile.date_of_birth', 'profile_section:education',
                                           -- 'employee_document:identity', 'custom_field:tshirt_size'
  weight                INTEGER NOT NULL
  is_required           BOOLEAN NOT NULL
  country_code          TEXT NULL           -- NULL = global
  employment_type       TEXT NULL           -- NULL = all
  deadline_days         INTEGER NULL        -- days after hire
  label                 TEXT NOT NULL
  section               TEXT NOT NULL       -- UI grouping
  sort_order            INTEGER NOT NULL
```

### 14.2 Score Calculation

Computed on read (not stored). For each matching rule: check if populated. Score = (filled weights / total weights) x 100. Returns `{ score, filled, total, missing[] }`.

### 14.3 Nudging

- Employee dashboard: "Your profile is X% complete" with action items
- Manager dashboard: "N team members have incomplete profiles"
- `pg-boss` job `completeness-reminder` weekly, emits `ProfileIncompleteEvent` for profiles below threshold and past deadline

### 14.4 Duplicate Validation

Checked fields: company_email, national_id, tax_id, social_insurance_id, passport_number, bank_account_number, personal_email, personal_phone, country_data.vehicle_plate.

- `company_email`: hard block (unique partial index on active employments)
- All others: warning with conflict details (HR can acknowledge and proceed)
- Runs on: employment creation, profile changes, CSV import

---

## 15. LinkedIn Profile Import

### 15.1 Flow

1. Employee initiates OAuth 2.0 with LinkedIn (scopes: r_liteprofile, r_emailaddress)
2. Fetch profile data, map to profile_section types (education, work_experience, skill, certification)
3. Merge logic: match by institution+degree or company+title. Match found → skip. No match → add.
4. Employee reviews preview, selects items to import
5. Confirmed items created as profile_section entries via normal command flow

### 15.2 Commands

- `InitiateLinkedInAuthCommand` → returns OAuth redirect URL
- `ImportLinkedInProfileCommand` → fetches data, returns preview (no save)
- `ConfirmLinkedInImportCommand` → creates profile_sections for selected items

### 15.3 Constraints

- Access token never stored in DB — used immediately, discarded
- Employee-initiated only (OAuth consent)
- Degrades gracefully if only basic LinkedIn scopes available
- Lower priority feature — LinkedIn API partnership may not be available initially

---

## 16. Onboarding & Offboarding (Enhanced)

### 16.1 Changes from Current

- `profile_id` → `employment_id` on all case/task tables
- Template selection now considers `country_code` + `employment_type` + `worker_type`
- Onboarding tasks can reference `document_requirement.id` — auto-complete when matching document uploaded
- Offboarding template selection uses `termination_reason` + `country_code`

### 16.2 Template Scoping (New Columns)

```
onboarding_template:
  + country_code        TEXT NULL           -- NULL = global
  + worker_type         TEXT NULL
  + employment_type     TEXT NULL

offboarding_template:
  + country_code        TEXT NULL
  + termination_reason  TEXT NULL           -- specific matching beyond reason_category
```

### 16.3 Event Flow

```
CandidateHiredEvent → create employment (pre_hire) → auto-select onboarding template
  → create case + tasks → notifications

All required tasks complete + hire_date reached → ActivateEmployment
  → EmploymentActivatedEvent → probation auto-created

---

GiveNotice or TerminateEmployment → auto-select offboarding template
  → create case + tasks → notifications

Tasks complete → CompleteTermination → employment terminated
  → EmploymentTerminatedEvent → cascades to all modules
```

---

## 17. Cross-Module Integration

### 17.1 Events Emitted by People Module

| Event                            | Consumers                                                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmploymentActivatedEvent`       | time (start accruals), projects (available for staffing), kernel (activate grants)                                                                                                                                |
| `EmploymentTerminatedEvent`      | time (stop accruals), projects (flag assignments), finance (final pay), kernel (revoke grants), identity (disable SSO), agents (deactivate), goals (reassign OKRs)                                                |
| `JobAssignmentChangedEvent`      | kernel (update org_placement projection + role grant evaluation), projects (staffing impact), finance (comp review trigger), time (accrual policy change), performance (reviewer change), goals (ownership shift) |
| `EmployeeOnLeaveEvent`           | time, projects (temporary backfill)                                                                                                                                                                               |
| `EmployeeSuspendedEvent`         | projects (remove from active work)                                                                                                                                                                                |
| `EmployeeReturnedFromLeaveEvent` | time, projects                                                                                                                                                                                                    |
| `ProfileChangeAppliedEvent`      | finance (bank account change), notifications                                                                                                                                                                      |
| `ContractVersionCreatedEvent`    | finance (payroll terms)                                                                                                                                                                                           |
| `ContractExpiringEvent`          | notifications                                                                                                                                                                                                     |
| `ProbationConfirmedEvent`        | finance (salary adjustment)                                                                                                                                                                                       |
| `ProbationEndingEvent`           | notifications                                                                                                                                                                                                     |
| `DocumentExpiringEvent`          | notifications                                                                                                                                                                                                     |
| `ProfileIncompleteEvent`         | notifications                                                                                                                                                                                                     |

### 17.2 Events Consumed by People Module

| Event                       | Source | Action                                          |
| --------------------------- | ------ | ----------------------------------------------- |
| `CandidateHiredEvent`       | hiring | Create employment in pre_hire + onboarding case |
| `DecisionCaseResolvedEvent` | kernel | Update profile_change_request status            |

### 17.3 Facade Methods Exposed

```typescript
PeopleQueryFacade: getEmployment(tenantId, employmentId)
getEmploymentByActorId(tenantId, actorId)
getCurrentJobAssignment(tenantId, employmentId)
getJobAssignmentAsOf(tenantId, employmentId, date)
listEmploymentsByDepartment(tenantId, departmentId)
listEmploymentsByManager(tenantId, managerActorId)
getHeadcount(tenantId, filters)
isActiveEmployee(tenantId, actorId)
```

### 17.4 Integration Principle — Single Source of Truth

People module is the **single source of truth** for:

- Who is employed (employment status, hire/termination dates)
- Who reports to whom (job_assignment.manager_id)
- What role someone holds (job_assignment → job_profile)
- Which department someone sits in (job_assignment.department_id)
- Employment details (personal data, bank, country-specific fields)
- Contract terms (type, salary, duration)

**No other module duplicates this data.** Other modules maintain derived projections updated via events:

- Kernel's `org_placement` is a read-only projection rebuilt from `JobAssignmentChangedEvent`
- Projects' `allocation` tracks project staffing (a different concept from org assignment)
- Finance's payroll records derive from `ContractVersionCreatedEvent`
- Time's leave balances react to `EmployeeOnLeaveEvent` / `EmployeeReturnedFromLeaveEvent`

**Data flow is one-directional:** People emits events → other modules react. People never calls projects/finance/time/performance/goals. People only queries kernel (department validation, permission checks) and documents (file storage).

---

## 18. pg-boss Jobs

| Job                           | Schedule  | Purpose                                                                        |
| ----------------------------- | --------- | ------------------------------------------------------------------------------ |
| `apply-scheduled-assignments` | Daily     | Activate future-dated job assignments                                          |
| `apply-scheduled-changes`     | Daily     | Apply approved future-dated profile changes                                    |
| `probation-reminder`          | Daily     | Alert at 30/14/7 days before probation end, auto-confirm if configured         |
| `check-document-expiry`       | Weekly    | Alert at 30/14/7 days before document expiry                                   |
| `check-contract-expiry`       | Weekly    | Alert at 60/30/14 days before contract expiry                                  |
| `completeness-reminder`       | Weekly    | Nudge incomplete profiles past deadline                                        |
| `rebuild-search-index`        | On-demand | Full rebuild of directory_search_index (fallback if event-driven updates miss) |

---

## 19. Database Schema Summary

**People schema tables (22 total):**

Core: `person_profile`, `employment`, `job_assignment`, `employment_detail`

Reference: `job_family`, `job_profile`, `country_field_config`, `field_edit_policy`, `field_visibility_config`, `probation_policy`, `contract_policy`, `completeness_rule`, `document_requirement`, `email_generation_config`, `custom_field_definition`

Feature: `contract_version`, `probation_record`, `employee_document`, `profile_section`, `profile_change_request`, `profile_share_link`

Operational: `directory_search_index`, `bulk_operation`, `import_job`

Retained (enhanced): `onboarding_template`, `onboarding_task_template`, `onboarding_case`, `onboarding_task`, `offboarding_template`, `offboarding_task_template`, `offboarding_case`, `offboarding_task`

**Total: ~30 tables** (22 new/redesigned + 8 retained with enhancements)

---

## 20. UI/UX Design — Page Inventory

### 20.1 Navigation Structure

The `web-people` zone has a sidebar with the following top-level sections:

```
People (sidebar)
├── Directory                    -- employee directory with search/filter
├── Org Chart                    -- visual org hierarchy
├── My Profile                   -- self-service profile view/edit
├── Onboarding                   -- onboarding case management
├── Offboarding                  -- offboarding case management
├── Change Requests              -- pending approvals queue
├── Reports                      -- headcount, completeness, expiry dashboards
└── Settings (HR only)           -- job catalog, policies, templates, field config
```

### 20.2 Page Details

---

#### P1. Directory (`/`)

The main landing page. Full employee directory with search, filtering, and multiple views.

**Layout:** Toolbar at top (search bar + filters + view toggle + export button), content below.

**Components:**

- **Search bar** — full-text search with debounce (300ms). Searches across name, email, title, department, skills. Vietnamese diacritic-insensitive. Uses `Input` with search icon.
- **Filter panel** — collapsible sidebar or dropdown panel. Faceted filters:
  - Department (tree select with hierarchy)
  - Job family / Job profile
  - Job level
  - Employment status (default: excludes terminated)
  - Employment type / Worker type
  - Work arrangement
  - Location
  - Country
  - Hire date range
  - Manager
  - Custom filterable fields
  - Each filter shows count badge
- **View toggle** — switch between list view and card grid view. Uses `Toggle-Group`.
- **List view** — `DataTable` with columns: Avatar+Name, Job Title, Department, Location, Email, Status. Sortable headers. Row click → profile detail. Checkbox column for bulk select.
- **Card view** — responsive grid (3-4 columns desktop, 2 tablet, 1 mobile). Each card: Avatar, name, title, department, location, work arrangement badge. Click → profile detail.
- **Bulk actions bar** — appears when rows selected. Actions: Change Department, Change Manager, Export Selected. Uses `DataTableBulkActions`.
- **Export button** — dropdown: CSV, XLSX. Respects field visibility. Large exports show progress toast.
- **Pagination** — bottom of table. Page size selector (25/50/100). Uses `DataTablePagination`.
- **Empty state** — when no results: illustration + "No employees match your filters" + clear filters button.
- **URL state** — all filters, search, sort, page, view mode persisted in URL params (existing `table-url-state` pattern).

**Permissions:** `people:profile:read` to view. Bulk actions require `people:profile:update`.

---

#### P2. Org Chart (`/org-chart`)

Interactive organizational hierarchy visualization.

**Layout:** Full-width canvas with toolbar at top.

**Components:**

- **Toolbar** — search (find person in tree), department filter dropdown, zoom controls (+/-/fit), expand/collapse all toggle.
- **Tree view** — hierarchical nodes connected by lines. Each node is a `Card` showing: Avatar, name, title, department, direct report count badge. Click node → expand/collapse children. Double-click → navigate to profile.
- **Two view modes** via toggle:
  - **Manager hierarchy** — tree by reporting line (`job_assignment.manager_id`)
  - **Department hierarchy** — tree by department structure (kernel departments)
- **Person locator** — search for a name, tree auto-scrolls and highlights the node with a pulsing ring.
- **Node detail popover** — hover/click on a node shows `Hover-Card` with: name, title, email, department, location, phone, "View Profile" link.
- **Vacant positions** — if position management is used in future, shown as dashed-border nodes.

**Permissions:** `people:org:read`.

---

#### P3. Employee Profile (`/profile/:employmentId`)

The core employee profile page. Tabbed layout, content filtered by viewer's access tier.

**Layout:** Header section (always visible) + tabbed content below.

**Header:**

- Left: Large `Avatar` (96px) with edit overlay (self/HR only)
- Center: Full name (text-h1), preferred name in parentheses if set, job title, department, location badges. Employment status `Badge` (color-coded: green=active, amber=on_leave, red=terminated, blue=pre_hire, gray=suspended, orange=notice_period).
- Right: Action buttons — "Edit Profile" (if permitted), "Share Profile" (generates link), "More" dropdown (Download PDF, View Job History, Start Offboarding). `Dropdown-Menu`.
- Below header: Profile completeness bar (`Progress` component) with percentage and "Complete your profile" link if < 100%.
- Probation banner: if active probation, show `Alert` with "Probation ends in X days" + status.

**Tabs:**

**Tab 1: Overview**

- **Personal Information** section — `Card` with two-column grid: DOB, gender, nationality, marital status, personal email, personal phone. Edit button (per field edit policy).
- **Employment Information** section — `Card`: employee code, company email, worker type, employment type, work arrangement, hire date, country. Read-only (HR only fields).
- **Current Job** section — `Card`: job title, job level, job family, department, location, cost center, manager (clickable → their profile). "View History" link → Job History tab.
- **Emergency Contacts** section — `Card` with list: name, relationship, phone, email per contact. Add/edit/remove buttons (self-service).
- **Addresses** section — `Card` with permanent + current address. Edit buttons.
- **Country-Specific Fields** section — dynamically rendered from `country_field_config`. Grouped by `field_group`. Field labels from `label_locale`. Edit per `field_edit_policy`.
- **Custom Fields** section — dynamically rendered from `custom_field_definition`. Grouped by `field_group`. Edit per policy.
- **Bank Details** section — `Card` (confidential tier): account number (masked by default, click to reveal for self/HR), bank name, branch, holder name, SWIFT. Edit requires HR approval.

Fields not visible to the viewer are hidden entirely (no "restricted" placeholder).

**Tab 2: Job History**

- Timeline view — vertical timeline (`Separator` + nodes). Each entry: date, event type `Badge` (promotion=green, lateral=blue, demotion=amber, hire=indigo, reorg=gray), job title, department, manager, reason.
- Most recent at top. Scrollable.
- Each entry expandable to show full before/after diff.
- "Current" entry highlighted with accent border.
- Future-dated entries shown with dashed border + "Scheduled" badge.

**Tab 3: Documents**

- Document list — `DataTable` with columns: Title, Category `Badge`, Upload Date, Expiry Date (red if < 30 days, amber if < 90 days), Status, Actions.
- **Upload button** → `Dialog` with: file drop zone, category select, title input, expiry date picker (optional), confidentiality toggle.
- **Document requirements checklist** — `Card` at top showing required documents for this employee's country+type. Checkmarks for submitted, warning icons for missing, clock icons for approaching deadline.
- **Expiring soon section** — filtered view of documents expiring within 90 days. Alert styling.
- **Policy acknowledgments** — separate section listing policies requiring acknowledgment. "Acknowledge" button for unacknowledged.
- Confidential documents only visible to self + HR.

**Tab 4: Contracts**

- Contract history list — cards stacked vertically, most recent first. Each card: contract type `Badge`, status `Badge`, date range, base salary (confidential — visible to self+HR only), signed date.
- **Active contract** highlighted with accent border.
- "View Contract" button → opens document via documents module.
- Expiring contracts show alert banner.
- "New Contract" button (HR only) → Contract creation dialog.

**Tab 5: Sections** (Education, Skills, Certifications, etc.)

- Sub-tabs or accordion for each section type: Education, Work Experience, Certifications, Skills, Languages, Social Links, Dependents.
- Each section: list of entries. Each entry is a `Card` with relevant fields.
- Add/edit/remove buttons per entry (respects edit policy — some self-service, some require approval).
- "Import from LinkedIn" button at top (if LinkedIn integration configured). Opens OAuth flow.
- Skills section: `Badge` list view (compact). Add via `Combobox` with suggestions.

**Tab 6: Change Requests**

- Pending changes — list of `profile_change_request` for this employee. Shows: field, old→new value, requested by, date, status `Badge`.
- If viewer is approver: "Approve" / "Reject" buttons per request, or "Approve All" / "Reject All" for batch.
- History — completed/rejected requests, filterable by date range.
- Scheduled changes — future-dated approved changes with effective date and "Cancel" button.

**Tab 7: Probation** (shown only if probation record exists)

- Status card — large status display: "In Probation — X days remaining" or "Passed" or "Failed".
- Timeline: start date, original end date, extensions (if any), outcome.
- Action buttons (HR/manager): "Confirm", "Extend" (if policy allows), "Fail".
- Salary info: probation percentage, difference from full salary.
- Reminder log: when reminders were sent.

---

#### P4. My Profile (`/me`)

Self-service profile view. Same layout as P3 but always shows the current user's profile with self-service edit capabilities.

**Differences from P3:**

- No "Start Offboarding" or management actions
- Edit buttons appear for all self-service fields
- Bank details visible (confidential but it's self)
- Profile completeness prominently displayed with action items
- "Share My Profile" button to generate external link

---

#### P5. Onboarding (`/onboarding`)

Onboarding case management dashboard.

**Layout:** Tabs for different views.

**Tab: Active Cases**

- `DataTable`: Employee name, template used, start date, progress (X/Y tasks), status `Badge`. Row click → case detail.
- Filter by: department, template, status, date range.

**Tab: My Tasks** (for any user with assigned onboarding tasks)

- Task list: employee name, task title, due date (red if overdue), status. "Complete" button with evidence upload option.

**Case Detail page** (`/onboarding/:caseId`):

- Header: employee name + avatar, template name, status, progress bar.
- Task list grouped by assignee role (HR tasks, IT tasks, Employee tasks, PM tasks). Each task: title, assignee, due date, status, evidence link. "Complete" / "Skip" buttons for assigned tasks.
- Document requirements integration: tasks linked to document_requirement show status of document upload.

**Permissions:** `people:onboard:manage` for full view. Individual users see their assigned tasks.

---

#### P6. Offboarding (`/offboarding`)

Same structure as onboarding with offboarding-specific context.

**Tab: Active Cases**

- `DataTable`: Employee name, reason category `Badge`, last working day, progress, status.
- Additional column: termination reason.

**Tab: My Tasks**

- Same as onboarding but for offboarding tasks (equipment return, access revocation, etc.).

**Case Detail page** (`/offboarding/:caseId`):

- Header: employee name, termination reason, last working day, status.
- Approval status (if pending approval): "Approve" / "Reject" buttons.
- Task list same structure as onboarding.

**Permissions:** `people:offboard:manage`.

---

#### P7. Change Requests (`/change-requests`)

Approval queue for profile changes. Primary view for HR and managers.

**Layout:** Filtered list with bulk actions.

**Components:**

- **Filter tabs** — "Pending My Review", "All Pending", "Recently Decided" (last 30 days).
- **Request list** — `DataTable` with: Employee name, field changed, old→new value preview, requested by, requested date, effective date (if future-dated), status. Checkbox column.
- **Batch actions** — "Approve Selected", "Reject Selected" buttons. Confirmation `Alert-Dialog` before executing.
- **Request detail** — expandable row or side `Drawer`: full field details, old/new values with diff highlighting, requester info, edit policy that triggered the approval, approve/reject with optional note.
- **Stats bar** at top — pending count, approved today, rejected today, oldest pending age.

**Permissions:** Manager sees requests for their reports. HR sees all.

---

#### P8. Reports (`/reports`)

Dashboard with HR analytics and compliance tracking.

**Sub-pages:**

**P8a. Headcount (`/reports/headcount`)**

- Summary cards row: Total Active, New Hires (this month), Terminations (this month), Net Change.
- Chart: headcount trend over time (line chart, 12 months).
- Breakdown table: by department, by country, by employment type, by work arrangement. Drill-down on click.

**P8b. Profile Completeness (`/reports/completeness`)**

- Summary: average completeness score, count below threshold.
- `DataTable`: employee name, department, score (color-coded: red < 50%, amber < 80%, green >= 80%), missing items count, days since hire. Sortable by score.
- Filter: department, country, below score threshold, overdue only.
- "Send Reminders" bulk action for selected employees.

**P8c. Document Compliance (`/reports/documents`)**

- Expiring documents: `DataTable` with employee name, document title, category, expiry date, days remaining (color-coded).
- Missing documents: employees with incomplete document requirements. Shows required vs submitted.
- Filter: country, category, expiry window (30/60/90 days).

**P8d. Probation Tracker (`/reports/probation`)**

- Active probations: `DataTable` with employee name, start date, end date, days remaining, status.
- Upcoming endings (next 30 days): highlighted section.
- Overdue: probations past end date with no outcome recorded.

**P8e. Contract Expiry (`/reports/contracts`)**

- Expiring contracts: `DataTable` with employee name, contract type, end date, days remaining.
- Filter: country, contract type, expiry window.

**Permissions:** `people:reports:read` (typically HR + executives).

---

#### P9. Settings (`/settings`)

HR administration pages for configuring the people module.

**Sub-pages:**

**P9a. Job Catalog (`/settings/job-catalog`)**

- **Job Families** — tree view of job families (collapsible). Add/edit/deactivate family. Drag to reorder.
- **Job Profiles** — `DataTable` within selected family: title, level, status `Badge`. Add/edit/deactivate profile. Cannot delete if referenced by active job assignments (show count).

**P9b. Onboarding Templates (`/settings/onboarding-templates`)**

- Template list: name, country scope, employment type scope, task count, is_default toggle.
- Template editor: drag-and-drop task reordering. Each task: title, description, assignee role select, due days input, is_required toggle, linked document requirement select.
- "Duplicate Template" action for creating country variants.

**P9c. Offboarding Templates (`/settings/offboarding-templates`)**

- Same structure as onboarding templates with termination reason/category scope.

**P9d. Country Configuration (`/settings/countries`)**

- Country list: code, name, configured field count, probation policy count, document requirement count.
- Country detail page:
  - **Fields tab** — `DataTable` of `country_field_config`: field key, label, type, group, required toggle. Add/edit/remove. Drag to reorder.
  - **Probation Policies tab** — table of policies per job level category: duration, max duration, allow extension, min salary %, auto-confirm. Edit inline.
  - **Document Requirements tab** — table: category, title, required toggle, deadline days. Add/edit/remove.
  - **Contract Policies tab** — max fixed-term months, max renewals, force indefinite toggle, probation contract toggle. Edit inline.

**P9e. Custom Fields (`/settings/custom-fields`)**

- `DataTable`: field key, label, type, group, required, searchable, filterable, visibility tier, active status.
- Add field `Dialog`: key (auto-generated from label, editable before first save), label, type select (text/number/date/boolean/select/multi_select), validation rules (conditional on type), options editor (for select types), visibility tier, group, required/searchable/filterable toggles.
- Edit: all fields except key. Deactivate with confirmation (preserves data).

**P9f. Field Edit Policies (`/settings/edit-policies`)**

- Grouped by section (personal, employment, bank, etc.).
- Each field: field path display, current edit mode `Badge`. Click to change: dropdown with self_service / manager_approval / hr_approval / hr_only.
- Bulk mode: select multiple fields, set same policy.

**P9g. Field Visibility (`/settings/visibility`)**

- Same structure as edit policies. Each field: path, current tier `Badge` (public=green, restricted=amber, confidential=red). Click to change.

**P9h. Email Configuration (`/settings/email`)**

- Single form: domain input, pattern select (with preview: "an.nguyen@domain"), transliteration mode.
- Test generator: enter a sample Vietnamese name, see generated email candidates.

**P9i. Completeness Rules (`/settings/completeness`)**

- `DataTable`: field path, label, section, weight, required toggle, country scope, deadline days.
- Add/edit/remove. Drag to reorder within sections.
- Preview: "Test score" — select an employee, see their computed score with this ruleset.

**P9j. Import/Export (`/settings/import`)**

- **Import section:**
  - "New Import" button → step wizard:
    - Step 1: File upload (drag-and-drop zone, CSV/XLSX, max 10MB)
    - Step 2: Column mapping — two-column layout: detected headers on left, system field select on right. Fuzzy auto-suggestions. Save/load mapping profile.
    - Step 3: Validation results — summary cards (valid/error/warning counts). Expandable error table: row number, field, message, severity `Badge`. Download error report button.
    - Step 4: Preview — sample of first 10 valid rows rendered as a table. Confirm/cancel buttons.
    - Step 5: Processing — progress bar for async jobs. Completion summary: created/updated/skipped/errored.
  - Import history: `DataTable` of past imports with status, counts, date, user.
- **Export section:**
  - Column picker: checkbox list of all available fields (grouped by section). Respects visibility — only shows fields the user can export.
  - Format select: CSV / XLSX.
  - Filter: reuse directory filters to scope the export.
  - "Export" button → async for large sets, download link via toast notification.

**Permissions:** `people:settings:manage` (typically HR admin + super admin).

---

#### P10. Shared Profile (`/shared/profile/:token`)

Public-facing profile view for external parties. No authentication required.

**Layout:** Minimal, clean single-page layout. No sidebar, no navigation. Company branding at top.

**Content:**

- Avatar + full name (text-h1)
- Job title, department, company name
- Company email
- Work arrangement, location
- Skills (as `Badge` list)
- Education entries (if in public tier)
- Certifications (if in public tier)
- Social links

**Restrictions:**

- Public tier fields only — no personal email, phone, DOB, address, bank, national ID
- No country-specific data, no custom fields
- Token expiry shown if close to expiring
- "This profile was shared by [Company Name]" footer

---

#### P11. Bulk Operations (`/bulk`)

Dedicated page for bulk employee updates.

**Layout:** Step wizard.

**Steps:**

1. **Select operation** — card grid: "Change Department", "Change Manager", "Change Status". Each card with icon, title, description.
2. **Select employees** — reuse directory `DataTable` with checkbox selection. Or paste employee codes. Shows selected count.
3. **Configure change** — form specific to operation type:
   - Department: department tree select + effective date picker
   - Manager: employee search/select for new manager + effective date
   - Status: status select (only valid transitions shown)
4. **Preview** — table showing each employee + what will change (old→new). Validation errors highlighted in red.
5. **Confirm** — summary card + "Execute" button. Progress bar for async processing. Results: success/failure counts with error details expandable.

**Permissions:** `people:profile:update` + specific operation permissions.

---

### 20.3 Shared Patterns

**Across all pages:**

- **Responsive:** all pages work on desktop (1024px+) and tablet (768px+). Mobile (< 768px) for self-service pages only (My Profile, My Tasks).
- **URL state:** filters, search, sort, pagination, active tab all persisted in URL params. Back button works.
- **Loading states:** `Skeleton` components matching content layout. Never blank screens.
- **Error states:** `Alert` with retry button. Network errors show toast via `Sonner`.
- **Empty states:** illustration + message + primary action button (contextual).
- **Keyboard navigation:** all interactive elements focusable. `Command` palette (Cmd+K) for quick employee search across the zone.
- **Density:** compact mode toggle in toolbar for data-heavy views (directory, reports). Sets `data-density="compact"` on container.
- **Breadcrumbs:** `Breadcrumb` component on all sub-pages. Directory → Profile → Tab pattern.

**Data table pattern:**

- All tables use the shared `DataTable` component with: `DataTableToolbar` (search + filters), `DataTableColumnHeader` (sortable), `DataTablePagination`, `DataTableBulkActions` (when applicable), `DataTableEmpty`/`DataTableLoading`/`DataTableError` states.

**Form pattern:**

- All forms use React Hook Form + Zod validation.
- Inline validation with error messages below fields.
- Submit button disabled until form is valid.
- Changes that require approval show info banner: "This change requires [manager/HR] approval."

**Dialog pattern:**

- Create/edit forms open in `Dialog` (small forms) or full-page (complex forms like import wizard).
- Destructive actions use `Alert-Dialog` with confirmation.
- Side detail views use `Drawer` (slide from right).

### 20.4 Page Count Summary

| #   | Page                  | Route                             | Permissions              |
| --- | --------------------- | --------------------------------- | ------------------------ |
| P1  | Directory             | `/`                               | `people:profile:read`    |
| P2  | Org Chart             | `/org-chart`                      | `people:org:read`        |
| P3  | Employee Profile      | `/profile/:employmentId`          | `people:profile:read`    |
| P4  | My Profile            | `/me`                             | authenticated            |
| P5  | Onboarding            | `/onboarding`                     | `people:onboard:manage`  |
| P5a | Onboarding Case       | `/onboarding/:caseId`             | `people:onboard:manage`  |
| P6  | Offboarding           | `/offboarding`                    | `people:offboard:manage` |
| P6a | Offboarding Case      | `/offboarding/:caseId`            | `people:offboard:manage` |
| P7  | Change Requests       | `/change-requests`                | manager or HR            |
| P8  | Reports               | `/reports`                        | `people:reports:read`    |
| P8a | Headcount             | `/reports/headcount`              | `people:reports:read`    |
| P8b | Completeness          | `/reports/completeness`           | `people:reports:read`    |
| P8c | Documents             | `/reports/documents`              | `people:reports:read`    |
| P8d | Probation             | `/reports/probation`              | `people:reports:read`    |
| P8e | Contracts             | `/reports/contracts`              | `people:reports:read`    |
| P9  | Settings              | `/settings`                       | `people:settings:manage` |
| P9a | Job Catalog           | `/settings/job-catalog`           | `people:settings:manage` |
| P9b | Onboarding Templates  | `/settings/onboarding-templates`  | `people:settings:manage` |
| P9c | Offboarding Templates | `/settings/offboarding-templates` | `people:settings:manage` |
| P9d | Country Config        | `/settings/countries`             | `people:settings:manage` |
| P9e | Custom Fields         | `/settings/custom-fields`         | `people:settings:manage` |
| P9f | Edit Policies         | `/settings/edit-policies`         | `people:settings:manage` |
| P9g | Field Visibility      | `/settings/visibility`            | `people:settings:manage` |
| P9h | Email Config          | `/settings/email`                 | `people:settings:manage` |
| P9i | Completeness Rules    | `/settings/completeness`          | `people:settings:manage` |
| P9j | Import/Export         | `/settings/import`                | `people:settings:manage` |
| P10 | Shared Profile        | `/shared/profile/:token`          | none (public)            |
| P11 | Bulk Operations       | `/bulk`                           | `people:profile:update`  |

**Total: 28 pages/views across 11 top-level routes.**
