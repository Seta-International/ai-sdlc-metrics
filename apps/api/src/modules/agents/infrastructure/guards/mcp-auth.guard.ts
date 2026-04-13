import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { createHash } from 'node:crypto'
import type { ActorType } from '@future/core'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'

interface JwtPayload {
  sub: string
  tid: string
  roles: string[]
}

export interface McpRequestContext {
  actorId: string
  tenantId: string
  authMethod: 'jwt' | 'api_key'
  actorType: ActorType
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: any,
    apiKey: string,
    tenantId: string,
  ): Promise<boolean> {
    const keyHash = createHash('sha256').update(apiKey).digest('hex')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
