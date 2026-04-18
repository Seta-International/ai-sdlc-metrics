import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
import { sql } from 'drizzle-orm'
import { QueryBus } from '@nestjs/cqrs'
import { PlannerQueryFacade } from './planner-query.facade'
import { Plan } from '../../domain/entities/plan.entity'
import { PlanContainer } from '../../domain/value-objects/plan-container.vo'
import { DrizzlePlanRepository } from '../../infrastructure/repositories/drizzle-plan.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000004000'
const TENANT_B = '01900000-0000-7fff-8000-000000004001'
const ACTOR_A = uuidv7()
const ACTOR_B = uuidv7()

describe('PlannerQueryFacade.countOpenTasksForActor — integration', () => {
  const db = createTestDb() as Db
  let facade: PlannerQueryFacade
  let planRepo: DrizzlePlanRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'facade-count-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'facade-count-tenant-b' })

    planRepo = new DrizzlePlanRepository(db as never)

    const queryBus = { execute: vi.fn() } as unknown as QueryBus
    facade = new PlannerQueryFacade(queryBus, db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  /**
   * Insert a plan + bucket via raw SQL for test setup simplicity.
   * Returns {planId, bucketId}.
   */
  async function seedPlanWithBucket(
    tenantId: string,
  ): Promise<{ planId: string; bucketId: string }> {
    await setTenantContext(db, tenantId)
    const planId = uuidv7()
    const bucketId = uuidv7()
    const createdBy = ACTOR_A

    const plan = Plan.create({
      id: planId,
      tenantId,
      name: 'Count Test Plan',
      container: PlanContainer.of({ type: 'none' }),
      createdBy,
      ownerActorId: createdBy,
    })
    await planRepo.save(plan)

    await db.execute(
      sql`INSERT INTO planner.bucket (id, tenant_id, plan_id, name, order_hint)
          VALUES (${bucketId}, ${tenantId}, ${planId}, 'Default', ' !')
          ON CONFLICT DO NOTHING`,
    )

    return { planId, bucketId }
  }

  /**
   * Insert a task directly with the given progress and assignee via raw SQL.
   * This bypasses the domain layer to avoid OCC complexity in test setup.
   */
  async function seedTask(opts: {
    tenantId: string
    planId: string
    bucketId: string
    actorId: string
    progress: 0 | 50 | 100
  }): Promise<string> {
    await setTenantContext(db, opts.tenantId)
    const taskId = uuidv7()

    if (opts.progress === 100) {
      await db.execute(
        sql`INSERT INTO planner.task
              (id, tenant_id, plan_id, bucket_id, title, progress, priority, order_hint,
               created_by, completed_by, completed_at)
            VALUES
              (${taskId}, ${opts.tenantId}, ${opts.planId}, ${opts.bucketId},
               ${'Task ' + taskId}, ${100}::smallint, ${5}::smallint, ${' !'},
               ${opts.actorId}, ${opts.actorId}, NOW())`,
      )
    } else {
      await db.execute(
        sql`INSERT INTO planner.task
              (id, tenant_id, plan_id, bucket_id, title, progress, priority, order_hint, created_by)
            VALUES
              (${taskId}, ${opts.tenantId}, ${opts.planId}, ${opts.bucketId},
               ${'Task ' + taskId}, ${opts.progress}::smallint, ${5}::smallint, ${' !'},
               ${opts.actorId})`,
      )
    }

    await db.execute(
      sql`INSERT INTO planner.task_assignee (task_id, actor_id, assigned_by, tenant_id)
          VALUES (${taskId}, ${opts.actorId}, ${opts.actorId}, ${opts.tenantId})
          ON CONFLICT DO NOTHING`,
    )

    return taskId
  }

  it('counts 2 open tasks for ACTOR_A (1 at progress=0, 1 at progress=50)', async () => {
    const { planId, bucketId } = await seedPlanWithBucket(TENANT_A)

    await seedTask({ tenantId: TENANT_A, planId, bucketId, actorId: ACTOR_A, progress: 0 })
    await seedTask({ tenantId: TENANT_A, planId, bucketId, actorId: ACTOR_A, progress: 50 })
    await seedTask({ tenantId: TENANT_A, planId, bucketId, actorId: ACTOR_A, progress: 100 })

    await setTenantContext(db, TENANT_A)
    const count = await facade.countOpenTasksForActor(ACTOR_A, TENANT_A)
    expect(count).toBe(2)
  })

  it('does not count tasks assigned to a different actor', async () => {
    const { planId, bucketId } = await seedPlanWithBucket(TENANT_A)

    // Tasks for ACTOR_B only
    await seedTask({ tenantId: TENANT_A, planId, bucketId, actorId: ACTOR_B, progress: 0 })
    await seedTask({ tenantId: TENANT_A, planId, bucketId, actorId: ACTOR_B, progress: 50 })

    await setTenantContext(db, TENANT_A)
    const countB = await facade.countOpenTasksForActor(ACTOR_B, TENANT_A)
    expect(countB).toBe(2)

    // ACTOR_A's count must not include ACTOR_B's tasks (only the 2 from previous test)
    const countA = await facade.countOpenTasksForActor(ACTOR_A, TENANT_A)
    expect(countA).toBe(2)
  })

  it('does not count other-tenant tasks even when actor matches', async () => {
    // Seed TENANT_B data for ACTOR_A
    const { planId, bucketId } = await seedPlanWithBucket(TENANT_B)
    await seedTask({ tenantId: TENANT_B, planId, bucketId, actorId: ACTOR_A, progress: 0 })
    await seedTask({ tenantId: TENANT_B, planId, bucketId, actorId: ACTOR_A, progress: 50 })

    // Query for TENANT_A should not return TENANT_B tasks (2 from test 1)
    await setTenantContext(db, TENANT_A)
    const countInTenantA = await facade.countOpenTasksForActor(ACTOR_A, TENANT_A)
    expect(countInTenantA).toBe(2)

    // Query for TENANT_B should return 2
    await setTenantContext(db, TENANT_B)
    const countInTenantB = await facade.countOpenTasksForActor(ACTOR_A, TENANT_B)
    expect(countInTenantB).toBe(2)
  })
})
