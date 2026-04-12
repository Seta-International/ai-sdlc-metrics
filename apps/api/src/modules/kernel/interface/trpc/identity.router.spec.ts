import { describe, expect, it } from 'vitest'
import { identityRouter } from './identity.router'

describe('identityRouter', () => {
  it('exports resolveLogin, requestMagicLink, and validateMagicLink procedures', () => {
    expect(identityRouter).toBeDefined()
    expect(identityRouter._def.procedures).toHaveProperty('resolveLogin')
    expect(identityRouter._def.procedures).toHaveProperty('requestMagicLink')
    expect(identityRouter._def.procedures).toHaveProperty('validateMagicLink')
  })
})
