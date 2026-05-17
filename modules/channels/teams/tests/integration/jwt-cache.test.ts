import * as jose from 'jose'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL is required for integration tests')

// Use postgres.js directly — same pool pattern as apps/api/src/main.ts
const postgres = await import('postgres')
const sql = postgres.default(DATABASE_URL)

const { privateKey, publicKey } = await jose.generateKeyPair('RS256')
const BOT_ID = 'integration-bot-id'

async function signJwt(): Promise<string> {
  return new jose.SignJWT({ aud: BOT_ID })
    .setProtectedHeader({ alg: 'RS256', kid: 'int-key-1' })
    .setIssuer('https://api.botframework.com')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

async function buildJwks(): Promise<jose.JSONWebKeySet> {
  const pub = await jose.exportJWK(publicKey)
  return { keys: [{ ...pub, kid: 'int-key-1', use: 'sig' }] }
}

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  vi.resetModules()
})
afterAll(async () => {
  server.close()
  await sql`DELETE FROM auth.jwks_cache WHERE key = 'botframework'`
  await sql.end()
})

test('successful verify writes JWKS cache row to DB', async () => {
  const jwks = await buildJwks()
  server.use(
    http.get('https://login.botframework.com/v1/.well-known/keys', () => HttpResponse.json(jwks)),
  )
  const { verifyBotFrameworkJwt } = await import('../../src/jwt.js')
  await verifyBotFrameworkJwt(await signJwt(), BOT_ID, sql as never)

  const rows = await sql<{ key: string }[]>`
    SELECT key FROM auth.jwks_cache WHERE key = 'botframework'
  `
  expect(rows).toHaveLength(1)
})
