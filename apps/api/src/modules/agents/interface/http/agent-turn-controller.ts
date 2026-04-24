import { Controller, Post, Req, Res } from '@nestjs/common'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { JwtService } from '../../../../common/auth/jwt.service'
import { ActiveTurnRegistry } from '../../application/services/active-turn-registry'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { composeTurnAbortSignal, ZERO_USAGE } from '../../application/services/abort-coordinator'
import {
  createStreamGateway,
  EVENT_SCHEMA_VERSION,
} from '../../application/services/stream-gateway'
import { extractSessionToken } from './session-token-extractor'

interface TurnRequestBody {
  surface: string
  conversation_id?: string
  user_utterance: string
  context: { current_screen: string; selection?: unknown }
}

@Controller()
export class AgentTurnController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly activeTurnRegistry: ActiveTurnRegistry,
    private readonly kernelAuditFacade: KernelAuditFacade,
  ) {}

  @Post('/api/agent/turn')
  async streamTurn(
    @Req() req: FastifyRequest<{ Body: TurnRequestBody }>,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const cookieHeader = (req.headers as Record<string, string | undefined>)['cookie']
    const token = extractSessionToken(cookieHeader)

    if (!token) {
      res.raw.writeHead(401, { 'Content-Type': 'application/json' })
      res.raw.end(JSON.stringify({ message: 'Unauthorized' }))
      return
    }

    const session = await this.jwtService.verify(token)
    if (!session) {
      res.raw.writeHead(401, { 'Content-Type': 'application/json' })
      res.raw.end(JSON.stringify({ message: 'Unauthorized' }))
      return
    }

    const { sub: userId, tid: tenantId } = session
    const traceId = crypto.randomUUID()
    const body = req.body as TurnRequestBody
    const conversationId = body?.conversation_id ?? null
    const surface = body?.surface ?? 'global-chat'

    res.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      event_schema_version: EVENT_SCHEMA_VERSION,
    })

    const writeSseEvent = (raw: string) => {
      res.raw.write(`data: ${raw}\n\n`)
    }

    const { signal, userCancelController, systemAbortController } = composeTurnAbortSignal({
      wallclockMs: 30_000,
    })

    req.raw.on('close', () => {
      userCancelController.abort()
    })

    const gateway = createStreamGateway(writeSseEvent)

    try {
      await this.activeTurnRegistry.register({
        traceId,
        tenantId,
        userId,
        conversationId,
        surface,
        userCancelController,
        systemAbortController,
        turnAbortSignal: signal,
        usageAccumulator: { ...ZERO_USAGE },
      })

      if (signal.aborted) {
        gateway.close('cancelled', ZERO_USAGE)
        return
      }

      gateway.emit({ type: 'turn.started', payload: { trace_id: traceId } })

      if (signal.aborted) {
        gateway.close('cancelled', ZERO_USAGE)
        return
      }

      gateway.emit({ type: 'phase.started', payload: { phase: 'routing' } })

      if (!signal.aborted) {
        gateway.emit({
          type: 'answer.shape_declared',
          payload: { format: 'markdown', locale: 'en' },
        })
      }

      if (!signal.aborted) {
        gateway.emit({ type: 'answer.token', payload: { token: '' } })
      }

      if (!signal.aborted) {
        gateway.emit({ type: 'answer.complete', payload: {} })
      }

      gateway.close('completed', ZERO_USAGE)
    } catch {
      if (!signal.aborted) {
        gateway.error('internal_error', ZERO_USAGE)
      } else {
        gateway.close('cancelled', ZERO_USAGE)
      }
    } finally {
      await this.activeTurnRegistry.unregister(traceId)
      if (!res.raw.writableEnded) {
        res.raw.end()
      }
    }
  }
}
