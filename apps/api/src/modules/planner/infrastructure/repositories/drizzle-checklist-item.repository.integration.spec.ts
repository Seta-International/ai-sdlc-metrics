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
import { ChecklistItem } from '../../domain/entities/checklist-item.value-object'
import { DrizzleChecklistItemRepository } from './drizzle-checklist-item.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000050'

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

async function getTaskCounters(
  db: Db,
  taskId: string,
): Promise<{ itemCount: number; checkedCount: number }> {
  const result = await db.execute<{
    checklist_item_count: number
    checklist_checked_count: number
  }>(
    sql`SELECT checklist_item_count, checklist_checked_count
        FROM planner.task WHERE id = ${taskId}`,
  )
  const row = result.rows[0]!
  return {
    itemCount: Number(row.checklist_item_count),
    checkedCount: Number(row.checklist_checked_count),
  }
}

describe('DrizzleChecklistItemRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzleChecklistItemRepository
  let taskId: string

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'checklist-item-repo-tenant-a' })
    const planId = await seedPlan(db, TENANT_A)
    const bucketId = await seedBucket(db, TENANT_A, planId)
    taskId = await seedTask(db, TENANT_A, planId, bucketId)
    repo = new DrizzleChecklistItemRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('addItem()', () => {
    it('inserts a checklist item and increments checklist_item_count', async () => {
      await setTenantContext(db, TENANT_A)
      const item = ChecklistItem.create({ id: uuidv7(), title: 'First item', orderHint: '1|a:' })

      await repo.addItem(taskId, TENANT_A, item, uuidv7())

      const counters = await getTaskCounters(db, taskId)
      expect(counters.itemCount).toBe(1)
      expect(counters.checkedCount).toBe(0)

      const items = await repo.listByTask(taskId, TENANT_A)
      expect(items).toHaveLength(1)
      expect(items[0]!.title).toBe('First item')
      expect(items[0]!.isChecked).toBe(false)
    })
  })

  describe('toggleItem()', () => {
    it('sets is_checked=true and increments checklist_checked_count', async () => {
      await setTenantContext(db, TENANT_A)
      const items = await repo.listByTask(taskId, TENANT_A)
      const itemId = items[0]!.id

      await repo.toggleItem(taskId, TENANT_A, itemId, true)

      const counters = await getTaskCounters(db, taskId)
      expect(counters.checkedCount).toBe(1)

      const updated = await repo.listByTask(taskId, TENANT_A)
      expect(updated[0]!.isChecked).toBe(true)
    })

    it('sets is_checked=false and decrements checklist_checked_count', async () => {
      await setTenantContext(db, TENANT_A)
      const items = await repo.listByTask(taskId, TENANT_A)
      const itemId = items[0]!.id

      await repo.toggleItem(taskId, TENANT_A, itemId, false)

      const counters = await getTaskCounters(db, taskId)
      expect(counters.checkedCount).toBe(0)

      const updated = await repo.listByTask(taskId, TENANT_A)
      expect(updated[0]!.isChecked).toBe(false)
    })
  })

  describe('updateItem()', () => {
    it('changes only the title with no counter change', async () => {
      await setTenantContext(db, TENANT_A)
      const items = await repo.listByTask(taskId, TENANT_A)
      const itemId = items[0]!.id
      const countersBefore = await getTaskCounters(db, taskId)

      await repo.updateItem(taskId, TENANT_A, itemId, 'Updated title')

      const countersAfter = await getTaskCounters(db, taskId)
      expect(countersAfter.itemCount).toBe(countersBefore.itemCount)
      expect(countersAfter.checkedCount).toBe(countersBefore.checkedCount)

      const updated = await repo.listByTask(taskId, TENANT_A)
      expect(updated[0]!.title).toBe('Updated title')
    })
  })

  describe('reorderItem()', () => {
    it('updates only order_hint with no counter change', async () => {
      await setTenantContext(db, TENANT_A)
      // Add a second item so we have two to sort
      const secondItem = ChecklistItem.create({
        id: uuidv7(),
        title: 'Second item',
        orderHint: '1|b:',
      })
      await repo.addItem(taskId, TENANT_A, secondItem, uuidv7())

      const items = await repo.listByTask(taskId, TENANT_A)
      const firstItemId = items[0]!.id
      const countersBefore = await getTaskCounters(db, taskId)

      await repo.reorderItem(taskId, TENANT_A, firstItemId, '1|z:')

      const countersAfter = await getTaskCounters(db, taskId)
      expect(countersAfter.itemCount).toBe(countersBefore.itemCount)
      expect(countersAfter.checkedCount).toBe(countersBefore.checkedCount)

      const reordered = await repo.listByTask(taskId, TENANT_A)
      const movedItem = reordered.find((i) => i.id === firstItemId)!
      expect(movedItem.orderHint).toBe('1|z:')
    })
  })

  describe('listByTask()', () => {
    it('returns items sorted by order_hint ascending', async () => {
      await setTenantContext(db, TENANT_A)
      const items = await repo.listByTask(taskId, TENANT_A)
      expect(items.length).toBeGreaterThanOrEqual(2)

      for (let i = 1; i < items.length; i++) {
        expect(items[i - 1]!.orderHint <= items[i]!.orderHint).toBe(true)
      }
    })
  })

  describe('removeItem()', () => {
    it('removes unchecked item, decrements item count only', async () => {
      await setTenantContext(db, TENANT_A)
      // Add a fresh unchecked item
      const newItem = ChecklistItem.create({
        id: uuidv7(),
        title: 'To remove unchecked',
        orderHint: '1|c:',
      })
      await repo.addItem(taskId, TENANT_A, newItem, uuidv7())
      const countersBefore = await getTaskCounters(db, taskId)

      await repo.removeItem(taskId, TENANT_A, newItem.id)

      const countersAfter = await getTaskCounters(db, taskId)
      expect(countersAfter.itemCount).toBe(countersBefore.itemCount - 1)
      expect(countersAfter.checkedCount).toBe(countersBefore.checkedCount)

      const items = await repo.listByTask(taskId, TENANT_A)
      expect(items.find((i) => i.id === newItem.id)).toBeUndefined()
    })

    it('removes checked item, decrements both item count and checked count', async () => {
      await setTenantContext(db, TENANT_A)
      // Add an item and check it
      const newItem = ChecklistItem.create({
        id: uuidv7(),
        title: 'To remove checked',
        orderHint: '1|d:',
      })
      await repo.addItem(taskId, TENANT_A, newItem, uuidv7())
      await repo.toggleItem(taskId, TENANT_A, newItem.id, true)
      const countersBefore = await getTaskCounters(db, taskId)

      await repo.removeItem(taskId, TENANT_A, newItem.id)

      const countersAfter = await getTaskCounters(db, taskId)
      expect(countersAfter.itemCount).toBe(countersBefore.itemCount - 1)
      expect(countersAfter.checkedCount).toBe(countersBefore.checkedCount - 1)
    })
  })
})
