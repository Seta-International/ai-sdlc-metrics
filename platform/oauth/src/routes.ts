import type { AuditWriter } from '@seta/audit'
import type { ConnectorRegistry } from '@seta/connector-registry'
import { BadRequest } from '@seta/middleware'
import { Hono } from 'hono'
import { z } from 'zod'
import type { OAuthProvider } from './provider.js'
import type { StateStore } from './state-store.js'
import type { TokenVault } from './vault.js'

export type OAuthRoutesDeps = {
  providers: Record<string, OAuthProvider>
  registry: ConnectorRegistry
  stateStore: StateStore
  vault?: TokenVault
  audit?: AuditWriter
  redirectBase: string
  onConsented?: (input: {
    tenantId: string
    connectorIds: string[]
    scopesGranted: { delegated: string[]; application: string[] }
  }) => Promise<void>
}

const ConsentUrlBody = z.object({
  connectors: z.array(z.string()).min(1),
  tenantHint: z.string().optional(),
})

export function createOAuthRoutes(deps: OAuthRoutesDeps) {
  const app = new Hono()

  app.post('/:provider/consent-url', async (c) => {
    const providerId = c.req.param('provider')
    const provider = deps.providers[providerId]
    if (!provider) throw new BadRequest(`unknown provider '${providerId}'`)

    const body = ConsentUrlBody.parse(await c.req.json())
    for (const id of body.connectors) {
      const def = deps.registry.get(id)
      if (def.providerId !== providerId) {
        throw new BadRequest(
          `connector '${id}' uses provider '${def.providerId}', not '${providerId}'`,
        )
      }
    }

    const union = deps.registry.scopeUnion(body.connectors)
    const state = await deps.stateStore.mint({ providerId, connectorIds: body.connectors })
    const url = provider.buildAdminConsentUrl({
      scopes: union.application.concat(union.delegated),
      redirectUri: `${deps.redirectBase}/oauth/${providerId}/callback`,
      state,
      ...(body.tenantHint !== undefined ? { tenantHint: body.tenantHint } : {}),
    })
    return c.json({ url, state })
  })

  return app
}
