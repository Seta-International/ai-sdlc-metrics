import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncateIdentitySchema,
} from '@future/db/test-helpers'
import { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import { DrizzleMsGraphCredentialRepository } from './drizzle-ms-graph-credential.repository'

const TENANT = '01900000-0000-7fff-8000-000000000050'

describe('DrizzleMsGraphCredentialRepository', () => {
  const db = createTestDb()
  let repo: DrizzleMsGraphCredentialRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT, slug: 'ms-graph-credential' })
    await setTenantContext(db, TENANT)
    repo = new DrizzleMsGraphCredentialRepository(db as never)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  it('upsert persists and get returns the entity', async () => {
    const cred = MsGraphCredentialEntity.create({
      tenantId: TENANT,
      clientId: 'c',
      clientSecretRef: 'arn',
      tenantAdId: 'aad',
      scopes: ['Tasks.ReadWrite.All'],
      consentedAt: new Date('2026-04-21T00:00:00Z'),
    })

    await repo.upsert(cred)

    const got = await repo.get(TENANT)
    expect(got?.clientId).toBe('c')
    expect(got?.status).toBe('active')
  })

  it('delete removes the row', async () => {
    const cred = MsGraphCredentialEntity.create({
      tenantId: TENANT,
      clientId: 'c',
      clientSecretRef: 'arn',
      tenantAdId: 'aad',
      scopes: [],
      consentedAt: new Date(),
    })

    await repo.upsert(cred)
    await repo.delete(TENANT)

    expect(await repo.get(TENANT)).toBeNull()
  })
})
