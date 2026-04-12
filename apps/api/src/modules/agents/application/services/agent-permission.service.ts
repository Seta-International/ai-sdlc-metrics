import { Injectable } from '@nestjs/common'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { CanDoContext } from '../../../kernel/application/queries/can-do.query'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

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
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async checkToolPermission(params: CheckToolPermissionParams): Promise<boolean> {
    const { actorId, tenantId, toolName, permission, scopeType, scopeId, resourceOwnerId, args } =
      params

    const canDoContext: CanDoContext = { tenantId }
    if (scopeType) canDoContext.scopeType = scopeType
    if (scopeId) canDoContext.scopeId = scopeId
    if (resourceOwnerId) canDoContext.resourceOwnerId = resourceOwnerId

    const allowed = await this.kernelFacade.canDo(actorId, permission, canDoContext)
    const result = allowed ? 'granted' : 'denied'

    try {
      await this.auditFacade.recordEvent({
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
    } catch {
      // Audit failure must not mask the permission result
    }

    return allowed
  }

  private sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...args }
    const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'api_key', 'credential']
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
        sanitized[key] = '[REDACTED]'
      }
    }
    return sanitized
  }
}
