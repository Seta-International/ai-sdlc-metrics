import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT, slug: 'ms-graph-credential' })
    await setTenantContext(db, TENANT)
    repo = new DrizzleMsGraphCredentialRepository(db as never)
  })

  beforeEach(async () => {
    await truncateIdentitySchema(db)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  it('insertIfAbsent persists and get returns the entity', async () => {
    const cred = MsGraphCredentialEntity.create({
      tenantId: TENANT,
      clientId: 'c',
      clientSecretRef: 'arn',
      tenantAdId: 'aad',
      scopes: ['Tasks.ReadWrite.All'],
      consentedAt: new Date('2026-04-21T00:00:00Z'),
    })

    const inserted = await repo.insertIfAbsent(cred)

    expect(inserted).toBe(true)
    const got = await repo.get(TENANT)
    expect(got?.clientId).toBe('c')
    expect(got?.status).toBe('active')
  })

  it('insertIfAbsent rejects conflicts without overwriting the existing row', async () => {
    const cred = MsGraphCredentialEntity.create({
      tenantId: TENANT,
      clientId: 'c',
      clientSecretRef: 'arn',
      tenantAdId: 'aad',
      scopes: [],
      consentedAt: new Date(),
    })
    const conflicting = MsGraphCredentialEntity.create({
      tenantId: TENANT,
      clientId: 'new-client',
      clientSecretRef: 'new-arn',
      tenantAdId: 'new-aad',
      scopes: [],
      consentedAt: new Date(),
    })

    await repo.insertIfAbsent(cred)
    const inserted = await repo.insertIfAbsent(conflicting)

    expect(inserted).toBe(false)
    const got = await repo.get(TENANT)
    expect(got?.clientId).toBe('c')
    expect(got?.clientSecretRef).toBe('arn')
  })

  it('updateIfSecretRef updates only the row owned by the attempt secret ref', async () => {
    const cred = MsGraphCredentialEntity.create({
      tenantId: TENANT,
      clientId: 'c',
      clientSecretRef: 'arn',
      tenantAdId: 'aad',
      scopes: [],
      status: 'paused',
      consentedAt: new Date(),
    })
    const active = MsGraphCredentialEntity.create({
      tenantId: TENANT,
      clientId: 'c',
      clientSecretRef: 'arn',
      tenantAdId: 'aad',
      scopes: [],
      consentedAt: new Date(),
    })

    await repo.insertIfAbsent(cred)
    expect(await repo.updateIfSecretRef(active, 'different-arn')).toBe(false)
    expect((await repo.get(TENANT))?.status).toBe('paused')

    expect(await repo.updateIfSecretRef(active, 'arn')).toBe(true)
    expect((await repo.get(TENANT))?.status).toBe('active')
  })

  it('deleteIfSecretRef removes only the row owned by the attempt secret ref', async () => {
    const cred = MsGraphCredentialEntity.create({
      tenantId: TENANT,
      clientId: 'c',
      clientSecretRef: 'arn',
      tenantAdId: 'aad',
      scopes: [],
      consentedAt: new Date(),
    })

    await repo.insertIfAbsent(cred)
    expect(await repo.deleteIfSecretRef(TENANT, 'different-arn')).toBe(false)
    expect(await repo.get(TENANT)).not.toBeNull()

    expect(await repo.deleteIfSecretRef(TENANT, 'arn')).toBe(true)
    expect(await repo.get(TENANT)).toBeNull()
  })
})
