import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { DrizzleRolePermissionRepository } from './drizzle-role-permission.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000010'
const TENANT_B = '01900000-0000-7fff-8000-000000000011'

describe('DrizzleRolePermissionRepository', () => {
  const db = createTestDb()
  let repo: DrizzleRolePermissionRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'rp-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'rp-tenant-b' })
    repo = new DrizzleRolePermissionRepository(db as never)
  })

  afterAll(async () => {
    await truncateCoreSchema(db)
  })

  it('inserts and finds a role permission by role key', async () => {
    await setTenantContext(db, TENANT_A)

    const inserted = await repo.insert({
      tenantId: TENANT_A,
      roleKey: 'employee',
      permissionKey: 'people:profile:self:read',
      isLocked: true,
    })

    expect(inserted).not.toBeNull()
    expect(inserted!.id).toBeDefined()
    expect(inserted!.roleKey).toBe('employee')
    expect(inserted!.permissionKey).toBe('people:profile:self:read')
    expect(inserted!.isLocked).toBe(true)

    const results = await repo.findByRoleKey('employee', TENANT_A)
    expect(results).toHaveLength(1)
    expect(results[0]?.permissionKey).toBe('people:profile:self:read')
  })

  it('findByRoleKeys returns permissions for multiple roles', async () => {
    await setTenantContext(db, TENANT_A)

    await repo.insert({
      tenantId: TENANT_A,
      roleKey: 'hr_ops',
      permissionKey: 'people:profile:read',
      isLocked: false,
    })

    const results = await repo.findByRoleKeys(['employee', 'hr_ops'], TENANT_A)
    expect(results.length).toBeGreaterThanOrEqual(2)

    const permKeys = results.map((r) => r.permissionKey)
    expect(permKeys).toContain('people:profile:self:read')
    expect(permKeys).toContain('people:profile:read')
  })

  it('findByRoleKeys returns empty array for empty input', async () => {
    await setTenantContext(db, TENANT_A)
    const results = await repo.findByRoleKeys([], TENANT_A)
    expect(results).toHaveLength(0)
  })

  it('remove deletes a permission entry', async () => {
    await setTenantContext(db, TENANT_A)

    await repo.insert({
      tenantId: TENANT_A,
      roleKey: 'recruiter',
      permissionKey: 'hiring:candidate:create',
      isLocked: false,
    })

    await repo.remove(TENANT_A, 'recruiter', 'hiring:candidate:create')
    const results = await repo.findByRoleKey('recruiter', TENANT_A)
    const match = results.find((r) => r.permissionKey === 'hiring:candidate:create')
    expect(match).toBeUndefined()
  })

  it('enforces tenant isolation — tenant B data not visible to tenant A queries', async () => {
    await setTenantContext(db, TENANT_B)

    await repo.insert({
      tenantId: TENANT_B,
      roleKey: 'employee',
      permissionKey: 'time:leave:self:submit',
      isLocked: true,
    })

    // Switch to tenant A context and query for tenant A only
    await setTenantContext(db, TENANT_A)
    const results = await repo.findByRoleKey('employee', TENANT_A)
    // Tenant B's permissions must not appear in tenant A's query
    const tenantBResults = results.filter((r) => r.tenantId === TENANT_B)
    expect(tenantBResults).toHaveLength(0)
  })

  it('findAll returns all permissions for a tenant', async () => {
    await setTenantContext(db, TENANT_A)
    const results = await repo.findAll(TENANT_A)
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.tenantId === TENANT_A)).toBe(true)
  })
})
