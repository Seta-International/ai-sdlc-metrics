---
module: employee
task: employee-documents
created: 2026-04-14
priority: medium
depends-on: [001]
---

# Task: Employee Documents

## Scope

Implement document management for employee profiles — upload, download, list, and track expiry of personal and company documents (ID copies, certificates, tax forms, policy acknowledgments).

## Roles Covered

- **HR:** Upload/download/delete any employee's documents, view confidential docs, manage expiry alerts
- **MANAGER:** View non-confidential documents of direct reports
- **EMPLOYEE:** Upload own personal documents (ID, certs), download own documents, acknowledge company policies

## Business Context

Every HRM tracks employee documents — ID copies for compliance, certificates for qualification verification, policy acknowledgments for legal protection. The legacy system has no dedicated document management (files are scattered across media/contract modules). This is a standard feature in BambooHR, HiBob, and Personio.

## Source Reference

- **Files:** `src/core/services/media_service.py` (generic file management), `src/core/models/media.py`
- **Key logic:** Legacy uses MinIO for file storage with a generic media table. No document categorization, expiry tracking, or confidentiality flags.

## Target Location

- **Where:** `apps/api/src/modules/people/application/commands/`, `apps/api/src/modules/people/application/queries/`
- **Conventions to follow:** Use `@future/storage` for S3 operations, file_key format: `{tenantId}/people/{profileId}/documents/{documentId}/{filename}`

## Data Model

Uses `employee_document` table from task 001.

Document categories: `id_document`, `tax_form`, `policy_ack`, `certificate`, `visa`, `contract`, `other`

## Interface Contract

Commands:

- `UploadEmployeeDocumentCommand { profileId, category, name, file, expiryDate?, isConfidential? }`
- `DeleteEmployeeDocumentCommand { documentId }`
- `AcknowledgePolicyCommand { profileId, documentId }` — marks a policy doc as acknowledged

Queries:

- `ListEmployeeDocumentsQuery { profileId, category? }` — filtered list with presigned download URLs
- `ListExpiringDocumentsQuery { tenantId, expiringBefore: date }` — for HR dashboard

pg-boss job:

- `check-document-expiry` — weekly job, finds documents expiring within 30 days, emits notification events

Domain events:

- `DocumentExpiringEvent { tenantId, profileId, documentId, expiryDate }` — consumed by notifications module

## Edge Cases

- File size limits: enforce max file size (e.g., 10MB) at upload
- Allowed file types: PDF, JPEG, PNG, DOCX — reject executables
- Confidential documents: only HR can view/download, not even the employee's manager
- Deleting a document: soft-delete (mark inactive), keep S3 object for audit trail
- Policy acknowledgment: once acknowledged, cannot be un-acknowledged

## Acceptance Criteria

- [ ] Upload document via `@future/storage` with proper key structure
- [ ] Download via presigned URL (1h TTL)
- [ ] List documents by profile, filterable by category
- [ ] Expiry date tracking with `ListExpiringDocumentsQuery`
- [ ] pg-boss job for expiry alerts
- [ ] Confidentiality flag enforced in queries
- [ ] File type and size validation
- [ ] tRPC procedures for all operations
- [ ] Unit tests for upload/download/list
- [ ] Integration test for expiry alert job
