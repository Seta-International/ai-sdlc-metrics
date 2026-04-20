import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uuidv7 } from 'uuidv7'
import { PlannerRouterService } from './planner-router.service'
import { personalRouter } from './personal.router'
import { ListPlansForActorQuery } from '../../application/queries/plans/list-plans-for-actor.query'
import type { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'
import type { PlannerViewFlags } from '../../../admin/application/queries/planner-view-flags.types'

const TENANT_ID = '01900000-0000-7fff-8000-000000005001'
const ACTOR_ID = uuidv7()

function makeCtx() {
  return {
    req: { headers: {} },
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
  }
}

function allEnabledFlags(): PlannerViewFlags {
  return {
    viewsEnabled: true,
    gridEnabled: true,
    scheduleEnabled: true,
    chartsEnabled: true,
    trendsEnabled: true,
    personalEnabled: true,
  }
}

describe('personalRouter — unit (mocked query bus)', () => {
  let commandBus: { execute: ReturnType<typeof vi.fn> }
  let queryBus: { execute: ReturnType<typeof vi.fn> }
  let getPlannerViewFlags: ReturnType<typeof vi.fn>

  beforeEach(() => {
    commandBus = { execute: vi.fn() }
    queryBus = { execute: vi.fn() }
    getPlannerViewFlags = vi.fn()

    const adminQueryFacade: Pick<AdminQueryFacade, 'isPlannerEnabled' | 'getPlannerViewFlags'> = {
      isPlannerEnabled: vi.fn().mockResolvedValue(true),
      getPlannerViewFlags,
    }

    const svc = new PlannerRouterService(
      commandBus as never,
      queryBus as never,
      adminQueryFacade as AdminQueryFacade,
    )
    svc.onModuleInit()
  })

  describe('listPlans', () => {
    it('returns plans from queryBus when personalEnabled flag is on', async () => {
      getPlannerViewFlags.mockResolvedValue(allEnabledFlags())

      const planId = uuidv7()
      const plans = [
        {
          id: planId,
          tenantId: TENANT_ID,
          name: 'My Plan',
          description: null,
        },
      ]
      queryBus.execute.mockResolvedValue(plans)

      const caller = personalRouter.createCaller(makeCtx())
      const result = await caller.listPlans({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
      })

      expect(result).toEqual(plans)
      expect(queryBus.execute).toHaveBeenCalledOnce()
      const dispatched = queryBus.execute.mock.calls[0][0] as ListPlansForActorQuery
      expect(dispatched).toBeInstanceOf(ListPlansForActorQuery)
      expect(dispatched.actorId).toBe(ACTOR_ID)
      expect(dispatched.tenantId).toBe(TENANT_ID)
    })

    it('rejects with FORBIDDEN when personalEnabled flag is off', async () => {
      getPlannerViewFlags.mockResolvedValue({
        ...allEnabledFlags(),
        personalEnabled: false,
      })

      const caller = personalRouter.createCaller(makeCtx())

      await expect(
        caller.listPlans({ actorId: ACTOR_ID, tenantId: TENANT_ID }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })

      expect(queryBus.execute).not.toHaveBeenCalled()
    })
  })
})
