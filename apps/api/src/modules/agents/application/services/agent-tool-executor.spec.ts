import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentToolExecutor } from './agent-tool-executor'
import { AgentPermissionService } from './agent-permission.service'
import { ForbiddenException } from '@nestjs/common'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('AgentToolExecutor', () => {
  let executor: AgentToolExecutor
  let permissionService: AgentPermissionService

  beforeEach(() => {
    permissionService = {
      checkToolPermission: vi.fn(),
    } as unknown as AgentPermissionService
    executor = new AgentToolExecutor(permissionService)
  })

  describe('executeTool', () => {
    it('should execute tool when permission is granted', async () => {
      vi.mocked(permissionService.checkToolPermission).mockResolvedValue(true)
      const toolFn = vi.fn().mockResolvedValue({ data: 'result' })

      const result = await executor.executeTool({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        toolName: 'people_get_employment_profile',
        permission: 'people:profile:read',
        args: { actorId: ACTOR_ID },
        execute: toolFn,
      })

      expect(permissionService.checkToolPermission).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        toolName: 'people_get_employment_profile',
        permission: 'people:profile:read',
        args: { actorId: ACTOR_ID },
      })
      expect(toolFn).toHaveBeenCalled()
      expect(result).toEqual({ data: 'result' })
    })

    it('should throw ForbiddenException when permission is denied', async () => {
      vi.mocked(permissionService.checkToolPermission).mockResolvedValue(false)
      const toolFn = vi.fn()

      await expect(
        executor.executeTool({
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          toolName: 'people_update_employment_profile',
          permission: 'people:profile:update',
          args: {},
          execute: toolFn,
        }),
      ).rejects.toThrow(ForbiddenException)

      expect(toolFn).not.toHaveBeenCalled()
    })

    it('should pass scope context through to permission check', async () => {
      vi.mocked(permissionService.checkToolPermission).mockResolvedValue(true)
      const DEPT_ID = '01900000-0000-7000-8000-000000000099'
      const toolFn = vi.fn().mockResolvedValue({})

      await executor.executeTool({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        toolName: 'time_approve_leave',
        permission: 'time:leave:approve',
        scopeType: 'department',
        scopeId: DEPT_ID,
        args: { leaveRequestId: 'some-id' },
        execute: toolFn,
      })

      expect(permissionService.checkToolPermission).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        toolName: 'time_approve_leave',
        permission: 'time:leave:approve',
        scopeType: 'department',
        scopeId: DEPT_ID,
        args: { leaveRequestId: 'some-id' },
      })
    })
  })
})
