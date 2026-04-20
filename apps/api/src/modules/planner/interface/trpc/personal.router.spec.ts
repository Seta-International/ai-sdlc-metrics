import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uuidv7 } from 'uuidv7'
import { PlannerRouterService } from './planner-router.service'
import { personalRouter } from './personal.router'
import { ListPlansForActorQuery } from '../../application/queries/plans/list-plans-for-actor.query'
import { ListTasksForActorQuery } from '../../application/queries/personal/list-tasks-for-actor.query'
import { GetPersonalChartsQuery } from '../../application/queries/personal/get-personal-charts.query'
import { GetMyDayQuery } from '../../application/queries/personal/get-my-day.query'
import { AddToMyDayCommand } from '../../application/commands/my-day/add-to-my-day.command'
import { RemoveFromMyDayCommand } from '../../application/commands/my-day/remove-from-my-day.command'
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

  describe('listTasks', () => {
    it('returns tasks from queryBus when personalEnabled is on', async () => {
      getPlannerViewFlags.mockResolvedValue(allEnabledFlags())
      const tasks = [
        {
          id: 't1',
          planId: 'p1',
          planName: 'Alpha',
          planKind: 'team',
        },
      ]
      queryBus.execute.mockResolvedValue(tasks)

      const caller = personalRouter.createCaller(makeCtx())
      const result = await caller.listTasks({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        includeCompleted: false,
      })
      expect(result).toEqual(tasks)
      const dispatched = queryBus.execute.mock.calls[0][0] as ListTasksForActorQuery
      expect(dispatched).toBeInstanceOf(ListTasksForActorQuery)
      expect(dispatched.actorId).toBe(ACTOR_ID)
      expect(dispatched.tenantId).toBe(TENANT_ID)
      expect(dispatched.options.includeCompleted).toBe(false)
    })

    it('defaults includeCompleted to false when omitted', async () => {
      getPlannerViewFlags.mockResolvedValue(allEnabledFlags())
      queryBus.execute.mockResolvedValue([])
      const caller = personalRouter.createCaller(makeCtx())
      await caller.listTasks({ actorId: ACTOR_ID, tenantId: TENANT_ID })
      const dispatched = queryBus.execute.mock.calls[0][0] as ListTasksForActorQuery
      expect(dispatched.options.includeCompleted).toBe(false)
    })

    it('rejects with FORBIDDEN when personalEnabled flag is off', async () => {
      getPlannerViewFlags.mockResolvedValue({ ...allEnabledFlags(), personalEnabled: false })
      const caller = personalRouter.createCaller(makeCtx())
      await expect(
        caller.listTasks({ actorId: ACTOR_ID, tenantId: TENANT_ID, includeCompleted: false }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(queryBus.execute).not.toHaveBeenCalled()
    })
  })

  describe('getCharts', () => {
    it('returns PlannerChartsData from queryBus when personalEnabled is on', async () => {
      getPlannerViewFlags.mockResolvedValue(allEnabledFlags())
      const payload = {
        progress: { 'not-started': 0, 'in-progress': 1, completed: 0 },
        priority: { urgent: 1, important: 0, medium: 0, low: 0 },
        bucket: [],
        workload: [],
        lateUpcoming: { late: [], upcoming: [] },
      }
      queryBus.execute.mockResolvedValue(payload)

      const caller = personalRouter.createCaller(makeCtx())
      const result = await caller.getCharts({ actorId: ACTOR_ID, tenantId: TENANT_ID })
      expect(result).toEqual(payload)
      const dispatched = queryBus.execute.mock.calls[0][0] as GetPersonalChartsQuery
      expect(dispatched).toBeInstanceOf(GetPersonalChartsQuery)
      expect(dispatched.actorId).toBe(ACTOR_ID)
      expect(dispatched.tenantId).toBe(TENANT_ID)
    })

    it('rejects with FORBIDDEN when personalEnabled flag is off', async () => {
      getPlannerViewFlags.mockResolvedValue({ ...allEnabledFlags(), personalEnabled: false })
      const caller = personalRouter.createCaller(makeCtx())
      await expect(
        caller.getCharts({ actorId: ACTOR_ID, tenantId: TENANT_ID }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  describe('myDay.get', () => {
    it('dispatches GetMyDayQuery and returns rows', async () => {
      getPlannerViewFlags.mockResolvedValue(allEnabledFlags())
      const rows = [{ id: 't1', myDay: { addedAt: '2026-04-20T01:00:00.000Z', completedAt: null } }]
      queryBus.execute.mockResolvedValue(rows)

      const caller = personalRouter.createCaller(makeCtx())
      const result = await caller.myDay.get({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        date: '2026-04-20',
      })

      expect(result).toEqual(rows)
      const dispatched = queryBus.execute.mock.calls[0][0] as GetMyDayQuery
      expect(dispatched).toBeInstanceOf(GetMyDayQuery)
      expect(dispatched.actorId).toBe(ACTOR_ID)
      expect(dispatched.tenantId).toBe(TENANT_ID)
      expect(dispatched.date).toBe('2026-04-20')
    })

    it('rejects invalid date format with BAD_REQUEST', async () => {
      getPlannerViewFlags.mockResolvedValue(allEnabledFlags())
      const caller = personalRouter.createCaller(makeCtx())
      await expect(
        caller.myDay.get({ actorId: ACTOR_ID, tenantId: TENANT_ID, date: 'not-a-date' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('rejects with FORBIDDEN when personalEnabled is off', async () => {
      getPlannerViewFlags.mockResolvedValue({ ...allEnabledFlags(), personalEnabled: false })
      const caller = personalRouter.createCaller(makeCtx())
      await expect(
        caller.myDay.get({ actorId: ACTOR_ID, tenantId: TENANT_ID, date: '2026-04-20' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  describe('myDay.add', () => {
    it('dispatches AddToMyDayCommand', async () => {
      getPlannerViewFlags.mockResolvedValue(allEnabledFlags())
      commandBus.execute.mockResolvedValue(undefined)

      const taskId = uuidv7()
      const caller = personalRouter.createCaller(makeCtx())
      await caller.myDay.add({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        taskId,
        date: '2026-04-20',
      })

      const dispatched = commandBus.execute.mock.calls[0][0] as AddToMyDayCommand
      expect(dispatched).toBeInstanceOf(AddToMyDayCommand)
      expect(dispatched.actorId).toBe(ACTOR_ID)
      expect(dispatched.tenantId).toBe(TENANT_ID)
      expect(dispatched.taskId).toBe(taskId)
      expect(dispatched.date).toBe('2026-04-20')
    })

    it('rejects invalid taskId with BAD_REQUEST', async () => {
      getPlannerViewFlags.mockResolvedValue(allEnabledFlags())
      const caller = personalRouter.createCaller(makeCtx())
      await expect(
        caller.myDay.add({
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          taskId: 'not-a-uuid',
          date: '2026-04-20',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('rejects with FORBIDDEN when personalEnabled is off', async () => {
      getPlannerViewFlags.mockResolvedValue({ ...allEnabledFlags(), personalEnabled: false })
      const caller = personalRouter.createCaller(makeCtx())
      await expect(
        caller.myDay.add({
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          taskId: uuidv7(),
          date: '2026-04-20',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  describe('myDay.remove', () => {
    it('dispatches RemoveFromMyDayCommand', async () => {
      getPlannerViewFlags.mockResolvedValue(allEnabledFlags())
      commandBus.execute.mockResolvedValue(undefined)

      const taskId = uuidv7()
      const caller = personalRouter.createCaller(makeCtx())
      await caller.myDay.remove({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        taskId,
        date: '2026-04-20',
      })

      const dispatched = commandBus.execute.mock.calls[0][0] as RemoveFromMyDayCommand
      expect(dispatched).toBeInstanceOf(RemoveFromMyDayCommand)
      expect(dispatched.actorId).toBe(ACTOR_ID)
      expect(dispatched.taskId).toBe(taskId)
      expect(dispatched.date).toBe('2026-04-20')
    })

    it('rejects with FORBIDDEN when personalEnabled is off', async () => {
      getPlannerViewFlags.mockResolvedValue({ ...allEnabledFlags(), personalEnabled: false })
      const caller = personalRouter.createCaller(makeCtx())
      await expect(
        caller.myDay.remove({
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          taskId: uuidv7(),
          date: '2026-04-20',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })
})
