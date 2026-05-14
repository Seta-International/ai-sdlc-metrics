import { describe, expect, test } from 'vitest'
import type { TeamsHandler } from './index.js'
import { routes } from './index.js'

const stubHandler: TeamsHandler = async () => null

describe('routes', () => {
  test('GET /health returns ok', async () => {
    const app = routes(stubHandler, { botId: 'test-bot', botSecret: 'secret' })
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  test('POST /messages with valid body returns 200', async () => {
    const app = routes(stubHandler, { botId: 'test-bot', botSecret: 'secret' })
    const body = {
      type: 'message',
      serviceUrl: 'https://smba.trafficmanager.net/apis',
      channelId: 'msteams',
      from: { id: 'user-1', aadObjectId: 'aad-object-id-1' },
      conversation: { id: 'conv-1', conversationType: 'personal' },
      recipient: { id: 'bot-1' },
      text: 'hello',
    }
    const res = await app.request('/messages', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(200)
  })
})
