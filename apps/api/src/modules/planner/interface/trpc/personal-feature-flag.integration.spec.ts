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
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DrizzlePlanRepository } from '../../infrastructure/repositories/drizzle-plan.repository'
import { ListPlansForActorHandler } from '../../application/queries/plans/list-plans-for-actor.handler'
import { ListPlansForActorQuery } from '../../application/queries/plans/list-plans-for-actor.query'
import { PlannerRouterService } from './planner-router.service'
import { plannerRouter } from './planner.router'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'
import type { PlannerViewFlags } from '../../../admin/application/queries/planner-view-flags.types'

// Two tenants: one with personal flag enabled, one without
const ENABLED_TENANT_ID = '01900000-ff02-7fff-8000-000000002001'
const DISABLED_TENANT_ID = '01900000-ff02-7fff-8000-000000002002'
const ACTOR_ID = uuidv7()

function makeKernelFacade(canDo = true): KernelQueryFacade {
  return { canDo: vi.fn().mockResolvedValue(canDo) } as unknown as KernelQueryFacade
}

function buildBuses(planRepo: DrizzlePlanRepository) {
  const queryHandlers = new Map<string, (q: unknown) => Promise<unknown>>()

  const kernelFacade = makeKernelFacade(true)
  const listHandler = new ListPlansForActorHandler(planRepo as never, kernelFacade)

  queryHandlers.set('ListPlansForActorQuery', (q) =>
    listHandler.execute(q as ListPlansForActorQuery),
  )

  const commandBus = {
    execute(_cmd: unknown) {
      throw new Error('No command handlers registered in personal feature flag test')
    },
  }

  const queryBus = {
    execute(q: unknown) {
      const name = (q as object).constructor.name
      const handler = queryHandlers.get(name)
      if (!handler) throw new Error(`No handler for query: ${name}`)
      return handler(q)
    },
  }

  return { commandBus, queryBus }
}

async function truncateAdminSettings(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE admin.tenant_settings RESTART IDENTITY CASCADE`)
}

describe('Planner feature flag — planner_personal_enabled', () => {
  const db = createTestDb() as Db

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await truncateAdminSettings(db)

    // Seed both tenants
    await seedTenant(db, { id: ENABLED_TENANT_ID, slug: 'ff-personal-enabled-tenant' })
    await seedTenant(db, { id: DISABLED_TENANT_ID, slug: 'ff-personal-disabled-tenant' })

    // Insert tenant_settings only for the ENABLED tenant with planner_personal_enabled=true
    await db.execute(
      sql`INSERT INTO admin.tenant_settings (id, tenant_id, planner_personal_enabled, created_at, updated_at)
          VALUES (${uuidv7()}, ${ENABLED_TENANT_ID}, true, NOW(), NOW())`,
    )

    const planRepo = new DrizzlePlanRepository(db as never)
    const { commandBus, queryBus } = buildBuses(planRepo)

    // AdminQueryFacade implementing getPlannerViewFlags via a direct Drizzle SQL query
    // on admin.tenant_settings. Default unset rows to false for every flag.
    const adminQueryFacade: Pick<AdminQueryFacade, 'getPlannerViewFlags'> = {
      async getPlannerViewFlags(tenantId: string): Promise<PlannerViewFlags> {
        const rows = await db.execute(
          sql`SELECT planner_views_enabled, planner_grid_enabled, planner_schedule_enabled,
                     planner_charts_enabled, planner_charts_trends_enabled, planner_personal_enabled
              FROM admin.tenant_settings
              WHERE tenant_id = ${tenantId}
              LIMIT 1`,
        )
        const row = rows.rows[0] as
          | {
              planner_views_enabled: boolean
              planner_grid_enabled: boolean
              planner_schedule_enabled: boolean
              planner_charts_enabled: boolean
              planner_charts_trends_enabled: boolean
              planner_personal_enabled: boolean
            }
          | undefined
        return {
          viewsEnabled: row?.planner_views_enabled ?? false,
          gridEnabled: row?.planner_grid_enabled ?? false,
          scheduleEnabled: row?.planner_schedule_enabled ?? false,
          chartsEnabled: row?.planner_charts_enabled ?? false,
          trendsEnabled: row?.planner_charts_trends_enabled ?? false,
          personalEnabled: row?.planner_personal_enabled ?? false,
        }
      },
    }

    // Override the singleton with the wired service
    const svc = new PlannerRouterService(
      commandBus as never,
      queryBus as never,
      adminQueryFacade as AdminQueryFacade,
    )
    svc.onModuleInit()
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await truncateAdminSettings(db)
  })

  describe('tenant with planner_personal_enabled = false (no settings row)', () => {
    it('plannerRouter.personal.listPlans throws FORBIDDEN', async () => {
      await setTenantContext(db, DISABLED_TENANT_ID)
      const caller = plannerRouter.createCaller({
        req: { headers: {} },
        tenantId: DISABLED_TENANT_ID,
        actorId: ACTOR_ID,
      })
      await expect(
        caller.personal.listPlans({ actorId: ACTOR_ID, tenantId: DISABLED_TENANT_ID }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  describe('tenant with planner_personal_enabled = true', () => {
    it('plannerRouter.personal.listPlans returns an array', async () => {
      await setTenantContext(db, ENABLED_TENANT_ID)
      const caller = plannerRouter.createCaller({
        req: { headers: {} },
        tenantId: ENABLED_TENANT_ID,
        actorId: ACTOR_ID,
      })
      const result = await caller.personal.listPlans({
        actorId: ACTOR_ID,
        tenantId: ENABLED_TENANT_ID,
      })
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
