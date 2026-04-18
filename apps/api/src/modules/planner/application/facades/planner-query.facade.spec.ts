import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlannerQueryFacade } from './planner-query.facade'
import { ListPlansForActorQuery } from '../queries/plans/list-plans-for-actor.query'
import { GetPlanQuery } from '../queries/plans/get-plan.query'
import type { QueryBus } from '@nestjs/cqrs'
import type { PlanSummary } from '../queries/plans/list-plans-for-actor.handler'
import type { Plan } from '../../domain/entities/plan.entity'

const ACTOR_ID = 'actor-1'
const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'

describe('PlannerQueryFacade', () => {
  let facade: PlannerQueryFacade
  let queryBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    queryBus = { execute: vi.fn() }
    facade = new PlannerQueryFacade(queryBus as unknown as QueryBus)
  })

  describe('listPlansForActor()', () => {
    it('delegates to ListPlansForActorQuery via QueryBus', async () => {
      const summaries: PlanSummary[] = [
        { id: PLAN_ID, name: 'Test Plan', memberCount: 1, myRole: 'owner', updatedAt: new Date() },
      ]
      queryBus.execute.mockResolvedValue(summaries)

      const result = await facade.listPlansForActor(ACTOR_ID, TENANT_ID)

      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
        }),
      )
      const calledWith = queryBus.execute.mock.calls[0][0]
      expect(calledWith).toBeInstanceOf(ListPlansForActorQuery)
      expect(result).toBe(summaries)
    })
  })

  describe('countOpenTasksForActor()', () => {
    it('returns 0 without querying the bus (stub implementation)', async () => {
      const result = await facade.countOpenTasksForActor(ACTOR_ID, TENANT_ID)

      expect(result).toBe(0)
      expect(queryBus.execute).not.toHaveBeenCalled()
    })
  })

  describe('getPlan()', () => {
    it('delegates to GetPlanQuery via QueryBus', async () => {
      const plan = { id: PLAN_ID } as unknown as Plan
      queryBus.execute.mockResolvedValue(plan)

      const result = await facade.getPlan(ACTOR_ID, PLAN_ID, TENANT_ID)

      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: ACTOR_ID,
          planId: PLAN_ID,
          tenantId: TENANT_ID,
        }),
      )
      const calledWith = queryBus.execute.mock.calls[0][0]
      expect(calledWith).toBeInstanceOf(GetPlanQuery)
      expect(result).toBe(plan)
    })

    it('returns null when QueryBus returns null', async () => {
      queryBus.execute.mockResolvedValue(null)

      const result = await facade.getPlan(ACTOR_ID, PLAN_ID, TENANT_ID)

      expect(result).toBeNull()
    })
  })
})
