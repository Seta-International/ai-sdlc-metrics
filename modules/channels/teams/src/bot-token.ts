import { ServiceUnavailable } from '@seta/middleware'
import { logger } from '@seta/observability'
import { LRUCache } from 'lru-cache'

const log = logger.child({ component: 'bot-token' })
const cache = new LRUCache<string, string>({ max: 20, ttl: 55 * 60 * 1000 })

export async function getBotToken(
  botId: string,
  botSecret: string,
  tenantId: string,
): Promise<string> {
  const cacheKey = `${tenantId}:${botId}`
  const cached = cache.get(cacheKey)
  if (cached) {
    log.debug({}, 'bot-token.cache-hit')
    return cached
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
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
  cache.set(cacheKey, access_token)
  try {
    const [, b64 = ''] = access_token.split('.')
    const claims = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    log.info(
      { iss: claims['iss'], aud: claims['aud'], appid: claims['appid'], azp: claims['azp'] },
      'bot-token.fetched',
    )
  } catch {
    log.info({}, 'bot-token.fetched')
  }
  return access_token
}
