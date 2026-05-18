import { onError } from '@seta/middleware'
import { describe, expect, it } from 'vitest'
import { createConnectorAdminRoutes } from './admin-routes'
import { createConnectorRegistry } from './runtime'
import type { ConnectorDefinition } from './types'

const plannerDef: ConnectorDefinition = {
  id: 'ms365-planner',
  providerId: 'entra',
  displayName: 'Microsoft Planner',
  description: 'Sync Planner tasks.',
  customerFacingRationale: 'Required so the agent can read tasks.',
  requiredScopes: { delegated: ['Tasks.Read'], application: ['Tasks.Read.All'] },
  capabilities: { syncable: true, writes: false },
}

function build(consented: Set<string>) {
  const registry = createConnectorRegistry(async (_t, id) => consented.has(id))
  registry.register(plannerDef)
  const app = createConnectorAdminRoutes({
    registry,
    isConsented: async (_tenantId, connectorId) => consented.has(connectorId),
    sessionUser: (c) => c.req.header('x-session-user'),
    lookupMembership: async () => ({ role: 'admin' }),
    buildConsentUrl: async ({ tenantId, providerId, connectorIds }) => ({
      url: `https://login.microsoftonline.com/${tenantId}/${providerId}?connectors=${connectorIds.join(',')}`,
      state: 'st_test',
    }),
  })
  app.onError(onError)
  return app
}

describe('createConnectorAdminRoutes', () => {
  it('GET /tenants/:id/connectors joins definitions with consent status', async () => {
    const app = build(new Set(['ms365-planner']))
    const res = await app.request('/tenants/t1/connectors', {
      headers: { 'x-session-user': 'u1' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      expect.objectContaining({ id: 'ms365-planner', providerId: 'entra', status: 'consented' }),
    ])
  })

  it('returns status=pending when no consent row', async () => {
    const app = build(new Set())
    const res = await app.request('/tenants/t1/connectors', {
      headers: { 'x-session-user': 'u1' },
    })
    const body = (await res.json()) as Array<{ status: string }>
    expect(body[0].status).toBe('pending')
  })

  it('POST /connectors/:cid/consent-url delegates to buildConsentUrl', async () => {
    const app = build(new Set())
    const res = await app.request('/tenants/t1/connectors/ms365-planner/consent-url', {
      method: 'POST',
      headers: { 'x-session-user': 'u1', 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      url: expect.stringContaining('connectors=ms365-planner'),
      state: 'st_test',
    })
  })

  it('403 when membership lookup returns null', async () => {
    const registry = createConnectorRegistry(async () => false)
    registry.register(plannerDef)
    const app = createConnectorAdminRoutes({
      registry,
      isConsented: async () => false,
      sessionUser: (c) => c.req.header('x-session-user'),
      lookupMembership: async () => null,
      buildConsentUrl: async () => ({ url: '', state: '' }),
    })
    app.onError(onError)
    const res = await app.request('/tenants/t1/connectors', {
      headers: { 'x-session-user': 'u1' },
    })
    expect(res.status).toBe(403)
  })
})
