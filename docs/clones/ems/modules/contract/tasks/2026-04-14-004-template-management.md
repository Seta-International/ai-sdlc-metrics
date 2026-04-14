---
module: contract
task: template-management
created: 2026-04-14
priority: high
depends-on: []
---

# Task: Document Template Management

## Scope

Implement template management in the `documents` module:

1. Template CRUD — upload DOCX templates, categorize, version
2. Template versioning — immutable versions pinned at generation time
3. Placeholder extraction — parse uploaded DOCX to discover variables
4. Variable schema definition — declare expected variables per template version
5. Template categories (contract, offer_letter, termination_letter, nda, policy, other)

This task is in the **`documents` module**, not `people`.

## Roles Covered

- **SUPER_ADMIN:** Full template CRUD, version management
- **HR:** Upload templates, view templates, preview with sample data
- **EMPLOYEE:** No access to templates (only to generated documents)

## Business Context

Templates are the foundation of document generation. HR admins create DOCX templates in Microsoft Word with placeholders like `{employee.full_name}`, upload them, and the system generates personalized documents. Template versioning ensures existing generated documents are reproducible even after the template is updated.

The legacy system stores templates in MinIO with a `templates` table. The target needs a more structured approach with versioning, variable schema, and category management.

## Source Reference

- **Files:** `src/core/services/template_service.py`, `src/repository/template_repository.py`, `src/present/routers/template_router.py`
- **Key logic:** Legacy has basic template CRUD with media_id (MinIO file). No versioning, no variable schema extraction.

## Target Location

- **Where:** `apps/api/src/modules/documents/` (domain, application, infrastructure, interface)
- **Conventions to follow:** Hexagonal architecture, `@future/storage` for S3 ops, CQRS handlers

## Data Model

### New tables in `documents` schema

```
documents.document_template
  id              uuid PK (uuidv7)
  tenant_id       uuid NOT NULL
  slug            text NOT NULL          -- machine name: 'employment-contract-vn'
  name            text NOT NULL          -- display: 'Employment Contract (Vietnamese)'
  category        text NOT NULL          -- 'contract' | 'offer_letter' | 'termination_letter' | 'nda' | 'policy' | 'other'
  locale          text DEFAULT 'vi-VN'   -- template language
  current_version integer NOT NULL DEFAULT 1
  is_active       boolean DEFAULT true
  created_by      uuid NOT NULL
  created_at      timestamptz DEFAULT now()
  updated_at      timestamptz DEFAULT now()

  UNIQUE (tenant_id, slug)

documents.document_template_version
  id              uuid PK (uuidv7)
  tenant_id       uuid NOT NULL
  template_id     uuid NOT NULL          -- FK to document_template
  version         integer NOT NULL
  storage_key     text NOT NULL           -- S3 key: templates/{tenantId}/{templateId}/{version}/template.docx
  file_size       integer
  variable_schema jsonb NOT NULL DEFAULT '[]'  -- declared variables this version expects
    -- [{ key, label, type, format?, required, source }]
  extracted_placeholders text[] DEFAULT '{}'  -- raw placeholders found in DOCX
  changelog       text
  created_by      uuid NOT NULL
  created_at      timestamptz DEFAULT now()

  UNIQUE (template_id, version)

documents.generated_document
  id              uuid PK (uuidv7)
  tenant_id       uuid NOT NULL
  template_id     uuid NOT NULL
  template_version integer NOT NULL       -- pinned version at generation time
  storage_key     text NOT NULL           -- S3 key: generated/{tenantId}/{documentId}/output.docx
  pdf_storage_key text                    -- S3 key for PDF conversion (optional)
  variables_used  jsonb NOT NULL          -- snapshot of data used for generation
  entity_type     text                    -- 'contract' | 'offer' | 'termination' | etc.
  entity_id       uuid                    -- FK to the entity this doc belongs to
  status          text DEFAULT 'draft'    -- 'draft' | 'final' | 'signed' | 'voided'
  generated_by    uuid NOT NULL
  generated_at    timestamptz DEFAULT now()
```

## Interface Contract

### Commands

- `CreateDocumentTemplateCommand { tenantId, slug, name, category, locale, file: Buffer }`
  - Upload DOCX to S3, extract placeholders, create template + version 1
- `UploadTemplateVersionCommand { tenantId, templateId, file: Buffer, changelog? }`
  - Create new version, extract placeholders, increment current_version
- `UpdateTemplateMetadataCommand { tenantId, templateId, name?, category?, locale?, isActive? }`
- `DefineVariableSchemaCommand { tenantId, templateId, version, variables[] }`
  - Map extracted placeholders to data sources

### Queries

- `ListDocumentTemplatesQuery { tenantId, category? }` — all active templates
- `GetDocumentTemplateQuery { tenantId, templateId }` — template with current version details
- `GetTemplateVariablesQuery { tenantId, templateId, version? }` — variable schema for a version
- `ListGeneratedDocumentsQuery { tenantId, entityType?, entityId? }` — documents for an entity

### Placeholder Extraction (internal)

On upload, use docxtemplater's parser to extract all `{placeholder}` tags from the DOCX:

```typescript
const doc = new Docxtemplater(zip, { parser: expressionParser })
const tags = doc.getFullText().match(/\{[^}]+\}/g)
```

Store extracted tags in `extracted_placeholders`. Admin then maps them to variable schema entries.

## Edge Cases

- **Duplicate slug:** Reject with clear error. Slug is the machine name used in API calls.
- **Template with no placeholders:** Valid (static document). Variable schema is empty.
- **Delete template:** Soft-delete (set is_active=false). Existing generated documents reference template_version, not template — they're still valid.
- **Large DOCX:** Enforce max file size (10MB). Templates beyond this are likely not HR documents.
- **Invalid DOCX:** Validate file is a valid DOCX (ZIP with expected structure) on upload. Reject with clear error.

## Acceptance Criteria

- [ ] Template CRUD with S3 storage via `@future/storage`
- [ ] Template versioning (immutable versions, current_version tracking)
- [ ] Placeholder extraction from uploaded DOCX using docxtemplater
- [ ] Variable schema definition per template version
- [ ] Generated document table with entity linkage
- [ ] Template categories with locale support
- [ ] Soft-delete for templates
- [ ] tRPC procedures for all operations
- [ ] Unit tests for placeholder extraction (various DOCX structures)
- [ ] Unit tests for template versioning (create, upload new version, metadata update)
- [ ] Integration test for full flow: upload template → extract placeholders → define schema
