import { describe, expect, it } from 'vitest'
import { buildRequestIdentity } from './context'

describe('buildRequestIdentity', () => {
  it('reads tenant and actor from dev headers', () => {
    const identity = buildRequestIdentity({
      headers: {
        'x-future-tenant-id': 'tenant-dev',
        'x-future-actor-id': 'actor-dev',
      },
    })
    expect(identity).toEqual({ tenantId: 'tenant-dev', actorId: 'actor-dev' })
  })

  it('ignores spoofable identity headers in production', () => {
    const identity = buildRequestIdentity({
      headers: {
        'x-future-tenant-id': 'tenant-prod',
        'x-future-actor-id': 'actor-prod',
      },
      environment: 'production',
    })
    expect(identity).toEqual({ tenantId: null, actorId: null })
  })
})
