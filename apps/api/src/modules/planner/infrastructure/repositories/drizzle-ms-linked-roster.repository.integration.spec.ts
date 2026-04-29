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
import { MsLinkedRosterEntity } from '../../domain/entities/ms-linked-roster.entity'
import { DrizzleMsLinkedRosterRepository } from './drizzle-ms-linked-roster.repository'

const TENANT_A = '01900000-0000-7fff-8000-00000000a001'
const TENANT_B = '01900000-0000-7fff-8000-00000000a002'

function makeEntity(
  tenantId: string,
  overrides: Partial<{ id: string; msRosterId: string; displayName: string }> = {},
): MsLinkedRosterEntity {
  return MsLinkedRosterEntity.create({
    id: overrides.id ?? uuidv7(),
    tenantId,
    msRosterId: overrides.msRosterId ?? `roster-${uuidv7()}`,
    displayName: overrides.displayName ?? 'Test Roster',
    linkedByActorId: uuidv7(),
  })
}

describe('DrizzleMsLinkedRosterRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzleMsLinkedRosterRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'ms-linked-roster-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'ms-linked-roster-tenant-b' })
    repo = new DrizzleMsLinkedRosterRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('upsert() + findByTenantAndRoster()', () => {
    it('inserts and retrieves an entity', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = makeEntity(TENANT_A, { displayName: 'Engineering Roster' })
      await repo.upsert(entity)

      const found = await repo.findByTenantAndRoster(TENANT_A, entity.msRosterId)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(entity.id)
      expect(found!.displayName).toBe('Engineering Roster')
      expect(found!.syncEnabled).toBe(true)
      expect(found!.mintedByFutureAt).toBeNull()
      expect(found!.unlinkedAt).toBeNull()
    })

    it('updates mutable fields on second upsert (same tenantId + msRosterId)', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = makeEntity(TENANT_A)
      await repo.upsert(entity)

      const minted = new Date('2025-08-01T00:00:00Z')
      entity.markMinted(minted)
      entity.unlink()
      await repo.upsert(entity)

      const found = await repo.findByTenantAndRoster(TENANT_A, entity.msRosterId)
      expect(found!.mintedByFutureAt).toEqual(minted)
      expect(found!.unlinkedAt).toBeInstanceOf(Date)
    })

    it('returns null when msRosterId is not linked for tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const found = await repo.findByTenantAndRoster(TENANT_A, 'nonexistent-roster')
      expect(found).toBeNull()
    })
  })

  describe('listForTenant()', () => {
    it('returns all entities for the tenant', async () => {
      await setTenantContext(db, TENANT_B)
      const e1 = makeEntity(TENANT_B)
      const e2 = makeEntity(TENANT_B)
      await repo.upsert(e1)
      await repo.upsert(e2)

      const list = await repo.listForTenant(TENANT_B)
      const ids = list.map((e) => e.id)
      expect(ids).toContain(e1.id)
      expect(ids).toContain(e2.id)
    })
  })

  describe('listActiveForTenant()', () => {
    it('excludes unlinked rosters', async () => {
      await setTenantContext(db, TENANT_A)
      const active = makeEntity(TENANT_A)
      const unlinked = makeEntity(TENANT_A)
      unlinked.unlink()
      await repo.upsert(active)
      await repo.upsert(unlinked)

      const list = await repo.listActiveForTenant(TENANT_A)
      const ids = list.map((e) => e.id)
      expect(ids).toContain(active.id)
      expect(ids).not.toContain(unlinked.id)
    })
  })

  describe('remove()', () => {
    it('deletes the entity; findByTenantAndRoster returns null', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = makeEntity(TENANT_A)
      await repo.upsert(entity)

      await repo.remove(entity.id, TENANT_A)

      const found = await repo.findByTenantAndRoster(TENANT_A, entity.msRosterId)
      expect(found).toBeNull()
    })
  })

  describe('tenant isolation', () => {
    it('findByTenantAndRoster for TENANT_B does not return TENANT_A entity', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = makeEntity(TENANT_A)
      await repo.upsert(entity)

      const found = await repo.findByTenantAndRoster(TENANT_B, entity.msRosterId)
      expect(found).toBeNull()
    })
  })
})
