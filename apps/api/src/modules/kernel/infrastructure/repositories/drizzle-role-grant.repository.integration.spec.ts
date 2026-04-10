import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import {
  createTestDb,
  migrateForTest,
  seedActor,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { DrizzleRoleGrantRepository } from './drizzle-role-grant.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000003'
const TENANT_B = '01900000-0000-7fff-8000-000000000004'

describe('DrizzleRoleGrantRepository', () => {
  const db = createTestDb()
  let repo: DrizzleRoleGrantRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'rg-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'rg-tenant-b' })
    repo = new DrizzleRoleGrantRepository(db as never)
  })

  afterAll(async () => {
    await truncateCoreSchema(db)
  })

  it('findByActorId returns active grants only', async () => {
    await setTenantContext(db, TENANT_A)
    const { id: actorId } = await seedActor(db, { tenantId: TENANT_A })
    const { id: granterId } = await seedActor(db, { tenantId: TENANT_A })

    await repo.insert({
      tenantId: TENANT_A,
      actorId,
      roleKey: 'employee',
      scopeType: 'global',
      scopeId: null,
      grantedBy: granterId,
    })

    const expiredId = uuidv7()
    await db.execute(
      sql`INSERT INTO core.role_grant (id, tenant_id, actor_id, role_key, scope_type, granted_by, valid_from, valid_until)
          VALUES (${expiredId}, ${TENANT_A}, ${actorId}, 'hr_ops', 'global', ${granterId}, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day')`,
    )

    const grants = await repo.findByActorId(actorId, TENANT_A)

    expect(grants).toHaveLength(1)
    expect(grants[0]?.roleKey).toBe('employee')
  })

  it('returns no grants for a cross-tenant query', async () => {
    await setTenantContext(db, TENANT_B)
    const { id: actorId } = await seedActor(db, { tenantId: TENANT_B })
    const { id: granterId } = await seedActor(db, { tenantId: TENANT_B })

    await repo.insert({
      tenantId: TENANT_B,
      actorId,
      roleKey: 'platform_admin',
      scopeType: 'global',
      scopeId: null,
      grantedBy: granterId,
    })

    await setTenantContext(db, TENANT_A)
    const grants = await repo.findByActorId(actorId, TENANT_A)

    expect(grants).toHaveLength(0)
  })
})
