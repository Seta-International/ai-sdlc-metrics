import { tenantContext } from '@seta/tenancy'
import { describe, expect, it } from 'vitest'
import { actorFromContext } from './audit'

describe('actorFromContext', () => {
  it('returns user actor when userId present', async () => {
    await tenantContext.run(
      { tenantId: '00000000-0000-0000-0000-000000000001', userId: 'user-1' },
      async () => {
        expect(actorFromContext()).toEqual({ type: 'user', userId: 'user-1' })
      },
    )
  })

  it('returns system actor when userId absent', async () => {
    await tenantContext.run({ tenantId: '00000000-0000-0000-0000-000000000001' }, async () => {
      expect(actorFromContext()).toEqual({ type: 'system', label: 'agent-memory' })
    })
  })

  it('throws if tenantContext missing', () => {
    expect(() => actorFromContext()).toThrow()
  })
})
