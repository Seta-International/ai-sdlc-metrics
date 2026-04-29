import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from 'uuidv7'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncatePlannerSchema,
} from '@future/db/test-helpers'
import type { Db } from '@future/db'
import { DrizzleRosterMemberRepository } from './drizzle-roster-member.repository'

const TENANT_A = '01900000-0000-7fff-8000-00000000b001'
const TENANT_B = '01900000-0000-7fff-8000-00000000b002'

describe('DrizzleRosterMemberRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzleRosterMemberRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'roster-member-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'roster-member-tenant-b' })
    repo = new DrizzleRosterMemberRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('replaceForRoster() + listMembers()', () => {
    it('inserts members and retrieves them', async () => {
      await setTenantContext(db, TENANT_A)
      const msRosterId = `roster-${uuidv7()}`
      await repo.replaceForRoster({
        tenantId: TENANT_A,
        msRosterId,
        ssoSubjects: ['user1@example.com', 'user2@example.com'],
      })

      const members = await repo.listMembers({ tenantId: TENANT_A, msRosterId })
      const subjects = members.map((m) => m.ssoSubject)
      expect(subjects).toContain('user1@example.com')
      expect(subjects).toContain('user2@example.com')
      expect(members).toHaveLength(2)
      expect(members[0]!.actorId).toBeNull()
    })

    it('replaces all existing members on second call', async () => {
      await setTenantContext(db, TENANT_A)
      const msRosterId = `roster-${uuidv7()}`
      await repo.replaceForRoster({
        tenantId: TENANT_A,
        msRosterId,
        ssoSubjects: ['old1@example.com', 'old2@example.com'],
      })

      await repo.replaceForRoster({
        tenantId: TENANT_A,
        msRosterId,
        ssoSubjects: ['new1@example.com'],
      })

      const members = await repo.listMembers({ tenantId: TENANT_A, msRosterId })
      const subjects = members.map((m) => m.ssoSubject)
      expect(subjects).toEqual(['new1@example.com'])
    })

    it('handles empty ssoSubjects — removes all members', async () => {
      await setTenantContext(db, TENANT_A)
      const msRosterId = `roster-${uuidv7()}`
      await repo.replaceForRoster({
        tenantId: TENANT_A,
        msRosterId,
        ssoSubjects: ['user@example.com'],
      })

      await repo.replaceForRoster({ tenantId: TENANT_A, msRosterId, ssoSubjects: [] })

      const members = await repo.listMembers({ tenantId: TENANT_A, msRosterId })
      expect(members).toHaveLength(0)
    })
  })

  describe('listUnresolved()', () => {
    it('returns only members without an actorId', async () => {
      await setTenantContext(db, TENANT_B)
      const msRosterId = `roster-${uuidv7()}`
      await repo.replaceForRoster({
        tenantId: TENANT_B,
        msRosterId,
        ssoSubjects: ['unresolved@example.com', 'toresolve@example.com'],
      })

      await repo.resolveMember(TENANT_B, msRosterId, 'toresolve@example.com', uuidv7())

      const unresolved = await repo.listUnresolved(TENANT_B)
      const subjects = unresolved.map((m) => m.ssoSubject)
      expect(subjects).toContain('unresolved@example.com')
      expect(subjects).not.toContain('toresolve@example.com')
    })
  })

  describe('resolveMember()', () => {
    it('sets actorId for the matching member', async () => {
      await setTenantContext(db, TENANT_A)
      const msRosterId = `roster-${uuidv7()}`
      const actorId = uuidv7()
      await repo.replaceForRoster({
        tenantId: TENANT_A,
        msRosterId,
        ssoSubjects: ['resolve-me@example.com'],
      })

      await repo.resolveMember(TENANT_A, msRosterId, 'resolve-me@example.com', actorId)

      const members = await repo.listMembers({ tenantId: TENANT_A, msRosterId })
      expect(members[0]!.actorId).toBe(actorId)
    })
  })

  describe('tenant isolation', () => {
    it('listMembers for TENANT_B does not return TENANT_A members', async () => {
      await setTenantContext(db, TENANT_A)
      const msRosterId = `roster-shared-${uuidv7()}`
      await repo.replaceForRoster({
        tenantId: TENANT_A,
        msRosterId,
        ssoSubjects: ['tenant-a-user@example.com'],
      })

      await setTenantContext(db, TENANT_B)
      const members = await repo.listMembers({ tenantId: TENANT_B, msRosterId })
      expect(members).toHaveLength(0)
    })
  })
})
