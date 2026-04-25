import { Controller, Post, Req, Res, Param } from '@nestjs/common'
import { JwtService } from '../../../../common/auth/jwt.service'

// Minimal structural types — avoids a direct `fastify` package import that
// bun does not hoist into node_modules (fastify is a peer dep of platform-fastify).
interface FastifyRequest {
  headers: Record<string, string | string[] | undefined>
}
interface FastifyReply {
  status(code: number): this
  send(body?: unknown): void
}
import { ActiveTurnRegistry } from '../../application/services/active-turn-registry'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { CrossPodCancelService } from '../../infrastructure/cross-pod-cancel'
import { extractSessionToken } from './session-token-extractor'

@Controller()
export class AgentCancelController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly activeTurnRegistry: ActiveTurnRegistry,
    private readonly kernelQueryFacade: KernelQueryFacade,
    private readonly kernelAuditFacade: KernelAuditFacade,
    private readonly crossPodCancelService: CrossPodCancelService,
  ) {}

  @Post('/api/agent/turn/:trace_id/cancel')
  async cancelTurn(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @Param('trace_id') traceId: string,
  ): Promise<void> {
    const cookieHeader = (req.headers as Record<string, string | undefined>)['cookie']
    const token = extractSessionToken(cookieHeader)

    if (!token) {
      res.status(401).send({ message: 'Unauthorized' })
      return
    }

    const session = await this.jwtService.verify(token)
    if (!session) {
      res.status(401).send({ message: 'Unauthorized' })
      return
    }

    const { sub: userId, tid: tenantId, roles } = session

    const entry = this.activeTurnRegistry.getEntry(traceId)
    if (!entry) {
      // Turn is not on this pod — attempt cross-pod forwarding
      const result = await this.crossPodCancelService.forwardIfNeeded(traceId)
      if (result.status === 'forwarded') {
        res.status(200).send({ cancelled: true, eventual: false })
        return
      }
      if (result.status === 'eventual') {
        res.status(202).send({ cancelled: true, eventual: true })
        return
      }
      // 'not_found' or 'local' (race condition — just unregistered)
      res.status(404).send({ message: 'Turn not found' })
      return
    }

    const isSelf = entry.userId === userId

    if (isSelf) {
      this.activeTurnRegistry.cancel(traceId)
      res.send({ cancelled: true })
      return
    }

    const isPlatformAdmin = roles.includes('platform_admin')

    if (isPlatformAdmin) {
      const canForceStop = await this.kernelQueryFacade.canDo(userId, 'admin.turn.force_stop', {
        tenantId,
      })
      if (!canForceStop) {
        await this.kernelAuditFacade.recordEvent({
          tenantId,
          actorId: userId,
          eventType: 'agent.turn_force_stopped_attempt_denied',
          module: 'agents',
          subjectId: traceId,
          payload: { turn_owner: entry.userId, actor: userId },
        })
        res.status(403).send({ message: 'Forbidden' })
        return
      }
    } else {
      const canForceStop = await this.kernelQueryFacade.canDo(userId, 'agent.force_stop_turn', {
        tenantId,
      })
      if (!canForceStop) {
        await this.kernelAuditFacade.recordEvent({
          tenantId,
          actorId: userId,
          eventType: 'agent.turn_force_stopped_attempt_denied',
          module: 'agents',
          subjectId: traceId,
          payload: { turn_owner: entry.userId, actor: userId },
        })
        res.status(403).send({ message: 'Forbidden' })
        return
      }
    }

    this.activeTurnRegistry.cancel(traceId)

    await this.kernelAuditFacade.recordEvent({
      tenantId,
      actorId: userId,
      eventType: 'agent.turn_force_stopped',
      module: 'agents',
      subjectId: traceId,
      payload: { cancelled_by: userId, turn_owner: entry.userId },
    })

    res.send({ cancelled: true, eventual: false })
  }
}
