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
import { TaskComment } from '../../domain/entities/task-comment.entity'
import { DrizzleTaskCommentRepository } from './drizzle-task-comment.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000070'

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

describe('DrizzleTaskCommentRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzleTaskCommentRepository
  let taskId: string
  const authorActorId = uuidv7()

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'task-comment-repo-tenant-a' })
    const planId = await seedPlan(db, TENANT_A)
    const bucketId = await seedBucket(db, TENANT_A, planId)
    taskId = await seedTask(db, TENANT_A, planId, bucketId)
    repo = new DrizzleTaskCommentRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('add()', () => {
    it('inserts a comment into the DB', async () => {
      await setTenantContext(db, TENANT_A)
      const comment = TaskComment.create({
        id: uuidv7(),
        taskId,
        tenantId: TENANT_A,
        authorActorId,
        body: 'Hello world',
      })

      await repo.add(comment)

      const found = await repo.findById(comment.id, TENANT_A)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(comment.id)
      expect(found!.body).toBe('Hello world')
      expect(found!.deletedAt).toBeNull()
    })
  })

  describe('findById()', () => {
    it('returns the correct comment by id', async () => {
      await setTenantContext(db, TENANT_A)
      const id = uuidv7()
      const comment = TaskComment.create({
        id,
        taskId,
        tenantId: TENANT_A,
        authorActorId,
        body: 'Find me',
      })
      await repo.add(comment)

      const found = await repo.findById(id, TENANT_A)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(id)
      expect(found!.authorActorId).toBe(authorActorId)
    })

    it('returns null when comment does not exist', async () => {
      await setTenantContext(db, TENANT_A)
      const result = await repo.findById(uuidv7(), TENANT_A)
      expect(result).toBeNull()
    })

    it('returns null when tenantId does not match', async () => {
      await setTenantContext(db, TENANT_A)
      const id = uuidv7()
      const comment = TaskComment.create({
        id,
        taskId,
        tenantId: TENANT_A,
        authorActorId,
        body: 'Tenant mismatch',
      })
      await repo.add(comment)

      const differentTenant = uuidv7()
      const result = await repo.findById(id, differentTenant)
      expect(result).toBeNull()
    })
  })

  describe('softDelete()', () => {
    it('sets deletedAt on the comment', async () => {
      await setTenantContext(db, TENANT_A)
      const id = uuidv7()
      const comment = TaskComment.create({
        id,
        taskId,
        tenantId: TENANT_A,
        authorActorId,
        body: 'To be deleted',
      })
      await repo.add(comment)

      const deletedAt = new Date()
      await repo.softDelete(id, TENANT_A, deletedAt)

      const found = await repo.findById(id, TENANT_A)
      expect(found).not.toBeNull()
      expect(found!.deletedAt).not.toBeNull()
      expect(found!.isDeleted).toBe(true)
    })

    it('is idempotent — soft-deleting again does not throw', async () => {
      await setTenantContext(db, TENANT_A)
      const id = uuidv7()
      const comment = TaskComment.create({
        id,
        taskId,
        tenantId: TENANT_A,
        authorActorId,
        body: 'Double delete',
      })
      await repo.add(comment)

      await repo.softDelete(id, TENANT_A, new Date())
      await expect(repo.softDelete(id, TENANT_A, new Date())).resolves.not.toThrow()
    })
  })

  describe('listByTask()', () => {
    it('returns comments ordered newest-first', async () => {
      await setTenantContext(db, TENANT_A)

      // Seed a fresh task for isolation
      const planId = await seedPlan(db, TENANT_A)
      const bucketId = await seedBucket(db, TENANT_A, planId)
      const freshTaskId = await seedTask(db, TENANT_A, planId, bucketId)

      const ids: string[] = []
      for (let i = 0; i < 3; i++) {
        const id = uuidv7()
        ids.push(id)
        const comment = TaskComment.create({
          id,
          taskId: freshTaskId,
          tenantId: TENANT_A,
          authorActorId,
          body: `Comment ${i}`,
        })
        await repo.add(comment)
      }

      const results = await repo.listByTask(freshTaskId, TENANT_A, { limit: 10 })
      expect(results.length).toBe(3)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.postedAt.getTime()).toBeGreaterThanOrEqual(
          results[i]!.postedAt.getTime(),
        )
      }
    })

    it('includes tombstoned (deleted) comments', async () => {
      await setTenantContext(db, TENANT_A)

      const planId = await seedPlan(db, TENANT_A)
      const bucketId = await seedBucket(db, TENANT_A, planId)
      const freshTaskId = await seedTask(db, TENANT_A, planId, bucketId)

      const activeId = uuidv7()
      const deletedId = uuidv7()

      const active = TaskComment.create({
        id: activeId,
        taskId: freshTaskId,
        tenantId: TENANT_A,
        authorActorId,
        body: 'Active',
      })
      const deleted = TaskComment.create({
        id: deletedId,
        taskId: freshTaskId,
        tenantId: TENANT_A,
        authorActorId,
        body: 'Deleted',
      })

      await repo.add(active)
      await repo.add(deleted)
      await repo.softDelete(deletedId, TENANT_A, new Date())

      const results = await repo.listByTask(freshTaskId, TENANT_A, { limit: 10 })
      expect(results.length).toBe(2)
      const deletedResult = results.find((c) => c.id === deletedId)
      expect(deletedResult).toBeDefined()
      expect(deletedResult!.isDeleted).toBe(true)
    })

    it('returns empty array for a task with no comments', async () => {
      await setTenantContext(db, TENANT_A)

      const planId = await seedPlan(db, TENANT_A)
      const bucketId = await seedBucket(db, TENANT_A, planId)
      const emptyTaskId = await seedTask(db, TENANT_A, planId, bucketId)

      const results = await repo.listByTask(emptyTaskId, TENANT_A, { limit: 10 })
      expect(results).toHaveLength(0)
    })

    it('paginates with cursor', async () => {
      await setTenantContext(db, TENANT_A)

      const planId = await seedPlan(db, TENANT_A)
      const bucketId = await seedBucket(db, TENANT_A, planId)
      const freshTaskId = await seedTask(db, TENANT_A, planId, bucketId)

      // Seed 5 comments with distinct timestamps
      const commentIds: string[] = []
      for (let i = 0; i < 5; i++) {
        const id = uuidv7()
        commentIds.push(id)
        await db.execute(
          sql`INSERT INTO planner.task_comment (id, task_id, tenant_id, author_actor_id, body, posted_at)
              VALUES (${id}, ${freshTaskId}, ${TENANT_A}, ${authorActorId}, ${`Comment ${i}`}, NOW() + INTERVAL '${sql.raw(String(i))} seconds')`,
        )
      }

      // First page: 2 items
      const page1 = await repo.listByTask(freshTaskId, TENANT_A, { limit: 2 })
      expect(page1.length).toBe(3) // limit+1 to detect next page
      const cursor = page1[1]!.id

      // Second page using cursor
      const page2 = await repo.listByTask(freshTaskId, TENANT_A, { cursor, limit: 2 })
      expect(page2.length).toBeGreaterThan(0)
      // Should not overlap with first page
      const page1Ids = new Set(page1.slice(0, 2).map((c) => c.id))
      for (const c of page2.slice(0, 2)) {
        expect(page1Ids.has(c.id)).toBe(false)
      }
    })
  })
})
