import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { peopleRouter, createPeopleRouter } from './people.router'
import { publicProcedure } from '../../../../common/trpc/trpc-init'
import { createProtectedProcedures } from '../../../../common/trpc/create-protected-procedures'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { PeopleQueryFacade } from '../../application/facades/people-query.facade'
import { PeopleTrpcService } from './people-trpc.service'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncatePeopleSchema,
} from '@future/db/test-helpers'
import type { Db } from '@future/db'
import { DrizzleDirectorySearchIndexRepository } from '../../infrastructure/repositories/drizzle-directory-search-index.repository'
import { DrizzleEmploymentRepository } from '../../infrastructure/repositories/drizzle-employment.repository'
import { DrizzleJobAssignmentRepository } from '../../infrastructure/repositories/drizzle-job-assignment.repository'
import { ListDirectoryQuery } from '../../application/queries/list-directory.query'
import { SearchDirectoryQuery } from '../../application/queries/search-directory.query'
import { ExportDirectoryQuery } from '../../application/queries/export-directory.query'
import { ExportDirectoryHandler } from '../../application/queries/export-directory.handler'
import { GetOrgChartContextQuery } from '../../application/queries/get-org-chart-context.query'
import { GetOrgChartChildrenQuery } from '../../application/queries/get-org-chart-children.query'
import { OrgChartQueryService } from '../../application/services/org-chart-query.service'
import { uuidv7 } from 'uuidv7'

const TENANT_A = '01900000-0000-7fff-8000-000000000101'
const ACTOR_A = '01900000-0000-7fff-8000-000000000201'

const makeCtx = () => ({
  req: { headers: {} },
  tenantId: TENANT_A,
  actorId: ACTOR_A,
})

const baseQuery = {
  resourceKey: 'people.directory',
  search: '',
  filters: [],
  sorting: [],
  pagination: { pageIndex: 0, pageSize: 25 },
}

const HIERARCHY_TENANT = '01900000-0000-7fff-8000-000000000301'
const OTHER_HIERARCHY_TENANT = '01900000-0000-7fff-8000-000000000302'
const HIERARCHY_ENGINEERING = '01900000-0000-7fff-8000-000000000311'
const HIERARCHY_BACKEND = '01900000-0000-7fff-8000-000000000312'
const HIERARCHY_API = '01900000-0000-7fff-8000-000000000313'
const ORG_MANAGER_ACTOR = '01900000-0000-7fff-8000-000000000321'
const ORG_VIEWER_ACTOR = '01900000-0000-7fff-8000-000000000322'
const ORG_PEER_ACTOR = '01900000-0000-7fff-8000-000000000323'
const ORG_REPORT_ACTOR = '01900000-0000-7fff-8000-000000000324'
const ORG_OTHER_ACTOR = '01900000-0000-7fff-8000-000000000325'
const ORG_MANAGER_EMPLOYMENT = '01900000-0000-7fff-8000-000000000331'
const ORG_VIEWER_EMPLOYMENT = '01900000-0000-7fff-8000-000000000332'
const ORG_PEER_EMPLOYMENT = '01900000-0000-7fff-8000-000000000333'
const ORG_REPORT_EMPLOYMENT = '01900000-0000-7fff-8000-000000000334'
const ORG_OTHER_EMPLOYMENT = '01900000-0000-7fff-8000-000000000335'
const ROOT_FALLBACK_TENANT = '01900000-0000-7fff-8000-000000000336'
const ROOT_FALLBACK_ENGINEERING = '01900000-0000-7fff-8000-000000000337'
const ROOT_FALLBACK_OPERATIONS = '01900000-0000-7fff-8000-000000000338'
const ROOT_FALLBACK_MANAGER_ACTOR = '01900000-0000-7fff-8000-000000000339'
const ROOT_FALLBACK_DIRECTOR_ACTOR = '01900000-0000-7fff-8000-000000000340'
const ROOT_FALLBACK_MANAGER_EMPLOYMENT = '01900000-0000-7fff-8000-000000000346'
const ROOT_FALLBACK_DIRECTOR_EMPLOYMENT = '01900000-0000-7fff-8000-000000000347'

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

async function seedHierarchyDepartments(db: Db, tenantId: string): Promise<void> {
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
    ) VALUES
      (
        ${HIERARCHY_ENGINEERING},
        ${tenantId},
        'Engineering',
        NULL,
        NULL,
        TRUE,
        NOW(),
        NOW()
      ),
      (
        ${HIERARCHY_BACKEND},
        ${tenantId},
        'Backend',
        ${HIERARCHY_ENGINEERING},
        NULL,
        TRUE,
        NOW(),
        NOW()
      ),
      (
        ${HIERARCHY_API},
        ${tenantId},
        'API',
        ${HIERARCHY_BACKEND},
        NULL,
        TRUE,
        NOW(),
        NOW()
      )
    ON CONFLICT (id) DO NOTHING
  `)
}

async function seedCurrentAssignment(
  db: Db,
  tenantId: string,
  employmentId: string,
  departmentId: string,
  managerId: string | null = null,
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
      ${managerId},
      'hire',
      NULL,
      ${uuidv7()},
      NOW()
    )
  `)
}

async function seedPersonAndEmployment(
  db: Db,
  input: {
    tenantId: string
    actorId: string
    personProfileId: string
    employmentId: string
    fullName: string
    employeeCode: string
  },
): Promise<void> {
  await db.execute(sql`
    INSERT INTO people.person_profile (
      id,
      tenant_id,
      actor_id,
      family_name,
      given_name,
      full_name,
      full_name_unaccented,
      name_display_order,
      created_at,
      updated_at
    ) VALUES (
      ${input.personProfileId},
      ${input.tenantId},
      ${input.actorId},
      ${input.fullName.split(' ').at(-1) ?? input.fullName},
      ${input.fullName.split(' ')[0] ?? input.fullName},
      ${input.fullName},
      ${input.fullName},
      'given_first',
      NOW(),
      NOW()
    )
  `)
  await db.execute(sql`
    INSERT INTO people.employment (
      id,
      tenant_id,
      person_profile_id,
      employee_code,
      worker_type,
      employment_type,
      country_code,
      employment_status,
      hire_date,
      created_at,
      updated_at
    ) VALUES (
      ${input.employmentId},
      ${input.tenantId},
      ${input.personProfileId},
      ${input.employeeCode},
      'employee',
      'permanent',
      'VN',
      'active',
      DATE '2025-01-01',
      NOW(),
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

function createAuthorizedCaller(tenantId: string, actorId: string) {
  return createPeopleRouter(
    createProtectedProcedures(
      publicProcedure,
      { canDo: async () => true } as unknown as KernelQueryFacade,
      { recordEvent: async () => undefined } as unknown as KernelAuditFacade,
    ).permissionProtectedProcedure,
    {} as unknown as PeopleQueryFacade,
    {} as unknown as KernelQueryFacade,
    {} as unknown as KernelAuditFacade,
  ).createCaller({
    req: { headers: {} },
    tenantId,
    actorId,
  } as never)
}

async function seedDirectoryFixtureRows(
  db: Db,
  repo: DrizzleDirectorySearchIndexRepository,
  tenantId: string,
): Promise<void> {
  await seedTenant(db, { id: tenantId, slug: 'people-router-directory-fixtures' })
  await seedDepartment(db, tenantId, HIERARCHY_ENGINEERING, 'Engineering', null)
  await seedDepartment(db, tenantId, HIERARCHY_BACKEND, 'Backend', HIERARCHY_ENGINEERING)
  await seedDepartment(db, tenantId, HIERARCHY_API, 'API', HIERARCHY_BACKEND)

  const rows = [
    ['01900000-0000-7000-8000-000000000401', 'Alice Nguyen', 'Engineering', HIERARCHY_ENGINEERING],
    ['01900000-0000-7000-8000-000000000402', 'Bob Tran', 'Backend', HIERARCHY_BACKEND],
    ['01900000-0000-7000-8000-000000000403', 'Carol Pham', 'API', HIERARCHY_API],
    ['01900000-0000-7000-8000-000000000404', 'David Le', 'Engineering', HIERARCHY_ENGINEERING],
    ['01900000-0000-7000-8000-000000000405', 'Ellen Vo', 'Engineering', HIERARCHY_ENGINEERING],
    ['01900000-0000-7000-8000-000000000406', 'Frank Ho', 'Engineering', HIERARCHY_ENGINEERING],
    ['01900000-0000-7000-8000-000000000407', 'Grace Do', 'Engineering', HIERARCHY_ENGINEERING],
    ['01900000-0000-7000-8000-000000000408', 'Henry Bui', 'Engineering', HIERARCHY_ENGINEERING],
    ['01900000-0000-7000-8000-000000000409', 'Ivy Dang', 'Engineering', HIERARCHY_ENGINEERING],
    ['01900000-0000-7000-8000-000000000410', 'Jack Ngo', 'Engineering', HIERARCHY_ENGINEERING],
    ['01900000-0000-7000-8000-000000000411', 'Kate Truong', 'Engineering', HIERARCHY_ENGINEERING],
    ['01900000-0000-7000-8000-000000000412', 'Liam Vu', 'Engineering', HIERARCHY_ENGINEERING],
  ] as const

  for (const [employmentId, fullName, departmentName, departmentId] of rows) {
    await seedCurrentAssignment(db, tenantId, employmentId, departmentId)
    await repo.upsert(
      makeDirectoryRow({
        tenantId,
        employmentId,
        fullName,
        departmentName,
      }),
    )
  }
}

describe('people.directory tRPC sub-router', () => {
  const db = createTestDb()
  let repo: DrizzleDirectorySearchIndexRepository
  let caller: ReturnType<ReturnType<typeof createPeopleRouter>['createCaller']>

  beforeAll(async () => {
    await migrateForTest()
    repo = new DrizzleDirectorySearchIndexRepository(db as never)
    const exportDirectory = new ExportDirectoryHandler(repo as never)

    const kernelFacade = { canDo: async () => true }
    const auditFacade = { recordEvent: async () => undefined }
    const { permissionProtectedProcedure } = createProtectedProcedures(
      publicProcedure,
      kernelFacade as unknown as KernelQueryFacade,
      auditFacade as unknown as KernelAuditFacade,
    )

    new PeopleTrpcService(
      { execute: async () => undefined } as never,
      {
        execute: async (query: unknown) => {
          if (query instanceof ListDirectoryQuery) {
            return repo.list(query.tenantId, query.filters, query.limit, query.offset)
          }
          if (query instanceof SearchDirectoryQuery) {
            return repo.search(
              query.tenantId,
              query.query,
              query.filters,
              query.limit,
              query.offset,
            )
          }
          if (query instanceof ExportDirectoryQuery) {
            return exportDirectory.execute(query)
          }
          throw new Error('Unexpected query')
        },
      } as never,
    ).onModuleInit()

    caller = createPeopleRouter(
      permissionProtectedProcedure,
      {} as unknown as PeopleQueryFacade,
      kernelFacade as unknown as KernelQueryFacade,
      auditFacade as unknown as KernelAuditFacade,
    ).createCaller(makeCtx() as never)

    await truncateDirectorySearchIndex(db)
    await truncatePeopleSchema(db)
    await truncateCoreSchema(db)
    await setTenantContext(db, TENANT_A)
    await seedDirectoryFixtureRows(db, repo, TENANT_A)
  })

  afterAll(async () => {
    await truncateDirectorySearchIndex(db)
    await truncatePeopleSchema(db)
    await truncateCoreSchema(db)
  })

  it('list — returns standard response shape', async () => {
    const result = await caller.directory.list(baseQuery)

    expect(result).toHaveProperty('rows')
    expect(result).toHaveProperty('totalCount')
    expect(result).toHaveProperty('pageCount')
    expect(result).toHaveProperty('pageIndex')
    expect(result).toHaveProperty('pageSize')
    expect(result).toHaveProperty('facets')
    expect(Array.isArray(result.rows)).toBe(true)
    expect(typeof result.totalCount).toBe('number')
  })

  it('list — returns all fixture rows when no search/filters', async () => {
    const result = await caller.directory.list({
      ...baseQuery,
      pagination: { pageIndex: 0, pageSize: 100 },
    })

    expect(result.totalCount).toBe(12)
    expect(result.rows).toHaveLength(12)
  })

  it('list — search filters rows by fullName (case-insensitive)', async () => {
    const result = await caller.directory.list({ ...baseQuery, search: 'alice' })

    expect(result.rows).toHaveLength(1)
    expect((result.rows[0] as { fullName: string }).fullName).toBe('Alice Nguyen')
    expect(result.totalCount).toBe(1)
  })

  it('list — filters by departmentId and expands descendant departments', async () => {
    const result = await caller.directory.list({
      ...baseQuery,
      filters: [{ field: 'departmentId', operator: 'eq', value: HIERARCHY_ENGINEERING }],
      pagination: { pageIndex: 0, pageSize: 100 },
    })

    expect(
      result.rows.every((r) =>
        ['Engineering', 'Backend', 'API'].includes((r as { department: string }).department),
      ),
    ).toBe(true)
    expect(result.totalCount).toBe(12)
  })

  it('list — filters by employmentStatus', async () => {
    const result = await caller.directory.list({
      ...baseQuery,
      filters: [{ field: 'employmentStatus', operator: 'eq', value: 'active' }],
      pagination: { pageIndex: 0, pageSize: 100 },
    })

    expect(
      result.rows.every((r) => (r as { employmentStatus: string }).employmentStatus === 'active'),
    ).toBe(true)
  })

  it('list — ignores unsupported employmentType filters', async () => {
    const result = await caller.directory.list({
      ...baseQuery,
      filters: [{ field: 'employmentType', operator: 'eq', value: 'permanent' }],
      pagination: { pageIndex: 0, pageSize: 100 },
    })

    expect(result.totalCount).toBe(12)
  })

  it('list — returns fullName order for ascending sort input', async () => {
    const result = await caller.directory.list({
      ...baseQuery,
      sorting: [{ field: 'fullName', direction: 'asc' }],
      pagination: { pageIndex: 0, pageSize: 100 },
    })

    const names = result.rows.map((r) => (r as { fullName: string }).fullName)
    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)
  })

  it('list — does not apply descending sort input yet', async () => {
    const result = await caller.directory.list({
      ...baseQuery,
      sorting: [{ field: 'fullName', direction: 'desc' }],
      pagination: { pageIndex: 0, pageSize: 100 },
    })

    const names = result.rows.map((r) => (r as { fullName: string }).fullName)
    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)
  })

  it('list — pagination returns correct page slice', async () => {
    const result = await caller.directory.list({
      ...baseQuery,
      sorting: [{ field: 'fullName', direction: 'asc' }],
      pagination: { pageIndex: 1, pageSize: 5 },
    })

    expect(result.rows).toHaveLength(5)
    expect(result.pageIndex).toBe(1)
    expect(result.pageSize).toBe(5)
    expect(result.pageCount).toBe(Math.ceil(12 / 5))
  })

  it('list — ignores unsupported sort fields', async () => {
    const result = await caller.directory.list({
      ...baseQuery,
      sorting: [{ field: 'nonExistentField', direction: 'asc' }],
      pagination: { pageIndex: 0, pageSize: 100 },
    })

    expect(result.totalCount).toBe(12)
  })

  it('list — ignores unsupported filter fields', async () => {
    const result = await caller.directory.list({
      ...baseQuery,
      filters: [{ field: 'nonExistentField', operator: 'eq', value: 'foo' }],
      pagination: { pageIndex: 0, pageSize: 100 },
    })

    expect(result.totalCount).toBe(12)
  })

  it('list — returns empty facets collections in the response shape', async () => {
    const result = await caller.directory.list(baseQuery)

    expect(result.facets).toEqual({
      departments: [],
      jobFamilies: [],
      countries: [],
      locations: [],
    })
  })

  it('export — returns CSV for filtered result set (ignoring pagination)', async () => {
    const result = await caller.directory.export({
      resourceKey: 'people.directory',
      search: '',
      filters: [{ field: 'departmentId', operator: 'eq', value: HIERARCHY_ENGINEERING }],
      sorting: [{ field: 'fullName', direction: 'asc' }],
    })

    expect(result).toHaveProperty('filename')
    expect(result).toHaveProperty('csv')
    expect((result as { filename: string }).filename).toMatch(
      /^directory-export-\d{4}-\d{2}-\d{2}\.csv$/,
    )
    const csv = (result as { csv: string }).csv
    expect(csv).toContain('fullName')
    expect(csv).toContain('Alice Nguyen')
    expect(csv).toContain('Bob Tran')
  })

  it('export — returns the current CSV filename contract for successful exports', async () => {
    const result = await caller.directory.export({
      resourceKey: 'people.directory',
      search: '',
      filters: [],
      sorting: [],
    })

    expect((result as { filename: string }).filename).toMatch(
      /^directory-export-\d{4}-\d{2}-\d{2}\.csv$/,
    )
  })
})

describe('people.directory tRPC sub-router - hierarchy integration', () => {
  const db = createTestDb()
  let repo: DrizzleDirectorySearchIndexRepository
  let orgChart: OrgChartQueryService
  let caller: ReturnType<typeof peopleRouter.createCaller>

  beforeAll(async () => {
    await migrateForTest()
    repo = new DrizzleDirectorySearchIndexRepository(db as never)
    orgChart = new OrgChartQueryService(
      new DrizzleEmploymentRepository(db as never),
      new DrizzleJobAssignmentRepository(db as never),
      repo,
    )

    const kernelFacade = {
      canDo: async () => true,
    }
    const auditFacade = {
      recordEvent: async () => undefined,
    }
    const { permissionProtectedProcedure } = createProtectedProcedures(
      publicProcedure,
      kernelFacade as unknown as KernelQueryFacade,
      auditFacade as unknown as KernelAuditFacade,
    )
    const peopleFacade = {} as unknown as PeopleQueryFacade
    const peopleDirectoryRouter = createPeopleRouter(
      permissionProtectedProcedure,
      peopleFacade,
      kernelFacade as unknown as KernelQueryFacade,
      auditFacade as unknown as KernelAuditFacade,
    )

    new PeopleTrpcService(
      { execute: async () => undefined } as never,
      {
        execute: async (query: unknown) => {
          if (query instanceof ListDirectoryQuery) {
            return repo.list(query.tenantId, query.filters, query.limit, query.offset)
          }
          if (query instanceof GetOrgChartContextQuery) {
            return orgChart.getContext(query.tenantId, query.actorId)
          }
          if (query instanceof GetOrgChartChildrenQuery) {
            return orgChart.getChildren(query.tenantId, query.employmentId)
          }
          throw new Error('Unexpected query')
        },
      } as never,
    ).onModuleInit()

    caller = peopleDirectoryRouter.createCaller({
      req: { headers: {} },
      tenantId: HIERARCHY_TENANT,
      actorId: ACTOR_A,
    } as never)
  })

  beforeAll(async () => {
    await truncateDirectorySearchIndex(db)
    await truncatePeopleSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: HIERARCHY_TENANT, slug: 'people-router-hierarchy' })
    await seedTenant(db, { id: OTHER_HIERARCHY_TENANT, slug: 'people-router-hierarchy-other' })
    await setTenantContext(db, HIERARCHY_TENANT)
  })

  afterAll(async () => {
    await truncateDirectorySearchIndex(db)
    await truncatePeopleSchema(db)
    await truncateCoreSchema(db)
  })

  it('listDirectory expands descendant departments through the tRPC router', async () => {
    await seedDepartment(db, HIERARCHY_TENANT, HIERARCHY_ENGINEERING, 'Engineering', null)
    await seedDepartment(db, HIERARCHY_TENANT, HIERARCHY_BACKEND, 'Backend', HIERARCHY_ENGINEERING)
    await seedDepartment(db, HIERARCHY_TENANT, HIERARCHY_API, 'API', HIERARCHY_BACKEND)

    const engineeringEmployment = uuidv7()
    const backendEmployment = uuidv7()
    const apiEmployment = uuidv7()

    await seedCurrentAssignment(db, HIERARCHY_TENANT, engineeringEmployment, HIERARCHY_ENGINEERING)
    await seedCurrentAssignment(db, HIERARCHY_TENANT, backendEmployment, HIERARCHY_BACKEND)
    await seedCurrentAssignment(db, HIERARCHY_TENANT, apiEmployment, HIERARCHY_API)

    await repo.upsert(
      makeDirectoryRow({
        tenantId: HIERARCHY_TENANT,
        employmentId: engineeringEmployment,
        fullName: 'Engineering Employee',
        departmentName: 'Engineering',
      }),
    )
    await repo.upsert(
      makeDirectoryRow({
        tenantId: HIERARCHY_TENANT,
        employmentId: backendEmployment,
        fullName: 'Backend Employee',
        departmentName: 'Backend',
      }),
    )
    await repo.upsert(
      makeDirectoryRow({
        tenantId: HIERARCHY_TENANT,
        employmentId: apiEmployment,
        fullName: 'API Employee',
        departmentName: 'API',
      }),
    )

    const result = await caller.directory.listDirectory({
      filters: { departmentId: HIERARCHY_ENGINEERING },
      limit: 100,
      offset: 0,
    })

    expect(result.total).toBe(3)
    expect(result.items.map((item) => item.departmentName).sort()).toEqual([
      'API',
      'Backend',
      'Engineering',
    ])
  })

  it('orgChart returns viewer context, lazy children, and excludes other tenants', async () => {
    await seedHierarchyDepartments(db, HIERARCHY_TENANT)
    await seedHierarchyDepartments(db, OTHER_HIERARCHY_TENANT)

    await seedPersonAndEmployment(db, {
      tenantId: HIERARCHY_TENANT,
      actorId: ORG_MANAGER_ACTOR,
      personProfileId: '01900000-0000-7fff-8000-000000000341',
      employmentId: ORG_MANAGER_EMPLOYMENT,
      fullName: 'Morgan Manager',
      employeeCode: 'MGR',
    })
    await seedPersonAndEmployment(db, {
      tenantId: HIERARCHY_TENANT,
      actorId: ORG_VIEWER_ACTOR,
      personProfileId: '01900000-0000-7fff-8000-000000000342',
      employmentId: ORG_VIEWER_EMPLOYMENT,
      fullName: 'Sam Self',
      employeeCode: 'SELF',
    })
    await seedPersonAndEmployment(db, {
      tenantId: HIERARCHY_TENANT,
      actorId: ORG_PEER_ACTOR,
      personProfileId: '01900000-0000-7fff-8000-000000000343',
      employmentId: ORG_PEER_EMPLOYMENT,
      fullName: 'Pat Peer',
      employeeCode: 'PEER',
    })
    await seedPersonAndEmployment(db, {
      tenantId: HIERARCHY_TENANT,
      actorId: ORG_REPORT_ACTOR,
      personProfileId: '01900000-0000-7fff-8000-000000000344',
      employmentId: ORG_REPORT_EMPLOYMENT,
      fullName: 'Riley Report',
      employeeCode: 'RPT',
    })
    await seedPersonAndEmployment(db, {
      tenantId: OTHER_HIERARCHY_TENANT,
      actorId: ORG_OTHER_ACTOR,
      personProfileId: '01900000-0000-7fff-8000-000000000345',
      employmentId: ORG_OTHER_EMPLOYMENT,
      fullName: 'Other Tenant',
      employeeCode: 'OTHER',
    })

    await seedCurrentAssignment(db, HIERARCHY_TENANT, ORG_MANAGER_EMPLOYMENT, HIERARCHY_ENGINEERING)
    await seedCurrentAssignment(
      db,
      HIERARCHY_TENANT,
      ORG_VIEWER_EMPLOYMENT,
      HIERARCHY_BACKEND,
      ORG_MANAGER_EMPLOYMENT,
    )
    await seedCurrentAssignment(
      db,
      HIERARCHY_TENANT,
      ORG_PEER_EMPLOYMENT,
      HIERARCHY_BACKEND,
      ORG_MANAGER_EMPLOYMENT,
    )
    await seedCurrentAssignment(
      db,
      HIERARCHY_TENANT,
      ORG_REPORT_EMPLOYMENT,
      HIERARCHY_API,
      ORG_VIEWER_EMPLOYMENT,
    )
    await seedCurrentAssignment(
      db,
      OTHER_HIERARCHY_TENANT,
      ORG_OTHER_EMPLOYMENT,
      HIERARCHY_API,
      ORG_VIEWER_EMPLOYMENT,
    )

    for (const row of [
      [ORG_MANAGER_EMPLOYMENT, 'Morgan Manager', 'Engineering'] as const,
      [ORG_VIEWER_EMPLOYMENT, 'Sam Self', 'Backend'] as const,
      [ORG_PEER_EMPLOYMENT, 'Pat Peer', 'Backend'] as const,
      [ORG_REPORT_EMPLOYMENT, 'Riley Report', 'API'] as const,
    ]) {
      await repo.upsert(
        makeDirectoryRow({
          tenantId: HIERARCHY_TENANT,
          employmentId: row[0],
          fullName: row[1],
          departmentName: row[2],
        }),
      )
    }
    await repo.upsert(
      makeDirectoryRow({
        tenantId: OTHER_HIERARCHY_TENANT,
        employmentId: ORG_OTHER_EMPLOYMENT,
        fullName: 'Other Tenant',
        departmentName: 'API',
      }),
    )

    const orgCaller = createAuthorizedCaller(HIERARCHY_TENANT, ORG_VIEWER_ACTOR)

    const context = await orgCaller.orgChart.context()
    expect(context.focusEmploymentId).toBe(ORG_VIEWER_EMPLOYMENT)
    expect(context.nodes.map((node) => node.relationshipToViewer)).toEqual([
      'manager',
      'self',
      'peer',
      'direct_report',
    ])
    expect(context.nodes.every((node) => node.employmentId !== ORG_OTHER_EMPLOYMENT)).toBe(true)

    const children = await orgCaller.orgChart.children({ employmentId: ORG_VIEWER_EMPLOYMENT })
    expect(children).toHaveLength(1)
    expect(children[0]).toMatchObject({
      employmentId: ORG_REPORT_EMPLOYMENT,
      fullName: 'Riley Report',
      managerEmploymentId: ORG_VIEWER_EMPLOYMENT,
    })
  })

  it('orgChart returns root fallback when the viewer has no employment in the tenant', async () => {
    await seedTenant(db, { id: ROOT_FALLBACK_TENANT, slug: 'people-router-root-fallback' })
    await seedDepartment(db, ROOT_FALLBACK_TENANT, ROOT_FALLBACK_ENGINEERING, 'Engineering', null)
    await seedDepartment(db, ROOT_FALLBACK_TENANT, ROOT_FALLBACK_OPERATIONS, 'Operations', null)
    await seedPersonAndEmployment(db, {
      tenantId: ROOT_FALLBACK_TENANT,
      actorId: ROOT_FALLBACK_MANAGER_ACTOR,
      personProfileId: '01900000-0000-7fff-8000-000000000348',
      employmentId: ROOT_FALLBACK_MANAGER_EMPLOYMENT,
      fullName: 'Root Manager',
      employeeCode: 'ROOT-MGR',
    })
    await seedPersonAndEmployment(db, {
      tenantId: ROOT_FALLBACK_TENANT,
      actorId: ROOT_FALLBACK_DIRECTOR_ACTOR,
      personProfileId: '01900000-0000-7fff-8000-000000000349',
      employmentId: ROOT_FALLBACK_DIRECTOR_EMPLOYMENT,
      fullName: 'Root Director',
      employeeCode: 'ROOT-DIR',
    })
    await seedCurrentAssignment(
      db,
      ROOT_FALLBACK_TENANT,
      ROOT_FALLBACK_MANAGER_EMPLOYMENT,
      ROOT_FALLBACK_ENGINEERING,
    )
    await seedCurrentAssignment(
      db,
      ROOT_FALLBACK_TENANT,
      ROOT_FALLBACK_DIRECTOR_EMPLOYMENT,
      ROOT_FALLBACK_OPERATIONS,
    )
    await repo.upsert(
      makeDirectoryRow({
        tenantId: ROOT_FALLBACK_TENANT,
        employmentId: ROOT_FALLBACK_MANAGER_EMPLOYMENT,
        fullName: 'Root Manager',
        departmentName: 'Engineering',
      }),
    )
    await repo.upsert(
      makeDirectoryRow({
        tenantId: ROOT_FALLBACK_TENANT,
        employmentId: ROOT_FALLBACK_DIRECTOR_EMPLOYMENT,
        fullName: 'Root Director',
        departmentName: 'Operations',
      }),
    )

    const rootCaller = createAuthorizedCaller(
      ROOT_FALLBACK_TENANT,
      '01900000-0000-7fff-8000-000000000399',
    )

    const context = await rootCaller.orgChart.context()

    expect(context.focusEmploymentId).toBeNull()
    expect(context.nodes).toHaveLength(2)
    expect(context.nodes.map((node) => node.employmentId).sort()).toEqual(
      [ROOT_FALLBACK_DIRECTOR_EMPLOYMENT, ROOT_FALLBACK_MANAGER_EMPLOYMENT].sort(),
    )
    expect(context.nodes.every((node) => node.relationshipToViewer === 'root')).toBe(true)
  })

  it('orgChart children maps missing nodes to a TRPC not-found error', async () => {
    await seedHierarchyDepartments(db, HIERARCHY_TENANT)

    const orgCaller = createAuthorizedCaller(HIERARCHY_TENANT, ORG_VIEWER_ACTOR)

    await expect(
      orgCaller.orgChart.children({
        employmentId: '01900000-0000-7000-8000-000000000099',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Org chart node not found',
    } satisfies Partial<TRPCError>)
  })
})
