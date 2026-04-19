// Email delivery (MailHog) is validated in CI docker-compose E2E; here we assert the notification DB record.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  seedActor,
  setTenantContext,
  truncateCoreSchema,
  truncatePlannerSchema,
} from '@future/db/test-helpers'
import type { Db } from '@future/db'
import { TaskAssignedEvent } from '@future/event-contracts'
import type { CommandBus } from '@nestjs/cqrs'
import { DrizzleTaskRepository } from '../../infrastructure/repositories/drizzle-task.repository'
import { DrizzlePlanRepository } from '../../infrastructure/repositories/drizzle-plan.repository'
import { DrizzleNotificationRepository } from '../../../notifications/infrastructure/repositories/drizzle-notification.repository'
import { SendNotificationHandler } from '../../../notifications/application/commands/send-notification.handler'
import { SendNotificationCommand } from '../../../notifications/application/commands/send-notification.command'
import { OnTaskAssignedHandler } from './on-task-assigned.handler'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { NotificationPublisher } from '../../../notifications/domain/ports/notification-publisher'

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7fff-8000-000000009001'

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedPlan(db: Db, tenantId: string, actorId: string): Promise<string> {
  const planId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, ${'Test Plan'}, '', ${actorId}, NOW(), NOW())`,
  )
  return planId
}

async function seedBucket(db: Db, planId: string, tenantId: string): Promise<string> {
  const bucketId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
        VALUES (${bucketId}, ${tenantId}, ${planId}, ${'To do'}, ${'1|a:'}, NOW(), NOW())`,
  )
  return bucketId
}

async function seedTask(
  db: Db,
  planId: string,
  bucketId: string,
  tenantId: string,
  createdBy: string,
): Promise<string> {
  const taskId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.task
        (id, tenant_id, plan_id, bucket_id, title, description, progress, priority,
         order_hint, checklist_item_count, checklist_checked_count,
         created_by, created_at, updated_at)
        VALUES (
          ${taskId}, ${tenantId}, ${planId}, ${bucketId},
          ${'Fix the bug'}, '', 0, 5,
          ${'1|a:'}, 0, 0,
          ${createdBy}, NOW(), NOW()
        )`,
  )
  return taskId
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('OnTaskAssignedHandler — integration', () => {
  const db = createTestDb() as Db

  let actorId: string
  let assigneeId: string
  let planId: string
  let taskId: string

  let notificationRepo: DrizzleNotificationRepository
  let handler: OnTaskAssignedHandler

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await db.execute(
      sql`TRUNCATE notifications.notification, notifications.notification_preference CASCADE`,
    )

    await seedTenant(db, { id: TENANT_ID, slug: 'on-task-assigned-int-tenant' })
    await setTenantContext(db, TENANT_ID)

    const actor = await seedActor(db, { tenantId: TENANT_ID, displayName: 'Alice Nguyen' })
    actorId = actor.id

    const assignee = await seedActor(db, { tenantId: TENANT_ID, displayName: 'Bob Smith' })
    assigneeId = assignee.id

    planId = await seedPlan(db, TENANT_ID, actorId)
    const bucketId = await seedBucket(db, planId, TENANT_ID)
    taskId = await seedTask(db, planId, bucketId, TENANT_ID, actorId)

    // Repositories
    const taskRepo = new DrizzleTaskRepository(db as never)
    const planRepo = new DrizzlePlanRepository(db as never)
    notificationRepo = new DrizzleNotificationRepository(db as never)

    // Mock KernelQueryFacade — returns the assigner's display name
    const kernelFacade = {
      getActorsByIds: vi
        .fn()
        .mockResolvedValue(new Map([[actorId, { displayName: 'Alice Nguyen' }]])),
    } as unknown as KernelQueryFacade

    // Mock PgBossService — avoid needing a real pg-boss instance
    const mockPgBoss = { enqueue: vi.fn().mockResolvedValue('job-id') } as unknown as PgBossService

    // Mock NotificationPublisher (Redis) — avoid needing a real Redis connection
    const mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) } as NotificationPublisher

    // Build the real SendNotificationHandler with real repo + mocked side-effects
    const sendNotificationHandler = new SendNotificationHandler(
      notificationRepo,
      mockPublisher,
      mockPgBoss,
    )

    // Wire a CommandBus that delegates SendNotificationCommand to the real handler
    const commandBus = {
      execute: vi.fn().mockImplementation((cmd: unknown) => {
        if (cmd instanceof SendNotificationCommand) {
          return sendNotificationHandler.execute(cmd)
        }
        return Promise.resolve(undefined)
      }),
    } as unknown as CommandBus

    handler = new OnTaskAssignedHandler(commandBus, taskRepo, planRepo, kernelFacade)
  })

  afterAll(async () => {
    await db.execute(
      sql`TRUNCATE notifications.notification, notifications.notification_preference CASCADE`,
    )
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  it('creates a notification row in the DB for the assignee', async () => {
    const event = new TaskAssignedEvent(TENANT_ID, actorId, taskId, planId, assigneeId)

    await handler.handle(event)

    const notifications = await notificationRepo.findByRecipient(TENANT_ID, assigneeId, {
      limit: 10,
      offset: 0,
    })

    expect(notifications).toHaveLength(1)
    const notif = notifications[0]!
    expect(notif.tenantId).toBe(TENANT_ID)
    expect(notif.recipientId).toBe(assigneeId)
    expect(notif.senderId).toBe(actorId)
    expect(notif.category).toBe('assignment')
    expect(notif.title).toBe('Alice Nguyen assigned you to Fix the bug')
    expect(notif.body).toContain('Alice Nguyen')
    expect(notif.body).toContain('Fix the bug')
    expect(notif.body).toContain('Test Plan')
    expect(notif.resourceType).toBe('task')
    expect(notif.resourceId).toBe(taskId)
    expect(notif.resourceUrl).toBe(`/plans/${planId}/board/tasks/${taskId}`)
    expect(notif.readAt).toBeNull()
  })
})
