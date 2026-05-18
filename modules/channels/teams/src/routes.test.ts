import * as jose from 'jose'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import type { TeamsHandler } from './index'

const SERVICE_URL = 'https://test-service-url.invalid'
const CONV_ID = 'conv-test-1'
const BOT_ID = 'bot-id'
const BOT_TENANT_ID = 'test-tenant-id'
const capturedReplies: unknown[] = []

const { privateKey, publicKey } = await jose.generateKeyPair('RS256')

async function buildJwks(): Promise<jose.JSONWebKeySet> {
  const pub = await jose.exportJWK(publicKey)
  return { keys: [{ ...pub, kid: 'test-key', use: 'sig' }] }
}

async function signJwt(): Promise<string> {
  return new jose.SignJWT({ aud: BOT_ID })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer('https://api.botframework.com')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

function makeSqlStub() {
  return Object.assign(
    (_strings: TemplateStringsArray, ..._values: unknown[]) => Promise.resolve([]),
    { json: (v: object) => v },
  )
}

const server = setupServer(
  // Bot Framework token endpoint — getBotToken() calls this with the bot's tenant ID
  http.post(`https://login.microsoftonline.com/${BOT_TENANT_ID}/oauth2/v2.0/token`, () =>
    HttpResponse.json({ access_token: 'test-token', expires_in: 3600 }),
  ),
  // Outbound reply endpoint — replyToActivity() posts here
  http.post(`${SERVICE_URL}/v3/conversations/${CONV_ID}/activities`, async ({ request }) => {
    capturedReplies.push(await request.json())
    return HttpResponse.json({})
  }),
)

beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  capturedReplies.length = 0
  vi.restoreAllMocks()
  vi.resetModules()
})
afterAll(() => server.close())

function buildActivity(text: string) {
  return {
    type: 'message',
    serviceUrl: SERVICE_URL,
    channelId: 'msteams',
    from: { id: 'user-1', aadObjectId: 'aad-1' },
    conversation: { id: CONV_ID, conversationType: 'personal' },
    recipient: { id: 'bot-1' },
    channelData: { tenant: { id: 'tenant-1' } },
    text,
  }
}

const echoHandler: TeamsHandler = async (activity) => ({
  type: 'message',
  text: `echo: ${activity.text ?? ''}`,
})

describe('routes', () => {
  test('POST /messages with valid JWT returns 200 and fires outbound reply', async () => {
    const jwks = await buildJwks()
    server.use(
      http.get('https://login.botframework.com/v1/.well-known/keys', () => HttpResponse.json(jwks)),
    )
    const { routes: freshRoutes } = await import('./routes')
    const app = freshRoutes(echoHandler, {
      botId: BOT_ID,
      botSecret: 'bot-secret',
      botTenantId: BOT_TENANT_ID,
      sql: makeSqlStub() as never,
    })

    const token = await signJwt()
    const res = await app.request('/messages', {
      method: 'POST',
      body: JSON.stringify(buildActivity('ping')),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)

    // Wait for setImmediate to flush and the reply to be sent
    await vi.waitFor(() => expect(capturedReplies).toHaveLength(1), { timeout: 2000 })
    expect((capturedReplies[0] as { type: string }).type).toBe('message')
    expect((capturedReplies[0] as { text: string }).text).toBe('echo: ping')
  })

  test('POST /messages with forged token returns 401', async () => {
    const jwks = await buildJwks()
    server.use(
      http.get('https://login.botframework.com/v1/.well-known/keys', () => HttpResponse.json(jwks)),
    )
    const { routes: freshRoutes } = await import('./routes')
    const app = freshRoutes(echoHandler, {
      botId: BOT_ID,
      botSecret: 'bot-secret',
      botTenantId: BOT_TENANT_ID,
      sql: makeSqlStub() as never,
    })
    const res = await app.request('/messages', {
      method: 'POST',
      body: JSON.stringify(buildActivity('hi')),
      headers: { 'content-type': 'application/json', authorization: 'Bearer forged.token.here' },
    })
    expect(res.status).toBe(401)
  })

  test('handler returning null does not fire outbound reply', async () => {
    const jwks = await buildJwks()
    server.use(
      http.get('https://login.botframework.com/v1/.well-known/keys', () => HttpResponse.json(jwks)),
    )
    const noReplyHandler: TeamsHandler = async () => null
    const { routes: freshRoutes } = await import('./routes')
    const app = freshRoutes(noReplyHandler, {
      botId: BOT_ID,
      botSecret: 'bot-secret',
      botTenantId: BOT_TENANT_ID,
      sql: makeSqlStub() as never,
    })

    const token = await signJwt()
    await app.request('/messages', {
      method: 'POST',
      body: JSON.stringify({ ...buildActivity(''), type: 'conversationUpdate' }),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    })

    await new Promise((r) => setTimeout(r, 100))
    expect(capturedReplies).toHaveLength(0)
  })
})
