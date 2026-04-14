# Module: employee

## Source

- **Path:** `/Users/canh/Projects/Seta/legacy/ems`
- **Stack:** Python 3 / FastAPI / SQLAlchemy ORM / Pydantic v2 / PostgreSQL
- **Key files:**

| File                                                              | Purpose                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/core/models/employee.py`                                     | `Employee` SQLAlchemy entity (main table `employees`)                                                                                |
| `src/core/models/employee_draft.py`                               | Draft workflow entities (10 `*_drafts` tables)                                                                                       |
| `src/core/models/employee_related.py`                             | 1:N / 1:1 child entities (contacts, documents, education, certifications, skills, languages, projects, children, profile)            |
| `src/core/enums/employee.py`                                      | All employee-domain enums                                                                                                            |
| `src/core/mapper/employee.py`                                     | `EmployeeMapper` -- DTO-to-model and draft-to-employee mapping                                                                       |
| `src/core/services/employee_service.py`                           | Core business logic (~985 lines)                                                                                                     |
| `src/repository/employee_repository.py`                           | Employee queries (~622 lines)                                                                                                        |
| `src/repository/employee_draft_repository.py`                     | Draft queries (~583 lines)                                                                                                           |
| `src/repository/effort_repository.py`                             | Effort/staffing percentage queries                                                                                                   |
| `src/repository/salary_repository.py`                             | Salary history and structure queries                                                                                                 |
| `src/present/routers/employee_router.py`                          | FastAPI route definitions (~537 lines)                                                                                               |
| `src/present/dto/employee/create_employee_dto.py`                 | `CreateEmployeeDTO`, `UpdateEmployeeDTO`, `EmployeeCVDTO`, `EmployeeDraftCommentDTO`, `ExportSelectedRequest`                        |
| `src/present/dto/employee/employee_response_dto.py`               | All response DTOs (paginated list, detail, draft, search, effort, share-link, avatar sync)                                           |
| `src/present/dto/employee_related/create_employee_related_dto.py` | Sub-entity DTOs + Response models for contacts, documents, education, certifications, profile, languages, skills, projects, children |

---

## Domain Model

### Core Entity: `Employee` (table `employees`)

| Column              | Type                     | Nullable | Notes                                                                             |
| ------------------- | ------------------------ | -------- | --------------------------------------------------------------------------------- |
| `id`                | BigInteger PK            | no       | Manually assigned (auto-generated with prefix-based algorithm, prefixes 7/8/9/10) |
| `summary`           | Text                     | yes      | Bio/summary text                                                                  |
| `avatar_path`       | String(255)              | yes      | MinIO object path                                                                 |
| `full_name`         | String(255)              | no       |                                                                                   |
| `personal_email`    | String(255)              | yes      |                                                                                   |
| `email`             | String(255)              | no       | Company email, unique index `idx_employee_email`                                  |
| `phone`             | String(15)               | yes      | With country code support                                                         |
| `gender`            | Enum(GenderEnum)         | yes      |                                                                                   |
| `date_of_birth`     | Date                     | yes      |                                                                                   |
| `marital_status`    | Enum(MaritalStatusEnum)  | yes      |                                                                                   |
| `join_date`         | Date                     | yes      |                                                                                   |
| `current_position`  | String(255)              | yes      | Job title                                                                         |
| `permanent_address` | Text                     | yes      |                                                                                   |
| `current_address`   | Text                     | yes      |                                                                                   |
| `status`            | Enum(EmployeeStatusEnum) | no       | Default `Active`                                                                  |
| `hashed_password`   | String(1024)             | no       | Local auth password                                                               |
| `created_at`        | DateTime                 | no       | server_default=now()                                                              |
| `updated_at`        | DateTime                 | no       | server_default=now(), auto-update                                                 |

**Relationships (all cascade delete-orphan):**

| Relation           | Model                    | Table                       | Cardinality |
| ------------------ | ------------------------ | --------------------------- | ----------- |
| `contacts`         | `EmployeeContact`        | `employee_contacts`         | 1:N         |
| `document`         | `EmployeeDocument`       | `employee_documents`        | 1:1         |
| `educations`       | `EmployeeEducation`      | `employee_education`        | 1:N         |
| `certifications`   | `EmployeeCertification`  | `employee_certifications`   | 1:N         |
| `profile`          | `EmployeeProfile`        | `employee_profiles`         | 1:1         |
| `languages`        | `Language`               | `languages`                 | 1:N         |
| `technical_skills` | `EmployeeTechnicalSkill` | `employee_technical_skills` | 1:N         |
| `projects`         | `EmployeeProject`        | `employee_projects`         | 1:N         |
| `children`         | `EmployeeChild`          | `employee_children`         | 1:N         |

### Child Entity Details

#### EmployeeContact (`employee_contacts`)

| Column                      | Type                                            |
| --------------------------- | ----------------------------------------------- |
| `id`                        | BigInteger PK auto                              |
| `employee_id`               | BigInteger FK -> employees.id ON DELETE CASCADE |
| `name`                      | String(255) NOT NULL                            |
| `relation`                  | String(100) NOT NULL                            |
| `phone`                     | String(15) NOT NULL                             |
| `created_at` / `updated_at` | DateTime                                        |

#### EmployeeDocument (`employee_documents`)

| Column                      | Type                                                |
| --------------------------- | --------------------------------------------------- |
| `id`                        | BigInteger PK auto                                  |
| `employee_id`               | BigInteger FK -> employees.id, UNIQUE               |
| `identity_number`           | String(20) -- CCCD (12-digit Vietnamese citizen ID) |
| `identity_date`             | Date                                                |
| `identity_place`            | String(255)                                         |
| `old_identity_number`       | String(15) -- CMND (old 9-digit ID)                 |
| `old_identity_date`         | Date                                                |
| `old_identity_place`        | String(255)                                         |
| `tax_id_number`             | String(15) -- MST (10-13 digits)                    |
| `social_insurance_number`   | String(15) -- BHXH                                  |
| `bank_name`                 | String(100)                                         |
| `branch_name`               | String(255)                                         |
| `account_bank_number`       | String(30)                                          |
| `motorbike_plate`           | String(15)                                          |
| `created_at` / `updated_at` | DateTime                                            |

#### EmployeeEducation (`employee_education`)

| Column            | Type                 |
| ----------------- | -------------------- |
| `id`              | BigInteger PK auto   |
| `employee_id`     | BigInteger FK        |
| `school_name`     | String(255) NOT NULL |
| `graduation_year` | Integer              |
| `degree`          | String(255)          |
| `major`           | String(255)          |

#### EmployeeCertification (`employee_certifications`)

| Column             | Type                 |
| ------------------ | -------------------- |
| `id`               | BigInteger PK auto   |
| `employee_id`      | BigInteger FK        |
| `certificate_name` | String(255) NOT NULL |
| `issued_by`        | String(255) NOT NULL |
| `issued_date`      | Date                 |
| `expiry_date`      | Date                 |

#### EmployeeProfile (`employee_profiles`)

| Column                    | Type               |
| ------------------------- | ------------------ |
| `id`                      | BigInteger PK auto |
| `employee_id`             | BigInteger FK      |
| `facebook_link`           | String(500)        |
| `linkedin_link`           | String(500)        |
| `how_heard_about_company` | Text               |
| `hobbies`                 | Text               |

#### Language (`languages`)

| Column          | Type                           |
| --------------- | ------------------------------ |
| `id`            | BigInteger PK auto             |
| `employee_id`   | BigInteger FK                  |
| `language_name` | String(100) NOT NULL           |
| `proficiency`   | Enum(ProficiencyEnum) NOT NULL |
| `description`   | Text                           |

#### EmployeeTechnicalSkill (`employee_technical_skills`)

| Column        | Type                             |
| ------------- | -------------------------------- |
| `id`          | BigInteger PK auto               |
| `employee_id` | BigInteger FK                    |
| `category`    | Enum(SkillCategoryEnum) NOT NULL |
| `skill_name`  | String(255) NOT NULL             |
| `description` | Text                             |

#### EmployeeProject (`employee_projects`)

| Column                  | Type                 |
| ----------------------- | -------------------- |
| `id`                    | BigInteger PK auto   |
| `employee_id`           | BigInteger FK        |
| `project_name`          | String(255) NOT NULL |
| `project_description`   | Text                 |
| `position`              | String(255)          |
| `responsibilities`      | Text                 |
| `programming_languages` | Text                 |

#### EmployeeChild (`employee_children`)

| Column          | Type                 |
| --------------- | -------------------- |
| `id`            | BigInteger PK auto   |
| `employee_id`   | BigInteger FK        |
| `full_name`     | String(255) NOT NULL |
| `date_of_birth` | Date NOT NULL        |

### Enums

| Enum                       | Values                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GenderEnum`               | `Male`, `Female`                                                                                                            |
| `ProficiencyEnum`          | `Native`, `Fluent`, `Intermediate`, `Basic`                                                                                 |
| `SkillCategoryEnum`        | `Programming Language`, `Database`, `Framework`, `Tool`, `Hardware`                                                         |
| `SoftSkillEnum`            | `Communication`, `Teamwork`, `Problem Solving`, `Decision Making`, `Leadership`, `Time Management`, `Adaptability`, `Other` |
| `MaritalStatusEnum`        | `Single`, `Married`, `Divorced`, `Widowed`                                                                                  |
| `EmployeeStatusEnum`       | `Active`, `Inactive`, `Pending Approve`                                                                                     |
| `EmployeeDraftStatusEnum`  | `Draft`, `Approved`, `Rejected`                                                                                             |
| `DraftStatusEnum`          | `Draft`, `Approved`, `Rejected` (duplicate of above, both exist)                                                            |
| `SessionProviderEnum`      | `Local`, `Microsoft`                                                                                                        |
| `EmployeeSearchOptionEnum` | `effort`                                                                                                                    |

### Draft Tables (parallel shadow structure)

Every entity has a `*Draft` counterpart with identical columns plus `employee_id` FK:

- `employee_drafts` -- mirrors `employees` + `draft_status`, `comment` columns
- `employee_contact_drafts`
- `employee_document_drafts`
- `employee_education_drafts`
- `employee_certification_drafts`
- `employee_profile_drafts`
- `language_drafts`
- `employee_technical_skill_drafts`
- `employee_project_drafts`
- `employee_child_drafts`

---

## Business Logic

### EmployeeService Methods

| Method                             | Signature                                                                      | Description                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_employee`                  | `(admin_id: int, dto: CreateEmployeeDTO) -> EmployeeResponseDTO`               | Creates employee with auto-generated ID (prefix 7/8/9/10), auto-generated company email (`first.last@seta-international.vn`), temp password, assigns EMPLOYEE role. Optionally triggers Microsoft Teams account creation via email workflow. Sends temp password to admin via email. Fires `EMPLOYEE_CREATED` webhook. |
| `create_employee_migration`        | `(dto: CreateEmployeeDTO) -> EmployeeResponseDTO`                              | Bulk migration path -- creates employee without admin context, no email workflow, fires webhook.                                                                                                                                                                                                                       |
| `get_employees`                    | `(page, page_size, sort_by, sort_direction, filters) -> EmployeePaginationDTO` | Paginated list with filtering. Auto-adjusts page if beyond max. Resolves avatar URLs from MinIO.                                                                                                                                                                                                                       |
| `get_employee_with_details`        | `(employee_id: int) -> EmployeeWithDetailsResponseDTO`                         | Full employee with all relations loaded. Checks offboarding status. Resolves avatar URL.                                                                                                                                                                                                                               |
| `get_employee_basic_info`          | `(employee_id: int) -> EmployeeBasicInfoResponseDTO`                           | Lightweight employee info (no sub-entities).                                                                                                                                                                                                                                                                           |
| `search_employees`                 | `(string, options: list[EmployeeSearchOptionEnum], limit) -> list`             | Searches by id/name/email/phone (partial, active only). Optionally includes effort percentage.                                                                                                                                                                                                                         |
| `update_employee`                  | `(employee_id, dto: UpdateEmployeeDTO) -> EmployeeWithDetailsResponseDTO`      | Admin direct update -- maps to draft, then immediately maps back to employee (delete+recreate pattern). Validates duplicates.                                                                                                                                                                                          |
| `update_employee_draft`            | `(request, dto: UpdateEmployeeDTO)`                                            | Employee self-service edit -- removes old draft, creates new draft in `Draft` status.                                                                                                                                                                                                                                  |
| `approve_employee_draft`           | `(employee_id: int)`                                                           | HR/admin approves draft: merges draft data into live employee (delete old + create new), deletes draft.                                                                                                                                                                                                                |
| `reject_employee_draft`            | `(employee_id: int, comment: str)`                                             | HR/admin rejects draft with comment. Sets `draft_status = Rejected`.                                                                                                                                                                                                                                                   |
| `get_drafts`                       | `(page, page_size, sort_by, sort_direction, filters) -> EmployeePaginationDTO` | Paginated draft list (only `Draft` status, not approved/rejected).                                                                                                                                                                                                                                                     |
| `get_draft_by_id`                  | `(employee_id: int) -> EmployeeDraftWithDetailsResponseDTO`                    | Full draft with all draft sub-entities.                                                                                                                                                                                                                                                                                |
| `delete_employee`                  | `(employee_id: int)`                                                           | Hard deletes employee + all drafts + sessions + roles.                                                                                                                                                                                                                                                                 |
| `generate_employee_share_link`     | `(employee_id: int) -> GenerateShareLinkResponseDTO`                           | Creates JWT-based share token for employee profile. Returns URL with `?state=<token>`.                                                                                                                                                                                                                                 |
| `get_employee_from_share_token`    | `(token: str) -> EmployeeWithDetailsResponseDTO`                               | Verifies JWT share token, returns full employee profile. Handles expired/invalid tokens.                                                                                                                                                                                                                               |
| `generate_employee_id_suggestions` | `() -> List[int]`                                                              | Generates available employee ID suggestions with prefixes [7, 8, 9, 10].                                                                                                                                                                                                                                               |
| `get_employee_effort_percentage`   | `(employee_id: int) -> EmployeeEffortDetailResponseDTO`                        | Returns per-project effort breakdown (effort %, project name, account name).                                                                                                                                                                                                                                           |
| `get_employee_efforts`             | `(page, page_size, start_date, end_date) -> Pagination`                        | Paginated list of employees with their total effort percentage.                                                                                                                                                                                                                                                        |
| `check_email_exists`               | `(email: str) -> bool`                                                         | Checks if email already used by any employee.                                                                                                                                                                                                                                                                          |
| `sync_avatar_from_teams`           | `(employee_id: int) -> bool`                                                   | Fetches photo from Microsoft Graph API, uploads to MinIO, updates `avatar_path`.                                                                                                                                                                                                                                       |
| `sync_all_avatars_from_teams`      | `() -> AvatarSyncResponseDTO`                                                  | Batch syncs all employees without avatars. Returns stats (total/synced/skipped/failed).                                                                                                                                                                                                                                |
| `webhook_trigger`                  | `(email: str)`                                                                 | Activates employee by email and fires `EMPLOYEE_CREATED` webhook.                                                                                                                                                                                                                                                      |
| `_check_duplicate_fields_`         | `(employee_id, check_dict)`                                                    | Validates uniqueness of: email, personal_email, phone, identity_number, old_identity_number, tax_id_number, social_insurance_number, account_bank_number, motorbike_plate.                                                                                                                                             |

### Draft / Approval Workflow

```
Employee self-edits profile
    |
    v
update_employee_draft() -- creates shadow copy in *_drafts tables, status = DRAFT
    |
    +-- HR views via get_drafts() / get_draft_by_id()
    |
    +-- approve_employee_draft()
    |       Merges draft -> live employee (delete old rows + insert new)
    |       Deletes all draft rows
    |
    +-- reject_employee_draft(comment)
            Sets draft_status = REJECTED with comment
```

**Key implementation detail:** Updates use a destructive delete-then-recreate pattern rather than in-place field updates. The entire employee record (and all child records) is deleted and re-inserted.

### Search / Filtering

**List filters** (in `_apply_filters`):

- `id` (exact match)
- `email` (ILIKE)
- `full_name` (ILIKE)
- `phone` (ILIKE)
- `current_position` (ILIKE)
- `gender` (exact enum match)
- `status` (exact enum match)
- `marital_status` (ILIKE)
- `join_date_from` / `join_date_to` (range)
- `skill_name` (ILIKE, joins `employee_technical_skills`)

**Search** (`search_employee_by_string`): OR across `id` (cast to string), `full_name`, `email`, `phone` -- active employees only.

### Effort Tracking Logic

- `EffortRepository.get_employee_effort_percentage(employee_id)` -- joins `project_employees` -> `projects` -> `accounts` to get per-project effort %.
- `EffortRepository.get_employee_total_effort_percentage_from_list(ids)` -- SUM of effort percentages grouped by employee.
- `EffortRepository.get_employees_effort(page, page_size, account_id, project_id)` -- paginated employees with total effort, optional account/project filter.
- Search results can optionally include `total_effort` when `EmployeeSearchOptionEnum.EFFORT` is passed.

### Salary Data (via `SalaryRepository`)

- `get_latest_salary(employee_id)` -- latest active salary record (`is_latest = True`).
- `create_salary(salary)` -- marks previous as inactive, inserts new.
- `get_salary_history(employee_id)` -- all salary records ordered by created_at desc.
- `get_all_employee_salary(page, page_size, sort_by, ...)` -- paginated employee list with latest salary joined.
- `get_salaries_by_employee_ids(ids)` -- batch fetch latest salaries.
- `SalaryStructureRepository` -- manages salary component structure (ordered list of `SalaryStructure` items).

---

## API Endpoints

All routes under prefix `/orgs/employees`.

| Method | Path                           | Auth / Role                                                            | Request                                                                                                                                                                                         | Response                              | Description                        |
| ------ | ------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------- |
| POST   | `/`                            | `SUPER_ADMIN`, `HR`                                                    | `CreateEmployeeDTO` body                                                                                                                                                                        | `EmployeeResponseDTO` (201)           | Create employee                    |
| GET    | `/`                            | any authenticated                                                      | Query params: page, page_size, sort_by, sort_direction, id, full_name, email, phone, current_position, gender, status, marital_status, skill_name, skill_category, join_date_from, join_date_to | `EmployeePaginationDTO`               | Paginated list                     |
| GET    | `/search`                      | any authenticated                                                      | `suggest` (str), `options` (list of `EmployeeSearchOptionEnum`)                                                                                                                                 | `list[EmployeeSearchResponseDTO]`     | Quick search                       |
| GET    | `/me`                          | any authenticated                                                      | --                                                                                                                                                                                              | `EmployeeWithDetailsResponseDTO`      | Current user's full profile        |
| GET    | `/efforts`                     | any authenticated                                                      | page, page_size, start_date, end_date                                                                                                                                                           | Paginated effort list                 | Employee effort percentages        |
| GET    | `/efforts/{employee_id}`       | any authenticated                                                      | --                                                                                                                                                                                              | `EmployeeEffortDetailResponseDTO`     | Per-project effort breakdown       |
| GET    | `/id-suggestions`              | `SUPER_ADMIN`, `HR`                                                    | --                                                                                                                                                                                              | `List[int]`                           | Available employee ID suggestions  |
| GET    | `/{employee_id}`               | `SUPER_ADMIN`, `HR`, `EXECUTIVE`, `ACCOUNT_MANAGER`, `PROJECT_MANAGER` | --                                                                                                                                                                                              | `EmployeeWithDetailsResponseDTO`      | Full employee detail               |
| GET    | `/basic-info/{employee_id}`    | Same as above (contract module access)                                 | --                                                                                                                                                                                              | `EmployeeBasicInfoResponseDTO`        | Basic info for cross-module use    |
| PUT    | `/{employee_id}`               | `SUPER_ADMIN`, `HR`                                                    | `UpdateEmployeeDTO` body                                                                                                                                                                        | `EmployeeWithDetailsResponseDTO`      | Admin direct update                |
| PUT    | `/draft`                       | any authenticated                                                      | `UpdateEmployeeDTO` body                                                                                                                                                                        | --                                    | Employee self-edit (creates draft) |
| GET    | `/drafts`                      | `SUPER_ADMIN`, `HR`                                                    | page, page_size, sort_by, sort_direction                                                                                                                                                        | `EmployeePaginationDTO`               | List pending drafts                |
| GET    | `/drafts/me`                   | any authenticated                                                      | --                                                                                                                                                                                              | `EmployeeDraftWithDetailsResponseDTO` | Current user's own draft           |
| GET    | `/drafts/{employee_id}`        | `SUPER_ADMIN`, `HR`                                                    | --                                                                                                                                                                                              | `EmployeeDraftWithDetailsResponseDTO` | View specific draft                |
| PUT    | `/draft/approve/{employee_id}` | `SUPER_ADMIN`, `HR`                                                    | --                                                                                                                                                                                              | --                                    | Approve draft                      |
| PUT    | `/draft/reject/{employee_id}`  | `SUPER_ADMIN`, `HR`                                                    | `EmployeeDraftCommentDTO` body                                                                                                                                                                  | --                                    | Reject draft with comment          |
| POST   | `/share-link/{employee_id}`    | `SUPER_ADMIN`, `HR`                                                    | --                                                                                                                                                                                              | `GenerateShareLinkResponseDTO`        | Generate profile share URL         |
| GET    | `/shared`                      | public (token-based)                                                   | `token` query param                                                                                                                                                                             | `EmployeeWithDetailsResponseDTO`      | Access shared profile              |
| POST   | `/generate-email`              | `SUPER_ADMIN`, `HR`                                                    | `full_name` query param                                                                                                                                                                         | `{email: str}`                        | Generate company email             |
| GET    | `/webhook/active/{email}`      | `access_token` query param                                             | --                                                                                                                                                                                              | email string                          | Activate employee + fire webhook   |
| POST   | `/sync-avatars`                | any authenticated                                                      | --                                                                                                                                                                                              | `AvatarSyncResponseDTO`               | Batch sync avatars from MS Teams   |
| DELETE | `/{employee_id}`               | (in service, not router -- called internally)                          | --                                                                                                                                                                                              | --                                    | Hard delete employee               |

---

## Target Overlap

### What already exists in the `people` module

The target `people` module at `/Users/canh/Projects/Seta/future/apps/api/src/modules/people/` already has a significantly redesigned data model:

**Schema tables (`people.schema.ts`):**

- `employment_profile` -- corresponds to `employees` but redesigned (UUID PK, multi-tenant, `actorId` reference to identity module, employment type/status/work arrangement enums, job level/cost center)
- `employment_profile_detail` -- corresponds to `employee_documents` + personal info fields merged (nationalId, taxId, bankAccount, dob, gender, maritalStatus, addresses, phone, emergencyContact, motorbikePlate)
- `profile_section` -- **generic JSONB-based** table replacing all 1:N sub-entity tables (education, certification, skill, language, social_link, dependent) via `sectionType` + `payload`
- `profile_change_request` -- replaces the entire draft system with a per-field change request model (field path + old/new value + approval status)
- `periodic_profile_review` -- new concept (no legacy equivalent)
- `onboarding_template` / `onboarding_task_template` / `onboarding_case` / `onboarding_task` -- new structured onboarding workflow
- `offboarding_template` / `offboarding_task_template` / `offboarding_case` / `offboarding_task` -- new structured offboarding workflow
- `account_membership` -- cross-entity membership (account/project roles)
- `contract_version` -- employment contract versioning (no legacy equivalent in employee module)

**Commands already implemented:**

- `create-employment-profile` -- creates profile from hiring pipeline (event-driven via `on-candidate-hired`)
- `request-profile-change` -- employee self-edit (per-field change request)
- `approve-profile-change` / `reject-profile-change` -- HR approval
- `update-profile-direct` -- admin direct update
- `trigger-offboarding` / `approve-offboarding` / `reject-offboarding` / `complete-offboarding`
- `complete-task` -- onboarding/offboarding task completion

**Queries already implemented:**

- `get-profile` -- single profile detail
- `list-employees` -- paginated list
- `list-profile-change-requests` -- pending changes
- `list-onboarding-tasks`
- `list-periodic-reviews`
- `list-contract-versions`
- `list-templates`
- `export-people-directory`

### What is missing / needs to be added

1. **Employee search** -- the quick search by id/name/email/phone is not yet implemented
2. **Effort tracking** -- no effort/staffing queries exist in the people module (this may belong in the `projects` module instead)
3. **Salary data** -- not in people module (should go to `finance` module per the domain map)
4. **Avatar sync from Microsoft Teams** -- no equivalent; in future, avatar management likely moves to identity module or a media service
5. **Share link generation** -- JWT-based profile sharing not yet implemented
6. **Email generation** -- auto-generating company emails from full names not yet implemented
7. **Employee ID suggestions** -- legacy uses numeric IDs with prefix algorithm; future uses UUIDs, making this unnecessary
8. **Webhook trigger endpoint** -- replaced by domain events in the future architecture
9. **CV export DTO** (`EmployeeCVDTO`) -- used by CV/resume generation, not yet present

### Key differences in modeling approach

| Aspect                     | Legacy (EMS)                                                       | Future (people module)                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primary key**            | BigInteger (manual assignment with prefix algorithm)               | UUID v7 (auto-generated)                                                                                                                            |
| **Multi-tenancy**          | Single-tenant (no `tenant_id`)                                     | `tenant_id` on every table, RLS                                                                                                                     |
| **Identity**               | `hashed_password` on employee, local auth                          | Separate `identity` module, `actorId` reference                                                                                                     |
| **Sub-entities**           | Dedicated tables per type (9 tables)                               | Generic `profile_section` with JSONB `payload` (6 section types)                                                                                    |
| **Draft workflow**         | Full shadow copy of all tables (10 draft tables), all-or-nothing   | Per-field `profile_change_request` with `fieldPath` + old/new value                                                                                 |
| **Update mechanism**       | Delete entire employee + all children, re-insert                   | In-place field updates                                                                                                                              |
| **Employee status**        | `Active`, `Inactive`, `Pending Approve`                            | `pre_hire`, `active`, `on_leave`, `offboarding`, `terminated`                                                                                       |
| **Employment type**        | Not modeled                                                        | `permanent`, `fixed_term`, `contractor`, `intern`                                                                                                   |
| **Work arrangement**       | Not modeled                                                        | `onsite`, `hybrid`, `remote`                                                                                                                        |
| **Emergency contacts**     | Separate `employee_contacts` table (name, relation, phone)         | Single `emergencyContactName` + `emergencyContactPhone` on `employment_profile_detail`                                                              |
| **Children/dependents**    | Dedicated `employee_children` table                                | `profile_section` with `sectionType = 'dependent'`                                                                                                  |
| **Social links**           | `employee_profiles` table (facebook, linkedin, hobbies, how_heard) | `profile_section` with `sectionType = 'social_link'`                                                                                                |
| **Projects (personal CV)** | `employee_projects` table                                          | Not yet modeled in profile_section types (legacy tracks personal project history for CV; future `projects` module handles real project assignments) |
| **Contracts**              | Not in employee module                                             | `contract_version` table in people module                                                                                                           |
| **Onboarding/Offboarding** | Basic offboarding flag only                                        | Full template-based workflow with tasks, assignees, due dates                                                                                       |

---

## Dependencies

### Other legacy modules this depends on

| Module     | Usage                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `contract` | `ContractEvaluationLeader` model queried in employee repository; `RequireRoleForContractModule` used for basic-info endpoint |
| `media`    | `Media` model, `MediaRepository` for avatar storage tracking; `MediaType.AVATAR` enum                                        |
| `account`  | `Account` model used in effort queries (account name)                                                                        |
| `project`  | `Project`, `ProjectEmployee` models for effort percentage calculations                                                       |
| `role`     | `RoleRepository`, `EmployeeRole`, `RoleName`, `RoleType` for role assignment and access control                              |
| `session`  | `SessionRepository` for cleaning up sessions on employee deletion                                                            |
| `offboard` | `OffboardRepository.is_employee_offboarding()` checked in profile responses                                                  |
| `salary`   | `SalaryRepository` / `SalaryStructureRepository` for compensation data                                                       |

### External services

| Service                   | Usage                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| **MinIO** (S3-compatible) | Avatar file storage and presigned URL generation via `MinioClient`                          |
| **Microsoft Graph API**   | Fetch user photos from Teams/Entra via `MicrosoftClient.get_user_photo()`                   |
| **Email (SMTP)**          | `MailChannel.send_admin_temporary_password()` and `MailChannel.send_create_user_workflow()` |
| **JWT**                   | `JWTService` for share link token generation/verification                                   |
| **Webhooks**              | `WebhookService.send_webhook()` fires `EMPLOYEE_CREATED` event to external systems          |

---

## Migration Notes

### Complex areas that need special attention

1. **Delete-and-recreate update pattern**: The legacy system deletes the entire employee record and all child records, then re-inserts on every update. This is fragile and loses `created_at` timestamps. The future system correctly does in-place updates.

2. **Draft workflow redesign**: Legacy uses 10 shadow tables that duplicate the entire employee structure. Future uses per-field `profile_change_request`. Migration must translate the all-or-nothing draft approval into multiple per-field change requests, or implement a batch change request concept.

3. **Employee ID scheme**: Legacy uses manually assigned BigInteger IDs with a prefix-based generation algorithm (prefixes 7, 8, 9, 10). Future uses UUID v7. Any data migration must maintain a mapping from old numeric IDs to new UUIDs. The `employeeCode` field on `employment_profile` can store the legacy numeric ID as a string reference.

4. **Emergency contacts vs. dedicated contacts table**: Legacy supports multiple emergency contacts with name/relation/phone. Future has only a single emergency contact pair (`emergencyContactName`, `emergencyContactPhone`). If multiple contacts must be preserved, they could go into a `profile_section` with type `dependent` or a new section type `emergency_contact`.

5. **EmployeeProject (CV projects)**: Legacy tracks personal project history for CV generation (project name, description, position, responsibilities, programming languages). This is distinct from real project assignments in the `projects` module. Future has no equivalent section type yet -- needs a new `profile_section` type like `project_history` or `cv_project`.

6. **Profile social data**: Legacy stores `how_heard_about_company` and `hobbies` on `employee_profiles`. These don't map cleanly to the future `social_link` section type. May need a `profile_section` type `personal_info` or custom fields.

7. **Effort tracking scope**: Legacy puts effort queries in the employee module. In the future architecture, effort/staffing belongs in the `projects` module, with the `people` module consuming it via `QueryFacade`. Do not re-implement effort queries in the people module.

8. **Salary scope**: Legacy has salary repositories alongside employee code. Future correctly separates salary into the `finance` module per the domain map.

9. **Auth separation**: Legacy stores `hashed_password` directly on the employee. Future separates authentication into the `identity` module with `actorId` linking. Password management must not leak into the people module.

10. **Webhook to domain events**: Legacy fires webhooks (`EMPLOYEE_CREATED`) directly from the service. Future uses outbox-based domain events defined in `@future/event-contracts`. Replace all webhook calls with proper domain event emission.

### Data model field mapping (legacy -> future)

| Legacy field                  | Future location                                                             |
| ----------------------------- | --------------------------------------------------------------------------- |
| `employees.id`                | `employment_profile.employeeCode` (as string)                               |
| `employees.full_name`         | Stored in `identity` module (user profile)                                  |
| `employees.email`             | `employment_profile.companyEmail`                                           |
| `employees.personal_email`    | `employment_profile_detail.personalEmail`                                   |
| `employees.phone`             | `employment_profile_detail.personalPhone`                                   |
| `employees.gender`            | `employment_profile_detail.gender`                                          |
| `employees.date_of_birth`     | `employment_profile_detail.dob`                                             |
| `employees.marital_status`    | `employment_profile_detail.maritalStatus`                                   |
| `employees.join_date`         | `employment_profile.hireDate`                                               |
| `employees.current_position`  | `employment_profile.jobTitle`                                               |
| `employees.permanent_address` | `employment_profile_detail.permanentAddress`                                |
| `employees.current_address`   | `employment_profile_detail.currentAddress`                                  |
| `employees.status`            | `employment_profile.employmentStatus` (re-mapped values)                    |
| `employees.avatar_path`       | Identity module or media service                                            |
| `employees.summary`           | No direct mapping -- could be a profile_section or employment_profile field |
| `employee_documents.*`        | `employment_profile_detail.*` (field names renamed)                         |
| `employee_contacts`           | `employment_profile_detail.emergencyContactName/Phone` (single)             |
| `employee_education`          | `profile_section` type `education`, JSONB payload                           |
| `employee_certifications`     | `profile_section` type `certification`, JSONB payload                       |
| `employee_technical_skills`   | `profile_section` type `skill`, JSONB payload                               |
| `languages`                   | `profile_section` type `language`, JSONB payload                            |
| `employee_profiles` (social)  | `profile_section` type `social_link`, JSONB payload                         |
| `employee_children`           | `profile_section` type `dependent`, JSONB payload                           |
| `employee_projects` (CV)      | No current section type -- needs `project_history` or similar               |
| `employee_drafts`             | `profile_change_request` (per-field, not per-entity)                        |

### Business rules that must be preserved

1. **Duplicate field validation**: email, personal_email, phone, identity_number, old_identity_number, tax_id_number, social_insurance_number, account_bank_number, motorbike_plate must all be unique across employees.
2. **Company email auto-generation**: Vietnamese name -> latin transliteration -> `first.last@domain` with dedup attempts.
3. **Draft approval atomicity**: When a draft is approved, all changes apply at once (not partially).
4. **Profile share links**: JWT-based temporary access to employee profiles for external sharing.
5. **Employee search**: Must support partial matching across id, name, email, phone simultaneously.
6. **Offboarding flag**: Employee detail response includes `is_offboarding` boolean from offboarding module.
