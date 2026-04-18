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

const TENANT_A = '01900000-0000-7fff-8000-000000000030'
const TENANT_B = '01900000-0000-7fff-8000-000000000031'

describe('planner schema — RLS, tenant isolation, CHECK constraints', () => {
  const db = createTestDb() as Db

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'planner-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'planner-tenant-b' })
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  // ─── RLS enabled on every table ─────────────────────────────────────────────
  describe('RLS is enabled on every table', () => {
    const tables = [
      'plan',
      'plan_label',
      'plan_member',
      'bucket',
      'task',
      'task_assignee',
      'task_applied_label',
      'task_checklist_item',
      'task_attachment',
      'task_comment',
      'task_evidence',
    ]

    for (const tableName of tables) {
      it(`${tableName} has relrowsecurity = true`, async () => {
        const result = await db.execute<{ relrowsecurity: boolean }>(
          sql`SELECT c.relrowsecurity
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'planner'
                AND c.relname = ${tableName}`,
        )
        expect(result.rows).toHaveLength(1)
        expect(result.rows[0]!.relrowsecurity).toBe(true)
      })
    }
  })

  // ─── Tenant isolation ────────────────────────────────────────────────────────
  describe('tenant isolation on planner.plan', () => {
    let planId: string

    it('insert as tenant A bypassing RLS, then invisible to tenant B', async () => {
      planId = uuidv7()
      const createdBy = uuidv7()

      // Insert bypassing RLS using superuser/bypass via SET LOCAL inside a transaction
      await db.execute(
        sql`INSERT INTO planner.plan
            (id, tenant_id, name, description, created_by, created_at, updated_at)
            VALUES (${planId}, ${TENANT_A}, 'Plan A', '', ${createdBy}, NOW(), NOW())`,
      )

      // Query as tenant B — should be invisible
      await setTenantContext(db, TENANT_B)
      const result = await db.execute<{ id: string }>(
        sql`SELECT id FROM planner.plan WHERE id = ${planId}`,
      )
      expect(result.rows).toHaveLength(0)
    })

    it('plan is visible to tenant A', async () => {
      await setTenantContext(db, TENANT_A)
      const result = await db.execute<{ id: string }>(
        sql`SELECT id FROM planner.plan WHERE id = ${planId}`,
      )
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.id).toBe(planId)
    })
  })

  // ─── CHECK constraints ───────────────────────────────────────────────────────
  describe('CHECK constraints', () => {
    let planId: string
    let bucketId: string

    beforeAll(async () => {
      // Set up a valid plan and bucket to attach tasks to
      planId = uuidv7()
      bucketId = uuidv7()
      const createdBy = uuidv7()

      await db.execute(
        sql`INSERT INTO planner.plan
            (id, tenant_id, name, description, created_by, created_at, updated_at)
            VALUES (${planId}, ${TENANT_A}, 'Plan for checks', '', ${createdBy}, NOW(), NOW())`,
      )
      await db.execute(
        sql`INSERT INTO planner.bucket
            (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
            VALUES (${bucketId}, ${TENANT_A}, ${planId}, 'Bucket', '1|a:', NOW(), NOW())`,
      )
    })

    it('rejects progress = 42 on planner.task', async () => {
      await setTenantContext(db, TENANT_A)
      const taskId = uuidv7()
      const createdBy = uuidv7()

      await expect(
        db.execute(
          sql`INSERT INTO planner.task
              (id, tenant_id, plan_id, bucket_id, title, description, progress, priority, order_hint, created_by, created_at, updated_at)
              VALUES (${taskId}, ${TENANT_A}, ${planId}, ${bucketId}, 'Bad task', '', 42, 5, '1|a:', ${createdBy}, NOW(), NOW())`,
        ),
      ).rejects.toThrow()
    })

    it('rejects slot = "category26" on planner.plan_label', async () => {
      await setTenantContext(db, TENANT_A)

      await expect(
        db.execute(
          sql`INSERT INTO planner.plan_label
              (plan_id, slot, name, color, tenant_id)
              VALUES (${planId}, 'category26', 'Bad label', '#fff', ${TENANT_A})`,
        ),
      ).rejects.toThrow()
    })

    it('rejects description longer than 32000 chars on planner.plan', async () => {
      const longDesc = 'x'.repeat(32001)
      const badPlanId = uuidv7()
      const createdBy = uuidv7()

      await expect(
        db.execute(
          sql`INSERT INTO planner.plan
              (id, tenant_id, name, description, created_by, created_at, updated_at)
              VALUES (${badPlanId}, ${TENANT_A}, 'Plan', ${longDesc}, ${createdBy}, NOW(), NOW())`,
        ),
      ).rejects.toThrow()
    })

    it('rejects task_attachment with kind=file and url set (XOR violation)', async () => {
      await setTenantContext(db, TENANT_A)
      const attachId = uuidv7()
      const taskId = uuidv7()
      const createdBy = uuidv7()

      // First create a valid task
      await db.execute(
        sql`INSERT INTO planner.task
            (id, tenant_id, plan_id, bucket_id, title, description, progress, priority, order_hint, created_by, created_at, updated_at)
            VALUES (${taskId}, ${TENANT_A}, ${planId}, ${bucketId}, 'Task for attach', '', 0, 5, '1|b:', ${createdBy}, NOW(), NOW())`,
      )

      await expect(
        db.execute(
          sql`INSERT INTO planner.task_attachment
              (id, task_id, kind, storage_key, url, tenant_id, created_by, created_at)
              VALUES (${attachId}, ${taskId}, 'file', NULL, 'https://example.com', ${TENANT_A}, ${createdBy}, NOW())`,
        ),
      ).rejects.toThrow()
    })

    it('rejects task_evidence with kind=note and body NULL (XOR violation)', async () => {
      await setTenantContext(db, TENANT_A)
      const evidenceId = uuidv7()
      const taskId = uuidv7()
      const submittedBy = uuidv7()

      // Create a valid task
      await db.execute(
        sql`INSERT INTO planner.task
            (id, tenant_id, plan_id, bucket_id, title, description, progress, priority, order_hint, created_by, created_at, updated_at)
            VALUES (${taskId}, ${TENANT_A}, ${planId}, ${bucketId}, 'Task for evidence', '', 0, 5, '1|c:', ${submittedBy}, NOW(), NOW())`,
      )

      await expect(
        db.execute(
          sql`INSERT INTO planner.task_evidence
              (id, task_id, submitted_by, submitted_at, kind, body, caption, tenant_id)
              VALUES (${evidenceId}, ${taskId}, ${submittedBy}, NOW(), 'note', NULL, '', ${TENANT_A})`,
        ),
      ).rejects.toThrow()
    })
  })
})
