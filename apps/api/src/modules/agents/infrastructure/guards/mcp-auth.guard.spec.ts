import { beforeEach, describe, expect, it, vi } from 'vitest'
import { McpAuthGuard } from './mcp-auth.guard'
import { UnauthorizedException } from '@nestjs/common'
import type { JwtService } from '@nestjs/jwt'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const SYSTEM_ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('McpAuthGuard', () => {
  let guard: McpAuthGuard
  let jwtService: JwtService
  let kernelFacade: KernelQueryFacade

  beforeEach(() => {
    jwtService = { verifyAsync: vi.fn() } as unknown as JwtService
    kernelFacade = { getActor: vi.fn(), validateApiKey: vi.fn() } as unknown as KernelQueryFacade
    guard = new McpAuthGuard(jwtService, kernelFacade)
  })

  function createMockContext(headers: Record<string, string | undefined>) {
    const request = {
      headers: {
        authorization: headers.authorization,
        'x-api-key': headers['x-api-key'],
        'x-tenant-id': headers['x-tenant-id'],
      },
      mcpContext: {} as Record<string, unknown>,
    }
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any
  }

  describe('JWT authentication', () => {
    it('should pass with valid Bearer JWT and attach actorId + tenantId to context', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: ACTOR_ID,
        tid: TENANT_ID,
        roles: ['employee'],
      })
      vi.mocked(kernelFacade.getActor).mockResolvedValue({
        id: ACTOR_ID,
        tenantId: TENANT_ID,
        type: 'person',
        displayName: 'Test User',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const context = createMockContext({ authorization: 'Bearer valid.jwt.token' })
      const result = await guard.canActivate(context)

      expect(result).toBe(true)
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid.jwt.token')
      const request = context.switchToHttp().getRequest()
      expect(request.mcpContext.actorId).toBe(ACTOR_ID)
      expect(request.mcpContext.tenantId).toBe(TENANT_ID)
      expect(request.mcpContext.authMethod).toBe('jwt')
      expect(request.mcpContext.actorType).toBe('person')
    })

    it('should reject when JWT is invalid', async () => {
      vi.mocked(jwtService.verifyAsync).mockRejectedValue(new Error('invalid token'))
      const context = createMockContext({ authorization: 'Bearer invalid.jwt.token' })
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('should reject when actor is not active', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: ACTOR_ID,
        tid: TENANT_ID,
        roles: ['employee'],
      })
      vi.mocked(kernelFacade.getActor).mockResolvedValue({
        id: ACTOR_ID,
        tenantId: TENANT_ID,
        type: 'person',
        displayName: 'Suspended User',
        status: 'suspended',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      const context = createMockContext({ authorization: 'Bearer valid.jwt.token' })
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('API key authentication', () => {
    it('should pass with valid API key and resolve system actorId', async () => {
      vi.mocked((kernelFacade as any).validateApiKey).mockResolvedValue({
        actorId: SYSTEM_ACTOR_ID,
        tenantId: TENANT_ID,
      })
      vi.mocked(kernelFacade.getActor).mockResolvedValue({
        id: SYSTEM_ACTOR_ID,
        tenantId: TENANT_ID,
        type: 'system',
        displayName: 'Integration Bot',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const context = createMockContext({
        'x-api-key': 'fk_live_abc123def456',
        'x-tenant-id': TENANT_ID,
      })
      const result = await guard.canActivate(context)

      expect(result).toBe(true)
      const request = context.switchToHttp().getRequest()
      expect(request.mcpContext.actorId).toBe(SYSTEM_ACTOR_ID)
      expect(request.mcpContext.tenantId).toBe(TENANT_ID)
      expect(request.mcpContext.authMethod).toBe('api_key')
      expect(request.mcpContext.actorType).toBe('system')
    })

    it('should reject when API key is invalid', async () => {
      vi.mocked((kernelFacade as any).validateApiKey).mockResolvedValue(null)
      const context = createMockContext({
        'x-api-key': 'fk_live_invalid',
        'x-tenant-id': TENANT_ID,
      })
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('missing authentication', () => {
    it('should reject when no auth header and no API key', async () => {
      const context = createMockContext({})
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })
  })
})
