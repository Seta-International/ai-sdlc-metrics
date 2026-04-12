import { describe, expect, it } from 'vitest'

describe('identityRouter', () => {
  it('exports resolveLogin, requestMagicLink, and validateMagicLink procedures', async () => {
    const { identityRouter } = await import('./identity.router')
    expect(identityRouter).toBeDefined()
    expect(identityRouter._def.procedures).toHaveProperty('resolveLogin')
    expect(identityRouter._def.procedures).toHaveProperty('requestMagicLink')
    expect(identityRouter._def.procedures).toHaveProperty('validateMagicLink')
  })
})
