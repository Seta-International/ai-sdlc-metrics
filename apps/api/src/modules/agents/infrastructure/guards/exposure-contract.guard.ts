import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { McpRequestContext } from './mcp-auth.guard'

@Injectable()
export class ExposureContractGuard implements CanActivate {
  constructor(private readonly kernelFacade: KernelQueryFacade) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const mcpCtx = request.mcpContext as McpRequestContext | undefined
    if (!mcpCtx) {
      throw new UnauthorizedException('MCP context is missing; McpAuthGuard must run first')
    }

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

    throw new InternalServerErrorException('Unable to determine tool name from MCP context')
  }
}
