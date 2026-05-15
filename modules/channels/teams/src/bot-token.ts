import { ServiceUnavailable } from '@seta/middleware'
import { logger } from '@seta/observability'
import { LRUCache } from 'lru-cache'

const log = logger.child({ component: 'bot-token' })
const cache = new LRUCache<'token', string>({ max: 1, ttl: 55 * 60 * 1000 })

export async function getBotToken(botId: string, botSecret: string): Promise<string> {
  const cached = cache.get('token')
  if (cached) {
    log.debug({}, 'bot-token.cache-hit')
    return cached
  }

  const res = await fetch('https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: botId,
      client_secret: botSecret,
      scope: 'https://api.botframework.com/.default',
    }),
  })
  if (!res.ok) throw new ServiceUnavailable(`bot token fetch failed: ${res.status}`)
  const { access_token } = (await res.json()) as { access_token: string }
  cache.set('token', access_token)
  log.info({}, 'bot-token.fetched')
  return access_token
}
