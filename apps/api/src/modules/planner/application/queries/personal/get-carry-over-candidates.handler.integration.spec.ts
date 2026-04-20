import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
import { GetCarryOverCandidatesHandler } from './get-carry-over-candidates.handler'
import { GetCarryOverCandidatesQuery } from './get-carry-over-candidates.query'
import type { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'

const TENANT_A = '01900000-0000-7fff-8000-000000006001'

async function seedPersonalPlan(db: Db, tenantId: string, ownerActorId: string): Promise<string> {
  const planId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.plan (id, tenant_id, name, description, owner_actor_id, sync_enabled, created_by, created_at, updated_at)
        VALUES (${planId}, ${tenantId}, 'Personal', '', ${ownerActorId}, false, ${ownerActorId}, NOW(), NOW())`,
  )
  return planId
}

async function seedBucket(db: Db, planId: string, tenantId: string): Promise<string> {
  const bucketId = uuidv7()
  await db.execute(
    sql`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
        VALUES (${bucketId}, ${tenantId}, ${planId}, 'Bucket', '1|a:', NOW(), NOW())`,
  )
  return bucketId
}

async function seedTask(
  db: Db,
  planId: string,
  bucketId: string,
  tenantId: string,
  actorId: string,
  overrides: { title?: string; progress?: number } = {},
): Promise<string> {
  const taskId = uuidv7()
  const progress = overrides.progress ?? 0
  const completedAt = progress === 100 ? sql`NOW()` : sql`NULL`
  const completedBy = progress === 100 ? sql`${actorId}::uuid` : sql`NULL::uuid`
  await db.execute(
    sql`INSERT INTO planner.task
        (id, tenant_id, plan_id, bucket_id, title, description, progress, priority,
         order_hint, checklist_item_count, checklist_checked_count,
         created_by, created_at, updated_at, completed_at, completed_by)
        VALUES (
          ${taskId}, ${tenantId}, ${planId}, ${bucketId},
          ${overrides.title ?? 'Task'}, '', ${progress}, 5,
          '1|a:',
          0, 0,
          ${actorId}, NOW(), NOW(), ${completedAt}, ${completedBy}
        )`,
  )
  return taskId
}

async function seedMyDayEntry(
  db: Db,
  actorId: string,
  taskId: string,
  addedDate: string,
  tenantId: string,
  completedAt: Date | null = null,
): Promise<void> {
  if (completedAt) {
    await db.execute(
      sql`INSERT INTO planner.my_day_entry (actor_id, task_id, added_date, added_at, completed_at, tenant_id)
          VALUES (${actorId}, ${taskId}, ${addedDate}::date, NOW(), ${completedAt.toISOString()}::timestamptz, ${tenantId})`,
    )
  } else {
    await db.execute(
      sql`INSERT INTO planner.my_day_entry (actor_id, task_id, added_date, added_at, completed_at, tenant_id)
          VALUES (${actorId}, ${taskId}, ${addedDate}::date, NOW(), NULL, ${tenantId})`,
    )
  }
}

describe('GetCarryOverCandidatesHandler — integration', () => {
  const rawDb = createTestDb() as Db

  function makeKernelFacade(): KernelQueryFacade {
    return {
      getActorsByIds: vi.fn().mockResolvedValue(new Map()),
    } as unknown as KernelQueryFacade
  }

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(rawDb)
    await truncateCoreSchema(rawDb)
    await seedTenant(rawDb, { id: TENANT_A, slug: 'carry-over-tenant-a' })
    await setTenantContext(rawDb, TENANT_A)
  })

  afterAll(async () => {
    await truncatePlannerSchema(rawDb)
    await truncateCoreSchema(rawDb)
  })

  it('returns only the open + unfinished-task candidate from yesterday', async () => {
    const actorId = uuidv7()
    const planId = await seedPersonalPlan(rawDb, TENANT_A, actorId)
    const bucketId = await seedBucket(rawDb, planId, TENANT_A)

    // 1. Open task still at progress<100 — SHOULD return
    const openTask = await seedTask(rawDb, planId, bucketId, TENANT_A, actorId, {
      title: 'Open Task',
      progress: 0,
    })
    // 2. Completed task (progress=100) — should NOT return
    const completedTask = await seedTask(rawDb, planId, bucketId, TENANT_A, actorId, {
      title: 'Completed Task',
      progress: 100,
    })
    // 3. Task whose my_day_entry has completed_at set — should NOT return
    const markedTask = await seedTask(rawDb, planId, bucketId, TENANT_A, actorId, {
      title: 'Marked Done Task',
      progress: 0,
    })

    const yesterday = '2026-04-19'
    await seedMyDayEntry(rawDb, actorId, openTask, yesterday, TENANT_A, null)
    await seedMyDayEntry(rawDb, actorId, completedTask, yesterday, TENANT_A, null)
    await seedMyDayEntry(
      rawDb,
      actorId,
      markedTask,
      yesterday,
      TENANT_A,
      new Date('2026-04-19T15:00:00Z'),
    )

    const handler = new GetCarryOverCandidatesHandler(rawDb, makeKernelFacade())
    const result = await handler.execute(
      new GetCarryOverCandidatesQuery(actorId, TENANT_A, '2026-04-20'),
    )

    const ids = result.map((r) => r.id)
    expect(ids).toContain(openTask)
    expect(ids).not.toContain(completedTask)
    expect(ids).not.toContain(markedTask)
  })
})
