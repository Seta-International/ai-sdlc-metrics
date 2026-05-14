import { logger } from '@seta/observability'
import { getBotToken } from './bot-token'
import type { OutboundActivity } from './handler'

const log = logger.child({ component: 'teams-reply' })

export async function replyToActivity(
  serviceUrl: string,
  conversationId: string,
  activity: OutboundActivity,
  opts: { botId: string; botSecret: string },
): Promise<void> {
  const token = await getBotToken(opts.botId, opts.botSecret)
  const res = await fetch(`${serviceUrl}/v3/conversations/${conversationId}/activities`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(activity),
  })
  if (!res.ok) {
    log.error({ status: res.status }, 'teams.reply-failed')
    throw new Error(`Reply failed: ${res.status} ${await res.text()}`)
  }
}
