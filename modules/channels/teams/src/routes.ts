import { SpanStatusCode, trace } from '@opentelemetry/api'
import { onError, Unauthorized } from '@seta/middleware'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import { Hono } from 'hono'
import { type Activity, ActivitySchema } from './activity'
import type { OutboundActivity, RunContext, TeamsHandler } from './handler'
import { verifyBotFrameworkJwt } from './jwt'
import { replyToActivity } from './reply'

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

    // channelData.tenant.id is the Teams organisation's Entra tenant ID.
    // Bot Framework JWT tid is botframework.com — not the caller's org.
    const entraTenantId = activity.channelData?.tenant?.id ?? null
    if (!entraTenantId) throw new Unauthorized('Teams activity missing channelData.tenant.id')

    // Resolve Teams organisation (Entra tenant) → SETA tenant via SECURITY DEFINER function
    const rows = await opts.sql<{ tenant_id: string }>`
      SELECT auth.resolve_tenant_by_entra_id(${entraTenantId})::text AS tenant_id
    `
    const setaTenantId = rows[0]?.tenant_id ?? null
    if (!setaTenantId)
      throw new Unauthorized(`Teams organisation ${entraTenantId} is not registered`)

    // Return 200 immediately — Bot Framework requires HTTP ACK before the bot replies
    setImmediate(() => {
      const userId = activity.from.aadObjectId
      tenantContext
        .run({ tenantId: setaTenantId, ...(userId ? { userId } : {}) }, () =>
          dispatchActivity(activity, handler, opts),
        )
        .catch((err) => {
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
        userId: activity.from.aadObjectId ?? 'unknown',
      }

      const reply: OutboundActivity | null = await handler(activity, runCtx)

      if (reply) {
        const tenantId = activity.channelData?.tenant?.id
        if (!tenantId) throw new Error('missing tenant id in activity channelData')
        const enriched = {
          ...reply,
          from: activity.recipient,
          recipient: { id: activity.from.id },
        }
        await replyToActivity(activity.serviceUrl, activity.conversation.id, enriched, {
          ...opts,
          tenantId,
        })
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
