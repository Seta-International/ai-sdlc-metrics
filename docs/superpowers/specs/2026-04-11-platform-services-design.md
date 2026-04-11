# Future — Platform Services Design

**Date:** 2026-04-11
**Status:** Approved
**Project:** Seta Future AaaS

---

## Purpose

This document defines the six cross-cutting platform services that Future needs to operate as a production-ready AaaS system. These services are not domain modules — they are shared infrastructure (packages) and domain modules that every other module depends on for email, file storage, activity logging, document generation, and in-app notifications.

The design follows two principles:

1. **Reusable packages in `packages/`** — pure TypeScript, zero NestJS, independently testable, portable when modules extract to microservices.
2. **Domain modules in `modules/`** — hexagonal architecture, own schema, tRPC surface, for services with real state and domain logic.

---

## Architecture Overview

### 4 New Packages

| Package                 | Purpose                                      | NestJS deps | Tenant-configurable      |
| ----------------------- | -------------------------------------------- | ----------- | ------------------------ |
| `packages/mail`         | Email transport (SES + SMTP), MJML templates | None        | Yes — via `admin` module |
| `packages/storage`      | S3 presigned URLs, file operations           | None        | No — platform S3         |
| `packages/activity-log` | DynamoDB activity log writer/reader          | None        | No — platform DynamoDB   |
| `packages/documents`    | PDF parse + generate, Excel generate         | None        | No — stateless           |

### 2 New Domain Modules

| Module                  | Schema          | Purpose                                                             | Tenant-configurable      |
| ----------------------- | --------------- | ------------------------------------------------------------------- | ------------------------ |
| `modules/notifications` | `notifications` | In-app notifications, SSE real-time, preferences                    | No — platform-owned      |
| `modules/documents`     | `documents`     | Template storage, tenant branding, async generation jobs, MCP tools | Yes — branding/templates |

### Extended Existing Module

| Module  | Addition                                                         |
| ------- | ---------------------------------------------------------------- |
| `admin` | `tenant_email_config` table, `AdminQueryFacade.getEmailConfig()` |

### Dependency Graph

```
packages/mail        ← config resolved from AdminQueryFacade.getEmailConfig(tenantId)
                       same pattern as getResolvedAiConfig()
packages/storage     ← platform S3 config from environment
packages/activity-log ← platform DynamoDB config from environment
packages/documents   ← stateless, no config needed

modules/notifications ← injects packages/activity-log (writes to activity feed)
                      ← Redis pub/sub for SSE fanout
                      ← packages/mail for email notifications
modules/documents     ← injects packages/documents + packages/storage
                      ← pg-boss for async generation jobs
                      ← MCP tools for agent access
```

---

## Package 1: `packages/mail` — Email Transport Abstraction

### Purpose

Send email through any supported provider. Zero NestJS. Any process (API, worker, future microservice) imports and sends.

### Supported Transports

- **AWS SES** — platform default, uses `@aws-sdk/client-ses`
- **Generic SMTP** — tenant override, uses `nodemailer`

### Template Engine

MJML — compiles to responsive HTML email. Templates are plain `.mjml` files with Handlebars interpolation. Renders to HTML at send time.

### Interface

```ts
// packages/mail/src/transport.ts
export interface MailMessage {
  to: string | string[]
  subject: string
  html: string // pre-rendered HTML (from template engine)
  from?: string // override sender — falls back to config
  replyTo?: string
  attachments?: MailAttachment[]
}

export interface MailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface MailTransport {
  send(message: MailMessage): Promise<MailResult>
}

export interface MailResult {
  messageId: string
  accepted: string[]
  rejected: string[]
}

export interface MailConfig {
  provider: 'ses' | 'smtp'
  fromAddress: string
  region?: string // SES
  smtpHost?: string // SMTP
  smtpPort?: number
  credentialRef: string // Secrets Manager ARN
}

export function createMailTransport(config: MailConfig): MailTransport
export function renderTemplate(templateName: string, data: Record<string, unknown>): string
```

### Usage

```ts
const config = await adminQueryFacade.getEmailConfig(tenantId)
const transport = createMailTransport(config)
const html = renderTemplate('leave-approved', { name, dates, approver })
await transport.send({ to: recipientEmail, subject: '...', html })
```

### Email Config in Admin Module

```sql
admin.tenant_email_config
  id              UUID PK (v7)
  tenant_id       UUID NOT NULL UNIQUE
  provider        TEXT NOT NULL         -- 'ses' | 'smtp'
  from_address    TEXT NOT NULL
  smtp_host       TEXT                  -- nullable, only for SMTP
  smtp_port       INT                   -- nullable, only for SMTP
  credential_ref  TEXT NOT NULL         -- Secrets Manager ARN
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

Resolution: `AdminQueryFacade.getEmailConfig(tenantId)` — tenant override, platform SES default as fallback. Same pattern as `getResolvedAiConfig()`.

### Package Structure

```
packages/mail/
  src/
    transport.ts        → MailTransport interface + factory
    transports/
      ses.transport.ts  → SES implementation
      smtp.transport.ts → SMTP implementation
    template.ts         → MJML + Handlebars rendering
    index.ts
  __tests__/
    ses.transport.spec.ts
    smtp.transport.spec.ts
    template.spec.ts
```

### What This Package Does NOT Own

- Email config storage (that's `admin` module)
- Deciding when to send (that's the domain module via pg-boss)
- Delivery tracking / webhooks (future — not day one)

---

## Package 2: `packages/storage` — File Storage (S3)

### Purpose

Upload, download, and manage files in platform S3. Zero NestJS. Presigned URLs for direct browser upload/download — files never pass through the API server.

### Interface

```ts
// packages/storage/src/storage.ts
export interface StorageClient {
  getUploadUrl(key: string, opts: UploadOpts): Promise<PresignedUrl>
  getDownloadUrl(key: string, expiresIn?: number): Promise<PresignedUrl>
  deleteObject(key: string): Promise<void>
  headObject(key: string): Promise<ObjectMeta | null>
}

export interface UploadOpts {
  contentType: string
  maxSizeBytes: number
  expiresIn?: number // presigned URL TTL, default 900s
}

export interface PresignedUrl {
  url: string
  expiresAt: Date
}

export interface ObjectMeta {
  key: string
  size: number
  contentType: string
  lastModified: Date
}

export function createStorageClient(config: StorageConfig): StorageClient

export interface StorageConfig {
  bucket: string
  region: string
}
```

### S3 Key Layout

```
s3://future-{env}-files/
  {tenantId}/
    avatars/{actorId}/{uuid7}.jpg
    documents/{moduleKey}/{entityId}/{uuid7}.pdf
    cv/{candidateId}/{uuid7}.pdf
    exports/{uuid7}.pdf
    temp/{uuid7}                  ← TTL 24h via S3 lifecycle rule
```

Tenant-partitioned by prefix. The API validates `tenantId` before generating any presigned URL.

### Upload Flow

```
Frontend                    API                         S3
   |                         |                          |
   |-- trpc.storage.getUploadUrl({fileName, contentType})
   |                         |-- validate actor + tenant |
   |                         |-- generate S3 key         |
   |                         |-- getUploadUrl(key, opts) |
   |  <-- { url, key } -----|                          |
   |                         |                          |
   |-- PUT presigned URL ----|---------------------------->
   |                         |                          |
   |-- trpc.storage.confirmUpload({ key })              |
   |                         |-- headObject(key) ------->
   |                         |-- write file_record to DB |
   |  <-- { fileId } -------|                          |
```

### Package Structure

```
packages/storage/
  src/
    storage.ts          → StorageClient interface + factory
    s3.client.ts        → AWS S3 implementation
    key-builder.ts      → S3 key generation helpers
    index.ts
  __tests__/
    s3.client.spec.ts
    key-builder.spec.ts
```

### What This Package Does NOT Own

- File metadata storage / file records (that's the consuming module's schema)
- Access control beyond presigned URL TTL (that's the tRPC layer)
- Image processing / thumbnails (future — not day one)

---

## Package 3: `packages/activity-log` — DynamoDB Activity Log

### Purpose

Write and query user-facing activity events ("who did what"). Tenant-partitioned, TTL-managed, queryable by actor/resource/date. Zero NestJS.

### Relationship to PostgreSQL `audit_event`

|               | Activity Log                     | Audit Event                     |
| ------------- | -------------------------------- | ------------------------------- |
| Storage       | DynamoDB                         | PostgreSQL                      |
| Audience      | Org admins + users (UI)          | Compliance / legal / ops        |
| Content       | Human-readable summary           | Structured payload (JSON)       |
| Mutable       | Yes (TTL, soft-delete)           | No (INSERT-only, never deleted) |
| Query pattern | Timeline feed, by actor/resource | Forensic investigation          |

### DynamoDB Table Design

```
Table: future-{env}-activity-log

Partition key:  tenantId           (String)
Sort key:       timestamp#eventId  (String — ISO8601#uuid7 for uniqueness + ordering)

GSI-1 (actor lookup):
  PK: tenantId#actorId
  SK: timestamp#eventId

GSI-2 (resource lookup):
  PK: tenantId#resourceType#resourceId
  SK: timestamp#eventId

TTL attribute:  expiresAt          (Number — epoch seconds, default 365 days)
```

### Interface

```ts
// packages/activity-log/src/activity-log.ts
export interface ActivityEntry {
  tenantId: string
  actorId: string
  actorName: string // denormalized for display — no joins in DynamoDB
  action: string // e.g. 'leave.approved', 'person.hired', 'role.granted'
  resourceType: string // e.g. 'leave_request', 'employment', 'role_grant'
  resourceId: string
  summary: string // human-readable: "Canh approved leave for Nguyen (Apr 14-18)"
  metadata?: Record<string, unknown>
  timestamp?: Date // defaults to now
}

export interface ActivityLogClient {
  write(entry: ActivityEntry): Promise<void>
  writeBatch(entries: ActivityEntry[]): Promise<void>
  queryByTenant(tenantId: string, opts: QueryOpts): Promise<PaginatedResult<ActivityEntry>>
  queryByActor(
    tenantId: string,
    actorId: string,
    opts: QueryOpts,
  ): Promise<PaginatedResult<ActivityEntry>>
  queryByResource(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    opts: QueryOpts,
  ): Promise<PaginatedResult<ActivityEntry>>
}

export interface QueryOpts {
  from?: Date
  to?: Date
  limit?: number // default 50
  cursor?: string // opaque pagination token
}

export interface PaginatedResult<T> {
  items: T[]
  cursor?: string // null = no more pages
}

export function createActivityLogClient(config: ActivityLogConfig): ActivityLogClient

export interface ActivityLogConfig {
  tableName: string
  region: string
}
```

### Write Pattern — From Event Handlers

```ts
@EventsHandler(LeaveApprovedEvent)
export class OnLeaveApprovedActivityHandler {
  constructor(private readonly activityLog: ActivityLogClient) {}

  async handle(event: LeaveApprovedEvent) {
    await this.activityLog.write({
      tenantId: event.tenantId,
      actorId: event.approverId,
      actorName: event.approverName,
      action: 'leave.approved',
      resourceType: 'leave_request',
      resourceId: event.leaveRequestId,
      summary: `${event.approverName} approved leave for ${event.employeeName} (${event.from}–${event.to})`,
    })
  }
}
```

### Package Structure

```
packages/activity-log/
  src/
    activity-log.ts     → ActivityLogClient interface + factory
    dynamo.client.ts    → DynamoDB implementation
    index.ts
  __tests__/
    dynamo.client.spec.ts
```

### What This Package Does NOT Own

- Deciding what gets logged (that's the domain module's event handler)
- The `summary` text (caller constructs it — keeps domain language in the domain)
- Compliance audit trail (that stays in PostgreSQL `audit_event`)

---

## Package 4: `packages/documents` — PDF Parse + Generate, Excel Generate

### Purpose

Parse text from uploaded PDFs and generate PDFs/Excel from templates. Zero NestJS. Two independent subsystems: parsing and generation.

### PDF Parsing

```ts
// packages/documents/src/pdf/parse.ts
export interface ParsedPdf {
  text: string // full extracted text
  pages: PageText[] // per-page text
  metadata: PdfMetadata // title, author, creation date
  pageCount: number
}

export interface PageText {
  pageNumber: number
  text: string
}

export interface PdfMetadata {
  title?: string
  author?: string
  createdAt?: Date
}

export async function parsePdf(buffer: Buffer): Promise<ParsedPdf>
```

Uses `pdf-parse` under the hood. Returns raw text — LLM structuring happens in the consuming module (e.g. `hiring` calls `parsePdf()` then sends text to OpenAI for CV field extraction).

### PDF Generation

Template-based. HTML + CSS rendered to PDF via Puppeteer (headless Chromium).

```ts
// packages/documents/src/pdf/generate.ts
export interface PdfTemplate {
  html: string // Handlebars HTML template
  css?: string // optional stylesheet
}

export interface PdfGenerateOpts {
  template: PdfTemplate
  data: Record<string, unknown>
  branding?: TenantBranding
  format?: 'A4' | 'Letter' // default A4
  landscape?: boolean
}

export async function generatePdf(opts: PdfGenerateOpts): Promise<Buffer>
```

Puppeteer on ARM64 uses `@sparticuz/chromium` — prebuilt Chromium for AWS Lambda/ECS ARM64. No x86 dependency.

### Excel Generation

Uses `exceljs` — mature, streaming support for large datasets, ARM64 compatible, no native deps.

```ts
// packages/documents/src/excel/generate.ts
export interface ExcelSheet {
  name: string
  columns: ExcelColumn[]
  rows: Record<string, unknown>[]
}

export interface ExcelColumn {
  header: string
  key: string
  width?: number
  format?: 'text' | 'number' | 'date' | 'currency'
}

export interface ExcelGenerateOpts {
  sheets: ExcelSheet[]
  branding?: TenantBranding
}

export async function generateExcel(opts: ExcelGenerateOpts): Promise<Buffer>
```

### Shared Branding Interface

```ts
// packages/documents/src/common/branding.ts
export interface TenantBranding {
  logoUrl?: string
  primaryColor?: string
  companyName: string
  fontFamily?: string
}
```

### Package Structure

```
packages/documents/
  src/
    pdf/
      parse.ts            → parsePdf()
      generate.ts         → generatePdf()
      chromium.ts         → Puppeteer/Chromium lifecycle management
    excel/
      generate.ts         → generateExcel()
    common/
      branding.ts         → TenantBranding interface
    index.ts              → re-exports all
  __tests__/
    pdf-parse.spec.ts
    pdf-generate.spec.ts
    excel-generate.spec.ts
```

### What This Package Does NOT Own

- Template storage / versioning (that's `modules/documents`)
- Tenant branding config (that's `modules/documents`, stored in `documents` schema)
- LLM extraction logic (that's the consuming module — `hiring`, `agents`)
- Where the generated file goes (caller decides — S3, email attachment, response stream)

---

## Module 5: `modules/notifications` — In-App Notification Domain

### Schema: `notifications`

### Schema Definition

```sql
notifications.notification
  id              UUID PK (v7)
  tenant_id       UUID NOT NULL
  recipient_id    UUID NOT NULL        -- actor_id of the recipient
  sender_id       UUID                 -- actor_id who triggered it (nullable for system notifications)
  category        TEXT NOT NULL         -- 'approval', 'mention', 'assignment', 'system'
  title           TEXT NOT NULL         -- "Leave request approved"
  body            TEXT                  -- "Your leave Apr 14-18 was approved by Canh"
  resource_type   TEXT                  -- 'leave_request', 'decision_case', etc.
  resource_id     UUID                 -- deep-link target
  resource_url    TEXT                  -- cross-zone URL: "/time/leave/abc-123"
  read_at         TIMESTAMPTZ          -- NULL = unread
  archived_at     TIMESTAMPTZ          -- NULL = visible
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()

notifications.notification_preference
  id              UUID PK (v7)
  tenant_id       UUID NOT NULL
  actor_id        UUID NOT NULL
  category        TEXT NOT NULL         -- matches notification.category
  in_app          BOOLEAN DEFAULT true
  email           BOOLEAN DEFAULT true
  UNIQUE (tenant_id, actor_id, category)
```

RLS on `tenant_id`, same as every other table.

### Notification Creation — From Event Handlers

```ts
@EventsHandler(LeaveApprovedEvent)
export class OnLeaveApprovedNotificationHandler {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly activityLog: ActivityLogClient,
  ) {}

  async handle(event: LeaveApprovedEvent) {
    await this.notificationService.send({
      tenantId: event.tenantId,
      recipientId: event.employeeActorId,
      senderId: event.approverId,
      category: 'approval',
      title: 'Leave request approved',
      body: `Your leave ${event.from}–${event.to} was approved by ${event.approverName}`,
      resourceType: 'leave_request',
      resourceId: event.leaveRequestId,
      resourceUrl: `/time/leave/${event.leaveRequestId}`,
    })

    await this.activityLog.write({
      tenantId: event.tenantId,
      actorId: event.approverId,
      actorName: event.approverName,
      action: 'leave.approved',
      resourceType: 'leave_request',
      resourceId: event.leaveRequestId,
      summary: `${event.approverName} approved leave for ${event.employeeName} (${event.from}–${event.to})`,
    })
  }
}
```

### NotificationService.send() Internals

```
1. Insert notification row (PostgreSQL)
2. Check notification_preference — is in_app enabled?
   → yes: PUBLISH to Redis channel notifications:{tenantId}:{recipientId}
3. Check notification_preference — is email enabled?
   → yes: enqueue pg-boss job send-notification-email
```

### SSE Real-Time Delivery

```
GET /api/notifications/stream
  → SSE endpoint (NestJS)
  → subscribes to Redis channel notifications:{tenantId}:{actorId}
  → pushes new notifications as SSE events

Frontend (in GlobalNav from packages/ui):
  const source = new EventSource('/api/notifications/stream')
  source.onmessage = (e) => {
    const notification = JSON.parse(e.data)
    incrementUnreadCount()
    showToast(notification.title)
  }
```

Each zone opens its own SSE connection. Redis pub/sub fans out across ECS tasks.

### tRPC Router

```ts
notifications.list            → paginated, filterable by category, read/unread
notifications.unreadCount     → number (for bell badge)
notifications.markRead        → single or bulk
notifications.markAllRead     → per actor
notifications.archive         → soft archive
notifications.preferences.get → per actor, all categories
notifications.preferences.update → per category toggle
```

### Module Structure

```
modules/notifications/
  domain/
    entities/notification.entity.ts
    entities/notification-preference.entity.ts
    repositories/notification.repository.port.ts
    value-objects/category.vo.ts
  application/
    commands/send-notification.handler.ts
    commands/mark-read.handler.ts
    commands/mark-all-read.handler.ts
    queries/list-notifications.handler.ts
    queries/unread-count.handler.ts
    facades/notifications-query.facade.ts
    event-handlers/         ← subscribes to domain events from other modules
  infrastructure/
    schema/notifications.schema.ts
    repositories/drizzle-notification.repository.ts
    sse/notification-sse.gateway.ts
    redis/notification-publisher.ts
  interface/
    trpc/notifications.router.ts
  notifications.module.ts   → exports: [NotificationsQueryFacade]
```

### What This Module Does NOT Own

- Deciding when to notify (domain modules raise events, notification event handlers react)
- Email sending mechanics (delegates to `packages/mail`)
- Activity log writing (separate concern — `packages/activity-log`)

---

## Module 6: `modules/documents` — Document Management Domain

### Schema: `documents`

### Schema Definition

```sql
documents.template
  id              UUID PK (v7)
  tenant_id       UUID NOT NULL
  slug            TEXT NOT NULL         -- 'payslip', 'offer-letter', 'timesheet-report'
  name            TEXT NOT NULL         -- "Monthly Payslip"
  format          TEXT NOT NULL         -- 'pdf' | 'excel'
  content         TEXT NOT NULL         -- Handlebars HTML (pdf) or JSON column config (excel)
  version         INT NOT NULL DEFAULT 1
  is_default      BOOLEAN DEFAULT false -- system-provided template
  created_by      UUID                 -- actor_id, NULL for system templates
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  UNIQUE (tenant_id, slug, version)

documents.tenant_branding
  id              UUID PK (v7)
  tenant_id       UUID NOT NULL UNIQUE
  company_name    TEXT NOT NULL
  logo_file_key   TEXT                 -- S3 key via packages/storage
  primary_color   TEXT                 -- hex, e.g. '#1D4ED8'
  font_family     TEXT                 -- optional override
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()

documents.generation_job
  id              UUID PK (v7)
  tenant_id       UUID NOT NULL
  template_id     UUID NOT NULL REFERENCES documents.template(id)
  requested_by    UUID NOT NULL        -- actor_id
  status          TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'processing' | 'completed' | 'failed'
  input_data      JSONB NOT NULL       -- template variables / row data
  output_file_key TEXT                 -- S3 key when completed
  error_message   TEXT
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  completed_at    TIMESTAMPTZ
```

### Generation Flow

```
Domain module (e.g. finance)
  → trpc.documents.generate({ slug: 'payslip', data: { ... } })
    → documents module inserts generation_job (status: pending)
    → enqueues pg-boss job 'documents.generate'

pg-boss worker picks up job:
  1. Load template by slug + tenant
  2. Load tenant_branding
  3. Merge branding + data into template
  4. Call packages/documents → generatePdf() or generateExcel()
  5. Call packages/storage → upload to S3
  6. Update generation_job (status: completed, output_file_key)
  7. Publish DocumentGeneratedEvent
     → notifications module sends "Your report is ready"
     → optionally attach + email via packages/mail
```

### tRPC Router

```ts
documents.templates.list        → by tenant, filterable by format/slug
documents.templates.get         → single template with content
documents.templates.create      → tenant creates custom template
documents.templates.update      → new version (immutable versioning)
documents.branding.get          → tenant branding config
documents.branding.update       → logo, colors, company name
documents.generate              → trigger async generation job
documents.jobs.list             → generation history, status
documents.jobs.getDownloadUrl   → presigned S3 URL for completed job
```

### MCP Tools (for Agent Runtime)

```
documents_generate_report     → agent triggers PDF/Excel generation
documents_list_templates      → agent browses available templates
documents_get_job_status      → agent checks if generation is done
```

All MCP tools check `exposure_contract` + `role_grant` + write `audit_event`.

### System-Provided Default Templates

Seeded on tenant creation. Tenants can clone and customize:

| Slug                 | Format | Used by |
| -------------------- | ------ | ------- |
| `payslip`            | pdf    | finance |
| `offer-letter`       | pdf    | hiring  |
| `timesheet-report`   | excel  | time    |
| `attendance-report`  | excel  | time    |
| `employee-roster`    | excel  | people  |
| `candidate-pipeline` | excel  | hiring  |
| `invoice`            | pdf    | finance |

### Module Structure

```
modules/documents/
  domain/
    entities/template.entity.ts
    entities/tenant-branding.entity.ts
    entities/generation-job.entity.ts
    repositories/template.repository.port.ts
    repositories/generation-job.repository.port.ts
    value-objects/template-format.vo.ts
    value-objects/job-status.vo.ts
  application/
    commands/generate-document.handler.ts
    commands/create-template.handler.ts
    commands/update-branding.handler.ts
    queries/list-templates.handler.ts
    queries/get-job-download-url.handler.ts
    facades/documents-query.facade.ts
    event-handlers/on-document-generated.handler.ts
  infrastructure/
    schema/documents.schema.ts
    repositories/drizzle-template.repository.ts
    repositories/drizzle-generation-job.repository.ts
    jobs/document-generate.job.ts       ← pg-boss worker
  interface/
    trpc/documents.router.ts
    mcp/documents.mcp-tools.ts
  documents.module.ts   → exports: [DocumentsQueryFacade]
```

### What This Module Does NOT Own

- The actual PDF/Excel rendering engine (that's `packages/documents`)
- File storage (that's `packages/storage`)
- Email delivery of generated documents (that's `packages/mail` via pg-boss)
- Deciding what data goes into a report (the calling module provides `input_data`)

---

## New Event Contracts

These events are added to `packages/event-contracts`:

```
packages/event-contracts/
  notifications/
    NotificationSentEvent       { tenantId, notificationId, recipientId, category }
  documents/
    DocumentGeneratedEvent      { tenantId, jobId, templateSlug, format, outputFileKey }
    DocumentGenerationFailedEvent { tenantId, jobId, error }
```

---

## Infrastructure Requirements

### DynamoDB

- Table: `future-{env}-activity-log`
- Provisioned in Terraform (`infra/terraform/`)
- On-demand capacity mode (auto-scales, pay-per-request)
- TTL enabled on `expiresAt` attribute
- 2 GSIs: actor lookup, resource lookup

### Redis (ElastiCache)

- Already in stack for Cube.js query cache
- Reuse for notification SSE pub/sub
- Channel naming: `notifications:{tenantId}:{actorId}`

### S3

- Bucket: `future-{env}-files`
- Lifecycle rule: `temp/` prefix expires after 24h
- CORS configured for presigned URL uploads from frontend zones

### Secrets Manager

- Email credentials: `future/{env}/tenant/{tenantId}/email-credentials`
- Platform SES config: `future/{env}/platform/ses-config`

---

## Implementation Order

These services should be built in dependency order:

| Phase | What                    | Depends on                                        |
| ----- | ----------------------- | ------------------------------------------------- |
| 1     | `packages/storage`      | Nothing — stateless S3 helper                     |
| 2     | `packages/activity-log` | DynamoDB Terraform resource                       |
| 3     | `packages/mail`         | `admin` module `tenant_email_config` table        |
| 4     | `packages/documents`    | Nothing — stateless parse/generate                |
| 5     | `modules/notifications` | `packages/activity-log`, `packages/mail`, Redis   |
| 6     | `modules/documents`     | `packages/documents`, `packages/storage`, pg-boss |

Phases 1-4 (packages) can be parallelized. Phases 5-6 (modules) depend on their packages.

---

## Decisions Log

| Decision                   | Outcome                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Activity log storage       | DynamoDB — TTL-native, tenant-partitioned, high throughput, no RLS overhead                |
| Compliance audit           | Stays in PostgreSQL `audit_event` (INSERT-only, immutable)                                 |
| Email providers (day one)  | AWS SES + generic SMTP                                                                     |
| Email config pattern       | Same as AI config — `AdminQueryFacade.getEmailConfig()`, tenant override, platform default |
| File storage               | Platform S3 for all tenants — no tenant-BYO bucket                                         |
| Notification delivery      | SSE (Server-Sent Events) for real-time + tRPC for pull                                     |
| Notification fanout        | Redis pub/sub (reuse existing ElastiCache)                                                 |
| PDF generation engine      | Puppeteer + `@sparticuz/chromium` (ARM64 compatible)                                       |
| PDF parsing                | `pdf-parse` library + LLM structured extraction in consuming modules                       |
| Excel generation           | `exceljs` — streaming, no native deps                                                      |
| Template engine            | MJML (email) + Handlebars (PDF/Excel)                                                      |
| Document branding          | Tenant-configurable via `modules/documents`                                                |
| Reusable packages location | `packages/` — pure TS, zero NestJS, portable for microservice extraction                   |
| Domain modules location    | `modules/` — hexagonal, own schema, tRPC surface                                           |
| Package rename             | `packages/pdf` renamed to `packages/documents` to include Excel                            |
