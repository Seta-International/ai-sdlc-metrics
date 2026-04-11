# Access Control 06 — Agent Access to Backend Services

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Secure agent access to backend services with MCP guards for external agents and canDo() checks for internal agents, with full audit trail.

**Architecture:** Three-guard stack for MCP endpoints (auth -> exposure -> permission). Internal agents reuse user session and check permissions via canDo(). All agent actions audited.

**Tech Stack:** @rekog/mcp-nest, NestJS guards, vitest

**Depends on:** Plans 01-02 (canDo, exposure_contract, API keys, system actors)
**Blocks:** Nothing — this is the final plan

**Spec:** `docs/superpowers/specs/2026-04-11-access-control-strategy-design.md` (Section 6)

**Status:** not started

---

## Task 1: McpAuthGuard — Authenticate MCP Requests

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/guards/mcp-auth.guard.ts`
- Create: `apps/api/src/modules/agents/infrastructure/guards/mcp-auth.guard.spec.ts`

This guard sits at the MCP module level (`McpModule.forRoot({ guards: [McpAuthGuard] })`). It handles two authentication paths: Bearer JWT (user session) and API key (system-to-system).

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/modules/agents/infrastructure/guards/mcp-auth.guard.spec.ts
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
    jwtService = {
      verifyAsync: vi.fn(),
    } as unknown as JwtService

    kernelFacade = {
      getActor: vi.fn(),
      validateApiKey: vi.fn(),
    } as unknown as KernelQueryFacade

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
      switchToHttp: () => ({
        getRequest: () => request,
      }),
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

      const context = createMockContext({
        authorization: 'Bearer valid.jwt.token',
      })

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

      const context = createMockContext({
        authorization: 'Bearer invalid.jwt.token',
      })

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

      const context = createMockContext({
        authorization: 'Bearer valid.jwt.token',
      })

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('API key authentication', () => {
    it('should pass with valid API key and resolve system actorId', async () => {
      vi.mocked(kernelFacade.validateApiKey as any).mockResolvedValue({
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
      vi.mocked(kernelFacade.validateApiKey as any).mockResolvedValue(null)

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
```

- [ ] **Step 2: Run test — verify failure**

```bash
cd apps/api && bunx vitest run src/modules/agents/infrastructure/guards/mcp-auth.guard.spec.ts
```

- [ ] **Step 3: Implement McpAuthGuard**

```typescript
// apps/api/src/modules/agents/infrastructure/guards/mcp-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { createHash } from 'node:crypto'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'

interface JwtPayload {
  sub: string // actorId
  tid: string // tenantId
  roles: string[]
}

export interface McpRequestContext {
  actorId: string
  tenantId: string
  authMethod: 'jwt' | 'api_key'
  actorType: 'person' | 'organization' | 'system'
}

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly kernelFacade: KernelQueryFacade,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization as string | undefined
    const apiKey = request.headers['x-api-key'] as string | undefined

    if (authHeader?.startsWith('Bearer ')) {
      return this.authenticateJwt(request, authHeader.slice(7))
    }

    if (apiKey) {
      const tenantId = request.headers['x-tenant-id'] as string | undefined
      if (!tenantId) {
        throw new UnauthorizedException('x-tenant-id header is required for API key authentication')
      }
      return this.authenticateApiKey(request, apiKey, tenantId)
    }

    throw new UnauthorizedException(
      'Missing authentication: provide Bearer token or x-api-key header',
    )
  }

  private async authenticateJwt(request: any, token: string): Promise<boolean> {
    let payload: JwtPayload
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token)
    } catch {
      throw new UnauthorizedException('Invalid or expired JWT token')
    }

    const actor = await this.kernelFacade.getActor(payload.sub, payload.tid)
    if (!actor || actor.status !== 'active') {
      throw new UnauthorizedException('Actor is not active')
    }

    request.mcpContext = {
      actorId: payload.sub,
      tenantId: payload.tid,
      authMethod: 'jwt',
      actorType: actor.type,
    } satisfies McpRequestContext

    return true
  }

  private async authenticateApiKey(
    request: any,
    apiKey: string,
    tenantId: string,
  ): Promise<boolean> {
    const keyHash = createHash('sha256').update(apiKey).digest('hex')
    const result = await (this.kernelFacade as any).validateApiKey(keyHash, tenantId)

    if (!result) {
      throw new UnauthorizedException('Invalid API key')
    }

    const actor = await this.kernelFacade.getActor(result.actorId, tenantId)
    if (!actor || actor.status !== 'active') {
      throw new UnauthorizedException('System actor is not active')
    }

    request.mcpContext = {
      actorId: result.actorId,
      tenantId,
      authMethod: 'api_key',
      actorType: actor.type,
    } satisfies McpRequestContext

    return true
  }
}
```

**Note:** `KernelQueryFacade.validateApiKey()` is added in Plans 01-02 (identity module). The guard consumes it here. If it does not exist yet at build time, the cast to `any` allows compilation; the guard will be fully typed once the identity module plan lands.

- [ ] **Step 4: Run test — verify pass**
- [ ] **Step 5: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
feat(agents): add McpAuthGuard for JWT and API key authentication
```

---

## Task 2: ExposureContractGuard — Deny-by-Default for External Consumers

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/guards/exposure-contract.guard.ts`
- Create: `apps/api/src/modules/agents/infrastructure/guards/exposure-contract.guard.spec.ts`

This guard applies only to system actors (API key auth). Human users (JWT auth) pass through — exposure contracts are for external consumers only.

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/modules/agents/infrastructure/guards/exposure-contract.guard.spec.ts
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
    kernelFacade = {
      resolveExposureContract: vi.fn(),
    } as unknown as KernelQueryFacade

    guard = new ExposureContractGuard(kernelFacade)
  })

  function createMockContext(mcpContext: Record<string, unknown>, toolName: string) {
    const request = {
      mcpContext,
    }
    // Simulate @rekog/mcp-nest passing tool metadata through the execution context
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToRpc: () => ({
        getData: () => ({ method: { name: toolName } }),
      }),
      getArgByIndex: () => ({ params: { name: toolName } }),
      getArgs: () => [{ params: { name: toolName } }],
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
      expect(kernelFacade.resolveExposureContract).not.toHaveBeenCalled()
    })
  })

  describe('system actor (API key auth)', () => {
    it('should pass when exposure contract exists for the tool', async () => {
      vi.mocked(kernelFacade.resolveExposureContract as any).mockResolvedValue({
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
      expect(kernelFacade.resolveExposureContract).toHaveBeenCalledWith(
        SYSTEM_ACTOR_ID,
        'people_get_employment_profile',
        null,
        TENANT_ID,
      )
    })

    it('should deny when no exposure contract exists (deny-by-default)', async () => {
      vi.mocked(kernelFacade.resolveExposureContract as any).mockResolvedValue(null)

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
```

- [ ] **Step 2: Run test — verify failure**

```bash
cd apps/api && bunx vitest run src/modules/agents/infrastructure/guards/exposure-contract.guard.spec.ts
```

- [ ] **Step 3: Implement ExposureContractGuard**

```typescript
// apps/api/src/modules/agents/infrastructure/guards/exposure-contract.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { McpRequestContext } from './mcp-auth.guard'

@Injectable()
export class ExposureContractGuard implements CanActivate {
  constructor(private readonly kernelFacade: KernelQueryFacade) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const mcpCtx = request.mcpContext as McpRequestContext

    // Human users (JWT auth) bypass exposure contract checks.
    // Exposure contracts are for external system consumers only.
    if (mcpCtx.actorType !== 'system') {
      return true
    }

    const toolName = this.extractToolName(context)

    const contract = await (this.kernelFacade as any).resolveExposureContract(
      mcpCtx.actorId,
      toolName,
      null,
      mcpCtx.tenantId,
    )

    if (!contract) {
      throw new ForbiddenException(
        `No exposure contract found for tool '${toolName}'. External consumers require an explicit exposure contract.`,
      )
    }

    return true
  }

  private extractToolName(context: ExecutionContext): string {
    // @rekog/mcp-nest passes tool invocation data through the execution context.
    // The tool name is available in the RPC data or the first argument's params.
    try {
      const args = context.getArgs()
      if (args[0]?.params?.name) {
        return args[0].params.name as string
      }
    } catch {
      // fallback
    }

    try {
      const rpcData = context.switchToRpc().getData()
      if (rpcData?.method?.name) {
        return rpcData.method.name as string
      }
    } catch {
      // fallback
    }

    throw new ForbiddenException('Unable to determine tool name from MCP context')
  }
}
```

**Note:** `KernelQueryFacade.resolveExposureContract()` is added in Plans 01-02. The facade method signature: `resolveExposureContract(consumerId: string, toolName: string, resourceId: string | null, tenantId: string)`.

- [ ] **Step 4: Run test — verify pass**
- [ ] **Step 5: Commit**

```
feat(agents): add ExposureContractGuard for deny-by-default external access
```

---

## Task 3: ToolPermission Decorator — Annotate MCP Tools with Required Permissions

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/guards/tool-permission.decorator.ts`
- Create: `apps/api/src/modules/agents/infrastructure/guards/tool-permission.decorator.spec.ts`

A metadata decorator to annotate MCP tool methods with the permission key they require. The `ToolPermissionGuard` reads this metadata.

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/modules/agents/infrastructure/guards/tool-permission.decorator.spec.ts
import { describe, expect, it } from 'vitest'
import { ToolPermission, TOOL_PERMISSION_KEY } from './tool-permission.decorator'
import { Reflector } from '@nestjs/core'

describe('ToolPermission decorator', () => {
  const reflector = new Reflector()

  it('should set permission metadata on the decorated method', () => {
    class TestTool {
      @ToolPermission('people:profile:read')
      async getProfile() {
        return {}
      }
    }

    const permission = reflector.get<string>(TOOL_PERMISSION_KEY, TestTool.prototype.getProfile)

    expect(permission).toBe('people:profile:read')
  })

  it('should set compound permission keys', () => {
    class TestTool {
      @ToolPermission('time:leave:self:submit')
      async submitLeave() {
        return {}
      }
    }

    const permission = reflector.get<string>(TOOL_PERMISSION_KEY, TestTool.prototype.submitLeave)

    expect(permission).toBe('time:leave:self:submit')
  })

  it('should support scope metadata alongside permission', () => {
    class TestTool {
      @ToolPermission('people:profile:read', {
        scopeType: 'department',
      })
      async getTeamProfiles() {
        return {}
      }
    }

    const permission = reflector.get<string>(
      TOOL_PERMISSION_KEY,
      TestTool.prototype.getTeamProfiles,
    )
    expect(permission).toBe('people:profile:read')

    const scopeMeta = reflector.get<{ scopeType?: string }>(
      `${TOOL_PERMISSION_KEY}_scope`,
      TestTool.prototype.getTeamProfiles,
    )
    expect(scopeMeta).toEqual({ scopeType: 'department' })
  })
})
```

- [ ] **Step 2: Run test — verify failure**

```bash
cd apps/api && bunx vitest run src/modules/agents/infrastructure/guards/tool-permission.decorator.spec.ts
```

- [ ] **Step 3: Implement decorator**

```typescript
// apps/api/src/modules/agents/infrastructure/guards/tool-permission.decorator.ts
import { SetMetadata } from '@nestjs/common'

export const TOOL_PERMISSION_KEY = 'tool_permission'

export interface ToolPermissionScopeMeta {
  scopeType?: 'global' | 'department' | 'project' | 'account'
  scopeId?: string
}

/**
 * Decorates an MCP tool method with the permission key it requires.
 * The ToolPermissionGuard reads this metadata to call canDo().
 *
 * @example
 * @Tool({ name: 'people_get_employment_profile', ... })
 * @ToolGuards([ExposureContractGuard, ToolPermissionGuard])
 * @ToolPermission('people:profile:read')
 * async getProfile({ actorId }) { ... }
 */
export function ToolPermission(
  permission: string,
  scope?: ToolPermissionScopeMeta,
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    SetMetadata(TOOL_PERMISSION_KEY, permission)(target, propertyKey!, descriptor)
    if (scope) {
      SetMetadata(`${TOOL_PERMISSION_KEY}_scope`, scope)(target, propertyKey!, descriptor)
    }
    return descriptor
  }
}
```

- [ ] **Step 4: Run test — verify pass**
- [ ] **Step 5: Commit**

```
feat(agents): add @ToolPermission decorator for MCP tool authorization metadata
```

---

## Task 4: ToolPermissionGuard — Authorize Tool Invocations via canDo()

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/guards/tool-permission.guard.ts`
- Create: `apps/api/src/modules/agents/infrastructure/guards/tool-permission.guard.spec.ts`

This guard reads the `@ToolPermission` metadata, calls `canDo()`, and writes an `audit_event` for every tool call (both granted and denied).

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/modules/agents/infrastructure/guards/tool-permission.guard.spec.ts
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

    kernelFacade = {
      canDo: vi.fn(),
    } as unknown as KernelQueryFacade

    auditRepo = {
      insert: vi.fn().mockResolvedValue(undefined),
    } as unknown as IAuditEventRepository

    guard = new ToolPermissionGuard(reflector, kernelFacade, auditRepo)
  })

  function createMockContext(
    mcpContext: Record<string, unknown>,
    toolName: string,
    handler: () => any = () => {},
  ) {
    const request = { mcpContext }
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
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
        {
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          authMethod: 'jwt',
          actorType: 'person',
        },
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
        {
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          authMethod: 'jwt',
          actorType: 'person',
        },
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
        {
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          authMethod: 'jwt',
          actorType: 'person',
        },
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
        {
          actorId: ACTOR_ID,
          tenantId: TENANT_ID,
          authMethod: 'api_key',
          actorType: 'system',
        },
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
```

- [ ] **Step 2: Run test — verify failure**

```bash
cd apps/api && bunx vitest run src/modules/agents/infrastructure/guards/tool-permission.guard.spec.ts
```

- [ ] **Step 3: Implement ToolPermissionGuard**

```typescript
// apps/api/src/modules/agents/infrastructure/guards/tool-permission.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import { TOOL_PERMISSION_KEY, type ToolPermissionScopeMeta } from './tool-permission.decorator'
import type { McpRequestContext } from './mcp-auth.guard'

@Injectable()
export class ToolPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly kernelFacade: KernelQueryFacade,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const mcpCtx = request.mcpContext as McpRequestContext
    const toolName = this.extractToolName(context)
    const handler = context.getHandler()

    const permission = this.reflector.get<string | undefined>(TOOL_PERMISSION_KEY, handler)
    const scopeMeta = this.reflector.get<ToolPermissionScopeMeta | undefined>(
      `${TOOL_PERMISSION_KEY}_scope`,
      handler,
    )

    let result: 'granted' | 'denied' = 'granted'

    if (permission) {
      const canDoContext: Record<string, unknown> = {
        tenantId: mcpCtx.tenantId,
      }
      if (scopeMeta?.scopeType) {
        canDoContext.scopeType = scopeMeta.scopeType
      }
      if (scopeMeta?.scopeId) {
        canDoContext.scopeId = scopeMeta.scopeId
      }

      const allowed = await (this.kernelFacade as any).canDo(
        mcpCtx.actorId,
        permission,
        canDoContext,
      )

      if (!allowed) {
        result = 'denied'
      }
    }

    // Write audit event for every tool call — both granted and denied
    await this.writeAuditEvent(mcpCtx, toolName, permission ?? null, result, context)

    if (result === 'denied') {
      throw new ForbiddenException(`Permission '${permission}' denied for tool '${toolName}'`)
    }

    return true
  }

  private async writeAuditEvent(
    mcpCtx: McpRequestContext,
    toolName: string,
    permission: string | null,
    result: 'granted' | 'denied',
    context: ExecutionContext,
  ): Promise<void> {
    const args = this.extractSanitizedArgs(context)

    await this.auditRepo.insert({
      tenantId: mcpCtx.tenantId,
      actorId: mcpCtx.actorId,
      eventType: 'agent.tool_call',
      module: 'agents',
      subjectId: mcpCtx.actorId,
      payload: {
        tool: toolName,
        permission,
        result,
        via: 'agent',
        authMethod: mcpCtx.authMethod,
        args,
      },
    })
  }

  private extractToolName(context: ExecutionContext): string {
    try {
      const args = context.getArgs()
      if (args[0]?.params?.name) {
        return args[0].params.name as string
      }
    } catch {
      // fallback
    }
    return 'unknown'
  }

  private extractSanitizedArgs(context: ExecutionContext): Record<string, unknown> {
    try {
      const args = context.getArgs()
      const toolArgs = args[0]?.params?.arguments
      if (!toolArgs || typeof toolArgs !== 'object') return {}

      // Sanitize: remove sensitive fields before audit logging
      const sanitized = { ...toolArgs }
      const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'api_key', 'credential']
      for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
          sanitized[key] = '[REDACTED]'
        }
      }
      return sanitized
    } catch {
      return {}
    }
  }
}
```

- [ ] **Step 4: Run test — verify pass**
- [ ] **Step 5: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
feat(agents): add ToolPermissionGuard with canDo() check and audit trail
```

---

## Task 5: Guard Index Export and MCP Module Wiring

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/guards/index.ts`
- Modify: `apps/api/src/modules/agents/agents.module.ts`

Wire all guards together and register them in the agents module so they are available for DI.

- [ ] **Step 1: Create guard barrel export**

```typescript
// apps/api/src/modules/agents/infrastructure/guards/index.ts
export { McpAuthGuard, type McpRequestContext } from './mcp-auth.guard'
export { ExposureContractGuard } from './exposure-contract.guard'
export { ToolPermissionGuard } from './tool-permission.guard'
export {
  ToolPermission,
  TOOL_PERMISSION_KEY,
  type ToolPermissionScopeMeta,
} from './tool-permission.decorator'
```

- [ ] **Step 2: Update AgentsModule to register guards as providers**

```typescript
// apps/api/src/modules/agents/agents.module.ts
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AgentsQueryFacade } from './application/facades/agents-query.facade'
import { AgentPermissionService } from './application/services/agent-permission.service'
import { McpAuthGuard } from './infrastructure/guards/mcp-auth.guard'
import { ExposureContractGuard } from './infrastructure/guards/exposure-contract.guard'
import { ToolPermissionGuard } from './infrastructure/guards/tool-permission.guard'
import { KernelModule } from '../kernel/kernel.module'

@Module({
  imports: [
    KernelModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  providers: [
    AgentsQueryFacade,
    AgentPermissionService,
    McpAuthGuard,
    ExposureContractGuard,
    ToolPermissionGuard,
  ],
  exports: [
    AgentsQueryFacade,
    AgentPermissionService,
    McpAuthGuard,
    ExposureContractGuard,
    ToolPermissionGuard,
  ],
})
export class AgentsModule {}
```

- [ ] **Step 3: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
feat(agents): wire MCP guard stack into AgentsModule
```

---

## Task 6: AgentPermissionService — Internal Agent Permission Checks

**Files:**

- Create: `apps/api/src/modules/agents/application/services/agent-permission.service.ts`
- Create: `apps/api/src/modules/agents/application/services/agent-permission.service.spec.ts`

Internal agents (in `modules/agents/`) use the user's session `actorId`. Before every tool execution, the agent gateway calls this service to check permission and write audit.

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/modules/agents/application/services/agent-permission.service.spec.ts
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
    kernelFacade = {
      canDo: vi.fn(),
    } as unknown as KernelQueryFacade

    auditRepo = {
      insert: vi.fn().mockResolvedValue(undefined),
    } as unknown as IAuditEventRepository

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
          payload: expect.objectContaining({
            args: { actorId: ACTOR_ID, someField: 'value' },
          }),
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
```

- [ ] **Step 2: Run test — verify failure**

```bash
cd apps/api && bunx vitest run src/modules/agents/application/services/agent-permission.service.spec.ts
```

- [ ] **Step 3: Implement AgentPermissionService**

```typescript
// apps/api/src/modules/agents/application/services/agent-permission.service.ts
import { Inject, Injectable } from '@nestjs/common'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'

export interface CheckToolPermissionParams {
  actorId: string
  tenantId: string
  toolName: string
  permission: string
  scopeType?: 'global' | 'department' | 'project' | 'account'
  scopeId?: string
  resourceOwnerId?: string
  args?: Record<string, unknown>
}

@Injectable()
export class AgentPermissionService {
  constructor(
    private readonly kernelFacade: KernelQueryFacade,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  /**
   * Check if the given actor has permission to execute an agent tool.
   * Writes an audit_event regardless of the outcome.
   *
   * Used by the internal agent gateway before every tool execution.
   * The agent acts on behalf of the user — it inherits the user's actorId
   * and can never do more than the user's roles + delegations allow.
   */
  async checkToolPermission(params: CheckToolPermissionParams): Promise<boolean> {
    const { actorId, tenantId, toolName, permission, scopeType, scopeId, resourceOwnerId, args } =
      params

    const canDoContext: Record<string, unknown> = { tenantId }
    if (scopeType) canDoContext.scopeType = scopeType
    if (scopeId) canDoContext.scopeId = scopeId
    if (resourceOwnerId) canDoContext.resourceOwnerId = resourceOwnerId

    const allowed = await (this.kernelFacade as any).canDo(actorId, permission, canDoContext)

    const result = allowed ? 'granted' : 'denied'

    await this.auditRepo.insert({
      tenantId,
      actorId,
      eventType: 'agent.tool_call',
      module: 'agents',
      subjectId: actorId,
      payload: {
        tool: toolName,
        permission,
        result,
        via: 'agent',
        authMethod: 'session',
        args: args ? this.sanitizeArgs(args) : undefined,
      },
    })

    return allowed
  }

  private sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...args }
    const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'api_key', 'credential']
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]'
      }
    }
    return sanitized
  }
}
```

- [ ] **Step 4: Run test — verify pass**
- [ ] **Step 5: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
feat(agents): add AgentPermissionService for internal agent permission checks
```

---

## Task 7: MCP Tool Wiring Example — People Module MCP Tools

**Files:**

- Create: `apps/api/src/modules/people/interface/mcp/people-mcp.tools.ts`
- Create: `apps/api/src/modules/people/interface/mcp/people-mcp.tools.spec.ts`

Demonstrates the full guard stack applied to a real MCP tool. This is the pattern all modules follow when exposing tools via MCP.

- [ ] **Step 1: Write test for MCP tool with guard stack**

```typescript
// apps/api/src/modules/people/interface/mcp/people-mcp.tools.spec.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { PeopleMcpTools } from './people-mcp.tools'
import { Reflector } from '@nestjs/core'
import { TOOL_PERMISSION_KEY } from '../../../agents/infrastructure/guards/tool-permission.decorator'
import type { PeopleQueryFacade } from '../../application/facades/people-query.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('PeopleMcpTools', () => {
  let tools: PeopleMcpTools
  let peopleFacade: PeopleQueryFacade
  const reflector = new Reflector()

  beforeEach(() => {
    peopleFacade = {
      getEmploymentProfile: vi.fn(),
    } as unknown as PeopleQueryFacade

    tools = new PeopleMcpTools(peopleFacade)
  })

  describe('metadata', () => {
    it('should have people:profile:read permission on getEmploymentProfile', () => {
      const permission = reflector.get<string>(
        TOOL_PERMISSION_KEY,
        PeopleMcpTools.prototype.getEmploymentProfile,
      )
      expect(permission).toBe('people:profile:read')
    })
  })

  describe('getEmploymentProfile', () => {
    it('should delegate to PeopleQueryFacade', async () => {
      const mockProfile = {
        id: ACTOR_ID,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        employeeCode: 'EMP001',
        status: 'active',
      }
      vi.mocked(peopleFacade.getEmploymentProfile).mockResolvedValue(mockProfile as any)

      const result = await tools.getEmploymentProfile({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
      })

      expect(peopleFacade.getEmploymentProfile).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockProfile, null, 2),
          },
        ],
      })
    })

    it('should return not found message when profile does not exist', async () => {
      vi.mocked(peopleFacade.getEmploymentProfile).mockResolvedValue(null)

      const result = await tools.getEmploymentProfile({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
      })

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: `Employment profile not found for actor ${ACTOR_ID}`,
          },
        ],
        isError: true,
      })
    })
  })
})
```

- [ ] **Step 2: Run test — verify failure**

```bash
cd apps/api && bunx vitest run src/modules/people/interface/mcp/people-mcp.tools.spec.ts
```

- [ ] **Step 3: Implement PeopleMcpTools**

```typescript
// apps/api/src/modules/people/interface/mcp/people-mcp.tools.ts
import { Injectable } from '@nestjs/common'
import { z } from 'zod'
import { PeopleQueryFacade } from '../../application/facades/people-query.facade'
import { ToolPermission } from '../../../agents/infrastructure/guards/tool-permission.decorator'

// Note: @Tool and @ToolGuards decorators are from @rekog/mcp-nest.
// They are applied when the MCP server is configured. Below we show the
// decorator usage pattern. If @rekog/mcp-nest is not yet installed,
// use plain method decorators as placeholders.
//
// When @rekog/mcp-nest is available, the class looks like:
//
// import { Tool, ToolGuards } from '@rekog/mcp-nest'
// import { ExposureContractGuard } from '../../../agents/infrastructure/guards'
// import { ToolPermissionGuard } from '../../../agents/infrastructure/guards'
//
// @Tool({
//   name: 'people_get_employment_profile',
//   description: 'Get employment profile for an actor',
//   parameters: z.object({
//     actorId: z.string().uuid().describe('The actor ID to look up'),
//     tenantId: z.string().uuid().describe('The tenant ID'),
//   }),
// })
// @ToolGuards([ExposureContractGuard, ToolPermissionGuard])
// @ToolPermission('people:profile:read')
// async getEmploymentProfile(...) { ... }

@Injectable()
export class PeopleMcpTools {
  constructor(private readonly peopleFacade: PeopleQueryFacade) {}

  @ToolPermission('people:profile:read')
  async getEmploymentProfile(params: {
    actorId: string
    tenantId: string
  }): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    const profile = await this.peopleFacade.getEmploymentProfile(params.actorId, params.tenantId)

    if (!profile) {
      return {
        content: [
          {
            type: 'text',
            text: `Employment profile not found for actor ${params.actorId}`,
          },
        ],
        isError: true,
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(profile, null, 2),
        },
      ],
    }
  }
}
```

**Full MCP wiring example** (for when `@rekog/mcp-nest` is installed and the MCP module is set up):

```typescript
// Example: apps/api/src/mcp/mcp.module.ts (future, not created in this plan)
import { Module } from '@nestjs/common'
import { McpModule } from '@rekog/mcp-nest'
import { uuidv7 } from 'uuidv7'
import { McpAuthGuard } from '../modules/agents/infrastructure/guards/mcp-auth.guard'
import { AgentsModule } from '../modules/agents/agents.module'

@Module({
  imports: [
    AgentsModule, // provides McpAuthGuard, ExposureContractGuard, ToolPermissionGuard
    McpModule.forRoot({
      name: 'future-mcp-server',
      version: '1.0.0',
      guards: [McpAuthGuard], // global auth on all MCP endpoints
      streamableHttp: {
        enableJsonResponse: false,
        sessionIdGenerator: () => uuidv7(),
      },
    }),
  ],
})
export class FutureMcpModule {}
```

```typescript
// Example: full tool with all three guards applied
import { Injectable } from '@nestjs/common'
import { Tool, ToolGuards } from '@rekog/mcp-nest'
import { z } from 'zod'
import { ExposureContractGuard } from '../modules/agents/infrastructure/guards/exposure-contract.guard'
import { ToolPermissionGuard } from '../modules/agents/infrastructure/guards/tool-permission.guard'
import { ToolPermission } from '../modules/agents/infrastructure/guards/tool-permission.decorator'
import { PeopleQueryFacade } from '../modules/people/application/facades/people-query.facade'

@Injectable()
export class PeopleMcpToolsFull {
  constructor(private readonly peopleFacade: PeopleQueryFacade) {}

  @Tool({
    name: 'people_get_employment_profile',
    description: 'Get employment profile for an actor by their actor ID',
    parameters: z.object({
      actorId: z.string().uuid().describe('The actor ID to look up'),
    }),
  })
  @ToolGuards([ExposureContractGuard, ToolPermissionGuard])
  @ToolPermission('people:profile:read')
  async getEmploymentProfile({ actorId }: { actorId: string }) {
    // McpAuthGuard already ran -> mcpContext.actorId + tenantId available
    // ExposureContractGuard already ran -> system actors verified against exposure_contract
    // ToolPermissionGuard already ran -> canDo() passed + audit_event written
    // Safe to execute:
    const tenantId = '' // resolved from request.mcpContext.tenantId by guard
    const profile = await this.peopleFacade.getEmploymentProfile(actorId, tenantId)

    if (!profile) {
      return {
        content: [{ type: 'text' as const, text: `Profile not found for ${actorId}` }],
        isError: true,
      }
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(profile, null, 2) }],
    }
  }

  @Tool({
    name: 'people_list_team_profiles',
    description: 'List employment profiles for a department team',
    parameters: z.object({
      departmentId: z.string().uuid().describe('The department ID'),
    }),
  })
  @ToolGuards([ExposureContractGuard, ToolPermissionGuard])
  @ToolPermission('people:profile:team:read', { scopeType: 'department' })
  async listTeamProfiles({ departmentId }: { departmentId: string }) {
    // scope-aware: ToolPermissionGuard passes scopeType: 'department' to canDo()
    return {
      content: [{ type: 'text' as const, text: '[]' }],
    }
  }
}
```

- [ ] **Step 4: Run test — verify pass**
- [ ] **Step 5: Commit**

```
feat(people): add MCP tools with guard stack wiring example
```

---

## Task 8: Internal Agent Gateway Integration Example

**Files:**

- Create: `apps/api/src/modules/agents/application/services/agent-tool-executor.ts`
- Create: `apps/api/src/modules/agents/application/services/agent-tool-executor.spec.ts`

Shows how the internal agent gateway uses `AgentPermissionService` before every tool execution. This is the integration point between the agent runtime and the permission system.

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/modules/agents/application/services/agent-tool-executor.spec.ts
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
```

- [ ] **Step 2: Run test — verify failure**

```bash
cd apps/api && bunx vitest run src/modules/agents/application/services/agent-tool-executor.spec.ts
```

- [ ] **Step 3: Implement AgentToolExecutor**

````typescript
// apps/api/src/modules/agents/application/services/agent-tool-executor.ts
import { ForbiddenException, Injectable } from '@nestjs/common'
import { AgentPermissionService } from './agent-permission.service'

export interface ExecuteToolParams<T = unknown> {
  actorId: string
  tenantId: string
  toolName: string
  permission: string
  args: Record<string, unknown>
  scopeType?: 'global' | 'department' | 'project' | 'account'
  scopeId?: string
  resourceOwnerId?: string
  execute: () => Promise<T>
}

/**
 * Used by the internal agent gateway (SessionManager -> TopicRouter -> here)
 * to execute tools with permission checks and audit trail.
 *
 * The agent acts ON BEHALF OF the user. It inherits the user's actorId
 * and can never do more than the user's roles + delegations allow.
 *
 * Usage in agent gateway:
 * ```
 * // Inside the agent's tool execution pipeline:
 * const result = await agentToolExecutor.executeTool({
 *   actorId: session.actorId,      // from user session JWT
 *   tenantId: session.tenantId,    // from user session JWT
 *   toolName: 'people_get_employment_profile',
 *   permission: 'people:profile:read',
 *   args: { actorId: targetActorId },
 *   execute: () => peopleFacade.getEmploymentProfile(targetActorId, session.tenantId),
 * })
 * ```
 */
@Injectable()
export class AgentToolExecutor {
  constructor(private readonly permissionService: AgentPermissionService) {}

  async executeTool<T = unknown>(params: ExecuteToolParams<T>): Promise<T> {
    const {
      actorId,
      tenantId,
      toolName,
      permission,
      args,
      scopeType,
      scopeId,
      resourceOwnerId,
      execute,
    } = params

    const allowed = await this.permissionService.checkToolPermission({
      actorId,
      tenantId,
      toolName,
      permission,
      scopeType,
      scopeId,
      resourceOwnerId,
      args,
    })

    if (!allowed) {
      throw new ForbiddenException(
        `Agent permission denied: '${permission}' for tool '${toolName}'`,
      )
    }

    return execute()
  }
}
````

- [ ] **Step 4: Run test — verify pass**
- [ ] **Step 5: Commit**

```
feat(agents): add AgentToolExecutor for internal agent gateway integration
```

---

## Task 9: Commit and Verify All Tests Pass

- [ ] **Step 1: Run all agent guard tests**

```bash
cd apps/api && bunx vitest run src/modules/agents/infrastructure/guards/
```

- [ ] **Step 2: Run all agent service tests**

```bash
cd apps/api && bunx vitest run src/modules/agents/application/services/
```

- [ ] **Step 3: Run people MCP tool tests**

```bash
cd apps/api && bunx vitest run src/modules/people/interface/mcp/
```

- [ ] **Step 4: Run full test suite to verify no regressions**

```bash
cd apps/api && bunx vitest run
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

- [ ] **Step 6: Final commit if any fixups needed**

```
chore(agents): verify agent access control test suite passes
```

---

## Files Created/Modified (Summary)

| Action | File                                                                                  |
| ------ | ------------------------------------------------------------------------------------- |
| Create | `apps/api/src/modules/agents/infrastructure/guards/mcp-auth.guard.ts`                 |
| Create | `apps/api/src/modules/agents/infrastructure/guards/mcp-auth.guard.spec.ts`            |
| Create | `apps/api/src/modules/agents/infrastructure/guards/exposure-contract.guard.ts`        |
| Create | `apps/api/src/modules/agents/infrastructure/guards/exposure-contract.guard.spec.ts`   |
| Create | `apps/api/src/modules/agents/infrastructure/guards/tool-permission.decorator.ts`      |
| Create | `apps/api/src/modules/agents/infrastructure/guards/tool-permission.decorator.spec.ts` |
| Create | `apps/api/src/modules/agents/infrastructure/guards/tool-permission.guard.ts`          |
| Create | `apps/api/src/modules/agents/infrastructure/guards/tool-permission.guard.spec.ts`     |
| Create | `apps/api/src/modules/agents/infrastructure/guards/index.ts`                          |
| Modify | `apps/api/src/modules/agents/agents.module.ts`                                        |
| Create | `apps/api/src/modules/agents/application/services/agent-permission.service.ts`        |
| Create | `apps/api/src/modules/agents/application/services/agent-permission.service.spec.ts`   |
| Create | `apps/api/src/modules/agents/application/services/agent-tool-executor.ts`             |
| Create | `apps/api/src/modules/agents/application/services/agent-tool-executor.spec.ts`        |
| Create | `apps/api/src/modules/people/interface/mcp/people-mcp.tools.ts`                       |
| Create | `apps/api/src/modules/people/interface/mcp/people-mcp.tools.spec.ts`                  |

## Architecture Diagram

```
                    EXTERNAL MCP CLIENT
                           |
                    /mcp/{module} (HTTP+SSE)
                           |
                    +------v-------+
                    | McpAuthGuard |  (Bearer JWT or API key -> actorId + tenantId)
                    +------+-------+
                           |
                +----------v-----------+
                | ExposureContractGuard |  (system actors only: check exposure_contract)
                +----------+-----------+
                           |
                +----------v-----------+
                | ToolPermissionGuard   |  (canDo() + audit_event)
                +----------+-----------+
                           |
                    +------v-------+
                    |  MCP Tool    |
                    +--------------+


                    INTERNAL AGENT (WebSocket / Teams / Slack)
                           |
                    +------v-----------+
                    | Agent Gateway     |  (resolves actorId from user session)
                    +------+-----------+
                           |
                +----------v-----------+
                | AgentToolExecutor     |
                +----------+-----------+
                           |
                +----------v-----------+
                | AgentPermissionService|  (canDo() + audit_event)
                +----------+-----------+
                           |
                    +------v-------+
                    | CommandBus   |  (domain command execution)
                    +--------------+
```

## Dependencies on Other Plans

This plan assumes the following exist from Plans 01-02:

1. `KernelQueryFacade.canDo(actorId, permission, context)` — permission resolution
2. `KernelQueryFacade.resolveExposureContract(consumerId, toolName, resourceId, tenantId)` — exposure contract lookup
3. `KernelQueryFacade.validateApiKey(keyHash, tenantId)` — API key validation returning `{ actorId, tenantId } | null`
4. `exposure_contract` table in `core` schema — deny-by-default access control for external consumers
5. `api_key` table in `identity` schema — API key storage with SHA-256 hash
6. System actors (`actor.type = 'system'`) — created via admin UI for integrations

If any of these do not yet exist when this plan is executed, the guard implementations use `(this.kernelFacade as any)` casts to avoid compile errors. Once the dependency plans land, remove the casts and add proper types.
