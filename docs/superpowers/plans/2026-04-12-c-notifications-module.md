# Notifications Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all stubs in `modules/notifications` with a real Drizzle repository, Redis pub/sub publisher, SSE gateway, new command/query handlers, a pg-boss email worker, cross-module event handlers, and a tRPC router.

**Architecture:** `DrizzleNotificationRepository` owns all DB writes and reads. `RedisNotificationPublisher` publishes to Redis channel `notifications:{tenantId}:{actorId}` after each successful DB insert. `NotificationSseController` subscribes to that channel and streams SSE to connected browser clients. Outgoing email is queued via pg-boss (`notifications.send-email`) and processed by `SendNotificationEmailWorker`. Two cross-module event handlers (`OnLeaveApprovedHandler`, `OnDocumentGeneratedHandler`) fan out to `SendNotificationCommand`.

**Tech Stack:** Drizzle ORM, `ioredis` (`RedisService`), NestJS CQRS + `@Sse()`, pg-boss (`PgBossService`), `packages/mail`, `packages/activity-log`, vitest

**Prerequisite:** Plan A (shared infrastructure) must be complete. `AdminQueryFacade.getEmailConfig()` is already implemented in `AdminModule`.

---

## File Map

| Action | Path                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| Modify | `apps/api/src/modules/notifications/domain/repositories/notification.repository.port.ts`                             |
| Create | `apps/api/src/modules/notifications/infrastructure/repositories/drizzle-notification.repository.ts`                  |
| Create | `apps/api/src/modules/notifications/infrastructure/repositories/drizzle-notification.repository.integration.spec.ts` |
| Create | `apps/api/src/modules/notifications/infrastructure/redis/redis-notification-publisher.ts`                            |
| Create | `apps/api/src/modules/notifications/infrastructure/redis/redis-notification-publisher.spec.ts`                       |
| Create | `apps/api/src/modules/notifications/infrastructure/sse/notification-sse.controller.ts`                               |
| Create | `apps/api/src/modules/notifications/infrastructure/sse/notification-sse.controller.spec.ts`                          |
| Create | `apps/api/src/modules/notifications/infrastructure/jobs/send-notification-email.worker.ts`                           |
| Create | `apps/api/src/modules/notifications/infrastructure/jobs/send-notification-email.worker.spec.ts`                      |
| Create | `apps/api/src/modules/notifications/application/commands/archive-notification.command.ts`                            |
| Create | `apps/api/src/modules/notifications/application/commands/archive-notification.handler.ts`                            |
| Create | `apps/api/src/modules/notifications/application/commands/archive-notification.handler.spec.ts`                       |
| Create | `apps/api/src/modules/notifications/application/commands/update-preference.command.ts`                               |
| Create | `apps/api/src/modules/notifications/application/commands/update-preference.handler.ts`                               |
| Create | `apps/api/src/modules/notifications/application/commands/update-preference.handler.spec.ts`                          |
| Create | `apps/api/src/modules/notifications/application/queries/get-preferences.query.ts`                                    |
| Create | `apps/api/src/modules/notifications/application/queries/get-preferences.handler.ts`                                  |
| Create | `apps/api/src/modules/notifications/application/queries/get-preferences.handler.spec.ts`                             |
| Create | `apps/api/src/modules/notifications/application/event-handlers/on-leave-approved.handler.ts`                         |
| Create | `apps/api/src/modules/notifications/application/event-handlers/on-leave-approved.handler.spec.ts`                    |
| Create | `apps/api/src/modules/notifications/application/event-handlers/on-document-generated.handler.ts`                     |
| Create | `apps/api/src/modules/notifications/application/event-handlers/on-document-generated.handler.spec.ts`                |
| Modify | `apps/api/src/modules/notifications/notifications.module.ts`                                                         |
| Create | `apps/api/src/modules/notifications/interface/trpc/notifications-router.service.ts`                                  |
| Create | `apps/api/src/modules/notifications/interface/trpc/notifications.router.ts`                                          |
| Modify | `apps/api/src/common/trpc/app-router.ts`                                                                             |
| Modify | `apps/api/src/common/trpc/trpc.module.ts`                                                                            |

---

## Task 1: Update INotificationRepository port

**Files:**

- Modify: `apps/api/src/modules/notifications/domain/repositories/notification.repository.port.ts`

The current port is missing `upsertPreference`. Add it.

- [ ] **Step 1: Read the current port file**

Current content (from `notification.repository.port.ts`):

- `insert`, `findByRecipient`, `countUnread`, `markRead`, `markAllRead`, `archive`, `getPreference`

- [ ] **Step 2: Add upsertPreference**

Edit `apps/api/src/modules/notifications/domain/repositories/notification.repository.port.ts`:

```ts
import type { Notification } from '../entities/notification.entity'
import type { NotificationPreference } from '../entities/notification-preference.entity'
import type { NotificationCategory } from '../value-objects/category.vo'

export interface INotificationRepository {
  insert(
    notification: Omit<Notification, 'id' | 'readAt' | 'archivedAt' | 'createdAt'>,
  ): Promise<Notification>
  findByRecipient(
    tenantId: string,
    recipientId: string,
    opts: { category?: NotificationCategory; unreadOnly?: boolean; limit: number; offset: number },
  ): Promise<Notification[]>
  countUnread(tenantId: string, recipientId: string): Promise<number>
  markRead(tenantId: string, ids: string[]): Promise<void>
  markAllRead(tenantId: string, recipientId: string): Promise<void>
  archive(tenantId: string, ids: string[]): Promise<void>
  getPreference(
    tenantId: string,
    actorId: string,
    category: NotificationCategory,
  ): Promise<NotificationPreference | null>
  upsertPreference(data: Omit<NotificationPreference, 'id'>): Promise<NotificationPreference>
  getPreferences(tenantId: string, actorId: string): Promise<NotificationPreference[]>
}

export const NOTIFICATION_REPOSITORY = Symbol('INotificationRepository')
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/notifications/domain/repositories/notification.repository.port.ts
git commit -m "feat(notifications): update INotificationRepository — add upsertPreference, getPreferences"
```

---

## Task 2: DrizzleNotificationRepository

**Files:**

- Create: `apps/api/src/modules/notifications/infrastructure/repositories/drizzle-notification.repository.ts`
- Create: `apps/api/src/modules/notifications/infrastructure/repositories/drizzle-notification.repository.integration.spec.ts`

- [ ] **Step 1: Write failing integration test**

Create `apps/api/src/modules/notifications/infrastructure/repositories/drizzle-notification.repository.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  seedActor,
  setTenantContext,
} from '@future/db/src/test-helpers'
import type { Db } from '@future/db'
import { DrizzleNotificationRepository } from './drizzle-notification.repository'
import { sql } from 'drizzle-orm'

let db: Db
let repo: DrizzleNotificationRepository
let tenantId: string
let actorId: string

beforeAll(async () => {
  await migrateForTest()
  db = createTestDb()
  repo = new DrizzleNotificationRepository(db)
  const t = await seedTenant(db)
  tenantId = t.id
  const a = await seedActor(db, { tenantId })
  actorId = a.id
  await setTenantContext(db, tenantId)
})

afterAll(async () => {
  await db.execute(
    sql`TRUNCATE notifications.notification, notifications.notification_preference CASCADE`,
  )
})

describe('DrizzleNotificationRepository', () => {
  it('inserts a notification and retrieves it by recipient', async () => {
    const notif = await repo.insert({
      tenantId,
      recipientId: actorId,
      senderId: null,
      category: 'system',
      title: 'Test notification',
      body: 'Hello',
      resourceType: null,
      resourceId: null,
      resourceUrl: null,
    })

    expect(notif.id).toBeTruthy()
    expect(notif.readAt).toBeNull()

    const results = await repo.findByRecipient(tenantId, actorId, { limit: 10, offset: 0 })
    expect(results.some((n) => n.id === notif.id)).toBe(true)
  })

  it('countUnread returns correct count', async () => {
    const before = await repo.countUnread(tenantId, actorId)

    await repo.insert({
      tenantId,
      recipientId: actorId,
      senderId: null,
      category: 'approval',
      title: 'Leave approved',
      body: null,
      resourceType: 'leave_request',
      resourceId: null,
      resourceUrl: null,
    })

    const after = await repo.countUnread(tenantId, actorId)
    expect(after).toBe(before + 1)
  })

  it('markRead clears readAt on specified ids', async () => {
    const n = await repo.insert({
      tenantId,
      recipientId: actorId,
      senderId: null,
      category: 'system',
      title: 'To be read',
      body: null,
      resourceType: null,
      resourceId: null,
      resourceUrl: null,
    })

    await repo.markRead(tenantId, [n.id])

    const results = await repo.findByRecipient(tenantId, actorId, { limit: 50, offset: 0 })
    const updated = results.find((x) => x.id === n.id)
    expect(updated?.readAt).not.toBeNull()
  })

  it('upsertPreference stores and updates preference', async () => {
    const pref = await repo.upsertPreference({
      tenantId,
      actorId,
      category: 'approval',
      inApp: true,
      email: false,
    })
    expect(pref.email).toBe(false)

    const updated = await repo.upsertPreference({
      tenantId,
      actorId,
      category: 'approval',
      inApp: true,
      email: true,
    })
    expect(updated.email).toBe(true)
  })

  it('getPreferences returns all stored preferences for actor', async () => {
    await repo.upsertPreference({
      tenantId,
      actorId,
      category: 'mention',
      inApp: false,
      email: true,
    })
    const prefs = await repo.getPreferences(tenantId, actorId)
    expect(prefs.length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/api && bun run test:integration -- drizzle-notification.repository
```

- [ ] **Step 3: Implement DrizzleNotificationRepository**

Create `apps/api/src/modules/notifications/infrastructure/repositories/drizzle-notification.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, isNull, inArray } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import type { Notification } from '../../domain/entities/notification.entity'
import type { NotificationPreference } from '../../domain/entities/notification-preference.entity'
import type { NotificationCategory } from '../../domain/value-objects/category.vo'
import { notification, notificationPreference } from '../schema/notifications.schema'

@Injectable()
export class DrizzleNotificationRepository implements INotificationRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(
    data: Omit<Notification, 'id' | 'readAt' | 'archivedAt' | 'createdAt'>,
  ): Promise<Notification> {
    const rows = await this.db
      .insert(notification)
      .values({
        tenantId: data.tenantId,
        recipientId: data.recipientId,
        senderId: data.senderId ?? undefined,
        category: data.category,
        title: data.title,
        body: data.body ?? undefined,
        resourceType: data.resourceType ?? undefined,
        resourceId: data.resourceId ?? undefined,
        resourceUrl: data.resourceUrl ?? undefined,
      })
      .returning()
    return rows[0] as Notification
  }

  async findByRecipient(
    tenantId: string,
    recipientId: string,
    opts: { category?: NotificationCategory; unreadOnly?: boolean; limit: number; offset: number },
  ): Promise<Notification[]> {
    const conditions = [
      eq(notification.tenantId, tenantId),
      eq(notification.recipientId, recipientId),
      isNull(notification.archivedAt),
    ]
    if (opts.category) conditions.push(eq(notification.category, opts.category))
    if (opts.unreadOnly) conditions.push(isNull(notification.readAt))

    const rows = await this.db
      .select()
      .from(notification)
      .where(and(...conditions))
      .limit(opts.limit)
      .offset(opts.offset)
    return rows as Notification[]
  }

  async countUnread(tenantId: string, recipientId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(notification)
      .where(
        and(
          eq(notification.tenantId, tenantId),
          eq(notification.recipientId, recipientId),
          isNull(notification.readAt),
          isNull(notification.archivedAt),
        ),
      )
    return rows.length
  }

  async markRead(tenantId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(and(eq(notification.tenantId, tenantId), inArray(notification.id, ids)))
  }

  async markAllRead(tenantId: string, recipientId: string): Promise<void> {
    await this.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notification.tenantId, tenantId),
          eq(notification.recipientId, recipientId),
          isNull(notification.readAt),
        ),
      )
  }

  async archive(tenantId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.db
      .update(notification)
      .set({ archivedAt: new Date() })
      .where(and(eq(notification.tenantId, tenantId), inArray(notification.id, ids)))
  }

  async getPreference(
    tenantId: string,
    actorId: string,
    category: NotificationCategory,
  ): Promise<NotificationPreference | null> {
    const rows = await this.db
      .select()
      .from(notificationPreference)
      .where(
        and(
          eq(notificationPreference.tenantId, tenantId),
          eq(notificationPreference.actorId, actorId),
          eq(notificationPreference.category, category),
        ),
      )
      .limit(1)
    return (rows[0] as NotificationPreference | undefined) ?? null
  }

  async upsertPreference(
    data: Omit<NotificationPreference, 'id'>,
  ): Promise<NotificationPreference> {
    const rows = await this.db
      .insert(notificationPreference)
      .values({
        tenantId: data.tenantId,
        actorId: data.actorId,
        category: data.category,
        inApp: data.inApp,
        email: data.email,
      })
      .onConflictDoUpdate({
        target: [
          notificationPreference.tenantId,
          notificationPreference.actorId,
          notificationPreference.category,
        ],
        set: { inApp: data.inApp, email: data.email },
      })
      .returning()
    return rows[0] as NotificationPreference
  }

  async getPreferences(tenantId: string, actorId: string): Promise<NotificationPreference[]> {
    const rows = await this.db
      .select()
      .from(notificationPreference)
      .where(
        and(
          eq(notificationPreference.tenantId, tenantId),
          eq(notificationPreference.actorId, actorId),
        ),
      )
    return rows as NotificationPreference[]
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/api && bun run test:integration -- drizzle-notification.repository
```

- [ ] **Step 5: Check that notifications.notification_preference has the right unique constraint**

The schema file (`notifications.schema.ts`) defines the table but the unique constraint `UNIQUE (tenant_id, actor_id, category)` must be in the migration. Open the migration SQL generated in Plan A and verify this constraint exists. If it's missing, add it manually to the SQL and re-run migrations.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/notifications/infrastructure/repositories/drizzle-notification.repository.ts \
        apps/api/src/modules/notifications/infrastructure/repositories/drizzle-notification.repository.integration.spec.ts
git commit -m "feat(notifications): DrizzleNotificationRepository with integration tests"
```

---

## Task 3: RedisNotificationPublisher

**Files:**

- Create: `apps/api/src/modules/notifications/infrastructure/redis/redis-notification-publisher.ts`
- Create: `apps/api/src/modules/notifications/infrastructure/redis/redis-notification-publisher.spec.ts`

- [ ] **Step 1: Write failing unit test**

Create `apps/api/src/modules/notifications/infrastructure/redis/redis-notification-publisher.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RedisNotificationPublisher } from './redis-notification-publisher'
import type { RedisService } from '../../../../common/redis/redis.service'
import type { Notification } from '../../domain/entities/notification.entity'

const mockRedis = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as RedisService

const notification: Notification = {
  id: 'n-1',
  tenantId: 'tenant-1',
  recipientId: 'actor-1',
  senderId: null,
  category: 'approval',
  title: 'Leave approved',
  body: null,
  resourceType: null,
  resourceId: null,
  resourceUrl: null,
  readAt: null,
  archivedAt: null,
  createdAt: new Date(),
}

describe('RedisNotificationPublisher', () => {
  let publisher: RedisNotificationPublisher

  beforeEach(() => {
    vi.clearAllMocks()
    publisher = new RedisNotificationPublisher(mockRedis)
  })

  it('publishes notification to the correct channel', async () => {
    await publisher.publish('tenant-1', 'actor-1', notification)

    expect(mockRedis.publish).toHaveBeenCalledWith(
      'notifications:tenant-1:actor-1',
      JSON.stringify(notification),
    )
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/api && bun run test:unit -- redis-notification-publisher
```

- [ ] **Step 3: Implement RedisNotificationPublisher**

Create `apps/api/src/modules/notifications/infrastructure/redis/redis-notification-publisher.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { RedisService } from '../../../../common/redis/redis.service'
import type { NotificationPublisher } from './notification-publisher'
import type { Notification } from '../../domain/entities/notification.entity'

@Injectable()
export class RedisNotificationPublisher implements NotificationPublisher {
  constructor(private readonly redisService: RedisService) {}

  async publish(tenantId: string, recipientId: string, notification: Notification): Promise<void> {
    const channel = `notifications:${tenantId}:${recipientId}`
    await this.redisService.publish(channel, JSON.stringify(notification))
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/api && bun run test:unit -- redis-notification-publisher
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notifications/infrastructure/redis/redis-notification-publisher.ts \
        apps/api/src/modules/notifications/infrastructure/redis/redis-notification-publisher.spec.ts
git commit -m "feat(notifications): RedisNotificationPublisher — pub/sub via ioredis"
```

---

## Task 4: NotificationSseController

**Files:**

- Create: `apps/api/src/modules/notifications/infrastructure/sse/notification-sse.controller.ts`
- Create: `apps/api/src/modules/notifications/infrastructure/sse/notification-sse.controller.spec.ts`

- [ ] **Step 1: Write failing unit test**

Create `apps/api/src/modules/notifications/infrastructure/sse/notification-sse.controller.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificationSseController } from './notification-sse.controller'
import type { RedisService } from '../../../../common/redis/redis.service'

const mockRedis = {
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
} as unknown as RedisService

describe('NotificationSseController', () => {
  let controller: NotificationSseController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new NotificationSseController(mockRedis)
  })

  it('subscribes to the correct Redis channel', async () => {
    const req = {
      headers: { cookie: 'session=test' },
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      on: vi.fn(),
    }

    // Take the first emission from the observable
    controller.stream(req as never).subscribe({
      next: () => {},
      error: () => {},
    })

    // Wait for async subscribe
    await new Promise((r) => setTimeout(r, 10))

    expect(mockRedis.subscribe).toHaveBeenCalledWith(
      'notifications:tenant-1:actor-1',
      expect.any(Function),
    )
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/api && bun run test:unit -- notification-sse.controller
```

- [ ] **Step 3: Implement NotificationSseController**

Create `apps/api/src/modules/notifications/infrastructure/sse/notification-sse.controller.ts`:

```ts
import { Controller, Req, Sse } from '@nestjs/common'
import { Observable, Subject } from 'rxjs'
import type { MessageEvent } from '@nestjs/common'
import { RedisService } from '../../../../common/redis/redis.service'

interface SseRequest {
  tenantId: string
  actorId: string
  on(event: 'close', handler: () => void): void
}

@Controller()
export class NotificationSseController {
  constructor(private readonly redisService: RedisService) {}

  @Sse('/api/notifications/stream')
  stream(@Req() req: SseRequest): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>()
    const channel = `notifications:${req.tenantId}:${req.actorId}`

    void this.redisService.subscribe(channel, (message: string) => {
      subject.next({ data: message })
    })

    req.on('close', () => {
      void this.redisService.unsubscribe(channel)
      subject.complete()
    })

    return subject.asObservable()
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/api && bun run test:unit -- notification-sse.controller
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notifications/infrastructure/sse/notification-sse.controller.ts \
        apps/api/src/modules/notifications/infrastructure/sse/notification-sse.controller.spec.ts
git commit -m "feat(notifications): NotificationSseController — SSE stream via Redis pub/sub"
```

---

## Task 5: ArchiveNotificationHandler

**Files:**

- Create: `apps/api/src/modules/notifications/application/commands/archive-notification.command.ts`
- Create: `apps/api/src/modules/notifications/application/commands/archive-notification.handler.ts`
- Create: `apps/api/src/modules/notifications/application/commands/archive-notification.handler.spec.ts`

- [ ] **Step 1: Create command and write failing test**

Create `apps/api/src/modules/notifications/application/commands/archive-notification.command.ts`:

```ts
export class ArchiveNotificationCommand {
  constructor(
    public readonly tenantId: string,
    public readonly ids: string[],
  ) {}
}
```

Create `apps/api/src/modules/notifications/application/commands/archive-notification.handler.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ArchiveNotificationHandler } from './archive-notification.handler'
import { ArchiveNotificationCommand } from './archive-notification.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'

const mockRepo = {
  archive: vi.fn().mockResolvedValue(undefined),
} as unknown as INotificationRepository

describe('ArchiveNotificationHandler', () => {
  let handler: ArchiveNotificationHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new ArchiveNotificationHandler(mockRepo)
  })

  it('calls repo.archive with provided ids', async () => {
    await handler.execute(new ArchiveNotificationCommand('tenant-1', ['n-1', 'n-2']))
    expect(mockRepo.archive).toHaveBeenCalledWith('tenant-1', ['n-1', 'n-2'])
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/api && bun run test:unit -- archive-notification.handler
```

- [ ] **Step 3: Implement handler**

Create `apps/api/src/modules/notifications/application/commands/archive-notification.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ArchiveNotificationCommand } from './archive-notification.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'

@CommandHandler(ArchiveNotificationCommand)
@Injectable()
export class ArchiveNotificationHandler implements ICommandHandler<
  ArchiveNotificationCommand,
  void
> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(command: ArchiveNotificationCommand): Promise<void> {
    await this.repo.archive(command.tenantId, command.ids)
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/api && bun run test:unit -- archive-notification.handler
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notifications/application/commands/archive-notification.command.ts \
        apps/api/src/modules/notifications/application/commands/archive-notification.handler.ts \
        apps/api/src/modules/notifications/application/commands/archive-notification.handler.spec.ts
git commit -m "feat(notifications): ArchiveNotificationHandler"
```

---

## Task 6: UpdatePreferenceHandler

**Files:**

- Create: `apps/api/src/modules/notifications/application/commands/update-preference.command.ts`
- Create: `apps/api/src/modules/notifications/application/commands/update-preference.handler.ts`
- Create: `apps/api/src/modules/notifications/application/commands/update-preference.handler.spec.ts`

- [ ] **Step 1: Create command**

Create `apps/api/src/modules/notifications/application/commands/update-preference.command.ts`:

```ts
import type { NotificationCategory } from '../../domain/value-objects/category.vo'

export class UpdatePreferenceCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly category: NotificationCategory,
    public readonly inApp: boolean,
    public readonly email: boolean,
  ) {}
}
```

- [ ] **Step 2: Write failing unit test**

Create `apps/api/src/modules/notifications/application/commands/update-preference.handler.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UpdatePreferenceHandler } from './update-preference.handler'
import { UpdatePreferenceCommand } from './update-preference.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'

const mockRepo = {
  upsertPreference: vi.fn().mockResolvedValue({
    id: 'pref-1',
    tenantId: 'tenant-1',
    actorId: 'actor-1',
    category: 'approval',
    inApp: false,
    email: true,
  }),
} as unknown as INotificationRepository

describe('UpdatePreferenceHandler', () => {
  let handler: UpdatePreferenceHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new UpdatePreferenceHandler(mockRepo)
  })

  it('upserts preference and returns it', async () => {
    const result = await handler.execute(
      new UpdatePreferenceCommand('tenant-1', 'actor-1', 'approval', false, true),
    )
    expect(result.email).toBe(true)
    expect(mockRepo.upsertPreference).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      category: 'approval',
      inApp: false,
      email: true,
    })
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd apps/api && bun run test:unit -- update-preference.handler
```

- [ ] **Step 4: Implement handler**

Create `apps/api/src/modules/notifications/application/commands/update-preference.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { UpdatePreferenceCommand } from './update-preference.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'
import type { NotificationPreference } from '../../domain/entities/notification-preference.entity'

@CommandHandler(UpdatePreferenceCommand)
@Injectable()
export class UpdatePreferenceHandler implements ICommandHandler<
  UpdatePreferenceCommand,
  NotificationPreference
> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(command: UpdatePreferenceCommand): Promise<NotificationPreference> {
    return this.repo.upsertPreference({
      tenantId: command.tenantId,
      actorId: command.actorId,
      category: command.category,
      inApp: command.inApp,
      email: command.email,
    })
  }
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
cd apps/api && bun run test:unit -- update-preference.handler
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/notifications/application/commands/update-preference.command.ts \
        apps/api/src/modules/notifications/application/commands/update-preference.handler.ts \
        apps/api/src/modules/notifications/application/commands/update-preference.handler.spec.ts
git commit -m "feat(notifications): UpdatePreferenceHandler — upserts notification preference"
```

---

## Task 7: GetPreferencesHandler

**Files:**

- Create: `apps/api/src/modules/notifications/application/queries/get-preferences.query.ts`
- Create: `apps/api/src/modules/notifications/application/queries/get-preferences.handler.ts`
- Create: `apps/api/src/modules/notifications/application/queries/get-preferences.handler.spec.ts`

- [ ] **Step 1: Create query and write failing test**

Create `apps/api/src/modules/notifications/application/queries/get-preferences.query.ts`:

```ts
export class GetPreferencesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
  ) {}
}
```

Create `apps/api/src/modules/notifications/application/queries/get-preferences.handler.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetPreferencesHandler } from './get-preferences.handler'
import { GetPreferencesQuery } from './get-preferences.query'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'

const categories = ['approval', 'mention', 'assignment', 'system'] as const

const mockRepo = {
  getPreferences: vi.fn().mockResolvedValue([
    {
      id: 'p1',
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      category: 'approval',
      inApp: true,
      email: true,
    },
  ]),
} as unknown as INotificationRepository

describe('GetPreferencesHandler', () => {
  let handler: GetPreferencesHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new GetPreferencesHandler(mockRepo)
  })

  it('returns all 4 categories with defaults for missing ones', async () => {
    const result = await handler.execute(new GetPreferencesQuery('tenant-1', 'actor-1'))
    expect(result).toHaveLength(4)
    const cats = result.map((p) => p.category)
    expect(cats).toContain('approval')
    expect(cats).toContain('mention')
    expect(cats).toContain('assignment')
    expect(cats).toContain('system')
    // stored approval pref
    const approval = result.find((p) => p.category === 'approval')
    expect(approval?.inApp).toBe(true)
    // default for missing mention
    const mention = result.find((p) => p.category === 'mention')
    expect(mention?.inApp).toBe(true)
    expect(mention?.email).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/api && bun run test:unit -- get-preferences.handler
```

- [ ] **Step 3: Implement handler**

Create `apps/api/src/modules/notifications/application/queries/get-preferences.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetPreferencesQuery } from './get-preferences.query'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'
import type { NotificationPreference } from '../../domain/entities/notification-preference.entity'
import type { NotificationCategory } from '../../domain/value-objects/category.vo'

const ALL_CATEGORIES: NotificationCategory[] = ['approval', 'mention', 'assignment', 'system']

@QueryHandler(GetPreferencesQuery)
@Injectable()
export class GetPreferencesHandler implements IQueryHandler<
  GetPreferencesQuery,
  NotificationPreference[]
> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(query: GetPreferencesQuery): Promise<NotificationPreference[]> {
    const stored = await this.repo.getPreferences(query.tenantId, query.actorId)
    const storedMap = new Map(stored.map((p) => [p.category, p]))

    return ALL_CATEGORIES.map((category) => {
      return (
        storedMap.get(category) ?? {
          id: '',
          tenantId: query.tenantId,
          actorId: query.actorId,
          category,
          inApp: true,
          email: true,
        }
      )
    })
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/api && bun run test:unit -- get-preferences.handler
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notifications/application/queries/get-preferences.query.ts \
        apps/api/src/modules/notifications/application/queries/get-preferences.handler.ts \
        apps/api/src/modules/notifications/application/queries/get-preferences.handler.spec.ts
git commit -m "feat(notifications): GetPreferencesHandler — returns all 4 categories with defaults"
```

---

## Task 8: Cross-module event handlers

**Files:**

- Create: `apps/api/src/modules/notifications/application/event-handlers/on-leave-approved.handler.ts`
- Create: `apps/api/src/modules/notifications/application/event-handlers/on-leave-approved.handler.spec.ts`
- Create: `apps/api/src/modules/notifications/application/event-handlers/on-document-generated.handler.ts`
- Create: `apps/api/src/modules/notifications/application/event-handlers/on-document-generated.handler.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/modules/notifications/application/event-handlers/on-leave-approved.handler.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OnLeaveApprovedHandler } from './on-leave-approved.handler'
import { LeaveApprovedEvent } from '@future/event-contracts'
import type { CommandBus } from '@nestjs/cqrs'
import { SendNotificationCommand } from '../commands/send-notification.command'

const mockCommandBus = { execute: vi.fn().mockResolvedValue('notif-1') } as unknown as CommandBus

describe('OnLeaveApprovedHandler', () => {
  let handler: OnLeaveApprovedHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new OnLeaveApprovedHandler(mockCommandBus)
  })

  it('dispatches SendNotificationCommand for the leave requester', async () => {
    await handler.handle(
      new LeaveApprovedEvent('tenant-1', 'actor-1', 'leave-req-1', '2026-04-14', '2026-04-18'),
    )

    expect(mockCommandBus.execute).toHaveBeenCalledWith(expect.any(SendNotificationCommand))
    const cmd = vi.mocked(mockCommandBus.execute).mock.calls[0][0] as SendNotificationCommand
    expect(cmd.recipientId).toBe('actor-1')
    expect(cmd.category).toBe('approval')
    expect(cmd.title).toBe('Leave request approved')
  })
})
```

Create `apps/api/src/modules/notifications/application/event-handlers/on-document-generated.handler.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OnDocumentGeneratedHandler } from './on-document-generated.handler'
import { DocumentGeneratedEvent } from '@future/event-contracts'
import type { CommandBus } from '@nestjs/cqrs'
import { SendNotificationCommand } from '../commands/send-notification.command'

const mockCommandBus = { execute: vi.fn().mockResolvedValue('notif-1') } as unknown as CommandBus

describe('OnDocumentGeneratedHandler', () => {
  let handler: OnDocumentGeneratedHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new OnDocumentGeneratedHandler(mockCommandBus)
  })

  it('notifies the requester when document is generated', async () => {
    await handler.handle(
      new DocumentGeneratedEvent('tenant-1', 'job-1', 'payslip', 'pdf', 'key/file.pdf', 'actor-1'),
    )

    expect(mockCommandBus.execute).toHaveBeenCalledWith(expect.any(SendNotificationCommand))
    const cmd = vi.mocked(mockCommandBus.execute).mock.calls[0][0] as SendNotificationCommand
    expect(cmd.recipientId).toBe('actor-1')
    expect(cmd.category).toBe('system')
    expect(cmd.title).toBe('Your document is ready')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/api && bun run test:unit -- on-leave-approved.handler on-document-generated.handler
```

- [ ] **Step 3: Implement event handlers**

Create `apps/api/src/modules/notifications/application/event-handlers/on-leave-approved.handler.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler, CommandBus } from '@nestjs/cqrs'
import { LeaveApprovedEvent } from '@future/event-contracts'
import { SendNotificationCommand } from '../commands/send-notification.command'

@EventsHandler(LeaveApprovedEvent)
@Injectable()
export class OnLeaveApprovedHandler implements IEventHandler<LeaveApprovedEvent> {
  constructor(private readonly commandBus: CommandBus) {}

  async handle(event: LeaveApprovedEvent): Promise<void> {
    await this.commandBus.execute(
      new SendNotificationCommand(
        event.tenantId,
        event.actorId,
        null,
        'approval',
        'Leave request approved',
        `Your leave ${event.from}–${event.to} has been approved`,
        'leave_request',
        event.leaveRequestId,
        `/time/leave/${event.leaveRequestId}`,
      ),
    )
  }
}
```

Create `apps/api/src/modules/notifications/application/event-handlers/on-document-generated.handler.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler, CommandBus } from '@nestjs/cqrs'
import { DocumentGeneratedEvent } from '@future/event-contracts'
import { SendNotificationCommand } from '../commands/send-notification.command'

@EventsHandler(DocumentGeneratedEvent)
@Injectable()
export class OnDocumentGeneratedHandler implements IEventHandler<DocumentGeneratedEvent> {
  constructor(private readonly commandBus: CommandBus) {}

  async handle(event: DocumentGeneratedEvent): Promise<void> {
    await this.commandBus.execute(
      new SendNotificationCommand(
        event.tenantId,
        event.requestedBy,
        null,
        'system',
        'Your document is ready',
        `${event.templateSlug} (${event.format}) has been generated`,
        'generation_job',
        event.jobId,
        `/documents/jobs/${event.jobId}`,
      ),
    )
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/api && bun run test:unit -- on-leave-approved.handler on-document-generated.handler
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notifications/application/event-handlers/
git commit -m "feat(notifications): cross-module event handlers — LeaveApproved, DocumentGenerated"
```

---

## Task 9: SendNotificationEmailWorker

**Files:**

- Create: `apps/api/src/modules/notifications/infrastructure/jobs/send-notification-email.worker.ts`
- Create: `apps/api/src/modules/notifications/infrastructure/jobs/send-notification-email.worker.spec.ts`

The worker needs actor email. `PeopleQueryFacade.getProfile()` returns `{ profile: { companyEmail } }`. The worker injects `PeopleQueryFacade` and `AdminQueryFacade`.

- [ ] **Step 1: Write failing unit test**

Create `apps/api/src/modules/notifications/infrastructure/jobs/send-notification-email.worker.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SendNotificationEmailWorker } from './send-notification-email.worker'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import type { PeopleQueryFacade } from '../../../people/application/facades/people-query.facade'
import type { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'

vi.mock('@future/mail', () => ({
  createMailTransport: vi.fn(() => ({
    send: vi.fn().mockResolvedValue({ messageId: 'msg-1', accepted: [], rejected: [] }),
  })),
  renderMjmlTemplate: vi.fn().mockReturnValue('<html>Test</html>'),
}))

const mockNotifRepo: INotificationRepository = {
  insert: vi.fn(),
  findByRecipient: vi.fn(),
  countUnread: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  archive: vi.fn(),
  getPreference: vi.fn(),
  upsertPreference: vi.fn(),
  getPreferences: vi.fn(),
}

const mockPeopleFacade = {
  getProfile: vi.fn().mockResolvedValue({
    profile: { companyEmail: 'employee@company.com', actorId: 'actor-1' },
    detail: null,
    sections: [],
  }),
} as unknown as PeopleQueryFacade

const mockAdminFacade = {
  getEmailConfig: vi.fn().mockResolvedValue(null),
} as unknown as AdminQueryFacade

describe('SendNotificationEmailWorker', () => {
  let worker: SendNotificationEmailWorker

  beforeEach(() => {
    vi.clearAllMocks()
    worker = new SendNotificationEmailWorker(mockNotifRepo, mockPeopleFacade, mockAdminFacade)
  })

  it('loads notification, gets recipient email, and sends email', async () => {
    vi.mocked(mockNotifRepo.findByRecipient).mockResolvedValue([
      {
        id: 'n-1',
        tenantId: 'tenant-1',
        recipientId: 'actor-1',
        senderId: null,
        category: 'approval',
        title: 'Leave approved',
        body: 'Your leave was approved',
        resourceType: null,
        resourceId: null,
        resourceUrl: '/time/leave/123',
        readAt: null,
        archivedAt: null,
        createdAt: new Date(),
      },
    ])

    await worker.handle({
      data: { notificationId: 'n-1', tenantId: 'tenant-1', recipientId: 'actor-1' },
    } as never)

    const { createMailTransport } = await import('@future/mail')
    expect(createMailTransport).toHaveBeenCalled()
  })

  it('skips gracefully if notification not found', async () => {
    vi.mocked(mockNotifRepo.findByRecipient).mockResolvedValue([])

    // Should not throw
    await worker.handle({
      data: { notificationId: 'missing', tenantId: 'tenant-1', recipientId: 'actor-1' },
    } as never)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/api && bun run test:unit -- send-notification-email.worker
```

- [ ] **Step 3: Implement SendNotificationEmailWorker**

Create `apps/api/src/modules/notifications/infrastructure/jobs/send-notification-email.worker.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common'
import type PgBoss from 'pg-boss'
import { createMailTransport, renderMjmlTemplate } from '@future/mail'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'
import { PeopleQueryFacade } from '../../../people/application/facades/people-query.facade'
import { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'

export interface SendEmailJobData {
  notificationId: string
  tenantId: string
  recipientId: string
}

const PLATFORM_SES_FROM =
  process.env['PLATFORM_SES_FROM_ADDRESS'] ?? 'noreply@seta-international.vn'
const PLATFORM_SES_REGION = process.env['PLATFORM_SES_REGION'] ?? 'ap-southeast-1'

@Injectable()
export class SendNotificationEmailWorker {
  private readonly logger = new Logger(SendNotificationEmailWorker.name)

  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifRepo: INotificationRepository,
    private readonly peopleFacade: PeopleQueryFacade,
    private readonly adminFacade: AdminQueryFacade,
  ) {}

  async handle(job: PgBoss.Job<SendEmailJobData>): Promise<void> {
    const { notificationId, tenantId, recipientId } = job.data

    const notifications = await this.notifRepo.findByRecipient(tenantId, recipientId, {
      limit: 1,
      offset: 0,
    })
    const notification = notifications.find((n) => n.id === notificationId)

    if (!notification) {
      this.logger.warn(`Notification not found for email: ${notificationId}`)
      return
    }

    const profile = await this.peopleFacade.getProfile(recipientId, tenantId)
    if (!profile?.profile.companyEmail) {
      this.logger.warn(`No email for actor ${recipientId} — skipping email notification`)
      return
    }

    const emailConfig = await this.adminFacade.getEmailConfig(tenantId)
    const mailConfig = emailConfig ?? {
      provider: 'ses' as const,
      fromAddress: PLATFORM_SES_FROM,
      region: PLATFORM_SES_REGION,
      credentialRef: '',
    }

    const transport = createMailTransport(mailConfig)
    const html = renderMjmlTemplate('notification', {
      title: notification.title,
      body: notification.body ?? '',
      resourceUrl: notification.resourceUrl ?? '',
    })

    try {
      await transport.send({
        to: profile.profile.companyEmail,
        subject: notification.title,
        html,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Failed to send email notification ${notificationId}: ${message}`)
      throw err // let pg-boss retry
    }
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/api && bun run test:unit -- send-notification-email.worker
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notifications/infrastructure/jobs/send-notification-email.worker.ts \
        apps/api/src/modules/notifications/infrastructure/jobs/send-notification-email.worker.spec.ts
git commit -m "feat(notifications): SendNotificationEmailWorker — pg-boss worker for outgoing email"
```

---

## Task 10: Update SendNotificationHandler to enqueue email job

**Files:**

- Modify: `apps/api/src/modules/notifications/application/commands/send-notification.handler.ts`
- Modify: `apps/api/src/modules/notifications/application/commands/send-notification.handler.spec.ts`

- [ ] **Step 1: Update handler to enqueue email job when pref.email is true**

Edit `apps/api/src/modules/notifications/application/commands/send-notification.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { SendNotificationCommand } from './send-notification.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'
import type { NotificationPublisher } from '../../infrastructure/redis/notification-publisher'
import { NOTIFICATION_PUBLISHER } from '../../infrastructure/redis/notification-publisher'
import {
  PgBossService,
  JOB_NOTIFICATIONS_SEND_EMAIL,
} from '../../../../common/jobs/pg-boss.service'

@CommandHandler(SendNotificationCommand)
@Injectable()
export class SendNotificationHandler implements ICommandHandler<SendNotificationCommand, string> {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository,
    @Inject(NOTIFICATION_PUBLISHER) private readonly publisher: NotificationPublisher,
    private readonly pgBoss: PgBossService,
  ) {}

  async execute(command: SendNotificationCommand): Promise<string> {
    const notification = await this.repo.insert({
      tenantId: command.tenantId,
      recipientId: command.recipientId,
      senderId: command.senderId,
      category: command.category,
      title: command.title,
      body: command.body,
      resourceType: command.resourceType,
      resourceId: command.resourceId,
      resourceUrl: command.resourceUrl,
    })

    const pref = await this.repo.getPreference(
      command.tenantId,
      command.recipientId,
      command.category,
    )

    const inAppEnabled = pref?.inApp ?? true
    const emailEnabled = pref?.email ?? true

    if (inAppEnabled) {
      await this.publisher.publish(command.tenantId, command.recipientId, notification)
    }

    if (emailEnabled) {
      await this.pgBoss.enqueue(JOB_NOTIFICATIONS_SEND_EMAIL, {
        notificationId: notification.id,
        tenantId: command.tenantId,
        recipientId: command.recipientId,
      })
    }

    return notification.id
  }
}
```

- [ ] **Step 2: Update the spec to add PgBossService mock**

Edit `apps/api/src/modules/notifications/application/commands/send-notification.handler.spec.ts`.

Add `mockPgBoss = { enqueue: vi.fn().mockResolvedValue('boss-job-id') }` and pass it as third constructor arg. Add assertion that `enqueue` is called with `JOB_NOTIFICATIONS_SEND_EMAIL` when email pref is enabled.

- [ ] **Step 3: Run test — verify it passes**

```bash
cd apps/api && bun run test:unit -- send-notification.handler
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/notifications/application/commands/send-notification.handler.ts \
        apps/api/src/modules/notifications/application/commands/send-notification.handler.spec.ts
git commit -m "feat(notifications): SendNotificationHandler enqueues email job via pg-boss"
```

---

## Task 11: Wire NotificationsModule

**Files:**

- Modify: `apps/api/src/modules/notifications/notifications.module.ts`

- [ ] **Step 1: Replace all stubs with real providers**

Edit `apps/api/src/modules/notifications/notifications.module.ts`:

```ts
import { Module, OnApplicationBootstrap } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { NotificationsQueryFacade } from './application/facades/notifications-query.facade'
import { SendNotificationHandler } from './application/commands/send-notification.handler'
import { MarkReadHandler, MarkAllReadHandler } from './application/commands/mark-read.handler'
import { ArchiveNotificationHandler } from './application/commands/archive-notification.handler'
import { UpdatePreferenceHandler } from './application/commands/update-preference.handler'
import { UnreadCountHandler } from './application/queries/unread-count.handler'
import { ListNotificationsHandler } from './application/queries/list-notifications.handler'
import { GetPreferencesHandler } from './application/queries/get-preferences.handler'
import { OnLeaveApprovedHandler } from './application/event-handlers/on-leave-approved.handler'
import { OnDocumentGeneratedHandler } from './application/event-handlers/on-document-generated.handler'
import { NOTIFICATION_REPOSITORY } from './domain/repositories/notification.repository.port'
import { NOTIFICATION_PUBLISHER } from './infrastructure/redis/notification-publisher'
import { DrizzleNotificationRepository } from './infrastructure/repositories/drizzle-notification.repository'
import { RedisNotificationPublisher } from './infrastructure/redis/redis-notification-publisher'
import { NotificationSseController } from './infrastructure/sse/notification-sse.controller'
import { SendNotificationEmailWorker } from './infrastructure/jobs/send-notification-email.worker'
import { PgBossService, JOB_NOTIFICATIONS_SEND_EMAIL } from '../../common/jobs/pg-boss.service'
import { PeopleModule } from '../people/people.module'
import { AdminModule } from '../admin/admin.module'
import { NotificationsRouterService } from './interface/trpc/notifications-router.service'

@Module({
  imports: [CqrsModule, PeopleModule, AdminModule],
  providers: [
    NotificationsQueryFacade,
    SendNotificationHandler,
    MarkReadHandler,
    MarkAllReadHandler,
    ArchiveNotificationHandler,
    UpdatePreferenceHandler,
    UnreadCountHandler,
    ListNotificationsHandler,
    GetPreferencesHandler,
    OnLeaveApprovedHandler,
    OnDocumentGeneratedHandler,
    NotificationsRouterService,
    NotificationSseController,
    SendNotificationEmailWorker,
    { provide: NOTIFICATION_REPOSITORY, useClass: DrizzleNotificationRepository },
    { provide: NOTIFICATION_PUBLISHER, useClass: RedisNotificationPublisher },
  ],
  exports: [NotificationsQueryFacade],
  controllers: [NotificationSseController],
})
export class NotificationsModule implements OnApplicationBootstrap {
  constructor(
    private readonly pgBoss: PgBossService,
    private readonly emailWorker: SendNotificationEmailWorker,
  ) {}

  onApplicationBootstrap(): void {
    this.pgBoss.registerWorker(JOB_NOTIFICATIONS_SEND_EMAIL, (job) => this.emailWorker.handle(job))
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | grep -i "notifications" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/notifications/notifications.module.ts
git commit -m "feat(notifications): wire NotificationsModule — replace all stubs"
```

---

## Task 12: Notifications tRPC router

**Files:**

- Create: `apps/api/src/modules/notifications/interface/trpc/notifications-router.service.ts`
- Create: `apps/api/src/modules/notifications/interface/trpc/notifications.router.ts`
- Modify: `apps/api/src/common/trpc/app-router.ts`
- Modify: `apps/api/src/common/trpc/trpc.module.ts`

- [ ] **Step 1: Create NotificationsRouterService**

Create `apps/api/src/modules/notifications/interface/trpc/notifications-router.service.ts`:

```ts
import { Injectable, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'

let instance: NotificationsRouterService | null = null

@Injectable()
export class NotificationsRouterService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this
  }

  static getInstance(): NotificationsRouterService {
    if (!instance) throw new Error('NotificationsRouterService not initialized')
    return instance
  }

  command<T>(cmd: T): Promise<unknown> {
    return this.commandBus.execute(cmd as never)
  }

  query<T>(q: T): Promise<unknown> {
    return this.queryBus.execute(q as never)
  }
}
```

- [ ] **Step 2: Create notifications tRPC router**

Create `apps/api/src/modules/notifications/interface/trpc/notifications.router.ts`:

```ts
import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { AuthContext } from '../../../../common/trpc/auth-middleware'
import { NotificationsRouterService } from './notifications-router.service'
import { MarkReadCommand, MarkAllReadCommand } from '../../application/commands/mark-read.command'
import { ArchiveNotificationCommand } from '../../application/commands/archive-notification.command'
import { UpdatePreferenceCommand } from '../../application/commands/update-preference.command'
import { ListNotificationsQuery } from '../../application/queries/list-notifications.query'
import { UnreadCountQuery } from '../../application/queries/unread-count.query'
import { GetPreferencesQuery } from '../../application/queries/get-preferences.query'

function svc() {
  return NotificationsRouterService.getInstance()
}

const categoryEnum = z.enum(['approval', 'mention', 'assignment', 'system'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createNotificationsRouter(protectedProcedure: any) {
  return router({
    list: protectedProcedure
      .input(
        z.object({
          category: categoryEnum.optional(),
          unreadOnly: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .query(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().query(
          new ListNotificationsQuery(ctx.tenantId, ctx.actorId, {
            category: input.category,
            unreadOnly: input.unreadOnly,
            limit: input.limit,
            offset: input.offset,
          }),
        ),
      ),

    unreadCount: protectedProcedure.query(({ ctx }: { ctx: AuthContext }) =>
      svc().query(new UnreadCountQuery(ctx.tenantId, ctx.actorId)),
    ),

    markRead: protectedProcedure
      .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
      .mutation(({ ctx, input }: { ctx: AuthContext; input: { ids: string[] } }) =>
        svc().command(new MarkReadCommand(ctx.tenantId, input.ids)),
      ),

    markAllRead: protectedProcedure.mutation(({ ctx }: { ctx: AuthContext }) =>
      svc().command(new MarkAllReadCommand(ctx.tenantId, ctx.actorId)),
    ),

    archive: protectedProcedure
      .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
      .mutation(({ ctx, input }: { ctx: AuthContext; input: { ids: string[] } }) =>
        svc().command(new ArchiveNotificationCommand(ctx.tenantId, input.ids)),
      ),

    preferences: router({
      get: protectedProcedure.query(({ ctx }: { ctx: AuthContext }) =>
        svc().query(new GetPreferencesQuery(ctx.tenantId, ctx.actorId)),
      ),

      update: protectedProcedure
        .input(
          z.object({
            category: categoryEnum,
            inApp: z.boolean(),
            email: z.boolean(),
          }),
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
          svc().command(
            new UpdatePreferenceCommand(
              ctx.tenantId,
              ctx.actorId,
              input.category,
              input.inApp,
              input.email,
            ),
          ),
        ),
    }),
  })
}

// Static default for type inference
export const notificationsRouter = router({
  list: publicProcedure.input(z.object({})).query(() => []),
  unreadCount: publicProcedure.query(() => 0),
  markRead: publicProcedure.input(z.object({})).mutation(() => null),
  markAllRead: publicProcedure.mutation(() => null),
  archive: publicProcedure.input(z.object({})).mutation(() => null),
  preferences: router({
    get: publicProcedure.query(() => []),
    update: publicProcedure.input(z.object({})).mutation(() => null),
  }),
})
```

- [ ] **Step 3: Register in app-router.ts**

Edit `apps/api/src/common/trpc/app-router.ts`.

Add import:

```ts
import { notificationsRouter as defaultNotificationsRouter } from '../../modules/notifications/interface/trpc/notifications.router'
```

Add mutable reference:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _notificationsRouter: any = defaultNotificationsRouter
```

Add setter:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setNotificationsRouter(r: any): void {
  _notificationsRouter = r
}
```

Add `notifications: _notificationsRouter` to `buildAppRouter()` return.

- [ ] **Step 4: Wire into TrpcModule**

Edit `apps/api/src/common/trpc/trpc.module.ts`.

Add imports:

```ts
import { NotificationsModule } from '../../modules/notifications/notifications.module'
import { NotificationsRouterService } from '../../modules/notifications/interface/trpc/notifications-router.service'
import {
  createNotificationsRouter,
  setNotificationsRouter,
} from '../../modules/notifications/interface/trpc/notifications.router'
```

Add `NotificationsModule` to `@Module` imports. In `onModuleInit()`:

```ts
setNotificationsRouter(createNotificationsRouter(permissionProtectedProcedure))
```

- [ ] **Step 5: Typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | grep -v "node_modules" | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/notifications/interface/ \
        apps/api/src/common/trpc/app-router.ts \
        apps/api/src/common/trpc/trpc.module.ts
git commit -m "feat(notifications): add tRPC router — list, markRead, archive, preferences"
```

---

## Task 13: Check MarkReadCommand and UnreadCountQuery constructors

Before the tRPC router runs, confirm the existing command/query classes match the calls above.

- [ ] **Step 1: Verify MarkReadCommand**

Read `apps/api/src/modules/notifications/application/commands/mark-read.command.ts`. Verify:

- `new MarkReadCommand(tenantId: string, ids: string[])` — matches `markRead.handler.ts` call `repo.markRead(command.tenantId, command.ids)`
- `new MarkAllReadCommand(tenantId: string, recipientId: string)` — matches handler call

If constructors don't match the router calls in Task 12, update the router to match.

- [ ] **Step 2: Verify UnreadCountQuery**

Read `apps/api/src/modules/notifications/application/queries/unread-count.query.ts`. Verify:

- `new UnreadCountQuery(tenantId: string, recipientId: string)` — matches handler

- [ ] **Step 3: Verify ListNotificationsQuery**

Read `apps/api/src/modules/notifications/application/queries/list-notifications.query.ts`. Verify constructor signature matches the router's `new ListNotificationsQuery(tenantId, actorId, opts)` call.

If the existing query takes `(tenantId, recipientId, opts)` — the router's `ctx.actorId` maps to `recipientId`. Update if needed.

---

## Task 14: Run all tests — verify full notifications module

- [ ] **Step 1: Run all unit tests**

```bash
cd apps/api && bun run test:unit
```

Expected: all PASS.

- [ ] **Step 2: Run all integration tests**

```bash
cd apps/api && bun run test:integration
```

Expected: all PASS (requires docker postgres + redis running).

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | grep -v "node_modules" | grep -v "^$" | head -20
```

Expected: no new errors.

---

## Completion Checklist

- [ ] `INotificationRepository` has `upsertPreference` and `getPreferences`
- [ ] `DrizzleNotificationRepository` — integration tested, all methods including upsert/getPreferences
- [ ] `RedisNotificationPublisher` — unit tested, publishes to correct channel
- [ ] `NotificationSseController` — unit tested, streams SSE from Redis
- [ ] `ArchiveNotificationHandler` — unit tested
- [ ] `UpdatePreferenceHandler` — unit tested
- [ ] `GetPreferencesHandler` — unit tested, fills in defaults for missing categories
- [ ] `OnLeaveApprovedHandler` — unit tested, dispatches SendNotificationCommand
- [ ] `OnDocumentGeneratedHandler` — unit tested, dispatches SendNotificationCommand
- [ ] `SendNotificationEmailWorker` — unit tested, uses PeopleQueryFacade for email, AdminQueryFacade for config
- [ ] `SendNotificationHandler` — updated to enqueue pg-boss email job
- [ ] `NotificationsModule` — no stubs, all real providers, worker registered
- [ ] `notificationsRouter` — full tRPC surface wired into `AppRouter`
- [ ] All unit + integration tests pass
