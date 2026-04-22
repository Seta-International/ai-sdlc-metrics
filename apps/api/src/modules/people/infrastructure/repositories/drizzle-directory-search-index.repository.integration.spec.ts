import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncatePeopleSchema,
} from '@future/db/test-helpers'
import { uuidv7 } from 'uuidv7'
import type { Db } from '@future/db'
import { DrizzleDirectorySearchIndexRepository } from './drizzle-directory-search-index.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000101'
const TENANT_B = '01900000-0000-7fff-8000-000000000102'

const ENGINEERING_A = '01900000-0000-7fff-8000-000000001001'
const BACKEND_A = '01900000-0000-7fff-8000-000000001002'
const API_A = '01900000-0000-7fff-8000-000000001003'

const ENGINEERING_B = '01900000-0000-7fff-8000-000000002001'
const BACKEND_B = '01900000-0000-7fff-8000-000000002002'

async function truncateDirectorySearchIndex(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE people.directory_search_index RESTART IDENTITY CASCADE`)
}

async function seedDepartment(
  db: Db,
  tenantId: string,
  id: string,
  name: string,
  parentId: string | null,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO core.department (
      id,
      tenant_id,
      name,
      parent_id,
      cost_center_code,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      ${id},
      ${tenantId},
      ${name},
      ${parentId},
      NULL,
      TRUE,
      NOW(),
      NOW()
    )
  `)
}

async function seedCurrentAssignment(
  db: Db,
  tenantId: string,
  employmentId: string,
  departmentId: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO people.job_assignment (
      id,
      tenant_id,
      employment_id,
      effective_from,
      effective_to,
      job_profile_id,
      department_id,
      location_id,
      cost_center_id,
      work_arrangement,
      manager_id,
      event_type,
      reason,
      created_by,
      created_at
    ) VALUES (
      ${uuidv7()},
      ${tenantId},
      ${employmentId},
      DATE '2025-01-01',
      NULL,
      ${uuidv7()},
      ${departmentId},
      NULL,
      NULL,
      'hybrid',
      NULL,
      'hire',
      NULL,
      ${uuidv7()},
      NOW()
    )
  `)
}

function makeDirectoryRow(overrides: {
  tenantId: string
  employmentId: string
  fullName: string
  departmentName: string
}): Parameters<DrizzleDirectorySearchIndexRepository['upsert']>[0] {
  return {
    tenantId: overrides.tenantId,
    employmentId: overrides.employmentId,
    fullName: overrides.fullName,
    fullNameUnaccented: overrides.fullName,
    companyEmail: `${overrides.employmentId.slice(0, 8)}@example.com`,
    jobTitle: 'Engineer',
    jobLevel: 'L4',
    departmentName: overrides.departmentName,
    locationName: null,
    managerName: null,
    workArrangement: 'hybrid',
    employmentStatus: 'active',
    hireDate: new Date('2025-01-15'),
    skills: [],
    countryCode: 'VN',
    updatedAt: new Date(),
  }
}

describe('DrizzleDirectorySearchIndexRepository - department hierarchy filtering', () => {
  const db = createTestDb()
  let repo: DrizzleDirectorySearchIndexRepository

  beforeAll(async () => {
    await migrateForTest()
    repo = new DrizzleDirectorySearchIndexRepository(db as never)
  })

  beforeEach(async () => {
    await truncateDirectorySearchIndex(db)
    await truncatePeopleSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'directory-hierarchy-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'directory-hierarchy-b' })
  })

  afterAll(async () => {
    await truncateDirectorySearchIndex(db)
    await truncatePeopleSchema(db)
    await truncateCoreSchema(db)
  })

  it('list returns the selected department and all descendants', async () => {
    await setTenantContext(db, TENANT_A)
    await seedDepartment(db, TENANT_A, ENGINEERING_A, 'Engineering', null)
    await seedDepartment(db, TENANT_A, BACKEND_A, 'Backend', ENGINEERING_A)
    await seedDepartment(db, TENANT_A, API_A, 'API', BACKEND_A)

    const engineeringEmployment = uuidv7()
    const backendEmployment = uuidv7()
    const apiEmployment = uuidv7()

    await seedCurrentAssignment(db, TENANT_A, engineeringEmployment, ENGINEERING_A)
    await seedCurrentAssignment(db, TENANT_A, backendEmployment, BACKEND_A)
    await seedCurrentAssignment(db, TENANT_A, apiEmployment, API_A)

    await repo.upsert(
      makeDirectoryRow({
        tenantId: TENANT_A,
        employmentId: engineeringEmployment,
        fullName: 'Engineering Employee',
        departmentName: 'Engineering',
      }),
    )
    await repo.upsert(
      makeDirectoryRow({
        tenantId: TENANT_A,
        employmentId: backendEmployment,
        fullName: 'Backend Employee',
        departmentName: 'Backend',
      }),
    )
    await repo.upsert(
      makeDirectoryRow({
        tenantId: TENANT_A,
        employmentId: apiEmployment,
        fullName: 'API Employee',
        departmentName: 'API',
      }),
    )

    const result = await repo.list(TENANT_A, { departmentId: ENGINEERING_A }, 100, 0)

    expect(result.total).toBe(3)
    expect(result.items.map((item) => item.departmentName).sort()).toEqual([
      'API',
      'Backend',
      'Engineering',
    ])
  })

  it('list excludes ancestors when filtering from the middle of the tree', async () => {
    await setTenantContext(db, TENANT_A)
    await seedDepartment(db, TENANT_A, ENGINEERING_A, 'Engineering', null)
    await seedDepartment(db, TENANT_A, BACKEND_A, 'Backend', ENGINEERING_A)
    await seedDepartment(db, TENANT_A, API_A, 'API', BACKEND_A)

    const engineeringEmployment = uuidv7()
    const backendEmployment = uuidv7()
    const apiEmployment = uuidv7()

    await seedCurrentAssignment(db, TENANT_A, engineeringEmployment, ENGINEERING_A)
    await seedCurrentAssignment(db, TENANT_A, backendEmployment, BACKEND_A)
    await seedCurrentAssignment(db, TENANT_A, apiEmployment, API_A)

    await repo.upsert(
      makeDirectoryRow({
        tenantId: TENANT_A,
        employmentId: engineeringEmployment,
        fullName: 'Engineering Employee',
        departmentName: 'Engineering',
      }),
    )
    await repo.upsert(
      makeDirectoryRow({
        tenantId: TENANT_A,
        employmentId: backendEmployment,
        fullName: 'Backend Employee',
        departmentName: 'Backend',
      }),
    )
    await repo.upsert(
      makeDirectoryRow({
        tenantId: TENANT_A,
        employmentId: apiEmployment,
        fullName: 'API Employee',
        departmentName: 'API',
      }),
    )

    const result = await repo.list(TENANT_A, { departmentId: BACKEND_A }, 100, 0)

    expect(result.total).toBe(2)
    expect(result.items.map((item) => item.departmentName).sort()).toEqual(['API', 'Backend'])
    expect(result.items.every((item) => item.departmentName !== 'Engineering')).toBe(true)
  })

  it('search uses the same hierarchy filter and stays tenant-scoped', async () => {
    await setTenantContext(db, TENANT_A)
    await seedDepartment(db, TENANT_A, ENGINEERING_A, 'Engineering', null)
    await seedDepartment(db, TENANT_A, BACKEND_A, 'Backend', ENGINEERING_A)
    await seedDepartment(db, TENANT_A, API_A, 'API', BACKEND_A)

    await seedDepartment(db, TENANT_B, ENGINEERING_B, 'Engineering', null)
    await seedDepartment(db, TENANT_B, BACKEND_B, 'Backend', ENGINEERING_B)

    const engineeringAEmployment = uuidv7()
    const backendAEmployment = uuidv7()
    const apiAEmployment = uuidv7()
    const backendBEmployment = uuidv7()

    await seedCurrentAssignment(db, TENANT_A, engineeringAEmployment, ENGINEERING_A)
    await seedCurrentAssignment(db, TENANT_A, backendAEmployment, BACKEND_A)
    await seedCurrentAssignment(db, TENANT_A, apiAEmployment, API_A)
    await seedCurrentAssignment(db, TENANT_B, backendBEmployment, BACKEND_B)

    await repo.upsert(
      makeDirectoryRow({
        tenantId: TENANT_A,
        employmentId: engineeringAEmployment,
        fullName: 'Engineering Employee A',
        departmentName: 'Engineering',
      }),
    )
    await repo.upsert(
      makeDirectoryRow({
        tenantId: TENANT_A,
        employmentId: backendAEmployment,
        fullName: 'Backend Employee A',
        departmentName: 'Backend',
      }),
    )
    await repo.upsert(
      makeDirectoryRow({
        tenantId: TENANT_A,
        employmentId: apiAEmployment,
        fullName: 'API Employee A',
        departmentName: 'API',
      }),
    )
    await repo.upsert(
      makeDirectoryRow({
        tenantId: TENANT_B,
        employmentId: backendBEmployment,
        fullName: 'Backend Employee B',
        departmentName: 'Backend',
      }),
    )

    const result = await repo.search(TENANT_A, 'employee', { departmentId: ENGINEERING_A }, 100, 0)

    expect(result.total).toBe(3)
    expect(result.items.map((item) => item.departmentName).sort()).toEqual([
      'API',
      'Backend',
      'Engineering',
    ])
  })
})
