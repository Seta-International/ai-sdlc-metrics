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
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
        sanitized[key] = '[REDACTED]'
      }
    }
    return sanitized
  }
}
