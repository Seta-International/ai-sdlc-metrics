export type DevIdentity = {
  tenantId: string | null
  actorId: string | null
}

export function buildRequestIdentity(input: {
  headers: Record<string, unknown>
  environment?: string
}): DevIdentity {
  const env = input.environment ?? process.env['NODE_ENV'] ?? 'development'
  const allowDevHeaders = env === 'development' || env === 'test'

  if (!allowDevHeaders) {
    return { tenantId: null, actorId: null }
  }

  const rawTenant = input.headers['x-future-tenant-id']
  const rawActor = input.headers['x-future-actor-id']

  const tenantId = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant
  const actorId = Array.isArray(rawActor) ? rawActor[0] : rawActor

  return {
    tenantId: typeof tenantId === 'string' ? tenantId : null,
    actorId: typeof actorId === 'string' ? actorId : null,
  }
}
