import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publicProcedure } from '../../../../common/trpc/trpc-init'
import { AdminRouterService } from './admin-router.service'
import { createAdminRouter } from './admin.router'
import { GetTenantTimezoneQuery } from '../../application/queries/get-tenant-timezone.query'
import { UpdateTenantTimezoneCommand } from '../../application/commands/update-tenant-timezone.command'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { KernelPermissionFacade } from '../../../kernel/application/facades/kernel-permission.facade'

const TENANT_ID = '01900000-0000-7fff-8000-000000009001'
const ACTOR_ID = '01900000-0000-7fff-8000-000000009002'

function makeCtx() {
  return { req: { headers: {} }, tenantId: TENANT_ID, actorId: ACTOR_ID }
}

describe('adminRouter — timezone procedures (unit)', () => {
  let commandBus: { execute: ReturnType<typeof vi.fn> }
  let queryBus: { execute: ReturnType<typeof vi.fn> }
  let router: ReturnType<typeof createAdminRouter>

  beforeEach(() => {
    commandBus = { execute: vi.fn() }
    queryBus = { execute: vi.fn() }
    const svc = new AdminRouterService(
      commandBus as never,
      queryBus as never,
      {} as KernelQueryFacade,
      {} as KernelPermissionFacade,
    )
    svc.onModuleInit()
    router = createAdminRouter(publicProcedure)
  })

  describe('getTenantTimezone', () => {
    it('dispatches GetTenantTimezoneQuery and returns { timezone }', async () => {
      queryBus.execute.mockResolvedValue('America/New_York')
      const caller = router.createCaller(makeCtx())
      const result = await caller.getTenantTimezone({})
      expect(queryBus.execute).toHaveBeenCalledOnce()
      expect(queryBus.execute.mock.calls[0][0]).toBeInstanceOf(GetTenantTimezoneQuery)
      expect((queryBus.execute.mock.calls[0][0] as GetTenantTimezoneQuery).tenantId).toBe(TENANT_ID)
      expect(result).toEqual({ timezone: 'America/New_York' })
    })
  })

  describe('updateTimezone', () => {
    it('dispatches UpdateTenantTimezoneCommand with tenant id and timezone', async () => {
      commandBus.execute.mockResolvedValue(undefined)
      const caller = router.createCaller(makeCtx())
      await caller.updateTimezone({ timezone: 'Asia/Tokyo' })
      expect(commandBus.execute).toHaveBeenCalledOnce()
      const cmd = commandBus.execute.mock.calls[0][0] as UpdateTenantTimezoneCommand
      expect(cmd).toBeInstanceOf(UpdateTenantTimezoneCommand)
      expect(cmd.tenantId).toBe(TENANT_ID)
      expect(cmd.timezone).toBe('Asia/Tokyo')
    })

    it('rejects empty timezone via input validation (zod min(1))', async () => {
      const caller = router.createCaller(makeCtx())
      await expect(caller.updateTimezone({ timezone: '' })).rejects.toBeDefined()
      expect(commandBus.execute).not.toHaveBeenCalled()
    })
  })
})
