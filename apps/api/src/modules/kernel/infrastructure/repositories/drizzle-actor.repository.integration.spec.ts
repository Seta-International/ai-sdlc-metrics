import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedActor,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { DrizzleActorRepository } from './drizzle-actor.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000001'
const TENANT_B = '01900000-0000-7fff-8000-000000000002'

describe('DrizzleActorRepository', () => {
  const db = createTestDb()
  let repo: DrizzleActorRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'tenant-b' })
    repo = new DrizzleActorRepository(db as never)
  })

  afterAll(async () => {
    await truncateCoreSchema(db)
  })

  it('findById returns an actor within the correct tenant', async () => {
    await setTenantContext(db, TENANT_A)
    const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })

    const found = await repo.findById(actorId, TENANT_A)

    expect(found).not.toBeNull()
    expect(found?.id).toBe(actorId)
  })

  it('returns null for a cross-tenant query', async () => {
    await setTenantContext(db, TENANT_B)
    const { id: actorId } = await seedActor(db, { tenantId: TENANT_B })

    await setTenantContext(db, TENANT_A)
    const found = await repo.findById(actorId, TENANT_A)

    expect(found).toBeNull()
  })

  it('insert creates an actor visible within the same tenant context', async () => {
    await setTenantContext(db, TENANT_A)

    const actor = await repo.insert({
      tenantId: TENANT_A,
      type: 'person',
      displayName: 'Integration Test Actor',
    })

    expect(actor.id).toBeDefined()
    expect(actor.tenantId).toBe(TENANT_A)
    expect(actor.status).toBe('invited')
  })
})
