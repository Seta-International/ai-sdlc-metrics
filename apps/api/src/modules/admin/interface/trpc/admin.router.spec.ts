import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publicProcedure } from '../../../../common/trpc/trpc-init'
import { AdminRouterService } from './admin-router.service'
import { createAdminRouter } from './admin.router'
import { GetTenantTimezoneQuery } from '../../application/queries/get-tenant-timezone.query'
import { UpdateTenantTimezoneCommand } from '../../application/commands/update-tenant-timezone.command'
import { ListPlatformTenantsQuery } from '../../application/queries/list-platform-tenants.query'
import { UpdateTargetTenantStatusCommand } from '../../application/commands/update-target-tenant-status.command'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { KernelPermissionFacade } from '../../../kernel/application/facades/kernel-permission.facade'

const TENANT_ID = '01900000-0000-7fff-8000-000000009001'
const ACTOR_ID = '01900000-0000-7fff-8000-000000009002'
const TARGET_TENANT_ID = '01900000-0000-7fff-8000-000000000001'

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

describe('adminRouter — platform procedures (unit)', () => {
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

  describe('platform.listTenants', () => {
    it('dispatches ListPlatformTenantsQuery and returns the result', async () => {
      const tenants = [
        {
          id: TARGET_TENANT_ID,
          name: 'SETA',
          slug: 'seta',
          status: 'active',
          planTier: 'enterprise',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      queryBus.execute.mockResolvedValue(tenants)
      const caller = router.createCaller(makeCtx())
      const result = await caller.platform.listTenants({})
      expect(queryBus.execute).toHaveBeenCalledOnce()
      expect(queryBus.execute.mock.calls[0]![0]).toBeInstanceOf(ListPlatformTenantsQuery)
      expect(result).toEqual(tenants)
    })
  })

  describe('platform.updateTenantStatus', () => {
    it('dispatches UpdateTargetTenantStatusCommand with correct fields', async () => {
      commandBus.execute.mockResolvedValue(undefined)
      const caller = router.createCaller(makeCtx())
      await caller.platform.updateTenantStatus({
        tenantId: TARGET_TENANT_ID,
        status: 'suspended',
      })
      expect(commandBus.execute).toHaveBeenCalledOnce()
      const cmd = commandBus.execute.mock.calls[0]![0] as UpdateTargetTenantStatusCommand
      expect(cmd).toBeInstanceOf(UpdateTargetTenantStatusCommand)
      expect(cmd.tenantId).toBe(TENANT_ID)
      expect(cmd.actorId).toBe(ACTOR_ID)
      expect(cmd.targetTenantId).toBe(TARGET_TENANT_ID)
      expect(cmd.status).toBe('suspended')
    })

    it('rejects invalid status value via zod validation', async () => {
      const caller = router.createCaller(makeCtx())
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (caller.platform.updateTenantStatus as any)({
          tenantId: TARGET_TENANT_ID,
          status: 'unknown',
        }),
      ).rejects.toBeDefined()
      expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('rejects non-uuid tenantId via zod validation', async () => {
      const caller = router.createCaller(makeCtx())
      await expect(
        caller.platform.updateTenantStatus({ tenantId: 'not-a-uuid', status: 'active' }),
      ).rejects.toBeDefined()
      expect(commandBus.execute).not.toHaveBeenCalled()
    })
  })
})
