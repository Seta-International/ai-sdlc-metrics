import { describe, expect, it } from 'vitest'
import { tenantContext } from './context.js'

describe('tenantContext', () => {
  it('throws if accessed outside a run()', () => {
    expect(() => tenantContext.getTenantId()).toThrow(/no tenant/i)
  })

  it('returns the tenantId inside a run()', async () => {
    const tid = '11111111-1111-1111-1111-111111111111'
    const result = await tenantContext.run({ tenantId: tid }, async () => {
      return tenantContext.getTenantId()
    })
    expect(result).toBe(tid)
  })

  it('nested run() inherits parent if not overridden', async () => {
    const parent = '11111111-1111-1111-1111-111111111111'
    const child = '22222222-2222-2222-2222-222222222222'
    const result = await tenantContext.run({ tenantId: parent }, async () => {
      return tenantContext.run({ tenantId: child }, async () => tenantContext.getTenantId())
    })
    expect(result).toBe(child)
  })
})
