import * as jose from 'jose'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import type { TeamsHandler } from './index'
import { routes } from './index'

const { privateKey, publicKey } = await jose.generateKeyPair('RS256')

async function buildJwks(): Promise<jose.JSONWebKeySet> {
  const pub = await jose.exportJWK(publicKey)
  return { keys: [{ ...pub, kid: 'test-key', use: 'sig' }] }
}

async function signJwt(botId: string): Promise<string> {
  return new jose.SignJWT({ aud: botId })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer('https://api.botframework.com')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

function makeSqlStub() {
  return Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => {
      const sql = strings.join('?')
      if (sql.includes('resolve_tenant_by_entra_id')) {
        return Promise.resolve([{ tenant_id: 'cccccccc-4444-5555-6666-dddddddddddd' }])
      }
      return Promise.resolve([])
    },
    { json: (v: object) => v },
  )
}

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  vi.resetModules()
})
afterAll(() => server.close())

const stubHandler: TeamsHandler = async () => null

describe('routes', () => {
  test('GET /health returns ok', async () => {
    const app = routes(stubHandler, {
      botId: 'test-bot',
      botSecret: 'secret',
      sql: makeSqlStub() as never,
    })
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  test('POST /messages with valid body returns 200', async () => {
    const botId = 'test-bot'
    const jwks = await buildJwks()
    server.use(
      http.get('https://login.botframework.com/v1/.well-known/keys', () => HttpResponse.json(jwks)),
    )
    const { routes: freshRoutes } = await import('./routes.js')
    const app = freshRoutes(stubHandler, {
      botId,
      botSecret: 'secret',
      sql: makeSqlStub() as never,
    })
    const body = {
      type: 'message',
      serviceUrl: 'https://smba.trafficmanager.net/apis',
      channelId: 'msteams',
      from: { id: 'user-1', aadObjectId: 'aad-object-id-1' },
      conversation: { id: 'conv-1', conversationType: 'personal' },
      recipient: { id: 'bot-1' },
      channelData: { tenant: { id: 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb' } },
      text: 'hello',
    }
    const token = await signJwt(botId)
    const res = await app.request('/messages', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })
})
