import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'
import { PlannerRouterService } from './planner-router.service'

describe('PlannerRouterService', () => {
  describe('assertPersonalEnabled', () => {
    let svc: PlannerRouterService
    let adminFacade: {
      getPlannerViewFlags: ReturnType<typeof vi.fn>
      isPlannerEnabled: ReturnType<typeof vi.fn>
    }

    beforeEach(() => {
      adminFacade = {
        getPlannerViewFlags: vi.fn(),
        isPlannerEnabled: vi.fn().mockResolvedValue(true),
      }
      const commandBus = { execute: vi.fn() }
      const queryBus = { execute: vi.fn() }
      svc = new PlannerRouterService(
        commandBus as never,
        queryBus as never,
        adminFacade as unknown as AdminQueryFacade,
      )
      svc.onModuleInit()
    })

    it('resolves when planner.personal.enabled is true', async () => {
      adminFacade.getPlannerViewFlags.mockResolvedValue({
        viewsEnabled: true,
        gridEnabled: true,
        scheduleEnabled: true,
        chartsEnabled: true,
        trendsEnabled: true,
        personalEnabled: true,
      })
      await expect(svc.assertPersonalEnabled('tenant-1')).resolves.toBeUndefined()
    })

    it('throws TRPCError FORBIDDEN when personal is disabled', async () => {
      adminFacade.getPlannerViewFlags.mockResolvedValue({
        viewsEnabled: true,
        gridEnabled: true,
        scheduleEnabled: true,
        chartsEnabled: true,
        trendsEnabled: true,
        personalEnabled: false,
      })
      await expect(svc.assertPersonalEnabled('tenant-1')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })
  })
})
