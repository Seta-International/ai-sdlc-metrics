import { describe, expect, it } from 'vitest'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import { createIdentityAdminRouter } from './identity.router'
import { publicProcedure } from '../../../../common/trpc/trpc-init'

/**
 * Structural test: verifies that each identity admin procedure carries the
 * correct `meta.permission` value from the central PERMISSIONS registry.
 *
 * Testing `_def.procedures[name].meta.permission` (tRPC internals) is
 * intentional — it catches wiring mistakes (wrong constant, missing `.meta()`)
 * at the callsite rather than at auth enforcement time.
 */
describe('identityAdminRouter — permission metadata (structural)', () => {
  // Build the router once with publicProcedure so no auth middleware fires.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = createIdentityAdminRouter(publicProcedure) as any
  const procs = r._def.procedures

  function permOf(name: string): string {
    return procs[name]?.meta?.permission
  }

  it('router is constructible with publicProcedure', () => {
    expect(r).toBeDefined()
    expect(procs).toBeDefined()
  })

  describe('IdP procedures', () => {
    it('configureProvider requires ADMIN_IDP_CONFIGURE', () => {
      expect(permOf('configureProvider')).toBe(PERMISSIONS.ADMIN_IDP_CONFIGURE)
    })

    it('getProvider requires ADMIN_IDP_READ', () => {
      expect(permOf('getProvider')).toBe(PERMISSIONS.ADMIN_IDP_READ)
    })

    it('testConnection requires ADMIN_IDP_CONFIGURE', () => {
      expect(permOf('testConnection')).toBe(PERMISSIONS.ADMIN_IDP_CONFIGURE)
    })

    it('syncGroups requires ADMIN_IDP_SYNC', () => {
      expect(permOf('syncGroups')).toBe(PERMISSIONS.ADMIN_IDP_SYNC)
    })

    it('listGroupMappings requires ADMIN_IDP_READ', () => {
      expect(permOf('listGroupMappings')).toBe(PERMISSIONS.ADMIN_IDP_READ)
    })

    it('upsertGroupMapping requires ADMIN_IDP_SYNC', () => {
      expect(permOf('upsertGroupMapping')).toBe(PERMISSIONS.ADMIN_IDP_SYNC)
    })

    it('removeGroupMapping requires ADMIN_IDP_SYNC', () => {
      expect(permOf('removeGroupMapping')).toBe(PERMISSIONS.ADMIN_IDP_SYNC)
    })
  })

  describe('sync monitoring procedures', () => {
    it('getSyncStatus requires ADMIN_IDP_READ', () => {
      expect(permOf('getSyncStatus')).toBe(PERMISSIONS.ADMIN_IDP_READ)
    })

    it('getSyncHistory requires ADMIN_IDP_READ', () => {
      expect(permOf('getSyncHistory')).toBe(PERMISSIONS.ADMIN_IDP_READ)
    })

    it('triggerSync requires ADMIN_IDP_SYNC', () => {
      expect(permOf('triggerSync')).toBe(PERMISSIONS.ADMIN_IDP_SYNC)
    })
  })

  describe('user management procedures', () => {
    it('inviteLocalUser requires ADMIN_USER_MANAGE', () => {
      expect(permOf('inviteLocalUser')).toBe(PERMISSIONS.ADMIN_USER_MANAGE)
    })

    it('listLocalUsers requires ADMIN_USER_READ', () => {
      expect(permOf('listLocalUsers')).toBe(PERMISSIONS.ADMIN_USER_READ)
    })

    it('deactivateLocalUser requires ADMIN_USER_MANAGE', () => {
      expect(permOf('deactivateLocalUser')).toBe(PERMISSIONS.ADMIN_USER_MANAGE)
    })
  })

  describe('agent access procedures', () => {
    it('createSystemActor requires ADMIN_AGENT_MANAGE', () => {
      expect(permOf('createSystemActor')).toBe(PERMISSIONS.ADMIN_AGENT_MANAGE)
    })

    it('createApiKey requires ADMIN_AGENT_MANAGE', () => {
      expect(permOf('createApiKey')).toBe(PERMISSIONS.ADMIN_AGENT_MANAGE)
    })

    it('listApiKeys requires ADMIN_AGENT_READ', () => {
      expect(permOf('listApiKeys')).toBe(PERMISSIONS.ADMIN_AGENT_READ)
    })

    it('revokeApiKey requires ADMIN_AGENT_MANAGE', () => {
      expect(permOf('revokeApiKey')).toBe(PERMISSIONS.ADMIN_AGENT_MANAGE)
    })
  })
})
