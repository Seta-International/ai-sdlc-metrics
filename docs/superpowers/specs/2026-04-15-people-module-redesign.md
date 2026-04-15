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

## 2. Core Domain Model

### 2.1 Entity Relationship Overview

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

### 2.2 Person Profile

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

### 2.3 Employment

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

### 2.4 Job Assignment (Effective-Dated)

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

### 2.5 Employment Detail

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

### 2.6 Job Profile Catalog

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

| Event                            | Consumers                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmploymentActivatedEvent`       | time (start accruals), projects (available for staffing), kernel (activate grants)                                                                                              |
| `EmploymentTerminatedEvent`      | time (stop accruals), projects (flag assignments), finance (final pay), kernel (revoke grants), identity (disable SSO), agents (deactivate), goals (reassign OKRs)              |
| `JobAssignmentChangedEvent`      | projects (staffing impact), finance (comp review trigger), time (accrual policy change), performance (reviewer change), goals (ownership shift), kernel (role grant evaluation) |
| `EmployeeOnLeaveEvent`           | time, projects (temporary backfill)                                                                                                                                             |
| `EmployeeSuspendedEvent`         | projects (remove from active work)                                                                                                                                              |
| `EmployeeReturnedFromLeaveEvent` | time, projects                                                                                                                                                                  |
| `ProfileChangeAppliedEvent`      | finance (bank account change), notifications                                                                                                                                    |
| `ContractVersionCreatedEvent`    | finance (payroll terms)                                                                                                                                                         |
| `ContractExpiringEvent`          | notifications                                                                                                                                                                   |
| `ProbationConfirmedEvent`        | finance (salary adjustment)                                                                                                                                                     |
| `ProbationEndingEvent`           | notifications                                                                                                                                                                   |
| `DocumentExpiringEvent`          | notifications                                                                                                                                                                   |
| `ProfileIncompleteEvent`         | notifications                                                                                                                                                                   |

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

### 17.4 Integration Principle

People module is the source of truth for who works where and in what role. It emits events for state changes. It never calls projects/finance/time — those modules react to people events. People only queries kernel (department/authority validation) and documents (file storage).

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
