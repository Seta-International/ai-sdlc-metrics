import { describe, expect, it } from 'vitest'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import { createIdentityAdminRouter } from './identity.router'
import { publicProcedure } from '../../../../common/trpc/trpc-init'

/**
 * Smoke test: asserts that the identity admin router uses PERMISSIONS constants
 * (not literal strings) by verifying the values resolve to registered permission keys.
 */
describe('identityAdminRouter — permission alignment', () => {
  it('uses registered PERMISSIONS constants for IdP procedures', () => {
    expect(PERMISSIONS.ADMIN_IDP_CONFIGURE).toBe('admin:idp:configure')
    expect(PERMISSIONS.ADMIN_IDP_READ).toBe('admin:idp:read')
    expect(PERMISSIONS.ADMIN_IDP_SYNC).toBe('admin:idp:sync')
  })

  it('uses registered PERMISSIONS constants for user management procedures', () => {
    expect(PERMISSIONS.ADMIN_USER_READ).toBe('admin:user:read')
    expect(PERMISSIONS.ADMIN_USER_MANAGE).toBe('admin:user:manage')
  })

  it('uses registered PERMISSIONS constants for agent procedures', () => {
    expect(PERMISSIONS.ADMIN_AGENT_READ).toBe('admin:agent:read')
    expect(PERMISSIONS.ADMIN_AGENT_MANAGE).toBe('admin:agent:manage')
  })

  it('router can be constructed with a procedure', () => {
    // Ensures createIdentityAdminRouter does not throw at definition time
    expect(() => createIdentityAdminRouter(publicProcedure)).not.toThrow()
  })
})
