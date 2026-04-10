import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import {
  createTestDb,
  migrateForTest,
  seedActor,
  seedTenant,
  truncateCoreSchema,
} from '@future/db/test-helpers'

const TENANT_A = '01900000-0000-7fff-8000-000000000201'
const TENANT_B = '01900000-0000-7fff-8000-000000000202'
const SHARED_SSO_SUBJECT = 'entra-shared-subject'

describe('core.user_identity', () => {
  const db = createTestDb()

  beforeAll(async () => {
    await migrateForTest()
  })

  beforeEach(async () => {
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'identity-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'identity-tenant-b' })
  })

  it('rejects duplicate sso_subject values within the same tenant', async () => {
    const { id: actorIdA1 } = await seedActor(db, { tenantId: TENANT_A })
    const { id: actorIdA2 } = await seedActor(db, { tenantId: TENANT_A })
    const identityIdA1 = uuidv7()
    const identityIdA2 = uuidv7()

    await db.execute(sql`
      INSERT INTO core.user_identity (id, tenant_id, actor_id, email, sso_subject, provider)
      VALUES (${identityIdA1}, ${TENANT_A}, ${actorIdA1}, 'first@seta.test', ${SHARED_SSO_SUBJECT}, 'microsoft')
    `)

    await expect(
      db.execute(sql`
        INSERT INTO core.user_identity (id, tenant_id, actor_id, email, sso_subject, provider)
        VALUES (${identityIdA2}, ${TENANT_A}, ${actorIdA2}, 'second@seta.test', ${SHARED_SSO_SUBJECT}, 'microsoft')
      `),
    ).rejects.toThrow()
  })

  it('allows the same sso_subject in different tenants', async () => {
    const { id: actorIdA } = await seedActor(db, { tenantId: TENANT_A })
    const { id: actorIdB } = await seedActor(db, { tenantId: TENANT_B })
    const identityIdA = uuidv7()
    const identityIdB = uuidv7()

    await db.execute(sql`
      INSERT INTO core.user_identity (id, tenant_id, actor_id, email, sso_subject, provider)
      VALUES (${identityIdA}, ${TENANT_A}, ${actorIdA}, 'tenant-a@seta.test', ${SHARED_SSO_SUBJECT}, 'microsoft')
    `)

    await expect(
      db.execute(sql`
        INSERT INTO core.user_identity (id, tenant_id, actor_id, email, sso_subject, provider)
        VALUES (${identityIdB}, ${TENANT_B}, ${actorIdB}, 'tenant-b@seta.test', ${SHARED_SSO_SUBJECT}, 'microsoft')
      `),
    ).resolves.toBeDefined()
  })
})
