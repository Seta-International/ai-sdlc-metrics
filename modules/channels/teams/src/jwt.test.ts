import * as jose from 'jose'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

const BOT_ID = 'test-bot-id'
const { privateKey, publicKey } = await jose.generateKeyPair('RS256')

async function signTestJwt(overrides: Record<string, unknown> = {}): Promise<string> {
  return new jose.SignJWT({ aud: BOT_ID, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setIssuer('https://api.botframework.com')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

async function buildJwks(): Promise<jose.JSONWebKeySet> {
  const pub = await jose.exportJWK(publicKey)
  return { keys: [{ ...pub, kid: 'test-key-1', use: 'sig' }] }
}

// Minimal sql stub — no real DB for unit tests
function makeSqlStub(cacheRow?: jose.JWKSCacheInput) {
  return Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => {
      const query = strings.join('?')
      if (query.includes('SELECT payload'))
        return Promise.resolve(cacheRow ? [{ payload: cacheRow }] : [])
      return Promise.resolve([])
    },
    { json: (v: object) => v },
  )
}

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('verifyBotFrameworkJwt', () => {
  // Reset JWKS singleton between tests via module re-import
  beforeEach(() => {
    vi.resetModules()
  })

  test('valid JWT passes verification and returns payload', async () => {
    const jwks = await buildJwks()
    server.use(
      http.get('https://login.botframework.com/v1/.well-known/keys', () => HttpResponse.json(jwks)),
    )
    const { verifyBotFrameworkJwt } = await import('./jwt.js')
    const token = await signTestJwt()
    const payload = await verifyBotFrameworkJwt(token, BOT_ID, makeSqlStub() as never)
    expect(payload.aud).toBe(BOT_ID)
    expect(payload.iss).toBe('https://api.botframework.com')
  })

  test('expired token throws BotFrameworkJwtInvalid', async () => {
    const jwks = await buildJwks()
    server.use(
      http.get('https://login.botframework.com/v1/.well-known/keys', () => HttpResponse.json(jwks)),
    )
    const { verifyBotFrameworkJwt } = await import('./jwt.js')
    const { BotFrameworkJwtInvalid: JwtError } = await import('./errors.js')
    const token = await new jose.SignJWT({ aud: BOT_ID })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuer('https://api.botframework.com')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey)
    await expect(verifyBotFrameworkJwt(token, BOT_ID, makeSqlStub() as never)).rejects.toThrow(
      JwtError,
    )
  })

  test('wrong audience throws BotFrameworkJwtInvalid', async () => {
    const jwks = await buildJwks()
    server.use(
      http.get('https://login.botframework.com/v1/.well-known/keys', () => HttpResponse.json(jwks)),
    )
    const { verifyBotFrameworkJwt } = await import('./jwt.js')
    const { BotFrameworkJwtInvalid: JwtError } = await import('./errors.js')
    const token = await signTestJwt({ aud: 'wrong-bot-id' })
    await expect(verifyBotFrameworkJwt(token, BOT_ID, makeSqlStub() as never)).rejects.toThrow(
      JwtError,
    )
  })

  test('wrong issuer throws BotFrameworkJwtInvalid', async () => {
    const jwks = await buildJwks()
    server.use(
      http.get('https://login.botframework.com/v1/.well-known/keys', () => HttpResponse.json(jwks)),
    )
    const { verifyBotFrameworkJwt } = await import('./jwt.js')
    const { BotFrameworkJwtInvalid: JwtError } = await import('./errors.js')
    const token = await new jose.SignJWT({ aud: BOT_ID })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuer('https://evil.example.com')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey)
    await expect(verifyBotFrameworkJwt(token, BOT_ID, makeSqlStub() as never)).rejects.toThrow(
      JwtError,
    )
  })

  test('warm-start reads JWKS from DB cache, skips remote fetch', async () => {
    const jwks = await buildJwks()
    // uat is milliseconds (jose uses Date.now() internally); jwks must be the full JSONWebKeySet
    const cacheRow = { jwks, uat: Date.now() + 3_600_000 } as jose.JWKSCacheInput

    let remoteHits = 0
    server.use(
      http.get('https://login.botframework.com/v1/.well-known/keys', () => {
        remoteHits++
        return HttpResponse.json(jwks)
      }),
    )

    const { verifyBotFrameworkJwt } = await import('./jwt.js')
    const token = await signTestJwt()
    await verifyBotFrameworkJwt(token, BOT_ID, makeSqlStub(cacheRow) as never)
    expect(remoteHits).toBe(0)
  })
})
