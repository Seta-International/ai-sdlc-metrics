import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  createTestDb,
  migrateForTest,
  seedActor,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { uuidv7 } from 'uuidv7'
import { GetUserIdentityByActorIdHandler } from './get-user-identity-by-actor-id.handler'
import { GetUserIdentityByActorIdQuery } from './get-user-identity-by-actor-id.query'

const TENANT = '01900000-0000-7fff-8000-000000000060'

async function seedUserIdentity(
  db: ReturnType<typeof createTestDb>,
  data: {
    tenantId: string
    actorId: string
    email: string
    ssoSubject: string
    provider?: string
  },
): Promise<{ id: string }> {
  const id = uuidv7()
  await db.execute(
    sql`INSERT INTO core.user_identity
        (id, tenant_id, actor_id, email, sso_subject, provider, status, created_at)
        VALUES (
          ${id},
          ${data.tenantId},
          ${data.actorId},
          ${data.email},
          ${data.ssoSubject},
          ${data.provider ?? 'microsoft'},
          'active',
          NOW()
        )`,
  )
  return { id }
}

describe('GetUserIdentityByActorIdHandler (integration)', () => {
  const db = createTestDb()
  let handler: GetUserIdentityByActorIdHandler
  let actorId: string

  const SSO_SUBJECT = 'aad-oid-integration-test-001'

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT, slug: 'actor-id-query-tenant' })
    await setTenantContext(db, TENANT)
    const actor = await seedActor(db, { tenantId: TENANT, type: 'person' })
    actorId = actor.id
    await seedUserIdentity(db, {
      tenantId: TENANT,
      actorId,
      email: 'test@example.com',
      ssoSubject: SSO_SUBJECT,
    })
    handler = new GetUserIdentityByActorIdHandler(db as never)
  })

  afterAll(async () => {
    await truncateCoreSchema(db)
  })

  it('returns the ssoSubject for a known actorId', async () => {
    await setTenantContext(db, TENANT)
    const result = await handler.execute(new GetUserIdentityByActorIdQuery(actorId, TENANT))
    expect(result).toBe(SSO_SUBJECT)
  })

  it('returns null for an unknown actorId', async () => {
    await setTenantContext(db, TENANT)
    const result = await handler.execute(
      new GetUserIdentityByActorIdQuery('00000000-0000-0000-0000-000000000000', TENANT),
    )
    expect(result).toBeNull()
  })
})
