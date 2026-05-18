import { logger } from '@seta/observability'
import * as jose from 'jose'
import { BotFrameworkJwtInvalid } from './errors.js'

const BOT_FRAMEWORK_JWKS_URL = new URL('https://login.botframework.com/v1/.well-known/keys')
const BOT_FRAMEWORK_ISSUER = 'https://api.botframework.com'
const CACHE_KEY = 'botframework'

type Sql = <T extends Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T[]>

// Module-level singletons — one JWKS instance per process lifetime
let JWKS: ReturnType<typeof jose.createRemoteJWKSet> | undefined
let jwksCacheState: jose.JWKSCacheInput = {}

async function initJwks(sql: Sql): Promise<ReturnType<typeof jose.createRemoteJWKSet>> {
  if (JWKS) return JWKS
  const persisted = await readJwksCacheFromDb(sql)
  jwksCacheState = persisted ?? {}
  // Pattern 1: URL object — NOT a string
  JWKS = jose.createRemoteJWKSet(BOT_FRAMEWORK_JWKS_URL, {
    cooldownDuration: 30_000,
    [jose.jwksCache]: jwksCacheState,
  })
  return JWKS
}

export async function verifyBotFrameworkJwt(
  token: string,
  botId: string,
  sql: Sql,
): Promise<jose.JWTPayload> {
  const jwks = await initJwks(sql)
  const prevUat = jwksCacheState.uat

  // Pattern 2: pin algorithms — never allow 'none' or HS variants
  const verifyOpts: jose.JWTVerifyOptions = {
    issuer: BOT_FRAMEWORK_ISSUER,
    audience: botId,
    algorithms: ['RS256'],
    clockTolerance: 60, // Bot Framework clocks drift up to ~60 s
  }

  let payload: jose.JWTPayload
  try {
    const result = await jose.jwtVerify(token, jwks, verifyOpts)
    payload = result.payload
  } catch (err) {
    // Pattern 3: key rotation — retry once on multi-match
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code: string }).code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS'
    ) {
      logger.warn('JWKS multi-match during key rotation — retrying')
      const result = await jose.jwtVerify(token, jwks, verifyOpts)
      payload = result.payload
    } else {
      throw new BotFrameworkJwtInvalid(err instanceof Error ? err.message : String(err))
    }
  }

  // Cache write is best-effort — a DB failure must not invalidate a verified token
  if (jwksCacheState.uat !== prevUat) {
    writeJwksCacheToDb(sql, jwksCacheState).catch((err) => {
      logger.warn({ err }, 'jwks-cache write failed — cache miss on next cold start')
    })
  }

  return payload
}

async function readJwksCacheFromDb(sql: Sql): Promise<jose.JWKSCacheInput | null> {
  const rows = await sql<{ payload: jose.JWKSCacheInput }>`
    SELECT payload FROM auth.jwks_cache WHERE key = ${CACHE_KEY} LIMIT 1
  `
  return rows[0]?.payload ?? null
}

async function writeJwksCacheToDb(sql: Sql, cache: jose.JWKSCacheInput): Promise<void> {
  await sql`
    INSERT INTO auth.jwks_cache (key, payload, updated_at)
    VALUES (${CACHE_KEY}, ${JSON.stringify(cache)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE
      SET payload    = excluded.payload,
          updated_at = NOW()
  `
}
