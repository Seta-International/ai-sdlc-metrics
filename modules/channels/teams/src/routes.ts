import { SpanStatusCode, trace } from '@opentelemetry/api'
import { onError } from '@seta/middleware'
import { logger } from '@seta/observability'
import { Hono } from 'hono'
import { type Activity, ActivitySchema } from './activity.js'
import type { OutboundActivity, RunContext, TeamsHandler } from './handler.js'
import { verifyBotFrameworkJwt } from './jwt.js'
import { replyToActivity } from './reply.js'

type Sql = {
  <T extends Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>
  json: (value: object) => unknown
}

export interface TeamsRouterOpts {
  botId: string
  botSecret: string
  botTenantId: string
  sql: Sql
}

const tracer = trace.getTracer('@seta/ms-teams')

export function routes(handler: TeamsHandler, opts: TeamsRouterOpts): Hono {
  const app = new Hono().onError(onError) // maps DomainError subclasses to correct HTTP status

  app.post('/messages', async (c) => {
    const auth = c.req.header('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth
    await verifyBotFrameworkJwt(token, opts.botId, opts.sql)

    const body = await c.req.json()
    const activity = ActivitySchema.parse(body)

    // Return 200 immediately — Bot Framework requires HTTP ACK before the bot replies
    setImmediate(() => {
      dispatchActivity(activity, handler, opts).catch((err) => {
        logger.error({ err }, 'teams dispatch failed')
      })
    })

    return c.body(null, 200)
  })

  app.get('/health', (c) => c.json({ ok: true }))
  return app
}

export const teamsRouter = routes

async function dispatchActivity(
  activity: Activity,
  handler: TeamsHandler,
  opts: TeamsRouterOpts,
): Promise<void> {
  await tracer.startActiveSpan('teams.activity.message', async (span) => {
    span.setAttributes({ 'conversation.type': activity.conversation.conversationType })
    try {
      const runCtx: RunContext = {
        tenantId: activity.channelData?.tenant?.id ?? 'unknown',
        userId: activity.from.aadObjectId ?? 'unknown',
      }

      const reply: OutboundActivity | null = await handler(activity, runCtx)

      if (reply) {
        await replyToActivity(activity.serviceUrl, activity.conversation.id, reply, opts)
      }
      span.setAttribute('result', 'ok')
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR })
      logger.error({ err }, 'teams activity dispatch error')
    } finally {
      span.end()
    }
  })
}
