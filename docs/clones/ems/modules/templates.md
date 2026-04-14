# Module: templates

## Source -- entities, template groups, placeholder system

### Tables (SQLAlchemy, single shared schema -- no `tenant_id`)

| Table                      | Columns                                                                                                                                           | Notes                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `templates`                | `id` PK serial, `name` unique, `media_id` (FK to media/MinIO), `placeholder_schema` JSONB, `created_at`, `updated_at`, `deleted_at` (soft-delete) | The DOCX file itself lives in MinIO; `media_id` points to a `media` row whose `file_path` is the S3/MinIO key. `placeholder_schema` is a list of placeholder key strings (legacy data may be a dict). |
| `template_groups`          | `id` PK serial, `name` unique, `description`, `created_at`, `updated_at`                                                                          | Logical grouping of templates (e.g. "Labour Contracts").                                                                                                                                              |
| `template_group_relations` | `id` PK serial, `template_group_id`, `template_id`, `created_at`, `updated_at`, `deleted_at`                                                      | Many-to-many join table. A template can belong to multiple groups.                                                                                                                                    |
| `email_template`           | `id` PK serial, `mail_type` unique, `subject`, `template_html` TEXT, `created_at`, `updated_at`                                                   | Separate entity for HTML email templates (OTP, offboarding tasks, contract reminders, etc.). Not related to DOCX templates.                                                                           |

### EmailTemplateTypeEnum (17 types)

OTP emails, temporary passwords, offboarding task notifications, export-excel notification, contract evaluation/handler reminders, user workflow emails.

### Placeholder system

- `placeholder_schema` on `Template` stores an ordered list of placeholder key names (e.g. `["FULL_NAME", "DOB", "Basic_Salary", "Start_Date"]`).
- At fill time the contract module supplies a `context: Dict[str, Any]` where each key maps to either a plain string or a `{"value": str, "highlight": bool}` dict.
- Highlight-mode values get yellow background shading (`#FFFF00`) in the generated DOCX.
- Every placeholder also gets an XML bookmark wrapper (`bookmarkStart`/`bookmarkEnd`) so the frontend DOCX preview can locate them.

---

## Business Logic -- template CRUD, group management, DOCX filling

### TemplateService

| Method            | Behaviour                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_template` | Unique-name check, persists `Template` with `name`, `media_id`, `placeholder_schema`.                                                                                                   |
| `get_template`    | Fetches template, resolves `media_url` from MinIO via `MediaRepository`, attaches group names.                                                                                          |
| `update_template` | Partial update (`exclude_unset`), duplicate-name guard, sets fields dynamically.                                                                                                        |
| `delete_template` | Hard delete (physical row removal).                                                                                                                                                     |
| `list_templates`  | Paginated, filterable by `name` (ILIKE), `created_at` range. Sortable. Resolves media URLs and group names per item (N+1 on media, batched on groups). Auto-adjusts page if beyond max. |

### TemplateGroupService

| Method                                       | Behaviour                                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `create_template_group`                      | Unique-name check, requires >= 1 template_id, verifies each template exists, creates group + join rows.                                                                              |
| `get_template_group`                         | Returns group with full template objects (id + name).                                                                                                                                |
| `update_template_group`                      | Partial update on name/description. If `template_ids` provided, **replaces** all join rows (delete-all + re-insert).                                                                 |
| `delete_template_group`                      | Hard delete of group row (join rows remain -- orphaned).                                                                                                                             |
| `search_template_group_and_single_by_string` | Combined search: returns both groups and individual templates matching a search string. Supports type filter (`ALL`, `SINGLE`, `GROUP`). Empty search returns 5 most recent of each. |
| `list_template_groups`                       | Paginated, filterable by name, description, created_at range. Batch-fetches template_ids to avoid N+1.                                                                               |
| `list_templates_in_group`                    | Paginated list of templates within a specific group via join on `template_group_relations`.                                                                                          |

### DOCX filling (`src/utils/docx_filler.py`)

The `fill_docx(template, context)` function:

1. **Accepts** a file path or `BytesIO` stream + a context dict.
2. **Renders** via `docxtpl` (Jinja2-based DOCX templating).
3. **Two-pass post-processing:**
   - **Pass 1 -- Highlighting:** Scans paragraphs and table cells for marker strings (`HLSTART`/`HLEND`), strips markers, rebuilds runs with yellow highlighting on the value text.
   - **Pass 2 -- Bookmarks:** Scans for bookmark markers (`BMSTART`/`BMEND`), strips them, inserts `w:bookmarkStart`/`w:bookmarkEnd` XML elements around each placeholder value. Bookmark names follow `{key}_{index}` pattern. Preserves original run formatting (copies `rPr` elements).
4. **Returns** `BytesIO` of the filled DOCX.

Key dependencies: `docxtpl`, `python-docx` (`docx`).

### Hardcoded template files (`src/templates/`)

| File                        | Purpose                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract_docx_template.py` | `EmployeeExcelExporter` -- exports employee data to Excel using `openpyxl`. 33 Vietnamese-labelled columns. Not actually a contract DOCX template despite the name. |
| `cv_docx_template.py`       | `CVDocxTemplate` -- generates CV DOCX from `EmployeeCVDTO` using `python-docx`. Hardcoded SETA branding (`#003566`).                                                |
| `evaluation_criterias.json` | Default evaluation criteria data.                                                                                                                                   |
| `*.html` (16 files)         | Email templates: OTP, temporary passwords, offboarding tasks, contract reminders, export notifications. Correspond to `EmailTemplateTypeEnum` values.               |

---

## API Endpoints -- all routes with roles

### `/templates` (Router prefix)

| Method   | Path              | Role Required                | Handler           |
| -------- | ----------------- | ---------------------------- | ----------------- |
| `POST`   | `/templates`      | SUPER_ADMIN (org)            | `create_template` |
| `GET`    | `/templates/{id}` | SUPER_ADMIN, EXECUTIVE (org) | `get_template`    |
| `PUT`    | `/templates/{id}` | SUPER_ADMIN (org)            | `update_template` |
| `DELETE` | `/templates/{id}` | SUPER_ADMIN (org)            | `delete_template` |
| `GET`    | `/templates`      | SUPER_ADMIN, EXECUTIVE (org) | `list_templates`  |

Query params for list: `page`, `page_size`, `name`, `created_at_from`, `created_at_to`, `sort_by`, `order`.

### `/template-groups` (Router prefix)

| Method   | Path                              | Role Required                | Handler                                      |
| -------- | --------------------------------- | ---------------------------- | -------------------------------------------- |
| `POST`   | `/template-groups`                | SUPER_ADMIN (org)            | `create_template_group`                      |
| `GET`    | `/template-groups/search`         | SUPER_ADMIN, EXECUTIVE (org) | `search_template_group_and_single_by_string` |
| `GET`    | `/template-groups/{id}`           | SUPER_ADMIN, EXECUTIVE (org) | `get_template_group`                         |
| `PUT`    | `/template-groups/{id}`           | SUPER_ADMIN (org)            | `update_template_group`                      |
| `DELETE` | `/template-groups/{id}`           | SUPER_ADMIN (org)            | `delete_template_group`                      |
| `GET`    | `/template-groups/{id}/templates` | SUPER_ADMIN, EXECUTIVE (org) | `list_templates_in_group`                    |
| `GET`    | `/template-groups`                | SUPER_ADMIN, EXECUTIVE (org) | `list_template_groups`                       |

All endpoints gated by `RequireRoleForContractModule` -- this is the contract module's access control dependency.

---

## Target Overlap -- what exists in documents module

The Future `documents` module (`apps/api/src/modules/documents/`) already covers a **subset** of the legacy template functionality with a fundamentally different architecture:

### What exists

| Concern                | Legacy (templates)                                                  | Future (documents)                                                                         |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Template entity        | `name`, `media_id` (DOCX file in MinIO), `placeholder_schema` JSONB | `slug`, `name`, `format` (pdf/excel), `content` (HTML/JSON string), `version`, `isDefault` |
| Template storage       | DOCX files in MinIO, referenced by `media_id`                       | Template content stored inline in `content` TEXT column                                    |
| Template groups        | Full group system with many-to-many relations                       | **Not implemented** -- no grouping concept                                                 |
| Placeholder system     | JSONB list of keys, Jinja2-based DOCX fill                          | `inputData` JSONB on generation job, no schema definition on template                      |
| Document generation    | Synchronous `fill_docx()` in request thread                         | Async via pg-boss worker (`DocumentGenerateWorker`)                                        |
| Output formats         | DOCX only                                                           | PDF (Puppeteer HTML-to-PDF) and Excel (ExcelJS)                                            |
| Branding               | Hardcoded SETA colours in `CVDocxTemplate`                          | `tenant_branding` table (company name, logo, primary colour, font)                         |
| Email templates        | `email_template` table + 16 HTML files                              | **Not implemented** in documents module                                                    |
| Highlighting/bookmarks | Yellow highlight + XML bookmarks in filled DOCX                     | **Not implemented** -- no DOCX output                                                      |
| Multi-tenancy          | No `tenant_id`                                                      | Full `tenant_id` on every table                                                            |

### What is missing in Future

1. **Template groups** -- no grouping/categorisation of templates.
2. **DOCX format support** -- Future only does PDF and Excel. The legacy DOCX fill + highlight + bookmark system has no counterpart.
3. **Placeholder schema on template** -- Future templates don't declare their expected placeholders; callers must know what to pass.
4. **Email templates** -- no DB-stored email templates or HTML template management.
5. **Combined search** -- the search endpoint returning both groups and individual templates.
6. **Template update/delete** -- Future only has `create` and read operations on templates; no update or delete routes.
7. **Media/file attachment** -- legacy templates reference uploaded DOCX files via media; Future stores content inline.

---

## Dependencies -- contract module (primary consumer)

The template module's primary consumer is the **contract module** (`contract_service.py`):

- `fill_docx()` is called in two contract flows:
  1. **Contract document generation** -- takes a contract's placeholders (`{placeholder: value}` from `document.placeholders`), fills the template DOCX, and stores the result.
  2. **Contract preview** -- fills with highlighting for unmapped/empty placeholders so reviewers can see what's missing. Uploads preview to MinIO.
- The contract service imports `TemplateRepository` directly (not via a facade) to fetch templates and their media files.
- The contract service imports `MinioClient` to download template DOCX files and upload filled results.
- All template/template-group routes use `RequireRoleForContractModule` access control, confirming tight coupling.
- The `contract_data_mapper.py` maps employee/contract data fields to template placeholder keys.

Secondary consumers:

- `CVDocxTemplate` in `src/templates/` is used by employee export (not through the template module).
- `EmployeeExcelExporter` in `src/templates/` is used for employee data export.
- Email templates are consumed by various notification services (OTP, offboarding, contract reminders).

---

## Migration Notes -- DOCX generation, placeholder system

### DOCX generation strategy

The legacy DOCX filling pipeline (`docxtpl` + `python-docx`) has no direct equivalent in the Future stack. Options:

1. **Port to Node.js** -- Use `docxtemplater` (npm) as the Jinja2/docxtpl equivalent. It supports the same `{{placeholder}}` syntax in DOCX files. For highlighting and bookmarks, use `docxtemplater`'s XML module or post-process with `docx` (npm). This preserves the DOCX-in/DOCX-out workflow.
2. **Convert to PDF pipeline** -- Re-implement contract templates as HTML (like Future's current approach), render to PDF via Puppeteer. Loses DOCX editability and the highlight/bookmark preview feature.
3. **Hybrid** -- Add DOCX as a third `format` option alongside `pdf` and `excel` in the existing `documents` module. Use `@future/documents` package to handle generation.

### Placeholder schema

The legacy `placeholder_schema` (list of key names stored on the template) should be preserved in Future. It serves as:

- Documentation of what data a template expects.
- Validation at generation time (can warn on missing placeholders).
- UI support for showing available placeholders when creating contracts.

Recommendation: Add a `placeholderSchema` JSONB column to `documents.template` or define a richer schema (key + type + required flag).

### Template groups

The group system is simple (name + description + many-to-many join). In Future, this could be:

- A `template_group` table in the `documents` schema with a join table, or
- A `tags` array column on the template table if flat categorisation suffices.

### Email templates

Email templates are a separate concern from document templates. They should migrate to a **notifications** or **comms** module rather than `documents`. The 16 HTML files should become DB-stored templates with Handlebars/Mustache rendering.

### Key differences to handle

| Concern               | Legacy approach              | Future approach needed                                         |
| --------------------- | ---------------------------- | -------------------------------------------------------------- |
| IDs                   | Serial integers              | UUIDv7                                                         |
| Tenant isolation      | None                         | `tenant_id` on every row + RLS                                 |
| File storage          | MinIO via `media` table      | S3 via `@future/storage`                                       |
| Soft delete           | `deleted_at` column          | TBD -- Future schema currently has no soft delete on templates |
| Access control        | FastAPI dependency injection | tRPC middleware + kernel authority                             |
| Template file storage | Binary DOCX in MinIO         | Inline `content` text -- needs rethink for DOCX binary files   |
