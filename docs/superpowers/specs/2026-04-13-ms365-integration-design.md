# MS365 Integration Module Design Spec

**Date:** 2026-04-13
**Status:** Draft
**Module:** `integrations` (schema: `integrations`)
**Owns:** MS365 Graph API sync — Planner bi-directional sync, inbound email-to-action, Teams transcript capture, OAuth token lifecycle
**Requirements source:** `docs/requirements/planner.md` (Action Intelligence Platform v2.0 — Phase 1-2)

---

## Overview

The integrations module is the **external sync layer** between the Future platform and Microsoft 365. It owns the Graph API client, OAuth token lifecycle, webhook subscriptions, and polling infrastructure. It does NOT own tasks, notifications, or email delivery — it writes to planner via commands/events and delegates notifications to the existing notifications module.

Four integrations in scope:

1. **Planner bi-directional sync** — push our task changes to MS Planner, poll Planner for external changes
2. **Outlook inbound email** — monitor a shared mailbox, parse incoming emails into draft tasks
3. **Teams transcript capture** — webhook for new meeting transcripts, AI extraction into draft action items
4. **Outlook outbound email** — handled by notifications module + `packages/mail`, NOT by integrations

### Tech Stack

| Concern       | Technology                               | Notes                                       |
| ------------- | ---------------------------------------- | ------------------------------------------- |
| Schema        | Drizzle ORM (`pgSchema('integrations')`) | Index third arg uses array syntax           |
| CQRS          | `@nestjs/cqrs`                           | CommandHandler, QueryHandler, EventsHandler |
| API (admin)   | tRPC with Zod validation                 | Singleton `IntegrationsTrpcService`         |
| Webhooks      | NestJS HTTP Controller                   | Graph API sends POST — not tRPC             |
| Jobs          | pg-boss                                  | Polling, token refresh, webhook renewal     |
| Graph API     | `@microsoft/microsoft-graph-client`      | Wrapped in `IGraphApiClient` port           |
| Token storage | AWS Secrets Manager                      | Refresh tokens encrypted at rest            |

### Key Constraints

- **Planner API has no webhooks** — must poll every 5 minutes
- **Planner API is delegated-only** — needs per-tenant service account
- **Graph API rate limits** — 2,400 req/10min for Planner, 10,000 for Mail
- **Webhook subscriptions expire** — mail max ~3 days, must renew proactively
- **Microsoft Loop has no API** — not viable for integration

### Prerequisites

- **`@future/core` package** — exports `DomainException` base class. Refactoring spec required (see below).
- **Planner module Phase 3+** — integrations consumes planner events and dispatches planner commands. Core planner CQRS must be wired before integrations can sync.
- **Notifications module** — must be implemented (Drizzle repo, Redis publisher, email worker per `2026-04-12-c-notifications-module.md` plan).
- `@microsoft/microsoft-graph-client`: `bun add @microsoft/microsoft-graph-client` in `apps/api`.

### Pattern Reference

Follow `modules/people/` as the canonical module implementation reference:

- Schema: `infrastructure/schema/people.schema.ts`
- Entity: `domain/entities/employment-profile.entity.ts`
- Repository port: `domain/repositories/employment-profile.repository.ts`
- Handler: `application/commands/create-employment-profile.handler.ts`
- Facade: `application/facades/people-query.facade.ts`
- Module: `people.module.ts`
- tRPC service: `interface/trpc/people-trpc.service.ts`

For the NestJS HTTP controller (webhook endpoint), there is no existing reference in this codebase. Follow standard NestJS controller patterns with `@Controller()` and `@Post()` decorators.

### Implementation Order

**Phase 1 — Schema & Domain (no external dependencies)**

1. Drizzle schema: all tables (`external_connection`, `plan_mapping`, `task_mapping`, `sync_cursor`, `webhook_subscription`, `mailbox_config`, `sync_log`)
2. Run `bunx drizzle-kit generate`
3. Domain entities, types, exceptions
4. Port interfaces: `IGraphApiClient`, `ITokenVault`
5. Repository interfaces

**Phase 2 — Infrastructure (depends on Phase 1)**

6. Repository implementations (Drizzle)
7. `MsGraphApiClient` — implements `IGraphApiClient` with rate limiting and retry
8. `SecretsManagerTokenVault` — implements `ITokenVault`
9. `Ms365WebhookController` — NestJS HTTP controller for Graph API notifications

**Phase 3 — Application Commands (depends on Phase 2 + Planner Module Phase 3)**

10. `ConnectMs365`, `DisconnectMs365`, `RefreshAccessToken` commands
11. `LinkPlanToPlanner`, `UnlinkPlan` commands
12. `ConfigureMailbox` command
13. `CreateWebhookSubscription`, `RenewWebhookSubscription` commands
14. `IntegrationsQueryFacade` + `IntegrationsTrpcService`

**Phase 4 — Sync Engine (depends on Phase 3)**

15. `PushTaskToPlanner`, `DeleteTaskFromPlanner` commands
16. `ProcessInboundSync` command + `PlannerSyncService`
17. Event handlers: `OnTaskCreatedForSyncHandler`, `OnTaskUpdatedForSyncHandler`, etc.
18. pg-boss jobs: `integrations.planner-poll`, `integrations.token-refresh`, `integrations.webhook-renewal`

**Phase 5 — Inbound Pipelines (depends on Phase 3 + Planner draft support)**

19. `ProcessInboundEmail` command + `InboundMailService`
20. `ProcessTranscript` command + `TranscriptCaptureService`
21. `IActionExtractor` port + `OpenAiActionExtractor` adapter
22. pg-boss jobs: `integrations.process-email`, `integrations.process-transcript`

**Phase 6 — Admin Frontend (depends on Phase 3+)**

23. Admin panel: MS365 connection management
24. Plan linking UI
25. Mailbox configuration
26. Sync status dashboard + logs viewer

---

## Data Model

All tables in the `integrations` PostgreSQL schema. Every table has `tenant_id` (uuid, NOT NULL). Primary keys are uuid v7.

### `external_connection`

Per-tenant OAuth connection. Admin-configured via admin panel.

| Column                  | Type      | Notes                                                          |
| ----------------------- | --------- | -------------------------------------------------------------- |
| id                      | uuid v7   | PK                                                             |
| tenant_id               | uuid      | NOT NULL                                                       |
| provider                | enum      | `ms365` (extensible for future: `google_workspace`, `slack`)   |
| display_name            | text      | e.g. "SETA Microsoft 365"                                      |
| service_account_email   | text      | NOT NULL — the dedicated sync user                             |
| token_secret_ref        | text      | NOT NULL — AWS Secrets Manager ARN for encrypted refresh token |
| access_token_expires_at | timestamp | when current access token expires                              |
| status                  | enum      | `pending`, `verified`, `error`, `disconnected`                 |
| last_verified_at        | timestamp | nullable                                                       |
| error_message           | text      | nullable — last error detail                                   |
| configured_by           | uuid      | admin actor who set it up                                      |
| created_at              | timestamp |                                                                |
| updated_at              | timestamp |                                                                |

Unique constraint on `(tenant_id, provider)`.

### `plan_mapping`

Maps internal plan to MS Planner plan for sync.

| Column            | Type      | Notes                                            |
| ----------------- | --------- | ------------------------------------------------ |
| id                | uuid v7   | PK                                               |
| tenant_id         | uuid      | NOT NULL                                         |
| connection_id     | uuid      | FK to external_connection                        |
| internal_plan_id  | uuid      | FK-less ref to planner.plan                      |
| external_plan_id  | text      | NOT NULL — Planner plan ID                       |
| external_group_id | text      | NOT NULL — M365 Group ID owning the plan         |
| sync_direction    | enum      | `bidirectional`, `outbound_only`, `inbound_only` |
| is_active         | boolean   | default true                                     |
| created_at        | timestamp |                                                  |

### `task_mapping`

Maps internal task to MS Planner task with etag for optimistic concurrency.

| Column           | Type      | Notes                                 |
| ---------------- | --------- | ------------------------------------- |
| id               | uuid v7   | PK                                    |
| tenant_id        | uuid      | NOT NULL                              |
| plan_mapping_id  | uuid      | FK to plan_mapping                    |
| internal_task_id | uuid      | FK-less ref to planner.task           |
| external_task_id | text      | NOT NULL — Planner task ID            |
| external_etag    | text      | NOT NULL — for optimistic concurrency |
| last_synced_at   | timestamp |                                       |

Unique constraints on `(tenant_id, internal_task_id)` and `(tenant_id, external_task_id)`.

### `sync_cursor`

Polling state per linked plan.

| Column             | Type      | Notes                                       |
| ------------------ | --------- | ------------------------------------------- |
| id                 | uuid v7   | PK                                          |
| tenant_id          | uuid      | NOT NULL                                    |
| plan_mapping_id    | uuid      | FK to plan_mapping                          |
| last_polled_at     | timestamp |                                             |
| last_modified_seen | timestamp | highest `lastModifiedDateTime` from Planner |

### `webhook_subscription`

Active Graph API webhook subscriptions.

| Column           | Type      | Notes                                    |
| ---------------- | --------- | ---------------------------------------- |
| id               | uuid v7   | PK                                       |
| tenant_id        | uuid      | NOT NULL                                 |
| connection_id    | uuid      | FK to external_connection                |
| resource_type    | enum      | `mail_inbox`, `transcript`               |
| resource_path    | text      | Graph API resource path                  |
| subscription_id  | text      | NOT NULL — Graph API subscription ID     |
| client_state     | text      | NOT NULL — secret for webhook validation |
| expires_at       | timestamp | NOT NULL                                 |
| notification_url | text      | our webhook endpoint                     |
| status           | enum      | `active`, `expiring`, `expired`, `error` |
| created_at       | timestamp |                                          |

### `mailbox_config`

Shared mailbox configuration for email-to-action.

| Column          | Type      | Notes                                |
| --------------- | --------- | ------------------------------------ |
| id              | uuid v7   | PK                                   |
| tenant_id       | uuid      | NOT NULL, unique                     |
| connection_id   | uuid      | FK to external_connection            |
| mailbox_address | text      | NOT NULL — e.g. `actions@seta.com`   |
| mailbox_id      | text      | NOT NULL — Graph API user/mailbox ID |
| is_active       | boolean   | default true                         |
| created_at      | timestamp |                                      |

### `sync_log`

Audit trail for all sync operations.

| Column        | Type      | Notes                                                                             |
| ------------- | --------- | --------------------------------------------------------------------------------- |
| id            | uuid v7   | PK                                                                                |
| tenant_id     | uuid      | NOT NULL                                                                          |
| connection_id | uuid      | FK                                                                                |
| event_type    | text      | `sync_pull`, `sync_push`, `conflict`, `error`, `rate_limited`, `webhook_received` |
| resource_type | text      | `planner_task`, `email`, `transcript`                                             |
| resource_id   | text      | nullable — external resource ID                                                   |
| details       | jsonb     | context-specific payload                                                          |
| created_at    | timestamp |                                                                                   |

---

## Domain Layer

All entities are TypeScript interfaces. Type unions for enums.

### Entities

```
external-connection.entity.ts   — ExternalConnection interface
plan-mapping.entity.ts          — PlanMapping interface
task-mapping.entity.ts          — TaskMapping interface
sync-cursor.entity.ts           — SyncCursor interface
webhook-subscription.entity.ts  — WebhookSubscription interface
mailbox-config.entity.ts        — MailboxConfig interface
sync-log.entity.ts              — SyncLog interface
```

### Domain Types

```typescript
// In external-connection.entity.ts
export type IntegrationProvider = 'ms365'
export type ConnectionStatus = 'pending' | 'verified' | 'error' | 'disconnected'

// In plan-mapping.entity.ts
export type SyncDirection = 'bidirectional' | 'outbound_only' | 'inbound_only'

// In webhook-subscription.entity.ts
export type WebhookResourceType = 'mail_inbox' | 'transcript'
export type WebhookStatus = 'active' | 'expiring' | 'expired' | 'error'

// In sync-log.entity.ts
export type SyncEventType =
  | 'sync_pull'
  | 'sync_push'
  | 'conflict'
  | 'error'
  | 'rate_limited'
  | 'webhook_received'
```

### Ports (in `domain/ports/`)

```typescript
// graph-api-client.port.ts
export const GRAPH_API_CLIENT = Symbol('IGraphApiClient')
export interface IGraphApiClient {
  // Planner
  listPlanTasks(token: string, planId: string): Promise<ExternalTask[]>
  createTask(token: string, planId: string, data: CreateExternalTask): Promise<ExternalTask>
  updateTask(
    token: string,
    taskId: string,
    etag: string,
    data: Partial<ExternalTask>,
  ): Promise<ExternalTask>
  deleteTask(token: string, taskId: string, etag: string): Promise<void>
  listAccessiblePlans(token: string): Promise<ExternalPlan[]>

  // Mail
  sendMail(token: string, from: string, to: string[], subject: string, body: string): Promise<void>
  getMessage(token: string, mailboxId: string, messageId: string): Promise<ExternalEmail>

  // Subscriptions
  createSubscription(
    token: string,
    resource: string,
    notificationUrl: string,
    clientState: string,
    expiresMinutes: number,
  ): Promise<ExternalSubscription>
  renewSubscription(
    token: string,
    subscriptionId: string,
    expiresMinutes: number,
  ): Promise<ExternalSubscription>
  deleteSubscription(token: string, subscriptionId: string): Promise<void>

  // Transcripts
  getTranscriptContent(token: string, meetingId: string, transcriptId: string): Promise<string>
}

// token-vault.port.ts
export const TOKEN_VAULT = Symbol('ITokenVault')
export interface ITokenVault {
  storeRefreshToken(tenantId: string, provider: string, token: string): Promise<string>
  getRefreshToken(secretRef: string): Promise<string>
  deleteToken(secretRef: string): Promise<void>
  exchangeRefreshToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }>
  exchangeAuthCode(
    authCode: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }>
}
```

### Repository Interfaces

```
external-connection.repository.ts   — EXTERNAL_CONNECTION_REPOSITORY
plan-mapping.repository.ts          — PLAN_MAPPING_REPOSITORY
task-mapping.repository.ts          — TASK_MAPPING_REPOSITORY
sync-cursor.repository.ts           — SYNC_CURSOR_REPOSITORY
webhook-subscription.repository.ts  — WEBHOOK_SUBSCRIPTION_REPOSITORY
mailbox-config.repository.ts        — MAILBOX_CONFIG_REPOSITORY
sync-log.repository.ts              — SYNC_LOG_REPOSITORY
```

### Domain Rules

1. One `external_connection` per tenant per provider.
2. Connection must be `verified` (successful token exchange + `/me` call) before any plan can be linked or mailbox configured.
3. Token refresh must happen proactively — when `access_token_expires_at` is within 5 minutes.
4. `task_mapping.external_etag` must be updated on every successful push to Planner.
5. Sync conflicts (Planner-side change that differs from our version) are logged to `sync_log` with `event_type = 'conflict'`, and Planner is overwritten (our system is authoritative).
6. Webhook subscriptions with `expires_at` within 2 hours are marked `expiring` and queued for renewal.
7. Deleted tasks detected in Planner (mapped task missing from poll results) are logged but NOT auto-deleted internally.

### Exceptions

```
ConnectionNotFoundException         — code: 'CONNECTION_NOT_FOUND'
ConnectionNotVerifiedException      — code: 'CONNECTION_NOT_VERIFIED'
TokenExchangeFailedException        — code: 'TOKEN_EXCHANGE_FAILED'
PlanMappingAlreadyExistsException   — code: 'PLAN_MAPPING_ALREADY_EXISTS'
ExternalApiRateLimitedException     — code: 'EXTERNAL_API_RATE_LIMITED'
SyncConflictException               — code: 'SYNC_CONFLICT'
WebhookVerificationFailedException  — code: 'WEBHOOK_VERIFICATION_FAILED'
MailboxAlreadyConfiguredException   — code: 'MAILBOX_ALREADY_CONFIGURED'
```

---

## Application Layer

### Commands

| Command                     | Description                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ConnectMs365`              | Admin provides auth code from OAuth flow, exchange for tokens, store in Secrets Manager, verify via `/me` |
| `DisconnectMs365`           | Revoke tokens, delete from vault, set status `disconnected`, deactivate all plan mappings and webhooks    |
| `RefreshAccessToken`        | Proactively refresh access token before expiry                                                            |
| `LinkPlanToPlanner`         | Map internal plan to Planner plan + group, set sync direction, do initial task sync                       |
| `UnlinkPlan`                | Deactivate plan mapping, clean up task mappings                                                           |
| `TriggerManualSync`         | Force immediate sync cycle for a specific plan mapping                                                    |
| `PushTaskToPlanner`         | Create or update a task in Planner — handles etag, conflict detection                                     |
| `DeleteTaskFromPlanner`     | Remove a task from Planner when deleted internally                                                        |
| `ProcessInboundSync`        | Diff polled Planner tasks against local state, create/update/log conflicts                                |
| `ProcessInboundEmail`       | Parse incoming email, create draft task in planner                                                        |
| `ProcessTranscript`         | Fetch transcript, AI extraction, create draft tasks                                                       |
| `ConfigureMailbox`          | Set shared mailbox for email-to-action, create webhook subscription                                       |
| `CreateWebhookSubscription` | Register Graph API webhook                                                                                |
| `RenewWebhookSubscription`  | Renew before expiry                                                                                       |
| `DeleteWebhookSubscription` | Clean up subscription                                                                                     |
| `LogSyncEvent`              | Write to sync_log                                                                                         |

### Queries

| Query                      | Description                                                            |
| -------------------------- | ---------------------------------------------------------------------- |
| `GetConnection`            | Connection status, last verified, error details                        |
| `ListPlanMappings`         | All linked plans with sync status                                      |
| `GetSyncStatus`            | Per-plan health — last polled, conflicts, errors                       |
| `ListSyncLogs`             | Paginated audit trail, filterable by event type                        |
| `ListWebhookSubscriptions` | Active subscriptions with expiry                                       |
| `GetMailboxConfig`         | Current mailbox configuration                                          |
| `ListAccessiblePlans`      | Fetch Planner plans the service account can see (for admin linking UI) |

### Event Handlers (consuming planner events for outbound sync)

| Event                | Action                                                           |
| -------------------- | ---------------------------------------------------------------- |
| `TaskCreatedEvent`   | If task's plan has active outbound mapping → `PushTaskToPlanner` |
| `TaskUpdatedEvent`   | If mapped → `PushTaskToPlanner` with changed fields              |
| `TaskCompletedEvent` | If mapped → `PushTaskToPlanner` (percentComplete = 100)          |
| `TaskDeletedEvent`   | If mapped → `DeleteTaskFromPlanner`                              |

### Application Services

| Service                    | Responsibility                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `PlannerSyncService`       | Orchestrates poll cycle: get token → fetch tasks → diff → dispatch ProcessInboundSync → update cursor |
| `InboundMailService`       | Processes incoming email webhook: fetch message → parse → create draft task in planner                |
| `TranscriptCaptureService` | Processes transcript webhook: fetch VTT → AI extraction → create draft tasks → notify for review      |
| `TokenLifecycleService`    | Monitors access_token_expires_at, proactively refreshes                                               |

### Facade

**`IntegrationsQueryFacade`** (exported to other modules):

| Method                           | Description                            |
| -------------------------------- | -------------------------------------- |
| `getConnectionStatus(tenantId)`  | For admin module — is MS365 connected? |
| `isTaskSynced(taskId, tenantId)` | For planner UI — show sync badge       |
| `getSyncHealth(tenantId)`        | For admin dashboard — sync metrics     |

---

## Cross-Module Event Flows

### Outbound: Our system → MS Planner

```
Task created/updated/completed in planner
  → Event published via outbox
  → Integrations event handler:
      1. Check if task's plan has active plan_mapping with outbound sync
      2. Get access token (refresh if needed via TokenLifecycleService)
      3. Call IGraphApiClient.createTask/updateTask
      4. Store/update task_mapping with new etag
      5. Log to sync_log (sync_push)
      6. On failure: log error, retry via pg-boss — sync is best-effort, never blocks
```

### Inbound: MS Planner → Our system (polling)

```
pg-boss fires integrations.planner-poll every 5 min
  → PlannerSyncService per active plan_mapping:
      1. Get access token
      2. Call IGraphApiClient.listPlanTasks(planId)
      3. For each external task:
         a. Find task_mapping by external_task_id
         b. No mapping → new task in Planner → dispatch CreateTask to planner (source_type: 'manual')
         c. Mapped → compare lastModifiedDateTime vs last_synced_at
         d. External is newer → compare fields → detect conflict
         e. Our system wins → PushTaskToPlanner overwrites → log conflict in sync_log
         f. No conflict → update task_mapping.last_synced_at
      4. Mapped tasks missing from Planner → log deletion, don't auto-delete internally
      5. Update sync_cursor.last_polled_at
```

### Inbound: Email → Draft Task

```
Graph API webhook → POST /webhooks/ms365/notifications
  → Controller validates clientState, responds 202
  → Queues ProcessInboundEmail job via pg-boss
  → Worker:
      1. Get access token
      2. Fetch full email via IGraphApiClient.getMessage()
      3. Extract: subject, body, sender, recipients
      4. Dispatch CreateTask to planner:
         - title: email subject
         - description: email body (trimmed)
         - source_type: 'email'
         - source_ref: { emailThreadId, from, to }
         - status: draft category (pending human review)
         - created_by: matched actor by sender email, or system actor
      5. Dispatch SendNotificationCommand to notifications module
      6. Log to sync_log (webhook_received)
```

### Inbound: Teams Transcript → Draft Tasks

```
Graph API webhook for new transcript
  → Controller validates, responds 202
  → Queues ProcessTranscript job via pg-boss
  → Worker:
      1. Get access token
      2. Fetch VTT via IGraphApiClient.getTranscriptContent()
      3. AI extraction (OpenAI structured output):
         - Input: transcript text
         - Output: [{ title, ownerHint, deadlineHint, confidence, sourceQuote }]
      4. For each extracted item with confidence >= 0.5:
         Dispatch CreateTask to planner:
           - title: extracted title
           - source_type: 'teams_meeting'
           - source_ref: { meetingId, transcriptId, sourceQuote }
           - status: draft category
      5. Notify meeting organizer via SendNotificationCommand:
         "N action items extracted from your meeting — review and confirm"
      6. Log to sync_log
```

### Notification event handlers (in notifications module — not integrations)

New event handlers added to the existing notifications module:

| Event                | Notification                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `TaskAssignedEvent`  | "You've been assigned to task #N: {title}" → category: `assignment` |
| `TaskOverdueEvent`   | "Task #N is overdue (due {date})" → category: `system`              |
| `TaskCompletedEvent` | "Task #N completed by {actor}" → category: `system`                 |
| `PlanCreatedEvent`   | "New plan: {title}" → category: `system`                            |

---

## pg-boss Jobs

| Job                               | Schedule    | Description                                                                                  |
| --------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `integrations.planner-poll`       | Every 5 min | Per active plan_mapping — fetch, diff, sync inbound. Uses `singletonKey: plan-mapping-${id}` |
| `integrations.token-refresh`      | Every 3 min | Check all connections, refresh tokens expiring within 5 min                                  |
| `integrations.webhook-renewal`    | Hourly      | Find subscriptions expiring within 2 hours, renew                                            |
| `integrations.process-email`      | On demand   | Queued by webhook controller — process one inbound email                                     |
| `integrations.process-transcript` | On demand   | Queued by webhook controller — process one transcript                                        |

All jobs use `singletonKey` to prevent duplicate processing. Rate limit errors trigger retry with `Retry-After` backoff.

---

## Webhook HTTP Controller

NestJS HTTP controller (not tRPC — Microsoft needs a publicly accessible URL).

```
POST /webhooks/ms365/notifications
```

**Validation flow:**

1. On subscription creation, Graph sends `?validationToken=...` — respond 200 with token as plain text
2. On real notifications, POST body contains `{ value: [{ subscriptionId, changeType, resource, clientState }] }`
3. Verify `clientState` matches stored value in `webhook_subscription`
4. Respond 202 immediately
5. Queue processing job via pg-boss (async — don't block the webhook response)

---

## tRPC Router

```
integrations.
  connection.connect       — mutation
  connection.disconnect    — mutation
  connection.verify        — mutation
  connection.get           — query
  planMapping.link         — mutation
  planMapping.unlink       — mutation
  planMapping.list         — query
  planMapping.syncNow      — mutation
  sync.status              — query
  sync.logs                — query
  webhook.list             — query
  mailbox.configure        — mutation
  mailbox.get              — query
  availablePlans.list      — query (fetches from Graph API)
```

---

## Permissions

All restricted to tenant admin:

| Permission                         | Who               |
| ---------------------------------- | ----------------- |
| `integrations:connection:manage`   | Tenant admin only |
| `integrations:plan-mapping:manage` | Tenant admin only |
| `integrations:sync:read`           | Tenant admin only |
| `integrations:mailbox:manage`      | Tenant admin only |

---

## Module Wiring

```typescript
@Module({
  imports: [CqrsModule, KernelModule, PlannerModule, NotificationsModule],
  providers: [
    // Repositories
    { provide: EXTERNAL_CONNECTION_REPOSITORY, useClass: DrizzleExternalConnectionRepository },
    { provide: PLAN_MAPPING_REPOSITORY, useClass: DrizzlePlanMappingRepository },
    { provide: TASK_MAPPING_REPOSITORY, useClass: DrizzleTaskMappingRepository },
    { provide: SYNC_CURSOR_REPOSITORY, useClass: DrizzleSyncCursorRepository },
    { provide: WEBHOOK_SUBSCRIPTION_REPOSITORY, useClass: DrizzleWebhookSubscriptionRepository },
    { provide: MAILBOX_CONFIG_REPOSITORY, useClass: DrizzleMailboxConfigRepository },
    { provide: SYNC_LOG_REPOSITORY, useClass: DrizzleSyncLogRepository },

    // Ports
    { provide: GRAPH_API_CLIENT, useClass: MsGraphApiClient },
    { provide: TOKEN_VAULT, useClass: SecretsManagerTokenVault },

    // Command handlers
    ConnectMs365Handler,
    DisconnectMs365Handler,
    RefreshAccessTokenHandler,
    LinkPlanToPlannerHandler,
    UnlinkPlanHandler,
    TriggerManualSyncHandler,
    PushTaskToPlannerHandler,
    DeleteTaskFromPlannerHandler,
    ProcessInboundSyncHandler,
    ProcessInboundEmailHandler,
    ProcessTranscriptHandler,
    ConfigureMailboxHandler,
    CreateWebhookSubscriptionHandler,
    RenewWebhookSubscriptionHandler,
    DeleteWebhookSubscriptionHandler,
    LogSyncEventHandler,

    // Query handlers
    GetConnectionHandler,
    ListPlanMappingsHandler,
    GetSyncStatusHandler,
    ListSyncLogsHandler,
    ListWebhookSubscriptionsHandler,
    GetMailboxConfigHandler,
    ListAccessiblePlansHandler,

    // Event handlers (consuming planner events)
    OnTaskCreatedForSyncHandler,
    OnTaskUpdatedForSyncHandler,
    OnTaskCompletedForSyncHandler,
    OnTaskDeletedForSyncHandler,

    // Services
    PlannerSyncService,
    InboundMailService,
    TranscriptCaptureService,
    TokenLifecycleService,

    // Facade & tRPC
    IntegrationsQueryFacade,
    IntegrationsTrpcService,
  ],
  controllers: [Ms365WebhookController],
  exports: [IntegrationsQueryFacade],
})
export class IntegrationsModule {}
```

---

## Infrastructure Layer

### MsGraphApiClient

Implements `IGraphApiClient`. Wraps `@microsoft/microsoft-graph-client`:

- Handles rate limiting: per-tenant token bucket (2,400/10min for Planner, 10,000 for Mail)
- Automatic retry with `Retry-After` on 429 responses (max 3 retries, exponential backoff)
- All rate limit hits logged to `sync_log` via `LogSyncEvent` command
- Etag management: reads etag from response headers, returns in `ExternalTask` object

### SecretsManagerTokenVault

Implements `ITokenVault`. Uses AWS SDK:

- `storeRefreshToken` → `CreateSecret` / `UpdateSecret`
- `getRefreshToken` → `GetSecretValue`
- `deleteToken` → `DeleteSecret`
- `exchangeRefreshToken` / `exchangeAuthCode` → HTTPS POST to `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`
- Secret naming: `future/{tenantId}/ms365/refresh-token`

### Admin Configuration Flow

1. Tenant admin navigates to **Settings → Integrations → Microsoft 365**
2. Clicks "Connect" → frontend redirects to Microsoft OAuth consent URL with scopes: `Tasks.ReadWrite`, `Mail.Read`, `Mail.Send`, `OnlineMeetingTranscript.Read.All`, `User.Read`, `offline_access`
3. Microsoft redirects back with auth code
4. Frontend calls `integrations.connection.connect` with auth code
5. Backend exchanges code for tokens via `ITokenVault.exchangeAuthCode`
6. Stores refresh token in Secrets Manager, verifies via Graph `/me` endpoint
7. Connection shows as `verified` with service account display name
8. Admin links plans: picks internal plan → sees list of accessible Planner plans (via `availablePlans.list`) → creates plan mapping
9. Admin configures shared mailbox (optional): enters address → system resolves mailbox ID via Graph → creates webhook subscription

---

## What This Module Does NOT Own

- **Task data** — planner module
- **Email delivery** — notifications module + `packages/mail`
- **AI extraction logic** — direct OpenAI call within `TranscriptCaptureService` for now, moves to agents module later
- **User profiles** — people module
- **Permissions** — kernel module via `canDo()`
- **Voice recording capture** — separate spec (Voice Capture & AI Extraction)

---

## Verification Criteria

You know the integrations module is working when:

1. **OAuth flow**: Admin clicks Connect → redirected to Microsoft → callback exchanges code → connection shows `verified` with service account display name
2. **Token refresh**: Set `access_token_expires_at` to 2 minutes from now → `integrations.token-refresh` job fires → token refreshed, new expiry stored
3. **Plan linking**: Link internal plan to Planner plan → `plan_mapping` created → initial tasks synced from Planner
4. **Outbound push**: Create task in linked plan → `TaskCreatedEvent` fires → task appears in MS Planner within 30 seconds
5. **Inbound poll**: Edit task title directly in MS Planner → wait 5 minutes → planner task updated, `sync_log` entry with `sync_pull`
6. **Conflict detection**: Edit same task in both systems → poll detects conflict → our version overwrites Planner → `sync_log` entry with `event_type: 'conflict'` shows the overwritten Planner values
7. **Webhook mail**: Send email to shared mailbox → webhook fires → draft task created in planner with `source_type: 'email'`
8. **Webhook transcript**: Teams meeting ends with transcription enabled → webhook fires → transcript fetched → AI extracts action items → draft tasks created with `source_type: 'teams_meeting'`
9. **Webhook renewal**: Set subscription `expires_at` to 1 hour from now → `integrations.webhook-renewal` job fires → subscription renewed, new expiry stored
10. **Disconnect**: Admin clicks Disconnect → tokens deleted from Secrets Manager → all plan mappings deactivated → webhooks deleted
