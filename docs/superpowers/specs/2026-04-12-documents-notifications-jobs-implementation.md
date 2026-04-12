# Documents, Notifications & Jobs — Full Implementation

**Date:** 2026-04-12
**Status:** Approved
**Project:** Seta Future AaaS
**Depends on:** `2026-04-11-platform-services-design.md` (packages already implemented)

---

## Context

The four platform packages (`packages/mail`, `packages/storage`, `packages/activity-log`, `packages/documents`) are implemented. The two domain modules (`modules/documents`, `modules/notifications`) and the pg-boss job infrastructure are all stubs. This spec covers replacing every stub with a real implementation.

---

## Scope

| What                                        | Included                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| pg-boss module (shared)                     | Yes                                                                          |
| Redis module (shared)                       | Yes                                                                          |
| `docker-compose.local.yml` Redis service    | Yes                                                                          |
| Admin email config extension                | Yes                                                                          |
| Documents — Drizzle repositories            | Yes                                                                          |
| Documents — application handlers            | Yes (create-template, update-branding, list-templates, get-job-download-url) |
| Documents — pg-boss worker                  | Yes                                                                          |
| Documents — tRPC router                     | Yes                                                                          |
| Documents — MCP tools                       | Yes                                                                          |
| Notifications — Drizzle repository          | Yes                                                                          |
| Notifications — Redis publisher             | Yes                                                                          |
| Notifications — SSE gateway                 | Yes                                                                          |
| Notifications — application handlers        | Yes (preferences get/update, archive)                                        |
| Notifications — email job worker            | Yes                                                                          |
| Notifications — cross-module event handlers | Yes (2 sample: LeaveApproved, DocumentGenerated)                             |
| Notifications — tRPC router                 | Yes                                                                          |

---

## Section 1 — Shared Infrastructure

### 1.1 pg-boss

Install `pg-boss` in `apps/api`. Create `apps/api/src/common/jobs/` with:

- `pg-boss.module.ts` — global NestJS module, bootstraps a `PgBoss` instance against `DATABASE_URL`, starts on `onApplicationBootstrap`, stops on `onApplicationShutdown`
- `pg-boss.service.ts` — thin injectable wrapper exposing `enqueue<T>(jobName: string, data: T): Promise<string>` and `registerWorker<T>(jobName: string, handler: (job: Job<T>) => Promise<void>): void`

Job names (constants in `pg-boss.service.ts`):

```ts
export const JOB_DOCUMENTS_GENERATE = 'documents.generate'
export const JOB_NOTIFICATIONS_SEND_EMAIL = 'notifications.send-email'
```

Workers are registered during `onApplicationBootstrap` via `PgBossService.registerWorker()`. Each worker module (documents, notifications) calls `registerWorker` in its own `onApplicationBootstrap`.

### 1.2 Redis

Install `ioredis` in `apps/api`. Create `apps/api/src/common/redis/`:

- `redis.module.ts` — global NestJS module, creates `IORedis` client from `REDIS_URL` env var, provides `REDIS_CLIENT` token
- `redis.service.ts` — injectable wrapper exposing `publish(channel: string, message: string): Promise<void>` and `subscribe(channel: string, handler: (message: string) => void): Promise<void>`

### 1.3 docker-compose.local.yml

Add Redis 7 Alpine service:

```yaml
redis:
  image: redis:7-alpine
  container_name: future-redis
  restart: on-failure
  ports:
    - '6379:6379'
  healthcheck:
    test: ['CMD', 'redis-cli', 'ping']
    interval: 5s
    timeout: 5s
    retries: 10
```

### 1.4 Environment Variables

Add to API env (`.env.local`):

- `REDIS_URL=redis://localhost:6379`
- pg-boss uses `DATABASE_URL` (already set)
- `S3_BUCKET`, `S3_REGION` (for storage package)
- `ACTIVITY_LOG_TABLE`, `ACTIVITY_LOG_REGION` (for activity-log package)
- `PLATFORM_SES_FROM_ADDRESS`, `PLATFORM_SES_REGION` (fallback email)

---

## Section 2 — Admin Email Config Extension

### 2.1 Schema

New table `admin.tenant_email_config`:

```sql
id              UUID PK (v7)
tenant_id       UUID NOT NULL UNIQUE
provider        TEXT NOT NULL          -- 'ses' | 'smtp'
from_address    TEXT NOT NULL
smtp_host       TEXT                   -- nullable
smtp_port       INT                    -- nullable
credential_ref  TEXT NOT NULL          -- Secrets Manager ARN
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

File: `apps/api/src/modules/admin/infrastructure/schema/admin.schema.ts` — add `tenantEmailConfig` table.

### 2.2 Repository & Facade

- New `IAdminEmailConfigRepository` port in `admin/domain/repositories/`
- `DrizzleAdminEmailConfigRepository` in `admin/infrastructure/repositories/`
- `AdminQueryFacade` gets new method:

```ts
async getEmailConfig(tenantId: string): Promise<MailConfig | null>
```

Returns tenant-specific config if row exists, `null` otherwise. Caller (email worker) falls back to platform SES env vars when `null`.

### 2.3 Module wiring

`AdminModule` providers array adds `DrizzleAdminEmailConfigRepository` bound to the port token.

---

## Section 3 — Documents Module

### 3.1 New Domain Port

`documents/domain/repositories/tenant-branding.repository.port.ts`:

```ts
export const TENANT_BRANDING_REPOSITORY = Symbol('ITenantBrandingRepository')
export interface ITenantBrandingRepository {
  findByTenant(tenantId: string): Promise<TenantBranding | null>
  upsert(data: Omit<TenantBranding, 'id'>): Promise<TenantBranding>
}
```

### 3.2 Drizzle Repositories

`documents/infrastructure/repositories/`:

**`drizzle-template.repository.ts`** implements `ITemplateRepository`:

- `findBySlugAndTenant(tenantId, slug)` — latest version
- `findById(id, tenantId)`
- `listByTenant(tenantId, filters?)` — filterable by format
- `insert(data)` — sets `version: 1`
- `insertVersion(data)` — increments version

**`drizzle-generation-job.repository.ts`** implements `IGenerationJobRepository`:

- `insert(data)`
- `findById(id, tenantId)`
- `updateStatus(id, tenantId, status, extra?)` — extra = `{ outputFileKey }` or `{ errorMessage }`
- `listByTenant(tenantId, filters?)` — filterable by status, limit/offset

**`drizzle-tenant-branding.repository.ts`** implements `ITenantBrandingRepository`:

- `findByTenant(tenantId)`
- `upsert(data)` — INSERT … ON CONFLICT (tenant_id) DO UPDATE

### 3.3 New Application Handlers

`documents/application/commands/`:

- `CreateTemplateCommand` + `CreateTemplateHandler` — validates slug uniqueness per tenant, inserts template
- `UpdateBrandingCommand` + `UpdateBrandingHandler` — upserts tenant branding row

`documents/application/queries/`:

- `ListTemplatesQuery` + `ListTemplatesHandler` — delegates to `templateRepo.listByTenant`
- `ListGenerationJobsQuery` + `ListGenerationJobsHandler` — delegates to `jobRepo.listByTenant`
- `GetGenerationJobQuery` + `GetGenerationJobHandler` — delegates to `jobRepo.findById` (used by MCP)
- `GetJobDownloadUrlQuery` + `GetJobDownloadUrlHandler` — loads job, asserts `status === 'completed'`, calls `storageClient.getDownloadUrl(outputFileKey)`

`documents/application/event-handlers/`:

- `OnDocumentGeneratedEventHandler` — listens to `DocumentGeneratedEvent`, dispatches `SendNotificationCommand` to notify requester "Your document is ready"

### 3.4 Updated GenerateDocumentHandler

Remove the TODO. After `jobRepo.insert()`, call `pgBossService.enqueue(JOB_DOCUMENTS_GENERATE, { jobId: job.id, tenantId })`.

### 3.5 pg-boss Worker

`documents/infrastructure/jobs/document-generate.worker.ts`:

```
1. Load generation_job by id (assert exists + pending)
2. Update status → 'processing'
3. Load template by templateId
4. Load tenantBranding by tenantId (nullable)
5. Call generatePdf() or generateExcel() from packages/documents
6. Upload Buffer to S3 via `storageClient.putObject(key, buffer, contentType)` — note: `packages/storage` `StorageClient` interface needs `putObject` added for server-side direct upload (presigned URLs are for browser upload only)
7. Update job status → 'completed', outputFileKey = s3Key
8. EventBus.publish(new DocumentGeneratedEvent(...))
9. On any error: update job → 'failed', errorMessage, publish DocumentGenerationFailedEvent
```

Worker registered in `DocumentsModule.onApplicationBootstrap()`.

### 3.6 tRPC Router

`documents/interface/trpc/documents.router.ts` — contributes to `AppRouter`:

```
documents.templates.list        → ListTemplatesQuery
documents.templates.get         → templateRepo.findById (via query handler)
documents.templates.create      → CreateTemplateCommand
documents.branding.get          → tenantBrandingRepo.findByTenant (via query)
documents.branding.update       → UpdateBrandingCommand
documents.generate              → GenerateDocumentCommand → returns jobId
documents.jobs.list             → ListGenerationJobsQuery
documents.jobs.getDownloadUrl   → GetJobDownloadUrlQuery
```

All procedures validate `tenantId` from session context (tRPC middleware already sets this).

### 3.7 MCP Tools

`documents/interface/mcp/documents.mcp-tools.ts`:

- `documents_generate_report` — wraps `GenerateDocumentCommand`
- `documents_list_templates` — wraps `ListTemplatesQuery`
- `documents_get_job_status` — wraps `GetGenerationJobQuery`

Each tool checks `exposure_contract` + `role_grant` + writes `audit_event` (via `KernelAuditFacade`).

### 3.8 Module Wiring

`DocumentsModule` providers:

- `DrizzleTemplateRepository` → `TEMPLATE_REPOSITORY`
- `DrizzleGenerationJobRepository` → `GENERATION_JOB_REPOSITORY`
- `DrizzleTenantBrandingRepository` → `TENANT_BRANDING_REPOSITORY`
- All command/query handlers
- `DocumentGenerateWorker`
- `DbModule` imported for `DB_TOKEN`
- `PgBossModule` imported
- `StorageModule` (or inject `S3StorageClient` directly via env config)

---

## Section 4 — Notifications Module

### 4.1 Drizzle Repository

`notifications/infrastructure/repositories/drizzle-notification.repository.ts` implements `INotificationRepository`:

- `insert(data)` — returns `Notification`
- `findById(id, tenantId)`
- `listByTenant(tenantId, filters?)` — filterable by `recipientId`, `category`, `readAt IS NULL` (unread only), limit/offset
- `countUnread(tenantId, recipientId)` — for unread badge
- `markRead(id, tenantId)` — sets `read_at = now()`
- `markAllRead(tenantId, recipientId)` — bulk update
- `archive(id, tenantId)` — sets `archived_at = now()`
- `getPreference(tenantId, actorId, category)`
- `upsertPreference(data)` — INSERT … ON CONFLICT DO UPDATE

### 4.2 Redis Publisher

`notifications/infrastructure/redis/redis-notification-publisher.ts` implements `NotificationPublisher`:

```ts
async publish(tenantId: string, recipientId: string, notification: Notification): Promise<void> {
  const channel = `notifications:${tenantId}:${recipientId}`
  await this.redisService.publish(channel, JSON.stringify(notification))
}
```

### 4.3 SSE Gateway

`notifications/infrastructure/sse/notification-sse.controller.ts` — NestJS controller:

```
GET /api/notifications/stream
  → validates auth (session cookie)
  → subscribes to Redis channel notifications:{tenantId}:{actorId}
  → streams SSE: "data: {json}\n\n"
  → on client disconnect: unsubscribes
```

Uses `@Sse()` decorator + `Observable<MessageEvent>` return type (NestJS built-in SSE support).

### 4.4 New Application Handlers

`notifications/application/commands/`:

- `ArchiveNotificationCommand` + `ArchiveNotificationHandler`
- `UpdatePreferenceCommand` + `UpdatePreferenceHandler` — upserts preference row

`notifications/application/queries/`:

- `GetPreferencesQuery` + `GetPreferencesHandler` — returns all 4 category preferences for an actor (with defaults for missing rows)

### 4.5 Cross-Module Event Handlers

`notifications/application/event-handlers/`:

**`on-leave-approved.handler.ts`** listens to `LeaveApprovedEvent`:

- Dispatches `SendNotificationCommand` to employee: "Leave request approved"
- Writes activity log entry via `DynamoActivityLogClient`

**`on-document-generated.handler.ts`** listens to `DocumentGeneratedEvent`:

- Dispatches `SendNotificationCommand` to `requestedBy` actor: "Your document is ready"

### 4.6 Email Job Worker

`notifications/infrastructure/jobs/send-notification-email.worker.ts`:

```
1. Load notification by id
2. Load recipient actor email via `KernelQueryFacade.getActorById(tenantId, recipientId)` — actor email lives in the kernel/identity layer
3. AdminQueryFacade.getEmailConfig(tenantId) → MailConfig | null
4. If null: use platform SES config from env vars
5. createMailTransport(config)
6. renderMjmlTemplate('notification', { title, body, resourceUrl })
7. transport.send({ to: recipientEmail, subject: title, html })
8. On failure: pg-boss retries up to 3×, then dead-letters
```

### 4.7 tRPC Router

`notifications/interface/trpc/notifications.router.ts`:

```
notifications.list                → ListNotificationsQuery
notifications.unreadCount         → UnreadCountQuery
notifications.markRead            → MarkReadCommand
notifications.markAllRead         → MarkAllReadCommand
notifications.archive             → ArchiveNotificationCommand
notifications.preferences.get     → GetPreferencesQuery
notifications.preferences.update  → UpdatePreferenceCommand
```

### 4.8 Module Wiring

`NotificationsModule` providers:

- `DrizzleNotificationRepository` → `NOTIFICATION_REPOSITORY`
- `RedisNotificationPublisher` → `NOTIFICATION_PUBLISHER`
- `NotificationSseController`
- All command/query/event handlers
- `SendNotificationEmailWorker`
- `DbModule` imported
- `PgBossModule` imported
- `RedisModule` imported
- `AdminModule` imported (for `AdminQueryFacade`)

---

## Section 5 — Testing Strategy

| Layer                            | Test file                                               | Type                  |
| -------------------------------- | ------------------------------------------------------- | --------------------- |
| `DrizzleTemplateRepository`      | `drizzle-template.repository.integration.spec.ts`       | Integration (real DB) |
| `DrizzleGenerationJobRepository` | `drizzle-generation-job.repository.integration.spec.ts` | Integration (real DB) |
| `DrizzleNotificationRepository`  | `drizzle-notification.repository.integration.spec.ts`   | Integration (real DB) |
| `CreateTemplateHandler`          | `create-template.handler.spec.ts`                       | Unit                  |
| `UpdateBrandingHandler`          | `update-branding.handler.spec.ts`                       | Unit                  |
| `GetJobDownloadUrlHandler`       | `get-job-download-url.handler.spec.ts`                  | Unit                  |
| `DocumentGenerateWorker`         | `document-generate.worker.spec.ts`                      | Unit                  |
| `SendNotificationHandler`        | already exists                                          | Unit                  |
| `SendNotificationEmailWorker`    | `send-notification-email.worker.spec.ts`                | Unit                  |
| `NotificationSseController`      | `notification-sse.controller.spec.ts`                   | Unit                  |
| `OnLeaveApprovedHandler`         | `on-leave-approved.handler.spec.ts`                     | Unit                  |
| `PgBossService`                  | `pg-boss.service.spec.ts`                               | Unit                  |
| `RedisService`                   | `redis.service.spec.ts`                                 | Unit                  |

Coverage target: ≥70% lines, functions, branches per module.

---

## Implementation Order

| Phase | What                                                  | Depends on   |
| ----- | ----------------------------------------------------- | ------------ |
| 1     | pg-boss module + Redis module + docker-compose update | Nothing      |
| 2     | Admin email config schema + facade method             | Phase 1      |
| 3     | Documents Drizzle repos + remaining handlers          | Phase 1      |
| 4     | Documents pg-boss worker + tRPC router + MCP          | Phase 3      |
| 5     | Notifications Drizzle repo + Redis publisher          | Phase 1      |
| 6     | Notifications SSE + tRPC router + email worker        | Phase 5      |
| 7     | Cross-module event handlers                           | Phases 4 + 6 |

Phases 2, 3, 5 can be parallelized after Phase 1.

---

## What This Does NOT Cover

- Tenant email config management UI (admin zone — follow-on)
- Full set of cross-module notification event handlers (only 2 sample wired; others added as domain modules ship their events)
- Document template seeding (default templates — follow-on migration)
- Notification delivery webhooks / read receipts
- pg-boss dashboard / monitoring UI
