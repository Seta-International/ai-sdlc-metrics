import { ServiceUnavailable } from '@seta/middleware'
import { logger } from '@seta/observability'
import { getBotToken } from './bot-token'
import type { OutboundActivity } from './handler'

const log = logger.child({ component: 'teams-reply' })

export async function replyToActivity(
  serviceUrl: string,
  conversationId: string,
  activity: OutboundActivity,
  opts: { botId: string; botSecret: string; botTenantId: string },
): Promise<void> {
  const token = await getBotToken(opts.botId, opts.botSecret, opts.botTenantId)
  const res = await fetch(`${serviceUrl}/v3/conversations/${conversationId}/activities`, {
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
