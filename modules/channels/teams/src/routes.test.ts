import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import type { TeamsHandler } from './index.js'
import { routes } from './index.js'

const SERVICE_URL = 'https://test-service-url.invalid'
const CONV_ID = 'conv-test-1'
const capturedReplies: unknown[] = []

const BOT_TENANT_ID = 'test-tenant-id'

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
  test('POST /messages with skipJwtVerify returns 200 and fires outbound reply', async () => {
    const app = routes(echoHandler, {
      botId: 'bot-id',
      botSecret: 'bot-secret',
      botTenantId: BOT_TENANT_ID,
      skipJwtVerify: true,
    })

    const res = await app.request('/messages', {
      method: 'POST',
      body: JSON.stringify(buildActivity('ping')),
      headers: { 'content-type': 'application/json' },
    })

    expect(res.status).toBe(200)

    // Wait for setImmediate to flush and the reply to be sent
    await vi.waitFor(() => expect(capturedReplies).toHaveLength(1), { timeout: 2000 })
    expect((capturedReplies[0] as { type: string }).type).toBe('message')
    expect((capturedReplies[0] as { text: string }).text).toBe('echo: ping')
  })

  test('POST /messages without skipJwtVerify returns 401', async () => {
    const app = routes(echoHandler, {
      botId: 'bot-id',
      botSecret: 'bot-secret',
      botTenantId: BOT_TENANT_ID,
    })
    const res = await app.request('/messages', {
      method: 'POST',
      body: JSON.stringify(buildActivity('hi')),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(401)
  })

  test('handler returning null does not fire outbound reply', async () => {
    const noReplyHandler: TeamsHandler = async () => null
    const app = routes(noReplyHandler, {
      botId: 'bot-id',
      botSecret: 'bot-secret',
      botTenantId: BOT_TENANT_ID,
      skipJwtVerify: true,
    })

    await app.request('/messages', {
      method: 'POST',
      body: JSON.stringify({ ...buildActivity(''), type: 'conversationUpdate' }),
      headers: { 'content-type': 'application/json' },
    })

    await new Promise((r) => setTimeout(r, 100))
    expect(capturedReplies).toHaveLength(0)
  })
})
