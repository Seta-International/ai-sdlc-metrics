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

  app.get('/:provider/callback', async (c) => {
    const providerId = c.req.param('provider')
    const provider = deps.providers[providerId]
    if (!provider) throw new BadRequest(`unknown provider '${providerId}'`)

    const adminConsent = c.req.query('admin_consent')
    const tenantHint = c.req.query('tenant')
    const state = c.req.query('state')
    const error = c.req.query('error')
    const errorDesc = c.req.query('error_description')

    if (error)
      throw new BadRequest(`admin consent declined: ${error}${errorDesc ? ` (${errorDesc})` : ''}`)
    if (adminConsent !== 'True' || !tenantHint || !state)
      throw new BadRequest('missing admin_consent / tenant / state')

    const stateRow = await deps.stateStore.consume(state)
    if (!stateRow) throw new BadRequest('consent state expired or already used')
    if (stateRow.providerId !== providerId) throw new BadRequest('state/provider mismatch')

    const { tenantId, appOnlyBundle } = await provider.completeAdminConsent({
      tenantQueryParam: tenantHint,
      state,
    })

    if (tenantId !== tenantHint) {
      await deps.audit?.recordAudit({
        tenantId: tenantHint,
        actor: { type: 'system', label: 'oauth-callback' },
        providerId,
        operation: 'oauth.admin_consent_tid_mismatch',
        result: 'failure',
        metadata: { tenant_hint: tenantHint, token_tid: tenantId },
      })
      throw new BadRequest('tenant tid mismatch')
    }

    if (deps.onConsented) {
      await deps.onConsented({
        tenantId,
        connectorIds: stateRow.connectorIds,
        scopesGranted: deps.registry.scopeUnion(stateRow.connectorIds),
      })
    }

    const clientId = (provider as unknown as { cfg: { clientId: string } }).cfg.clientId
    if (deps.vault) {
      await deps.vault.put(tenantId, providerId, `app:${clientId}`, appOnlyBundle)
    }

    await deps.audit?.recordAudit({
      tenantId,
      actor: { type: 'system', label: 'oauth-callback' },
      providerId,
      operation: 'oauth.admin_consent',
      result: 'ok',
      metadata: { connector_ids: stateRow.connectorIds },
    })

    return c.html(`<!doctype html><html><body>
<h1>Connected</h1>
<p>Your team can now @ mention SetaAgent in Microsoft Teams.</p>
</body></html>`)
  })

  return app
}
