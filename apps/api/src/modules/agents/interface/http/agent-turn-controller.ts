import { Controller, Post, Req, Res } from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'http'
import { JwtService } from '../../../../common/auth/jwt.service'
import {
  recordTurnTotal,
  recordTurnDuration,
  recordAbortTotal,
} from '../../infrastructure/observability/streaming-metrics'

// Minimal structural types — avoids a direct `fastify` package import that
// bun does not hoist into node_modules (fastify is a peer dep of platform-fastify).
interface FastifyRequest<RouteGeneric extends { Body?: unknown } = { Body?: unknown }> {
  headers: Record<string, string | string[] | undefined>
  body: RouteGeneric['Body']
  raw: IncomingMessage
}
interface FastifyReply {
  raw: ServerResponse
}
import { ActiveTurnRegistry } from '../../application/services/active-turn-registry'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { composeTurnAbortSignal, ZERO_USAGE } from '../../application/services/abort-coordinator'
import {
  createStreamGateway,
  EVENT_SCHEMA_VERSION,
} from '../../application/services/stream-gateway'
import { extractSessionToken } from './session-token-extractor'
import { BudgetChecker } from '../../application/services/budget-checker'
import { ObservabilityContextFactory } from '../../application/services/observability-context'
import { FlowIdPropagation } from '../../application/services/flow-id-propagation'
import type { IntentSlug } from '../../application/services/flow-id-propagation'

// Fallback intent slug used before the router resolves the actual intent
const UNCLASSIFIED_INTENT = 'unclassified' as IntentSlug

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
    private readonly budgetChecker: BudgetChecker,
    private readonly observabilityContextFactory: ObservabilityContextFactory,
    private readonly flowIdPropagation: FlowIdPropagation,
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

    // ── R-07.44: Mint a flow_id for this turn ─────────────────────────────────
    // intentSlug will be resolved by the router later; use 'unclassified' as the
    // pre-router placeholder (§18.5 — ≤2% unclassified threshold monitors this).
    const requestContext = { tenantId, userId, traceId, surface }
    const flowId = this.flowIdPropagation.mint({
      requestContext,
      intentSlug: UNCLASSIFIED_INTENT,
    })

    // ── R-07.43: Create the root TURN span ────────────────────────────────────
    const obsCtx = this.observabilityContextFactory.create({
      requestContext,
      flowId,
      intentSlug: UNCLASSIFIED_INTENT,
      capture: true,
    })

    // ── R-05.1: Pre-turn budget gate ──────────────────────────────────────────
    const budgetResult = await this.budgetChecker.preTurnCheck({ tenantId, userId })

    if (!budgetResult.allowed) {
      // Emit kernel audit event before refusing
      await this.kernelAuditFacade.recordEvent({
        tenantId,
        actorId: userId,
        eventType: 'agent.turn_refused_budget',
        module: 'agents',
        subjectId: traceId,
        payload: { reason: budgetResult.reason, tier: budgetResult.tier, traceId },
        flowId,
        intentSlug: UNCLASSIFIED_INTENT,
      })

      // Close the root span with error status (budget refused = turn never started)
      obsCtx.currentSpan.end({ status: 'error' })

      res.raw.writeHead(429, { 'Content-Type': 'application/json' })
      res.raw.end(
        JSON.stringify({
          message: 'Budget exceeded',
          reason: 'budget_exceeded',
          budgetReason: budgetResult.reason,
        }),
      )
      return
    }

    // ── R-05.1: Stamp budget_tier on tier shift ───────────────────────────────
    // flow_id and intent_slug are already stamped by ObservabilityContextFactory.create
    // via otelRoot.setAttributes (bypassing the denylist wrapper — that is intentional
    // for middleware-owned identity keys). The controller must NOT duplicate those calls
    // via setAttribute, which would throw via IDENTITY_KEY_DENYLIST on a real OtelSpan.
    // budget_tier is NOT on the denylist and is gated on tierShift so it is safe here.
    if (budgetResult.tierShift) {
      obsCtx.currentSpan.setAttribute('budget_tier', budgetResult.tier)
    }

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

    const gateway = createStreamGateway(writeSseEvent, tenantId)

    // Track turn start time for duration metric (Plan 06 §8).
    const turnStartMs = Date.now()
    let turnEndReason = 'completed'

    let turnError: Error | undefined
    try {
      // budgetResult.tier is 'full' | 'nano' here — 'refused' exits above via 429
      const activeTier = budgetResult.tier as 'full' | 'nano'

      await this.activeTurnRegistry.register({
        traceId,
        tenantId,
        userId,
        conversationId,
        surface,
        tier: activeTier,
        userCancelController,
        systemAbortController,
        turnAbortSignal: signal,
        usageAccumulator: { ...ZERO_USAGE },
      })

      if (signal.aborted) {
        turnEndReason = 'cancelled'
        gateway.close('cancelled', ZERO_USAGE)
        return
      }

      gateway.emit({ type: 'turn.started', payload: { trace_id: traceId, flow_id: flowId } })

      if (signal.aborted) {
        turnEndReason = 'cancelled'
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
    } catch (err) {
      turnError = err instanceof Error ? err : new Error(String(err))
      if (!signal.aborted) {
        turnEndReason = 'error'
        gateway.error('internal_error', ZERO_USAGE)
      } else {
        turnEndReason = 'cancelled'
        gateway.close('cancelled', ZERO_USAGE)
      }
    } finally {
      // ── R-07.43: Close root span with appropriate status ───────────────────
      if (turnError) {
        obsCtx.currentSpan.end({ status: 'error', error: turnError })
      } else {
        obsCtx.currentSpan.end({ status: 'ok' })
      }

      // ── Plan 06 §8: Emit turn total + duration metrics ────────────────────
      const durationMs = Date.now() - turnStartMs
      recordTurnTotal(tenantId, 'bounded', turnEndReason)
      recordTurnDuration(tenantId, turnEndReason, durationMs)

      // Emit abort metric when signal fired (captures source from abort controller state)
      if (signal.aborted) {
        recordAbortTotal(tenantId, 'user', turnEndReason)
      }

      await this.activeTurnRegistry.unregister(traceId)
      if (!res.raw.writableEnded) {
        res.raw.end()
      }
    }
  }
}
