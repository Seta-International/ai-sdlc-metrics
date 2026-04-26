import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncatePlannerSchema,
} from '@future/db/test-helpers'
import type { Db } from '@future/db'
import { MsSyncConflictEntity } from '../../domain/entities/ms-sync-conflict.entity'
import { DrizzleMsSyncConflictRepository } from './drizzle-ms-sync-conflict.repository'

const TENANT_A = '01900000-0000-7fff-8000-0000000a9001'
const TENANT_B = '01900000-0000-7fff-8000-0000000a9002'

describe('DrizzleMsSyncConflictRepository', () => {
  const db = createTestDb() as Db
  let repo: DrizzleMsSyncConflictRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'ms-conflict-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'ms-conflict-tenant-b' })
    repo = new DrizzleMsSyncConflictRepository(db as never)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('insert() + listOpenForTenant()', () => {
    it('inserts a conflict and lists it as open', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = MsSyncConflictEntity.forPush403Quota({
        tenantId: TENANT_A,
        limitCode: 'MaximumPlannerPlans',
        rawError: { message: 'Quota exceeded' },
      })
      await repo.insert(entity)

      const open = await repo.listOpenForTenant(TENANT_A)
      expect(open.length).toBeGreaterThanOrEqual(1)
      const found = open.find((c) => c.id === entity.id)
      expect(found).toBeDefined()
      expect(found!.kind).toBe('push_403_quota')
      expect(found!.field).toBe('MaximumPlannerPlans')
    })

    it('does not leak conflicts across tenants', async () => {
      await setTenantContext(db, TENANT_B)
      const entity = MsSyncConflictEntity.forPushFailed({
        tenantId: TENANT_B,
        rawError: { code: 500 },
      })
      await repo.insert(entity)

      await setTenantContext(db, TENANT_A)
      const openForA = await repo.listOpenForTenant(TENANT_A)
      expect(openForA.every((c) => c.tenantId === TENANT_A)).toBe(true)
    })
  })

  describe('markResolved()', () => {
    it('removes a conflict from the open list after resolution', async () => {
      await setTenantContext(db, TENANT_A)
      const entity = MsSyncConflictEntity.forCredentialInvalidated({
        tenantId: TENANT_A,
        reason: 'token expired',
        rawError: null,
      })
      await repo.insert(entity)

      const before = await repo.listOpenForTenant(TENANT_A)
      const conflict = before.find((c) => c.id === entity.id)
      expect(conflict).toBeDefined()

      await repo.markResolved(entity.id, TENANT_A, 'acknowledged')

      const after = await repo.listOpenForTenant(TENANT_A)
      expect(after.find((c) => c.id === entity.id)).toBeUndefined()
    })
  })
})
