import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  seedAccount,
  seedProject,
  seedProjectRole,
  seedAllocation,
  setTenantContext,
  truncateCoreSchema,
  truncateProjectsSchema,
} from '@future/db/test-helpers'
import { DrizzleAllocationRepository } from './drizzle-allocation.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000030'
const TENANT_B = '01900000-0000-7fff-8000-000000000031'

describe('DrizzleAllocationRepository', () => {
  const db = createTestDb()
  let repo: DrizzleAllocationRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await truncateProjectsSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'tenant-b' })
    repo = new DrizzleAllocationRepository(db as never)
  })

  afterAll(async () => {
    await truncateProjectsSchema(db)
    await truncateCoreSchema(db)
  })

  it('inserts an allocation and retrieves it by id', async () => {
    await setTenantContext(db, TENANT_A)
    const { id: accountId } = await seedAccount(db, { tenantId: TENANT_A })
    const { id: projectId } = await seedProject(db, { tenantId: TENANT_A, accountId })
    const { id: roleId } = await seedProjectRole(db, { tenantId: TENANT_A, projectId })

    const alloc = await repo.insert({
      tenantId: TENANT_A,
      projectId,
      projectRoleId: roleId,
      actorId: null,
      position: 'Tech Lead',
      hoursPerDay: '6.00',
      billingType: 'billable',
      memberType: 'core',
      startedAt: new Date('2026-03-01'),
      endedAt: null,
      note: null,
    })

    const found = await repo.findById(alloc.id, TENANT_A)
    expect(found).not.toBeNull()
    expect(found?.position).toBe('Tech Lead')
    expect(found?.status).toBe('tentative')
  })

  it('sumConfirmedHoursPerDay returns sum only for overlapping date range', async () => {
    await setTenantContext(db, TENANT_A)
    const actorId = '01900000-0000-7fff-8000-aaaaaaaaaaaa'
    const { id: accountId } = await seedAccount(db, { tenantId: TENANT_A })
    const { id: projectId } = await seedProject(db, { tenantId: TENANT_A, accountId })
    const { id: roleId } = await seedProjectRole(db, { tenantId: TENANT_A, projectId })

    await seedAllocation(db, {
      tenantId: TENANT_A,
      projectId,
      projectRoleId: roleId,
      actorId,
      hoursPerDay: '4.00',
      status: 'confirmed',
      startedAt: new Date('2026-01-01'),
      endedAt: new Date('2026-06-30'),
    })
    await seedAllocation(db, {
      tenantId: TENANT_A,
      projectId,
      projectRoleId: roleId,
      actorId,
      hoursPerDay: '3.00',
      status: 'confirmed',
      startedAt: new Date('2026-09-01'),
      endedAt: null,
    })

    const sum = await repo.sumConfirmedHoursPerDay(
      actorId,
      TENANT_A,
      new Date('2026-03-01'),
      new Date('2026-05-31'),
    )
    expect(sum).toBe(4)

    const sumBoth = await repo.sumConfirmedHoursPerDay(
      actorId,
      TENANT_A,
      new Date('2026-01-01'),
      new Date('2026-12-31'),
    )
    expect(sumBoth).toBe(7)
  })

  it('flagTentativeForActor only affects allocations within date range', async () => {
    await setTenantContext(db, TENANT_A)
    const actorId = '01900000-0000-7fff-8000-bbbbbbbbbbbb'
    const { id: accountId } = await seedAccount(db, { tenantId: TENANT_A })
    const { id: projectId } = await seedProject(db, { tenantId: TENANT_A, accountId })
    const { id: roleId } = await seedProjectRole(db, { tenantId: TENANT_A, projectId })

    // This one starts before expectedLastDay — should be flagged tentative
    const { id: allocId } = await seedAllocation(db, {
      tenantId: TENANT_A,
      projectId,
      projectRoleId: roleId,
      actorId,
      hoursPerDay: '8.00',
      status: 'confirmed',
      startedAt: new Date('2026-01-01'),
      endedAt: null,
    })

    // This one starts after expectedLastDay — should NOT be flagged
    const { id: futureAllocId } = await seedAllocation(db, {
      tenantId: TENANT_A,
      projectId,
      projectRoleId: roleId,
      actorId,
      hoursPerDay: '4.00',
      status: 'confirmed',
      startedAt: new Date('2027-02-01'),
      endedAt: null,
    })

    await repo.flagTentativeForActor(actorId, TENANT_A, new Date('2026-12-31'))

    const found = await repo.findById(allocId, TENANT_A)
    expect(found?.status).toBe('tentative')

    const futureFound = await repo.findById(futureAllocId, TENANT_A)
    expect(futureFound?.status).toBe('confirmed')
  })

  it('returns null for a cross-tenant query', async () => {
    await setTenantContext(db, TENANT_A)
    const { id: accountId } = await seedAccount(db, { tenantId: TENANT_A })
    const { id: projectId } = await seedProject(db, { tenantId: TENANT_A, accountId })
    const { id: roleId } = await seedProjectRole(db, { tenantId: TENANT_A, projectId })
    const alloc = await repo.insert({
      tenantId: TENANT_A,
      projectId,
      projectRoleId: roleId,
      actorId: null,
      position: null,
      hoursPerDay: '8.00',
      billingType: 'billable',
      memberType: 'core',
      startedAt: new Date('2026-01-01'),
      endedAt: null,
      note: null,
    })

    await setTenantContext(db, TENANT_B)
    const found = await repo.findById(alloc.id, TENANT_B)
    expect(found).toBeNull()
  })

  it('closeAllForActor sets ended_at on all open allocations', async () => {
    await setTenantContext(db, TENANT_A)
    const actorId = '01900000-0000-7fff-8000-cccccccccccc'
    const { id: accountId } = await seedAccount(db, { tenantId: TENANT_A })
    const { id: projectId } = await seedProject(db, { tenantId: TENANT_A, accountId })
    const { id: roleId } = await seedProjectRole(db, { tenantId: TENANT_A, projectId })

    const { id: allocId } = await seedAllocation(db, {
      tenantId: TENANT_A,
      projectId,
      projectRoleId: roleId,
      actorId,
      hoursPerDay: '8.00',
      status: 'confirmed',
      startedAt: new Date('2026-01-01'),
      endedAt: null,
    })

    const terminationDate = new Date('2026-05-01')
    await repo.closeAllForActor(actorId, TENANT_A, terminationDate)

    const found = await repo.findById(allocId, TENANT_A)
    expect(found?.endedAt).toEqual(terminationDate)
  })
})
