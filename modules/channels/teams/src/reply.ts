import { ServiceUnavailable } from '@seta/middleware'
import { logger } from '@seta/observability'
import { getBotToken } from './bot-token'
import type { OutboundActivity } from './handler'

const log = logger.child({ component: 'teams-reply' })

export async function replyToActivity(
  serviceUrl: string,
  conversationId: string,
  activity: OutboundActivity,
  opts: { botId: string; botSecret: string; tenantId: string },
): Promise<void> {
  const token = await getBotToken(opts.botId, opts.botSecret, opts.tenantId)
  const base = serviceUrl.replace(/\/$/, '')
  const url = `${base}/v3/conversations/${conversationId}/activities`
  log.info({ url, botId: opts.botId }, 'teams.reply-attempt')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(activity),
  })
  if (!res.ok) {
    const body = await res.text()
    log.error(
      { status: res.status },
      `teams.reply-failed serviceUrl: ${serviceUrl}, conversationId: ${conversationId}, activity: ${JSON.stringify(activity)}, responseBody: ${body}`,
    )
    throw new ServiceUnavailable(`teams reply failed: ${res.status} ${body}`)
  }
}
