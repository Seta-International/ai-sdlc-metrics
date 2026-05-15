import { tenantContext } from '@seta/tenant'
import { describe, expect, it } from 'vitest'
import { actorFromContext } from './actor'

const TENANT = '00000000-0000-0000-0000-000000000001'

describe('actorFromContext', () => {
  it('returns user actor when userId in context', async () => {
    await tenantContext.run({ tenantId: TENANT, userId: 'u-1' }, async () => {
      expect(actorFromContext()).toEqual({ type: 'user', userId: 'u-1' })
    })
  })

  it('returns system actor when userId absent', async () => {
    await tenantContext.run({ tenantId: TENANT }, async () => {
      expect(actorFromContext()).toEqual({ type: 'system', label: 'agent-workflows' })
    })
  })

  it('throws if tenantContext missing', () => {
    expect(() => actorFromContext()).toThrow()
  })
})
