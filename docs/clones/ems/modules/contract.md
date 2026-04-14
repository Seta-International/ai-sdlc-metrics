# Module: contract

## Source

- **Path:** `/Users/canh/Projects/Seta/legacy/ems`
- **Key files:**

| File                                                    | Purpose                                                                                                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/models/contract.py`                           | Domain entities: ContractVersion, ContractDocument, ContractEvaluation, ContractEvaluationLeader; enums ContractStatus, EvaluationResultEnum |
| `src/core/models/contract_placeholder.py`               | ContractPlaceholder entity for template variable mappings                                                                                    |
| `src/core/models/configuration.py`                      | ContractType, HandoverStatus, ContractHandler entities (shared config table)                                                                 |
| `src/core/constant/contract_placeholder.py`             | Static PLACEHOLDER_MAPPING dict (employee/document/contract field paths)                                                                     |
| `src/core/services/contract_service.py`                 | Main business logic (~47KB, ~1186 lines) -- version lifecycle, document generation, evaluation leaders, scheduling                           |
| `src/core/services/contract_evaluation_service.py`      | Evaluation criteria fetch, submission, submitted-evaluations listing                                                                         |
| `src/core/services/contract_handler_service.py`         | CRUD for contract handlers (employees who bypass role checks); schedules reminders                                                           |
| `src/core/services/contract_data_mapper.py`             | Maps placeholder keys to employee/document/contract data; auto-translation EN/VI                                                             |
| `src/core/services/contract_type_service.py`            | CRUD for ContractType lookup table                                                                                                           |
| `src/core/services/contract_placeholder_service.py`     | Thin read service for placeholders                                                                                                           |
| `src/repository/contract_version_repository.py`         | Complex queries: latest versions, employee listing with filters/sort/pagination, expiring contracts, statistics                              |
| `src/repository/contract_document_repository.py`        | CRUD + bulk ops for contract documents                                                                                                       |
| `src/repository/contract_evaluation_repository.py`      | Upsert evaluations with IntegrityError handling                                                                                              |
| `src/repository/contract_handler_repository.py`         | Handler CRUD, `is_contract_handler` check, joins to Employee+Role                                                                            |
| `src/repository/contract_type_repository.py`            | Standard CRUD for ContractType                                                                                                               |
| `src/repository/contract_placeholder_repository.py`     | Simple list-all query                                                                                                                        |
| `src/repository/evaluation_leader_repository.py`        | Sync leaders (add/remove), assigned-as-leader check                                                                                          |
| `src/present/routers/contract_router.py`                | 16 REST endpoints for contracts (~554 lines)                                                                                                 |
| `src/present/routers/contract_config_router.py`         | Config endpoints: handlers, placeholders, types, handover statuses (~459 lines)                                                              |
| `src/present/controllers/contract_controller.py`        | Thin controller delegating to ContractService + ContractEvaluationService                                                                    |
| `src/present/controllers/contract_config_controller.py` | Thin controller for config operations                                                                                                        |
| `src/present/dependencies/contract_access_control.py`   | `RequireRoleForContractModule` -- contract handlers bypass normal RBAC                                                                       |
| `src/present/dto/contract/contract_version.py`          | DTOs: Create, Save, Update, ListItem, EvaluationLeaders, Statistics                                                                          |
| `src/present/dto/contract/contract_document.py`         | DTOs: Placeholder, PlaceholderFilled, Upload, Generate, Preview, ReminderJob                                                                 |
| `src/present/dto/contract/contract_evaluation.py`       | DTOs: EvaluationForm, Submit, SubmittedList                                                                                                  |
| `src/present/dto/contract/contract_type_dto.py`         | CRUD DTOs for ContractType                                                                                                                   |
| `src/present/dto/contract/contract_placeholder_dto.py`  | Read DTO for ContractPlaceholder                                                                                                             |
| `src/present/dto/contract/contract_template_dto.py`     | CRUD DTOs for contract DOCX templates                                                                                                        |
| `src/present/dto/contract/accessibility.py`             | `ContractAccessibilityResponseDTO` (is_contract_handler flag)                                                                                |
| `src/present/dto/configuration/contract_handler_dto.py` | CRUD DTOs for ContractHandler                                                                                                                |
| `src/utils/docx_filler.py`                              | DOCX template rendering: placeholder substitution, yellow-highlight unmapped, bookmark insertion                                             |
| `src/templates/contract_handler_reminder.html`          | Email template for handler reminders                                                                                                         |
| `src/templates/contract_evaluation_reminder.html`       | Email template for evaluation reminders                                                                                                      |
| `src/templates/contract_docx_template.py`               | Contract DOCX template reference                                                                                                             |
| `src/test/test_contract_service.py`                     | Unit tests for ContractService                                                                                                               |

---

## Domain Model

### Entities

#### ContractVersion (`contract_versions`)

| Field               | Type                 | Nullable | Notes                                 |
| ------------------- | -------------------- | -------- | ------------------------------------- |
| id                  | Integer PK           | no       | autoincrement                         |
| employee_id         | Integer              | no       | FK to employees (not enforced in ORM) |
| status              | Enum(ContractStatus) | no       | default `draft`                       |
| hand_over_status_id | Integer              | yes      | FK to handover_status                 |
| contract_type_id    | Integer              | yes      | FK to contract_type                   |
| start_date          | Date                 | yes      |                                       |
| end_date            | Date                 | yes      | Computed: `start_date + terms`        |
| created_at          | DateTime             | no       |                                       |
| updated_at          | DateTime             | no       |                                       |

#### ContractDocument (`contract_documents`)

| Field               | Type       | Nullable | Notes                                                  |
| ------------------- | ---------- | -------- | ------------------------------------------------------ |
| id                  | Integer PK | no       | autoincrement                                          |
| contract_version_id | Integer    | no       | FK to contract_versions                                |
| template_id         | Integer    | no       | FK to templates (DOCX templates)                       |
| media_id            | Integer    | yes      | FK to media -- the generated .docx/.pdf in MinIO       |
| metadata            | JSONB      | yes      | Stores placeholder values, template info, generated_at |
| created_at          | DateTime   | no       |                                                        |
| updated_at          | DateTime   | no       |                                                        |

#### ContractEvaluation (`contract_evaluations`)

| Field               | Type                       | Nullable | Notes                    |
| ------------------- | -------------------------- | -------- | ------------------------ |
| id                  | Integer PK                 | no       | autoincrement            |
| contract_version_id | Integer                    | no       | indexed                  |
| evaluator_id        | BigInteger                 | no       | indexed; FK to employees |
| scores              | Float                      | no       | Total evaluation score   |
| strengths           | Text                       | yes      | Free-text                |
| improvements        | Text                       | yes      | Free-text                |
| summary             | Text                       | no       | Free-text                |
| result              | Enum(EvaluationResultEnum) | no       | PASS / FAIL / EXTEND     |
| created_at          | DateTime                   | no       |                          |
| updated_at          | DateTime                   | no       |                          |

**Constraint:** `UNIQUE(contract_version_id, evaluator_id)` -- one evaluation per evaluator per version.

#### ContractEvaluationLeader (`contract_evaluation_leaders`)

| Field               | Type       | Nullable | Notes                                  |
| ------------------- | ---------- | -------- | -------------------------------------- |
| id                  | Integer PK | no       | autoincrement                          |
| contract_version_id | Integer    | no       | indexed                                |
| employee_id         | BigInteger | no       | indexed; the assigned leader/evaluator |
| created_at          | DateTime   | no       |                                        |
| updated_at          | DateTime   | no       |                                        |

#### ContractType (`contract_type`) -- in configuration.py

| Field      | Type        | Nullable | Notes                                        |
| ---------- | ----------- | -------- | -------------------------------------------- |
| id         | Integer PK  | no       | autoincrement                                |
| name       | String(255) | no       | e.g. "Probation", "Fixed-term", "Indefinite" |
| created_at | DateTime    | no       |                                              |
| updated_at | DateTime    | no       |                                              |

#### HandoverStatus (`handover_status`) -- in configuration.py

| Field      | Type        | Nullable | Notes                                          |
| ---------- | ----------- | -------- | ---------------------------------------------- |
| id         | Integer PK  | no       | autoincrement                                  |
| name       | String(255) | no       | e.g. "Not Started", "In Progress", "Completed" |
| created_at | DateTime    | no       |                                                |
| updated_at | DateTime    | no       |                                                |

#### ContractHandler (`contract_handler`) -- in configuration.py

| Field       | Type       | Nullable | Notes                              |
| ----------- | ---------- | -------- | ---------------------------------- |
| id          | Integer PK | no       | autoincrement                      |
| employee_id | BigInteger | no       | Employee who is a contract handler |
| created_at  | DateTime   | no       |                                    |

A "contract handler" is an employee granted special access to the contract module, bypassing normal RBAC.

#### ContractPlaceholder (`contract_placeholders`)

| Field        | Type       | Nullable | Notes                                                    |
| ------------ | ---------- | -------- | -------------------------------------------------------- |
| id           | Integer PK | no       | autoincrement                                            |
| placeholder  | String     | no       | unique, indexed; e.g. `{{full_name}}`                    |
| column_path  | String     | no       | Dot-notation path: `employee.full_name`                  |
| formatter    | String     | yes      | `date`, `date_en`, `currency`, `upper`, `lower`, `title` |
| description  | String     | yes      | Human-readable description                               |
| is_sensitive | Boolean    | no       | default false; marks PII fields                          |
| created_at   | DateTime   | no       |                                                          |
| updated_at   | DateTime   | no       |                                                          |

### Enums

#### ContractStatus

| Value        | Description                                                           |
| ------------ | --------------------------------------------------------------------- |
| `draft`      | Newly created, not yet activated                                      |
| `active`     | Currently in effect                                                   |
| `terminated` | Ended early (or employee offboarded without contract)                 |
| `expired`    | Past end_date; superseded by newer version                            |
| `expiring`   | Active but within reminder_days of end_date (computed/virtual status) |
| `default`    | UI filter sentinel -- shows all statuses with custom sort order       |

**Status transitions:**

```
draft --> active (save_contract_version: activates draft, expires previous active)
active --> expiring (scan_expiring_contracts: within reminder_days of end_date)
active --> expired (save_contract_version: when a new version is activated)
active --> terminated (implicit: employee offboarded/inactive with no contract)
expiring --> (evaluation happens while in this state)
```

#### EvaluationResultEnum

| Value    | Description                          |
| -------- | ------------------------------------ |
| `PASS`   | Employee passes evaluation           |
| `FAIL`   | Employee fails evaluation            |
| `EXTEND` | Contract extended for further review |

---

## Business Logic

### ContractService (1186 lines, ~47KB)

The largest service in the legacy codebase. Injected dependencies: EmployeeRepository, MediaRepository, MediaService, MinioClient, TemplateRepository, ContractDataMapper, ContractVersionRepository, ContractDocumentRepository, ContractPlaceholderRepository, ContractEvaluationLeaderRepository, ContractHandlerRepository, HandoverStatusRepository, ContractTypeRepository, SystemSettingsRepository, ScheduleService, SystemSettingsService, TaskService.

#### Methods

| Method                                    | Signature                                                                                      | Description                                                                                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_contract_version`                 | `(dto: CreateContractVersionDTO) -> ContractVersionResponseDTO`                                | Creates a DRAFT contract version. Rejects if employee already has a draft. Computes `end_date = start_date + terms`. Creates ContractDocument rows for each template_id.                          |
| `save_contract_version`                   | `(dto: SaveContractVersionDTO) -> ContractVersionResponseDTO`                                  | **Activates** the draft: sets previous active version to EXPIRED, sets draft to ACTIVE. Schedules evaluation reminder for handlers.                                                               |
| `save_contract_document`                  | `async (dto: UploadContractDocumentDTO) -> ContractDocumentResponseDTO`                        | Fetches DOCX template from MinIO, fills placeholders via `fill_docx()`, uploads result to MinIO, saves media_id and metadata to ContractDocument.                                                 |
| `fill_placeholders`                       | `async (employee_id, template_id) -> PlaceholderFilledDTO`                                     | Extracts placeholders from template, maps them to employee/document/contract data via ContractDataMapper. Returns filled values with unmapped tracking.                                           |
| `generate_contract_preview`               | `(dto: GenerateContractDTO) -> ContractPreviewResponseDTO`                                     | Fills template with provided placeholders, highlights unmapped ones in yellow, uploads preview to MinIO, returns presigned URL.                                                                   |
| `get_all_active_contracts`                | `(page, page_size, sort_by, sort_order, filters...) -> Pagination[ContractVersionListItemDTO]` | Main listing: all employees with latest contract version. Computes virtual statuses (expiring, terminated for offboarded). Includes evaluation leaders. Complex sort with custom status ordering. |
| `get_all_contract_version_by_employee_id` | `(employee_id) -> List[ContractVersionResponseDTO]`                                            | All contract versions for one employee with documents and evaluation leaders.                                                                                                                     |
| `get_draft_contract_version`              | `(employee_id) -> Optional[ContractVersionResponseDTO]`                                        | Returns the employee's draft contract with documents, templates, media URLs, evaluation leaders.                                                                                                  |
| `get_contract_document`                   | `(document_id) -> ContractDocumentResponseDTO`                                                 | Single document with template name and media URL.                                                                                                                                                 |
| `update_contract`                         | `(contract_version_id, dto: UpdateContractVersionDTO) -> ContractVersionResponseDTO`           | Updates draft contract fields (start_date, terms, contract_type_id, employee_id). Can add new template_ids (no duplicates).                                                                       |
| `update_contract_handover_status`         | `(contract_version_id, dto) -> ContractVersionResponseDTO`                                     | Updates the handover_status_id on a contract version (any status).                                                                                                                                |
| `delete_draft_document`                   | `(document_ids) -> ContractVersionResponseDTO`                                                 | Deletes documents from a draft contract. Must keep at least one document.                                                                                                                         |
| `edit_contract_evaluation_leaders`        | `(contract_version_id, dto) -> ContractEvaluationLeadersResponseDTO`                           | Sync leaders: add new, remove old. Returns ordered list with message.                                                                                                                             |
| `get_contract_accessibility`              | `(employee_id) -> ContractAccessibilityResponseDTO`                                            | Checks if employee is a contract handler.                                                                                                                                                         |
| `scan_expiring_contracts`                 | `async () -> None`                                                                             | Scheduled job: finds active contracts within reminder_days of expiry, sets status to EXPIRING, creates evaluation tasks for assigned leaders via TaskService.                                     |
| `get_expiring_statistics`                 | `() -> ContractStatisticResponseDTO`                                                           | Counts: expiring_today, expiring_this_week, expiring_this_month.                                                                                                                                  |
| `_extract_placeholders`                   | `(media_id) -> List[str]`                                                                      | Downloads DOCX from MinIO, uses `docxtpl` to extract undeclared template variables.                                                                                                               |
| `_upload_contract`                        | `(filled_doc_stream, file_name, object_name) -> str`                                           | Uploads filled DOCX to MinIO, returns presigned URL.                                                                                                                                              |
| `_schedule_evaluation_reminder`           | `(contract_version, target) -> None`                                                           | Reads CONTRACT_REMINDER_DAYS from system settings, delegates to SystemSettingsService.\_schedule().                                                                                               |

### ContractEvaluationService

| Method                      | Signature                                                                  | Description                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `get_evaluation_criterias`  | `(contract_version_id, evaluator_id) -> ContractEvaluationFormResponseDTO` | Validates leader is assigned, contract is ACTIVE/EXPIRING, loads criteria from JSON file, returns form with employee + leader info. |
| `get_submitted_evaluations` | `(contract_version_id) -> SubmittedEvaluationsResponseDTO`                 | Lists all evaluations for a contract version.                                                                                       |
| `submit_evaluation`         | `(dto: SubmitContractEvaluationDTO) -> ContractEvaluation`                 | Validates leader assignment, upserts evaluation (scores, strengths, improvements, summary, result).                                 |

### ContractHandlerService

| Method                                 | Signature                                       | Description                                                                                                          |
| -------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `create_contract_handlers`             | `(dto: List[ContractHandlerCreateDTO]) -> List` | Bulk-create handlers; validates employees exist, checks no duplicates. Schedules reminders for all active contracts. |
| `list_contract_handlers`               | `() -> List[ContractHandlerResponseDTO]`        | Lists all handlers with employee info and organization role.                                                         |
| `delete_contract_handlers`             | `(dto: List[ContractHandlerDeleteDTO]) -> List` | Bulk-delete handlers by employee_id.                                                                                 |
| `get_latest_contract_handler`          | `(search?) -> List[ContractHandlerResponseDTO]` | Top 10 handlers, optionally filtered by employee name.                                                               |
| `_schedule_reminders_for_new_handlers` | `() -> None`                                    | When new handlers are added, schedules handler reminders for all active contracts with end dates.                    |

### ContractTypeService

Standard CRUD: `create_contract_type`, `get_contract_type`, `update_contract_type`, `delete_contract_type`, `list_contract_types` (paginated).

### ContractPlaceholderService

Single method: `get_all_contract_placeholders() -> List[ContractPlaceholder]`.

### ContractDataMapper

| Method              | Signature                                                                              | Description                                                                                                                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `map_employee_data` | `async (placeholders, employee, db_placeholders, contract_version?) -> Dict[str, Any]` | Core mapping engine. For each placeholder: looks up DB mapping, resolves dot-notation path on employee/document/contract_version objects, applies formatters (date, date_en, currency, case). Handles `_en`/`_vi`/`_vn` suffixes via batch Google Translate. Unmapped placeholders returned as `{value, highlight: True}`. |

**Formatters:** `date` (DD-MM-YYYY), `date_en` (Month DD, YYYY), `currency` (N,NNN VND), `upper`, `lower`, `title`, plus auto-inferred case from placeholder naming convention.

**Translation:** Placeholders ending in `_en` are translated VI->EN; those ending in `_vi`/`_vn` are translated EN->VI. Uses custom TRANSLATION_MAP for known terms.

### Document Generation (docx_filler.py)

`fill_docx(template, context) -> BytesIO`

1. Renders DOCX template via `docxtpl` (Jinja2-based).
2. First pass: inserts highlight markers around unmapped placeholders, renders template.
3. Post-render: finds marker pairs in paragraph runs, rebuilds paragraphs with yellow highlighting (`w:shd fill=FFFF00`) on unmapped values.
4. Second pass: adds XML bookmarks (`w:bookmarkStart`/`w:bookmarkEnd`) around ALL filled placeholders for programmatic identification (e.g. `full_name_0`, `full_name_1`).
5. Preserves original run formatting (font, size, bold, etc.) through paragraph rebuild.

---

## API Endpoints

### Contract Router (`/contracts`)

| Method | Path                                                      | Description                                     | Auth              |
| ------ | --------------------------------------------------------- | ----------------------------------------------- | ----------------- |
| GET    | `/contracts/fill-placeholders?employee_id&template_id`    | Fill template placeholders with employee data   | SA or Handler     |
| POST   | `/contracts/preview`                                      | Generate DOCX preview with highlighted unmapped | SA or Handler     |
| POST   | `/contracts/save-document`                                | Fill and save contract document to MinIO        | SA or Handler     |
| POST   | `/contracts/create-version`                               | Create draft contract version                   | SA or Handler     |
| POST   | `/contracts/save-version`                                 | Activate draft (set ACTIVE, expire previous)    | SA or Handler     |
| GET    | `/contracts/active-contracts`                             | Paginated list: all employees + latest contract | SA or Handler     |
| GET    | `/contracts/draft-version?employee_id`                    | Get employee's draft contract                   | SA or Handler     |
| GET    | `/contracts/get-all-contract-version/{employee_id}`       | All versions for employee                       | SA or Handler     |
| DELETE | `/contracts/delete-draft-document?document_ids`           | Delete docs from draft contract                 | SA or Handler     |
| GET    | `/contracts/document/{document_id}`                       | Single document detail                          | SA or Handler     |
| PATCH  | `/contracts/{id}/update-contract`                         | Update draft contract fields                    | SA or Handler     |
| PATCH  | `/contracts/{id}/update-contract_handover_status`         | Update handover status                          | SA or Handler     |
| PUT    | `/contracts/{id}/contract-evaluation-leaders`             | Sync evaluation leaders                         | SA or Handler     |
| GET    | `/contracts/accessible`                                   | Check if current user is handler                | Any authenticated |
| GET    | `/contracts/contract-evaluation-form?contract_version_id` | Get evaluation form + criteria                  | Any authenticated |
| GET    | `/contracts/{id}/evaluations`                             | List submitted evaluations                      | Any authenticated |
| POST   | `/contracts/{id}/evaluation`                              | Submit evaluation                               | SA or Handler     |
| POST   | `/contracts/send-evaluation-reminder/{id}`                | Send manual reminder email                      | SA or Handler     |
| GET    | `/contracts/expiry-statistics`                            | Expiring counts (today/week/month)              | SA or Handler     |
| POST   | `/contracts/trigger-scanner`                              | Manually trigger expiring-contract scanner      | SA or Handler     |

### Contract Config Router (various prefixes)

| Method | Path                                     | Description                        | Auth                          |
| ------ | ---------------------------------------- | ---------------------------------- | ----------------------------- |
| POST   | `/email-handler/contract-handler`        | Create contract handlers (bulk)    | SA                            |
| GET    | `/email-handler/contract-handler`        | List all handlers                  | SA, Executive                 |
| GET    | `/email-handler/contract-handler/latest` | Latest 10 handlers (searchable)    | SA, Executive                 |
| DELETE | `/email-handler/contract-handler`        | Delete handlers (bulk)             | SA                            |
| GET    | `/contracts-placeholder`                 | List all placeholders              | SA                            |
| POST   | `/contract-types`                        | Create contract type               | SA, HR (+ Handler)            |
| GET    | `/contract-types/{id}`                   | Get contract type                  | SA, HR, Executive (+ Handler) |
| PUT    | `/contract-types/{id}`                   | Update contract type               | SA, HR (+ Handler)            |
| DELETE | `/contract-types/{id}`                   | Delete contract type               | SA, HR (+ Handler)            |
| GET    | `/contract-types`                        | List contract types (paginated)    | SA, HR, Executive (+ Handler) |
| POST   | `/handover-statuses`                     | Create handover status             | SA, HR (+ Handler)            |
| GET    | `/handover-statuses/{id}`                | Get handover status                | SA, HR, Executive (+ Handler) |
| PUT    | `/handover-statuses/{id}`                | Update handover status             | SA, HR (+ Handler)            |
| DELETE | `/handover-statuses/{id}`                | Delete handover status             | SA, HR (+ Handler)            |
| GET    | `/handover-statuses`                     | List handover statuses (paginated) | SA, HR, Executive (+ Handler) |

**Auth note:** `RequireRoleForContractModule` checks if the user is a contract handler first; if so, bypasses normal role checks. Otherwise falls through to standard `RequireRole`.

---

## Target Overlap

### What exists in `/Users/canh/Projects/Seta/future/apps/api/src/modules/people/`

**Entity:** `domain/entities/contract-version.entity.ts`

```ts
export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated'

export interface ContractVersion {
  id: string
  tenantId: string
  profileId: string
  contractType: string
  status: ContractStatus
  startedAt: Date
  endedAt: Date | null
  probationEndDate: Date | null
  note: string | null
  createdAt: Date
}
```

**Schema:** `infrastructure/schema/people.schema.ts` -- `contractVersion` table defined in `people` schema with UUID PKs, `tenant_id`, `profile_id`, `contract_type` (text, not FK), status enum (draft/active/expired/terminated), `started_at`, `ended_at`, `probation_end_date`, `note`.

**Query handler:** `application/queries/list-contract-versions.handler.ts` -- stub returning `[]`.

**Query:** `application/queries/list-contract-versions.query.ts` -- takes `tenantId` and `profileId`.

### What's missing in target

| Feature                                  | Status                                          |
| ---------------------------------------- | ----------------------------------------------- |
| ContractDocument entity + schema         | Missing entirely                                |
| ContractEvaluation entity + schema       | Missing entirely                                |
| ContractEvaluationLeader entity + schema | Missing entirely                                |
| ContractType lookup table                | Missing (contractType is inline text in target) |
| HandoverStatus lookup table              | Missing entirely                                |
| ContractHandler (bypass RBAC)            | Missing entirely                                |
| ContractPlaceholder entity + schema      | Missing entirely                                |
| Document generation (DOCX fill)          | Missing entirely                                |
| Evaluation workflow                      | Missing entirely                                |
| Expiring contract scanner / scheduler    | Missing entirely                                |
| Contract statistics dashboard            | Missing entirely                                |
| Placeholder data mapper + translation    | Missing entirely                                |
| All contract CRUD commands               | Missing (only stub query exists)                |
| Contract config endpoints                | Missing entirely                                |

### Key modeling differences

| Aspect                 | Legacy (EMS)                                | Target (Future)                             |
| ---------------------- | ------------------------------------------- | ------------------------------------------- |
| Primary keys           | Integer autoincrement                       | UUID v7                                     |
| Multi-tenancy          | Not present (single-tenant)                 | `tenant_id` on every table                  |
| Employee reference     | `employee_id: Integer`                      | `profileId: UUID` (employment_profile)      |
| Contract type          | FK to `contract_type` table (Integer)       | Inline `contract_type: text` (denormalized) |
| Status enum            | 6 values including `expiring` and `default` | 4 values: draft/active/expired/terminated   |
| Probation              | Not tracked                                 | `probation_end_date` field added            |
| Note                   | Not present                                 | `note: text` field added                    |
| `end_date` computation | `start_date + terms (days)`                 | `ended_at` stored directly                  |
| Handover status        | FK to lookup table                          | Not present                                 |
| Updated_at             | Present                                     | Not present on contract_version             |

---

## Dependencies

### Internal module dependencies

| Dependency                                                           | Usage                                                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Employee** (EmployeeRepository)                                    | Employee data for placeholders, avatar URLs, status checks, name lookups                                        |
| **Template** (TemplateRepository)                                    | DOCX templates stored in `templates` table; each has `media_id` pointing to MinIO file and `placeholder_schema` |
| **Media** (MediaRepository, MediaService)                            | File storage; generated contract documents uploaded to MinIO; media records track file metadata                 |
| **SystemSettings** (SystemSettingsRepository, SystemSettingsService) | `CONTRACT_REMINDER_DAYS` setting; scheduling evaluation/handler reminders                                       |
| **ScheduleService**                                                  | APScheduler-based job scheduling for contract expiry reminders                                                  |
| **Task** (TaskService)                                               | Creates evaluation tasks for leaders when contracts approach expiry                                             |
| **Role** (EmployeeRole, RoleType)                                    | RBAC checks; contract handlers join to get org role names                                                       |
| **HandoverStatus** (HandoverStatusRepository)                        | Lookup table for handover tracking during contract transitions                                                  |

### External dependencies

| Dependency                              | Usage                                                                 |
| --------------------------------------- | --------------------------------------------------------------------- |
| `docxtpl` (python-docx + Jinja2)        | DOCX template rendering with placeholder substitution                 |
| `python-docx` (`docx.oxml`)             | Low-level XML manipulation for highlighting and bookmarks             |
| MinIO (via `MinioClient`)               | Object storage for template files and generated contract documents    |
| Google Translate (via `translate_text`) | Auto-translation of placeholder values between Vietnamese and English |
| `dateutil.relativedelta`                | Date arithmetic for contract term calculation                         |
| APScheduler                             | Scheduled jobs for contract expiry scanning and reminders             |

### Scheduled jobs

1. **Expiring contract scanner** (`scan_expiring_contracts`): Periodic scan of active contracts approaching end_date. Updates status to EXPIRING, creates evaluation tasks for assigned leaders.
2. **Handler reminders** (`_schedule_reminders_for_new_handlers`): When new handlers are added, schedules handler-type reminders for all active contracts.
3. **Evaluation reminders** (`_schedule_evaluation_reminder`): When a contract is activated, schedules evaluation reminder for handlers.
4. **Manual reminder** (`send_evaluation_reminder`): On-demand email reminder to evaluation leaders.

---

## Migration Notes

### Decomposition strategy

This is the largest service (~47KB, ~1186 lines) and needs careful decomposition into the Future hexagonal architecture:

1. **Contract version lifecycle** (create draft, activate, expire, terminate) -- maps to `application/commands/` with separate command handlers.
2. **Document generation** (template fill, preview, upload) -- separate bounded context, possibly its own service. The DOCX processing utility should be a shared package or infrastructure service.
3. **Evaluation workflow** (leader assignment, criteria, submission, results) -- could be a sub-aggregate or separate module. Consider whether this belongs in `people` or `performance`.
4. **Configuration** (contract types, handover statuses, handlers, placeholders) -- admin/config commands, likely in `admin` module or `people` config sub-domain.
5. **Scheduling** (expiry scanning, reminders) -- maps to pg-boss jobs in Future architecture.
6. **Statistics** (expiring counts) -- query handler.

### Key concerns

- **Contract handler bypass** is a custom RBAC pattern that should be modeled as a kernel delegation or role_permission in Future's authority system, not as a separate access control mechanism.
- **Placeholder system** tightly couples contract templates to employee data schema. In Future, this could use a more generic template engine or be part of a document-generation package.
- **Translation** (Google Translate for EN/VI placeholders) is deeply embedded in the data mapper. Should be extracted as a pluggable i18n strategy.
- **`expiring` status** is a virtual/computed status in the legacy (derived from `active` + date proximity). The target already omits it from the enum -- this should remain computed at query time.
- **`default` status** is a UI filter sentinel, not a real status. Should not exist in domain model.
- **HandoverStatus** is a contract-specific lookup not yet present in target. Evaluate whether it's still needed or can be replaced by a generic status/tag system.
- **Template model** (DOCX files with Jinja2 placeholders stored in MinIO) needs a corresponding model in Future. Currently no template entity exists in the people module.
- **Integer PKs to UUID migration** affects all foreign key references. The `employee_id` becomes `profileId` (UUID referencing `employment_profile`).
- **Multi-tenancy** (`tenant_id`) must be added to all new tables. The legacy system is single-tenant.
- **Evaluation criteria** are loaded from a JSON file (`load_criteria()`), not from database. Consider whether to keep file-based or move to DB/config in Future.
