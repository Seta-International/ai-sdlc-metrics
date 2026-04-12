import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExposureContractGuard } from './exposure-contract.guard'
import { ForbiddenException } from '@nestjs/common'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const SYSTEM_ACTOR_ID = '01900000-0000-7000-8000-000000000003'
const HUMAN_ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('ExposureContractGuard', () => {
  let guard: ExposureContractGuard
  let kernelFacade: KernelQueryFacade

  beforeEach(() => {
    kernelFacade = { resolveExposureContract: vi.fn() } as unknown as KernelQueryFacade
    guard = new ExposureContractGuard(kernelFacade)
  })

  function createMockContext(mcpContext: Record<string, unknown>, toolName: string) {
    const request = { mcpContext }
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToRpc: () => ({ getData: () => ({ method: { name: toolName } }) }),
      getArgByIndex: () => ({ params: { name: toolName } }),
      getArgs: () => [{ params: { name: toolName } }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  }

  describe('human user (JWT auth)', () => {
    it('should pass through without checking exposure contract', async () => {
      const context = createMockContext(
        {
          actorId: HUMAN_ACTOR_ID,
          tenantId: TENANT_ID,
          authMethod: 'jwt',
          actorType: 'person',
        },
        'people_get_employment_profile',
      )
      const result = await guard.canActivate(context)
      expect(result).toBe(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((kernelFacade as any).resolveExposureContract).not.toHaveBeenCalled()
    })
  })

  describe('system actor (API key auth)', () => {
    it('should pass when exposure contract exists for the tool', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked((kernelFacade as any).resolveExposureContract).mockResolvedValue({
        id: '01900000-0000-7000-8000-000000000099',
        toolName: 'people_get_employment_profile',
        scopeId: SYSTEM_ACTOR_ID,
        tenantId: TENANT_ID,
      })
      const context = createMockContext(
        {
          actorId: SYSTEM_ACTOR_ID,
          tenantId: TENANT_ID,
          authMethod: 'api_key',
          actorType: 'system',
        },
        'people_get_employment_profile',
      )
      const result = await guard.canActivate(context)
      expect(result).toBe(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((kernelFacade as any).resolveExposureContract).toHaveBeenCalledWith(
        SYSTEM_ACTOR_ID,
        'people_get_employment_profile',
        null,
        TENANT_ID,
      )
    })

    it('should deny when no exposure contract exists (deny-by-default)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked((kernelFacade as any).resolveExposureContract).mockResolvedValue(null)
      const context = createMockContext(
        {
          actorId: SYSTEM_ACTOR_ID,
          tenantId: TENANT_ID,
          authMethod: 'api_key',
          actorType: 'system',
        },
        'people_get_employment_profile',
      )
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
    })
  })
})
