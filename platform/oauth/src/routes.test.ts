import { directoryConnector } from '@seta/connector-ms365-directory'
import { plannerConnector } from '@seta/connector-ms365-planner'
import { createConnectorRegistry } from '@seta/connector-registry'
import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { EntraProvider } from './providers/entra.js'
import { createOAuthRoutes } from './routes.js'
import { createStateStore } from './state-store.js'

const URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

describe('POST /oauth/:provider/consent-url', () => {
  const sql = postgres(URL, { max: 1, prepare: false })
  const registry = createConnectorRegistry()
  registry.register(plannerConnector)
  registry.register(directoryConnector)
  const providers = {
    entra: new EntraProvider({
      clientId: 'client-x',
      clientSecret: 'secret-y',
      ccaFactory: () => ({}) as never,
    }),
  }
  const stateStore = createStateStore(sql)

  const app = new Hono().onError(onError).route(
    '/oauth',
    createOAuthRoutes({
      providers,
      registry,
      stateStore,
      redirectBase: 'https://api.example.com',
    }),
  )

  it('returns a consent URL containing the .default scope and state', async () => {
    const res = await app.request('/oauth/entra/consent-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connectors: ['ms365-planner', 'ms365-directory'] }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string; state: string }
    expect(body.url).toContain('https://login.microsoftonline.com/organizations/v2.0/adminconsent')
    expect(body.url).toContain('scope=https%3A%2F%2Fgraph.microsoft.com%2F.default')
    expect(body.url).toContain(`state=${encodeURIComponent(body.state)}`)
    expect(body.url).toContain(
      'redirect_uri=https%3A%2F%2Fapi.example.com%2Foauth%2Fentra%2Fcallback',
    )
  })

  it('returns 400 for unknown connector id', async () => {
    const res = await app.request('/oauth/entra/consent-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connectors: ['nope'] }),
    })
    expect(res.status).toBe(400)
  })
})
