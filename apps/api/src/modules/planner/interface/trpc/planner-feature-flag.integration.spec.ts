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
import { EventBus } from '@nestjs/cqrs'
import { DrizzlePlanRepository } from '../../infrastructure/repositories/drizzle-plan.repository'
import { DrizzleBucketRepository } from '../../infrastructure/repositories/drizzle-bucket.repository'
import { PlanAuthorizationService } from '../../application/services/plan-authorization.service'
import { CreatePlanHandler } from '../../application/commands/plans/create-plan.handler'
import { RenamePlanHandler } from '../../application/commands/plans/rename-plan.handler'
import { DeletePlanHandler } from '../../application/commands/plans/delete-plan.handler'
import { AddPlanMemberHandler } from '../../application/commands/plans/add-plan-member.handler'
import { RemovePlanMemberHandler } from '../../application/commands/plans/remove-plan-member.handler'
import { RenamePlanLabelHandler } from '../../application/commands/plans/rename-plan-label.handler'
import { RecolorPlanLabelHandler } from '../../application/commands/plans/recolor-plan-label.handler'
import { ListPlansForActorHandler } from '../../application/queries/plans/list-plans-for-actor.handler'
import { GetPlanHandler } from '../../application/queries/plans/get-plan.handler'
import { ListPlansForActorQuery } from '../../application/queries/plans/list-plans-for-actor.query'
import { GetPlanQuery } from '../../application/queries/plans/get-plan.query'
import { CreatePlanCommand } from '../../application/commands/plans/create-plan.command'
import { RenamePlanCommand } from '../../application/commands/plans/rename-plan.command'
import { DeletePlanCommand } from '../../application/commands/plans/delete-plan.command'
import { AddPlanMemberCommand } from '../../application/commands/plans/add-plan-member.command'
import { RemovePlanMemberCommand } from '../../application/commands/plans/remove-plan-member.command'
import { RenamePlanLabelCommand } from '../../application/commands/plans/rename-plan-label.command'
import { RecolorPlanLabelCommand } from '../../application/commands/plans/recolor-plan-label.command'
import { PlannerRouterService } from './planner-router.service'
import { plannerRouter } from './planner.router'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'

// Two tenants: one with flag enabled, one without
const ENABLED_TENANT_ID = '01900000-ff01-7fff-8000-000000002001'
const DISABLED_TENANT_ID = '01900000-ff01-7fff-8000-000000002002'
const ACTOR_ID = uuidv7()

function makeEventBus(): EventBus {
  return { publish: vi.fn().mockResolvedValue(undefined) } as unknown as EventBus
}

function makeKernelFacade(canDo = true): KernelQueryFacade {
  return { canDo: vi.fn().mockResolvedValue(canDo) } as unknown as KernelQueryFacade
}

function makePermissiveAuthSvc(): PlanAuthorizationService {
  return {
    assertCanCreatePlan: vi.fn().mockResolvedValue(undefined),
    assertCanReadPlan: vi.fn().mockResolvedValue(undefined),
    assertCanEditPlan: vi.fn().mockResolvedValue(undefined),
    assertCanAdminPlan: vi.fn().mockResolvedValue(undefined),
    assertCanManageMembers: vi.fn().mockResolvedValue(undefined),
  } as unknown as PlanAuthorizationService
}

function buildBuses(planRepo: DrizzlePlanRepository, bucketRepo: DrizzleBucketRepository) {
  const eventBus = makeEventBus()
  const authSvc = makePermissiveAuthSvc()

  const commandHandlers = new Map<string, (cmd: unknown) => Promise<unknown>>()
  const queryHandlers = new Map<string, (q: unknown) => Promise<unknown>>()

  const createHandler = new CreatePlanHandler(
    planRepo as never,
    bucketRepo as never,
    authSvc,
    eventBus,
  )
  const renameHandler = new RenamePlanHandler(planRepo as never, authSvc, eventBus)
  const deleteHandler = new DeletePlanHandler(planRepo as never, authSvc, eventBus)
  const addMemberHandler = new AddPlanMemberHandler(planRepo as never, authSvc, eventBus)
  const removeMemberHandler = new RemovePlanMemberHandler(planRepo as never, authSvc, eventBus)
  const renameLabelHandler = new RenamePlanLabelHandler(planRepo as never, authSvc, eventBus)
  const recolorLabelHandler = new RecolorPlanLabelHandler(planRepo as never, authSvc, eventBus)

  commandHandlers.set('CreatePlanCommand', (cmd) => createHandler.execute(cmd as CreatePlanCommand))
  commandHandlers.set('RenamePlanCommand', (cmd) => renameHandler.execute(cmd as RenamePlanCommand))
  commandHandlers.set('DeletePlanCommand', (cmd) => deleteHandler.execute(cmd as DeletePlanCommand))
  commandHandlers.set('AddPlanMemberCommand', (cmd) =>
    addMemberHandler.execute(cmd as AddPlanMemberCommand),
  )
  commandHandlers.set('RemovePlanMemberCommand', (cmd) =>
    removeMemberHandler.execute(cmd as RemovePlanMemberCommand),
  )
  commandHandlers.set('RenamePlanLabelCommand', (cmd) =>
    renameLabelHandler.execute(cmd as RenamePlanLabelCommand),
  )
  commandHandlers.set('RecolorPlanLabelCommand', (cmd) =>
    recolorLabelHandler.execute(cmd as RecolorPlanLabelCommand),
  )

  const kernelFacade = makeKernelFacade(true)
  const listHandler = new ListPlansForActorHandler(planRepo as never, kernelFacade)
  const getHandler = new GetPlanHandler(planRepo as never, authSvc)

  queryHandlers.set('ListPlansForActorQuery', (q) =>
    listHandler.execute(q as ListPlansForActorQuery),
  )
  queryHandlers.set('GetPlanQuery', (q) => getHandler.execute(q as GetPlanQuery))

  const commandBus = {
    execute(cmd: unknown) {
      const name = (cmd as object).constructor.name
      const handler = commandHandlers.get(name)
      if (!handler) throw new Error(`No handler for command: ${name}`)
      return handler(cmd)
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

describe('Planner feature flag — planner_core_enabled', () => {
  const db = createTestDb() as Db

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await truncateAdminSettings(db)

    // Seed both tenants
    await seedTenant(db, { id: ENABLED_TENANT_ID, slug: 'ff-enabled-tenant' })
    await seedTenant(db, { id: DISABLED_TENANT_ID, slug: 'ff-disabled-tenant' })

    // Insert tenant_settings only for the ENABLED tenant
    await db.execute(
      sql`INSERT INTO admin.tenant_settings (id, tenant_id, planner_core_enabled, created_at, updated_at)
          VALUES (${uuidv7()}, ${ENABLED_TENANT_ID}, true, NOW(), NOW())`,
    )

    const planRepo = new DrizzlePlanRepository(db as never)
    const bucketRepo = new DrizzleBucketRepository(db as never)
    const { commandBus, queryBus } = buildBuses(planRepo, bucketRepo)

    // AdminQueryFacade backed by the real IsPlannerEnabledHandler via DB
    // We wire it as a direct Drizzle query to bypass NestJS DI
    const adminQueryFacade: Pick<AdminQueryFacade, 'isPlannerEnabled'> = {
      async isPlannerEnabled(tenantId: string): Promise<boolean> {
        const rows = await db.execute(
          sql`SELECT planner_core_enabled FROM admin.tenant_settings WHERE tenant_id = ${tenantId} LIMIT 1`,
        )
        const row = rows.rows[0] as { planner_core_enabled: boolean } | undefined
        return row?.planner_core_enabled ?? false
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

  describe('tenant without tenant_settings row (planner disabled by default)', () => {
    it('plans.list throws FORBIDDEN', async () => {
      await setTenantContext(db, DISABLED_TENANT_ID)
      const caller = plannerRouter.createCaller({
        req: { headers: {} },
        tenantId: DISABLED_TENANT_ID,
        actorId: ACTOR_ID,
      })

      await expect(
        caller.plans.list({ actorId: ACTOR_ID, tenantId: DISABLED_TENANT_ID }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  describe('tenant with plannerCoreEnabled = true', () => {
    it('plans.list returns an array (no FORBIDDEN)', async () => {
      await setTenantContext(db, ENABLED_TENANT_ID)
      const caller = plannerRouter.createCaller({
        req: { headers: {} },
        tenantId: ENABLED_TENANT_ID,
        actorId: ACTOR_ID,
      })

      const result = await caller.plans.list({ actorId: ACTOR_ID, tenantId: ENABLED_TENANT_ID })
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
