import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncateIdentitySchema,
} from '@future/db/test-helpers'
import { DrizzleIdpGroupMemberRepository } from './drizzle-idp-group-member.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000040'
const TENANT_B = '01900000-0000-7fff-8000-000000000041'

describe('DrizzleIdpGroupMemberRepository', () => {
  const db = createTestDb()
  let repo: DrizzleIdpGroupMemberRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'idp-member-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'idp-member-b' })
    repo = new DrizzleIdpGroupMemberRepository(db as never)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  it('replaces members atomically by adding and removing in one call', async () => {
    await setTenantContext(db, TENANT_A)
    await repo.replaceForGroup({
      tenantId: TENANT_A,
      externalGroupId: 'g1',
      ssoSubjects: ['a', 'b', 'c'],
    })

    let members = await repo.listMembers({ tenantId: TENANT_A, externalGroupId: 'g1' })
    expect(members.map((m) => m.ssoSubject).sort()).toEqual(['a', 'b', 'c'])

    await repo.replaceForGroup({
      tenantId: TENANT_A,
      externalGroupId: 'g1',
      ssoSubjects: ['b', 'c', 'd'],
    })

    members = await repo.listMembers({ tenantId: TENANT_A, externalGroupId: 'g1' })
    expect(members.map((m) => m.ssoSubject).sort()).toEqual(['b', 'c', 'd'])
  })

  it('isolates members per tenant', async () => {
    await setTenantContext(db, TENANT_A)
    await repo.replaceForGroup({
      tenantId: TENANT_A,
      externalGroupId: 'g1',
      ssoSubjects: ['a'],
    })

    await setTenantContext(db, TENANT_B)
    await repo.replaceForGroup({
      tenantId: TENANT_B,
      externalGroupId: 'g1',
      ssoSubjects: ['z'],
    })

    await setTenantContext(db, TENANT_A)
    const t1 = await repo.listMembers({ tenantId: TENANT_A, externalGroupId: 'g1' })

    expect(t1.map((m) => m.ssoSubject)).toEqual(['a'])
  })
})
