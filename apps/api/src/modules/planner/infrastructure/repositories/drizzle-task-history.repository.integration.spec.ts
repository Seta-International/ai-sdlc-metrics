import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  truncateCoreSchema,
  truncatePlannerSchema,
} from '@future/db/test-helpers'
import { DrizzleTaskHistoryRepository } from './drizzle-task-history.repository'
import type { HistoryRecord } from '../../domain/repositories/task-history.repository'

const TENANT_ID = '01900000-0000-7fff-8000-000000098001'
const ACTOR_ID = '01900000-0000-7fff-8000-000000098009'
const PLAN_ID = '01900000-0000-7fff-8000-000000098002'
const BUCKET_ID = '01900000-0000-7fff-8000-000000098005'
const TASK_ID = '01900000-0000-7fff-8000-000000098003'

describe('DrizzleTaskHistoryRepository (integration)', () => {
  const db = createTestDb()
  let repo: DrizzleTaskHistoryRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'history-integration' })

    // Seed plan
    await db.execute(
      sql`INSERT INTO planner.plan (id, tenant_id, name, description, created_by, created_at, updated_at)
          VALUES (${PLAN_ID}, ${TENANT_ID}, 'History Test Plan', '', ${ACTOR_ID}, NOW(), NOW())`,
    )

    // Seed bucket
    await db.execute(
      sql`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint, created_at, updated_at)
          VALUES (${BUCKET_ID}, ${TENANT_ID}, ${PLAN_ID}, 'Bucket', '1|a:', NOW(), NOW())`,
    )

    // Seed task
    await db.execute(
      sql`INSERT INTO planner.task
          (id, tenant_id, plan_id, bucket_id, title, description, progress, priority, order_hint,
           checklist_item_count, checklist_checked_count, created_by, created_at, updated_at)
          VALUES (${TASK_ID}, ${TENANT_ID}, ${PLAN_ID}, ${BUCKET_ID}, 'History Task', '', 0, 5, '1|a:',
                  0, 0, ${ACTOR_ID}, NOW(), NOW())`,
    )

    repo = new DrizzleTaskHistoryRepository(db)
  })

  afterEach(async () => {
    await db.execute(sql`DELETE FROM planner.task_history WHERE tenant_id = ${TENANT_ID}`)
  })

  it('appends and retrieves a single history record', async () => {
    const record: HistoryRecord = {
      id: '01900000-0000-7fff-8000-000000097001',
      taskId: TASK_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      field: 'priority',
      oldValue: 3,
      newValue: 5,
      changedAt: new Date('2026-05-01T10:00:00Z'),
    }

    await repo.append(record)

    const page = await repo.listByTask(TASK_ID, TENANT_ID, { limit: 10 })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.field).toBe('priority')
    expect(page.items[0]?.taskId).toBe(TASK_ID)
    expect(page.nextCursor).toBeNull()
  })

  it('paginates with cursor (append 3 rows, page 1 returns 2 + nextCursor, page 2 returns 1 + null cursor)', async () => {
    // Insert 3 records with distinct timestamps
    const records: HistoryRecord[] = [
      {
        id: '01900000-0000-7fff-8000-000000096001',
        taskId: TASK_ID,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        field: 'title',
        oldValue: 'old title',
        newValue: 'new title',
        changedAt: new Date('2026-05-01T12:00:00Z'),
      },
      {
        id: '01900000-0000-7fff-8000-000000096002',
        taskId: TASK_ID,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        field: 'priority',
        oldValue: 3,
        newValue: 5,
        changedAt: new Date('2026-05-01T11:00:00Z'),
      },
      {
        id: '01900000-0000-7fff-8000-000000096003',
        taskId: TASK_ID,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        field: 'progress',
        oldValue: 0,
        newValue: 50,
        changedAt: new Date('2026-05-01T10:00:00Z'),
      },
    ]

    await repo.append(records[0]!)
    await repo.append(records[1]!)
    await repo.append(records[2]!)

    // Page 1: limit=2 — should return 2 items (most recent first) + nextCursor
    const page1 = await repo.listByTask(TASK_ID, TENANT_ID, { limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.items[0]?.field).toBe('title') // most recent
    expect(page1.items[1]?.field).toBe('priority')
    expect(page1.nextCursor).not.toBeNull()

    // Page 2: use cursor from page 1 — should return 1 item + null cursor
    const page2 = await repo.listByTask(TASK_ID, TENANT_ID, {
      limit: 2,
      cursor: page1.nextCursor!,
    })
    expect(page2.items).toHaveLength(1)
    expect(page2.items[0]?.field).toBe('progress') // oldest
    expect(page2.nextCursor).toBeNull()
  })
})
