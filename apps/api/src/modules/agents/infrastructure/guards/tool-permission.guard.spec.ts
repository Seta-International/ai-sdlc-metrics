import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolPermissionGuard } from './tool-permission.guard'
import { ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { TOOL_PERMISSION_KEY } from './tool-permission.decorator'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('ToolPermissionGuard', () => {
  let guard: ToolPermissionGuard
  let reflector: Reflector
  let kernelFacade: KernelQueryFacade
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    reflector = new Reflector()
    kernelFacade = { canDo: vi.fn() } as unknown as KernelQueryFacade
    auditRepo = { insert: vi.fn().mockResolvedValue(undefined) } as unknown as IAuditEventRepository
    guard = new ToolPermissionGuard(reflector, kernelFacade, auditRepo)
  })

  function createMockContext(
    mcpContext: Record<string, unknown>,
    toolName: string,
    handler: () => any = () => {},
  ) {
    const request = { mcpContext }
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => ({}),
      getArgs: () => [{ params: { name: toolName, arguments: { actorId: ACTOR_ID } } }],
    } as any
  }

  describe('when tool has @ToolPermission metadata', () => {
    it('should allow when canDo() returns true and write granted audit event', async () => {
      const handler = () => {}
      vi.spyOn(reflector, 'get').mockImplementation((key: any) => {
        if (key === TOOL_PERMISSION_KEY) return 'people:profile:read'
        return undefined
      })
      vi.mocked(kernelFacade.canDo as any).mockResolvedValue(true)

      const context = createMockContext(
        { actorId: ACTOR_ID, tenantId: TENANT_ID, authMethod: 'jwt', actorType: 'person' },
        'people_get_employment_profile',
        handler,
      )
      const result = await guard.canActivate(context)

      expect(result).toBe(true)
      expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:read', {
        tenantId: TENANT_ID,
      })
      expect(auditRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
          eventType: 'agent.tool_call',
          module: 'agents',
          payload: expect.objectContaining({
            tool: 'people_get_employment_profile',
            permission: 'people:profile:read',
            result: 'granted',
            via: 'agent',
            authMethod: 'jwt',
          }),
        }),
      )
    })

    it('should deny when canDo() returns false and write denied audit event', async () => {
      vi.spyOn(reflector, 'get').mockImplementation((key: any) => {
        if (key === TOOL_PERMISSION_KEY) return 'people:profile:update'
        return undefined
      })
      vi.mocked(kernelFacade.canDo as any).mockResolvedValue(false)

      const context = createMockContext(
        { actorId: ACTOR_ID, tenantId: TENANT_ID, authMethod: 'jwt', actorType: 'person' },
        'people_update_employment_profile',
      )
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
      expect(auditRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.tool_call',
          payload: expect.objectContaining({
            tool: 'people_update_employment_profile',
            permission: 'people:profile:update',
            result: 'denied',
            via: 'agent',
          }),
        }),
      )
    })
  })

  describe('when tool has no @ToolPermission metadata', () => {
    it('should pass through without permission check but still write audit event', async () => {
      vi.spyOn(reflector, 'get').mockReturnValue(undefined)

      const context = createMockContext(
        { actorId: ACTOR_ID, tenantId: TENANT_ID, authMethod: 'jwt', actorType: 'person' },
        'some_unprotected_tool',
      )
      const result = await guard.canActivate(context)

      expect(result).toBe(true)
      expect(kernelFacade.canDo).not.toHaveBeenCalled()
      expect(auditRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.tool_call',
          payload: expect.objectContaining({
            tool: 'some_unprotected_tool',
            permission: null,
            result: 'granted',
          }),
        }),
      )
    })
  })

  describe('scope-aware permission check', () => {
    it('should pass scope metadata to canDo() when present', async () => {
      vi.spyOn(reflector, 'get').mockImplementation((key: any) => {
        if (key === TOOL_PERMISSION_KEY) return 'people:profile:read'
        if (key === `${TOOL_PERMISSION_KEY}_scope`) return { scopeType: 'department' }
        return undefined
      })
      vi.mocked(kernelFacade.canDo as any).mockResolvedValue(true)

      const context = createMockContext(
        { actorId: ACTOR_ID, tenantId: TENANT_ID, authMethod: 'api_key', actorType: 'system' },
        'people_get_team_profiles',
      )
      await guard.canActivate(context)
      expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'people:profile:read', {
        tenantId: TENANT_ID,
        scopeType: 'department',
      })
    })
  })
})
