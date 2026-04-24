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
import { MsLinkedGroupEntity } from '../../domain/entities/ms-linked-group.entity'
import { DrizzleMsLinkedGroupRepository } from './drizzle-ms-linked-group.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000008001'
const TENANT_B = '01900000-0000-7fff-8000-000000008002'

function makeEntity(
  tenantId: string,
  overrides: Partial<{ id: string; msGroupId: string; displayName: string }> = {},
): MsLinkedGroupEntity {
  return MsLinkedGroupEntity.create({
    id: overrides.id ?? uuidv7(),
    tenantId,
    msGroupId: overrides.msGroupId ?? `grp-${uuidv7()}`,
    displayName: overrides.displayName ?? 'Test Group',
    linkedByActorId: uuidv7(),
  })
}

describe('DrizzleMsLinkedGroupRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzleMsLinkedGroupRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'ms-linked-group-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'ms-linked-group-tenant-b' })
    repo = new DrizzleMsLinkedGroupRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('upsert() + findByTenantAndGroup()', () => {
    it('inserts and retrieves an entity', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = makeEntity(TENANT_A, { displayName: 'Engineering' })
      await repo.upsert(entity)

      const found = await repo.findByTenantAndGroup(TENANT_A, entity.msGroupId)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(entity.id)
      expect(found!.displayName).toBe('Engineering')
      expect(found!.syncEnabled).toBe(true)
      expect(found!.backfillingAt).toBeNull()
      expect(found!.unlinkedAt).toBeNull()
    })

    it('updates mutable fields on second upsert (same id)', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = makeEntity(TENANT_A)
      await repo.upsert(entity)

      entity.pauseSync()
      entity.startBackfill('job-xyz')
      await repo.upsert(entity)

      const found = await repo.findByTenantAndGroup(TENANT_A, entity.msGroupId)
      expect(found!.syncEnabled).toBe(false)
      expect(found!.backfillJobId).toBe('job-xyz')
      expect(found!.backfillingAt).toBeInstanceOf(Date)
    })

    it('returns null when msGroupId is not linked for tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const found = await repo.findByTenantAndGroup(TENANT_A, 'nonexistent-group')
      expect(found).toBeNull()
    })
  })

  describe('listForTenant()', () => {
    it('returns all entities for the tenant', async () => {
      await setTenantContext(db, TENANT_B)
      const e1 = makeEntity(TENANT_B, { msGroupId: `grp-list-1-${uuidv7()}` })
      const e2 = makeEntity(TENANT_B, { msGroupId: `grp-list-2-${uuidv7()}` })
      await repo.upsert(e1)
      await repo.upsert(e2)

      const list = await repo.listForTenant(TENANT_B)
      const ids = list.map((e) => e.id)
      expect(ids).toContain(e1.id)
      expect(ids).toContain(e2.id)
    })
  })

  describe('remove()', () => {
    it('deletes the entity; findByTenantAndGroup returns null', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = makeEntity(TENANT_A)
      await repo.upsert(entity)

      await repo.remove(entity.id, TENANT_A)

      const found = await repo.findByTenantAndGroup(TENANT_A, entity.msGroupId)
      expect(found).toBeNull()
    })
  })

  describe('tenant isolation', () => {
    it('findByTenantAndGroup for TENANT_B does not return TENANT_A entity', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = makeEntity(TENANT_A)
      await repo.upsert(entity)

      const found = await repo.findByTenantAndGroup(TENANT_B, entity.msGroupId)
      expect(found).toBeNull()
    })
  })
})
