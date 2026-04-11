import { describe, expect, it } from 'vitest'

// Test that router procedures exist and have correct types
// Full integration tests require a running tRPC server — here we test the handler wiring

describe('identityRouter', () => {
  it('exports resolveLogin, requestMagicLink, and validateMagicLink procedures', async () => {
    // Dynamic import to avoid module init issues in tests
    const { identityRouter } = await import('./identity.router')

    // Verify router shape has the expected procedures
    expect(identityRouter).toBeDefined()
    expect(identityRouter._def.procedures).toHaveProperty('resolveLogin')
    expect(identityRouter._def.procedures).toHaveProperty('requestMagicLink')
    expect(identityRouter._def.procedures).toHaveProperty('validateMagicLink')
  })
})
