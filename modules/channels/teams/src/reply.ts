import { getBotToken } from './bot-token.js'
import type { OutboundActivity } from './handler.js'

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
    throw new Error(`Reply failed: ${res.status} ${await res.text()}`)
  }
}
