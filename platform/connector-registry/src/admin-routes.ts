import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { BadRequest, Forbidden, Unauthorized } from '@seta/middleware'
import type { Context } from 'hono'
import type { ConnectorRegistry } from './types'

export const ConnectorStatus = z.enum(['consented', 'pending', 'failed', 'token-expired'])
export type ConnectorStatus = z.infer<typeof ConnectorStatus>

export const ConnectorAdminRow = z
  .object({
    id: z.string(),
    providerId: z.string(),
    displayName: z.string(),
    description: z.string(),
    customerFacingRationale: z.string(),
    requiredScopes: z.object({
      delegated: z.array(z.string()),
      application: z.array(z.string()),
    }),
    capabilities: z.object({ syncable: z.boolean(), writes: z.boolean() }),
    status: ConnectorStatus,
    lastConsentedAt: z.string().nullable(),
  })
  .openapi('ConnectorAdminRow')

export type ConnectorAdminRow = z.infer<typeof ConnectorAdminRow>

const ConsentUrlBody = z.object({
  tenantId: z.string().uuid().optional(),
  tenantHint: z.string().optional(),
})

const ConsentUrlResponse = z
  .object({ url: z.string().url(), state: z.string() })
  .openapi('ConsentUrlResponse')

export type ConnectorAdminMembershipRole = 'owner' | 'admin' | 'member'

export type ConnectorAdminLookup = (args: {
  userId: string
  tenantId: string
}) => Promise<{ role: ConnectorAdminMembershipRole } | null>

export type CreateConnectorAdminRoutesOpts = {
  registry: ConnectorRegistry
  /** Per-tenant consent status read. Wired by composition root. */
  isConsented: (tenantId: string, connectorId: string) => Promise<boolean>
  /** Optional: enrich rows with last-consented-at timestamp. */
  lastConsentedAt?: (tenantId: string, connectorId: string) => Promise<string | null>
  lookupMembership: ConnectorAdminLookup
  sessionUser?: (c: Context) => string | undefined
  /**
   * Delegated to @seta/oauth — composition root wires this to the same
   * provider + state-store the OAuth callback uses. Keeps this package
   * vendor-neutral while reusing the existing consent-url builder.
   */
  buildConsentUrl: (args: {
    tenantId: string
    providerId: string
    connectorIds: string[]
    tenantHint?: string
  }) => Promise<{ url: string; state: string }>
}

const defaultSessionUser = (c: Context) => (c.get('sessionUser') as { id?: string } | undefined)?.id

export function createConnectorAdminRoutes(opts: CreateConnectorAdminRoutesOpts) {
  const app = new OpenAPIHono()
  const getUser = opts.sessionUser ?? defaultSessionUser

  async function requireMembership(
    c: Context,
    tenantId: string,
  ): Promise<{ role: ConnectorAdminMembershipRole }> {
    const userId = getUser(c)
    if (!userId) throw new Unauthorized('no session user')
    const row = await opts.lookupMembership({ userId, tenantId })
    if (!row) throw new Forbidden('not a member of this tenant')
    return row
  }

  const listRoute = createRoute({
    method: 'get',
    path: '/tenants/{id}/connectors',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(ConnectorAdminRow) } },
        description: 'Connectors visible for this tenant with consent status',
      },
    },
  })

  app.openapi(listRoute, async (c) => {
    const tenantId = c.req.param('id')
    await requireMembership(c, tenantId)
    const defs = opts.registry.list()
    const rows: ConnectorAdminRow[] = await Promise.all(
      defs.map(async (d) => {
        const consented = await opts.isConsented(tenantId, d.id)
        const lastConsentedAt = opts.lastConsentedAt
          ? await opts.lastConsentedAt(tenantId, d.id)
          : null
        return {
          id: d.id,
          providerId: d.providerId,
          displayName: d.displayName,
          description: d.description,
          customerFacingRationale: d.customerFacingRationale,
          requiredScopes: d.requiredScopes,
          capabilities: d.capabilities,
          status: consented ? 'consented' : 'pending',
          lastConsentedAt,
        }
      }),
    )
    return c.json(rows, 200)
  })

  const consentUrlRoute = createRoute({
    method: 'post',
    path: '/tenants/{id}/connectors/{cid}/consent-url',
    request: {
      params: z.object({ id: z.string(), cid: z.string() }),
      body: {
        content: { 'application/json': { schema: ConsentUrlBody } },
        required: false,
      },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: ConsentUrlResponse } },
        description: 'Admin-consent URL for the connector',
      },
    },
  })

  app.openapi(consentUrlRoute, async (c) => {
    const tenantId = c.req.param('id')
    const connectorId = c.req.param('cid')
    await requireMembership(c, tenantId)
    const def = opts.registry.get(connectorId)
    const raw = c.req.header('content-type')?.includes('application/json')
      ? await c.req.json().catch(() => ({}))
      : {}
    const body = ConsentUrlBody.parse(raw)
    if (body.tenantId && body.tenantId !== tenantId) {
      throw new BadRequest('body.tenantId must match route tenant')
    }
    const out = await opts.buildConsentUrl({
      tenantId,
      providerId: def.providerId,
      connectorIds: [connectorId],
      ...(body.tenantHint !== undefined ? { tenantHint: body.tenantHint } : {}),
    })
    return c.json(out, 200)
  })

  return app
}
