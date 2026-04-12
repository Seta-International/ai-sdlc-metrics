import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentPermissionService } from './agent-permission.service'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('AgentPermissionService', () => {
  let service: AgentPermissionService
  let kernelFacade: KernelQueryFacade
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    kernelFacade = { canDo: vi.fn() } as unknown as KernelQueryFacade
    auditRepo = { insert: vi.fn().mockResolvedValue(undefined) } as unknown as IAuditEventRepository
    service = new AgentPermissionService(kernelFacade, auditRepo)
  })

  describe('checkToolPermission', () => {
    it('should return true and write granted audit when canDo() allows', async () => {
      vi.mocked(kernelFacade.canDo as any).mockResolvedValue(true)

      const result = await service.checkToolPermission({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        toolName: 'people_get_employment_profile',
        permission: 'people:profile:read',
      })

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
          subjectId: ACTOR_ID,
          payload: expect.objectContaining({
            tool: 'people_get_employment_profile',
            permission: 'people:profile:read',
            result: 'granted',
            via: 'agent',
            authMethod: 'session',
          }),
        }),
      )
    })

    it('should return false and write denied audit when canDo() rejects', async () => {
      vi.mocked(kernelFacade.canDo as any).mockResolvedValue(false)

      const result = await service.checkToolPermission({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        toolName: 'people_update_employment_profile',
        permission: 'people:profile:update',
      })

      expect(result).toBe(false)
      expect(auditRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            tool: 'people_update_employment_profile',
            result: 'denied',
            via: 'agent',
          }),
        }),
      )
    })

    it('should pass scope context to canDo() when provided', async () => {
      vi.mocked(kernelFacade.canDo as any).mockResolvedValue(true)
      const SCOPE_ID = '01900000-0000-7000-8000-000000000099'

      await service.checkToolPermission({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        toolName: 'time_approve_leave',
        permission: 'time:leave:approve',
        scopeType: 'department',
        scopeId: SCOPE_ID,
      })

      expect(kernelFacade.canDo).toHaveBeenCalledWith(ACTOR_ID, 'time:leave:approve', {
        tenantId: TENANT_ID,
        scopeType: 'department',
        scopeId: SCOPE_ID,
      })
    })

    it('should include sanitized args in audit when provided', async () => {
      vi.mocked(kernelFacade.canDo as any).mockResolvedValue(true)

      await service.checkToolPermission({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        toolName: 'people_get_employment_profile',
        permission: 'people:profile:read',
        args: { actorId: ACTOR_ID, someField: 'value' },
      })

      expect(auditRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ args: { actorId: ACTOR_ID, someField: 'value' } }),
        }),
      )
    })

    it('should redact sensitive fields from args in audit', async () => {
      vi.mocked(kernelFacade.canDo as any).mockResolvedValue(true)

      await service.checkToolPermission({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        toolName: 'test_tool',
        permission: 'test:resource:read',
        args: { name: 'test', password: 'secret123', apiKey: 'key123' },
      })

      expect(auditRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            args: { name: 'test', password: '[REDACTED]', apiKey: '[REDACTED]' },
          }),
        }),
      )
    })
  })
})
