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
