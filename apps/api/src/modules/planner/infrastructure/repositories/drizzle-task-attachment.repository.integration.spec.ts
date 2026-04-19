import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncatePlannerSchema,
} from '@future/db/test-helpers'
import type { Db } from '@future/db'
import { TaskAttachment } from '../../domain/entities/task-attachment.entity'
import { DrizzleTaskAttachmentRepository } from './drizzle-task-attachment.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000060'

async function seedPlan(db: Db, tenantId: string): Promise<string> {
  const planId = uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'Test Plan', '', ${createdBy}, NOW(), NOW())`,
  )
  return planId
}

async function seedBucket(db: Db, tenantId: string, planId: string): Promise<string> {
  const bucketId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
        VALUES (${bucketId}, ${tenantId}, ${planId}, 'Bucket', '1|a:', NOW(), NOW())`,
  )
  return bucketId
}

async function seedTask(
  db: Db,
  tenantId: string,
  planId: string,
  bucketId: string,
): Promise<string> {
  const taskId = uuidv7()
  const createdBy = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.task
        (id, tenant_id, plan_id, bucket_id, title, description, progress, priority, order_hint,
         checklist_item_count, checklist_checked_count, created_by, created_at, updated_at)
        VALUES (${taskId}, ${tenantId}, ${planId}, ${bucketId}, 'Task', '', 0, 5, '1|a:',
                0, 0, ${createdBy}, NOW(), NOW())`,
  )
  return taskId
}

describe('DrizzleTaskAttachmentRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzleTaskAttachmentRepository
  let taskId: string
  const createdBy = uuidv7()

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'task-attachment-repo-tenant-a' })
    const planId = await seedPlan(db, TENANT_A)
    const bucketId = await seedBucket(db, TENANT_A, planId)
    taskId = await seedTask(db, TENANT_A, planId, bucketId)
    repo = new DrizzleTaskAttachmentRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('add() — file attachment', () => {
    it('inserts a file attachment into the DB', async () => {
      await setTenantContext(db, TENANT_A)
      const attachment = TaskAttachment.createFile({
        id: uuidv7(),
        taskId,
        tenantId: TENANT_A,
        createdBy,
        storageKey: 'uploads/report.pdf',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        sizeBytes: 20480,
      })

      await repo.add(attachment)

      const items = await repo.list(taskId, TENANT_A)
      const found = items.find((a) => a.id === attachment.id)
      expect(found).toBeDefined()
      expect(found!.kind).toBe('file')
      expect(found!.storageKey).toBe('uploads/report.pdf')
      expect(found!.filename).toBe('report.pdf')
      expect(found!.contentType).toBe('application/pdf')
      expect(found!.sizeBytes).toBe(20480)
      expect(found!.url).toBeUndefined()
    })
  })

  describe('add() — link attachment', () => {
    it('inserts a link attachment into the DB', async () => {
      await setTenantContext(db, TENANT_A)
      const attachment = TaskAttachment.createLink({
        id: uuidv7(),
        taskId,
        tenantId: TENANT_A,
        createdBy,
        url: 'https://example.com/docs',
        linkTitle: 'Documentation',
      })

      await repo.add(attachment)

      const items = await repo.list(taskId, TENANT_A)
      const found = items.find((a) => a.id === attachment.id)
      expect(found).toBeDefined()
      expect(found!.kind).toBe('link')
      expect(found!.url).toBe('https://example.com/docs')
      expect(found!.linkTitle).toBe('Documentation')
      expect(found!.storageKey).toBeUndefined()
    })
  })

  describe('list()', () => {
    it('returns all attachments for a task ordered by created_at DESC', async () => {
      await setTenantContext(db, TENANT_A)

      const items = await repo.list(taskId, TENANT_A)
      expect(items.length).toBeGreaterThanOrEqual(2)

      // Verify descending order by createdAt
      for (let i = 1; i < items.length; i++) {
        expect(items[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(
          items[i]!.createdAt.getTime(),
        )
      }
    })

    it('returns empty array for a task with no attachments', async () => {
      await setTenantContext(db, TENANT_A)

      // Seed a new task with no attachments
      const planId = await seedPlan(db, TENANT_A)
      const bucketId = await seedBucket(db, TENANT_A, planId)
      const emptyTaskId = await seedTask(db, TENANT_A, planId, bucketId)

      const items = await repo.list(emptyTaskId, TENANT_A)
      expect(items).toHaveLength(0)
    })
  })

  describe('findById()', () => {
    it('returns the correct attachment by id', async () => {
      await setTenantContext(db, TENANT_A)
      const id = uuidv7()
      const attachment = TaskAttachment.createFile({
        id,
        taskId,
        tenantId: TENANT_A,
        createdBy,
        storageKey: 'uploads/find-me.png',
        filename: 'find-me.png',
        contentType: 'image/png',
        sizeBytes: 1024,
      })
      await repo.add(attachment)

      const found = await repo.findById(id, TENANT_A)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(id)
      expect(found!.storageKey).toBe('uploads/find-me.png')
    })

    it('returns null when the attachment does not exist', async () => {
      await setTenantContext(db, TENANT_A)
      const result = await repo.findById(uuidv7(), TENANT_A)
      expect(result).toBeNull()
    })

    it('returns null when the tenantId does not match', async () => {
      await setTenantContext(db, TENANT_A)
      const id = uuidv7()
      const attachment = TaskAttachment.createFile({
        id,
        taskId,
        tenantId: TENANT_A,
        createdBy,
        storageKey: 'uploads/wrong-tenant.png',
        filename: 'wrong-tenant.png',
        contentType: 'image/png',
        sizeBytes: 512,
      })
      await repo.add(attachment)

      const differentTenant = uuidv7()
      const result = await repo.findById(id, differentTenant)
      expect(result).toBeNull()
    })
  })

  describe('remove()', () => {
    it('deletes the attachment from the DB', async () => {
      await setTenantContext(db, TENANT_A)
      const id = uuidv7()
      const attachment = TaskAttachment.createLink({
        id,
        taskId,
        tenantId: TENANT_A,
        createdBy,
        url: 'https://example.com/to-delete',
      })
      await repo.add(attachment)

      // Verify it exists first
      const before = await repo.findById(id, TENANT_A)
      expect(before).not.toBeNull()

      await repo.remove(id, TENANT_A)

      const after = await repo.findById(id, TENANT_A)
      expect(after).toBeNull()
    })

    it('is idempotent — removing a non-existent attachment does not throw', async () => {
      await setTenantContext(db, TENANT_A)
      await expect(repo.remove(uuidv7(), TENANT_A)).resolves.not.toThrow()
    })
  })
})
