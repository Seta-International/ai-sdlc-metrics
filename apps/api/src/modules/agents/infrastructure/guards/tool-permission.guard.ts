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
      const canDoContext: Record<string, unknown> = { tenantId: mcpCtx.tenantId }
      if (scopeMeta?.scopeType) canDoContext.scopeType = scopeMeta.scopeType
      if (scopeMeta?.scopeId) canDoContext.scopeId = scopeMeta.scopeId

      const allowed = await (this.kernelFacade as any).canDo(
        mcpCtx.actorId,
        permission,
        canDoContext,
      )
      if (!allowed) result = 'denied'
    }

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
      if (args[0]?.params?.name) return args[0].params.name as string
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
      const sanitized = { ...toolArgs }
      const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'api_key', 'credential']
      for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
          sanitized[key] = '[REDACTED]'
        }
      }
      return sanitized
    } catch {
      return {}
    }
  }
}
