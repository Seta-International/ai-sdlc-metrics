import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListDirectoryQuery } from './list-directory.query'
import { ListDirectoryHandler } from './list-directory.handler'
import type { IDirectorySearchIndexRepository } from '../../domain/repositories/directory-search-index.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('ListDirectoryHandler', () => {
  let handler: ListDirectoryHandler
  let searchRepo: IDirectorySearchIndexRepository

  beforeEach(() => {
    searchRepo = {
      upsert: vi.fn(),
      deleteByEmploymentId: vi.fn(),
      search: vi.fn(),
      list: vi.fn(),
      rebuildAll: vi.fn(),
      countByTenant: vi.fn(),
      listCompanyEmails: vi.fn(),
    }
    handler = new ListDirectoryHandler(searchRepo)
  })

  it('delegates to searchRepo.list with tenantId, filters, limit, offset', async () => {
    vi.mocked(searchRepo.list).mockResolvedValue({ items: [], total: 0 })

    const filters = { countryCode: 'VN' }
    await handler.execute(new ListDirectoryQuery(TENANT_ID, filters, 50, 10))

    expect(searchRepo.list).toHaveBeenCalledWith(TENANT_ID, filters, 50, 10)
  })

  it('returns items and total from repository', async () => {
    const mockItems = [
      {
        id: 'idx-1',
        tenantId: TENANT_ID,
        employmentId: 'emp-1',
        fullName: 'Nguyễn Văn An',
        fullNameUnaccented: 'Nguyen Van An',
        companyEmail: 'an.nguyen@seta.vn',
        jobTitle: 'Engineer',
        jobLevel: 'L4',
        departmentName: 'Engineering',
        locationName: null,
        managerName: null,
        workArrangement: 'hybrid',
        employmentStatus: 'active',
        hireDate: new Date('2025-01-15'),
        skills: [],
        countryCode: 'VN',
        updatedAt: new Date(),
      },
    ]
    vi.mocked(searchRepo.list).mockResolvedValue({ items: mockItems, total: 1 })

    const result = await handler.execute(new ListDirectoryQuery(TENANT_ID, {}, 25, 0))

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.items[0].fullName).toBe('Nguyễn Văn An')
  })
})

describe('ListDirectoryHandler - department hierarchy filtering', () => {
  let handler: ListDirectoryHandler
  let searchRepo: IDirectorySearchIndexRepository

  // Mock department IDs
  const ENGINEERING_DEPT_ID = '01900000-0000-7000-8000-000000000010'
  const BACKEND_DEPT_ID = '01900000-0000-7000-8000-000000000011'
  const API_DEPT_ID = '01900000-0000-7000-8000-000000000012'

  const makeDirectoryItem = (
    overrides: Partial<Record<string, unknown>> = {},
  ): Record<string, unknown> => ({
    id: 'idx-1',
    tenantId: TENANT_ID,
    employmentId: 'emp-1',
    fullName: 'Test Employee',
    fullNameUnaccented: 'Test Employee',
    companyEmail: 'test@seta.vn',
    jobTitle: 'Engineer',
    jobLevel: 'L4',
    departmentName: 'Engineering',
    locationName: null,
    managerName: null,
    workArrangement: 'hybrid',
    employmentStatus: 'active',
    hireDate: new Date('2025-01-15'),
    skills: [],
    countryCode: 'VN',
    updatedAt: new Date(),
    ...overrides,
  })

  beforeEach(() => {
    searchRepo = {
      upsert: vi.fn(),
      deleteByEmploymentId: vi.fn(),
      search: vi.fn(),
      list: vi.fn(),
      rebuildAll: vi.fn(),
      countByTenant: vi.fn(),
      listCompanyEmails: vi.fn(),
    }
    handler = new ListDirectoryHandler(searchRepo)
  })

  it('filters by parent "Engineering" returns all descendants (2 in Engineering + 3 in Backend + 4 in API = 9 total)', async () => {
    // Mock: when filtering by Engineering dept ID, return 9 employees (from all 3 levels)
    const mockItems = [
      makeDirectoryItem({
        id: 'idx-1',
        employmentId: 'emp-1',
        fullName: 'Eng Employee 1',
        departmentName: 'Engineering',
      }),
      makeDirectoryItem({
        id: 'idx-2',
        employmentId: 'emp-2',
        fullName: 'Eng Employee 2',
        departmentName: 'Engineering',
      }),
      makeDirectoryItem({
        id: 'idx-3',
        employmentId: 'emp-3',
        fullName: 'Backend Employee 1',
        departmentName: 'Backend',
      }),
      makeDirectoryItem({
        id: 'idx-4',
        employmentId: 'emp-4',
        fullName: 'Backend Employee 2',
        departmentName: 'Backend',
      }),
      makeDirectoryItem({
        id: 'idx-5',
        employmentId: 'emp-5',
        fullName: 'Backend Employee 3',
        departmentName: 'Backend',
      }),
      makeDirectoryItem({
        id: 'idx-6',
        employmentId: 'emp-6',
        fullName: 'API Employee 1',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-7',
        employmentId: 'emp-7',
        fullName: 'API Employee 2',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-8',
        employmentId: 'emp-8',
        fullName: 'API Employee 3',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-9',
        employmentId: 'emp-9',
        fullName: 'API Employee 4',
        departmentName: 'API',
      }),
    ]

    vi.mocked(searchRepo.list).mockResolvedValue({ items: mockItems, total: 9 })

    const result = await handler.execute(
      new ListDirectoryQuery(TENANT_ID, { departmentId: ENGINEERING_DEPT_ID }, 100, 0),
    )

    expect(result.items).toHaveLength(9)
    expect(result.total).toBe(9)
  })

  it('filters by middle "Backend" returns only it and descendants, NOT ancestors (3 in Backend + 4 in API = 7 total)', async () => {
    // Mock: when filtering by Backend dept ID, return 7 employees (3 in Backend + 4 in API, NOT the 2 in Engineering)
    const mockItems = [
      makeDirectoryItem({
        id: 'idx-3',
        employmentId: 'emp-3',
        fullName: 'Backend Employee 1',
        departmentName: 'Backend',
      }),
      makeDirectoryItem({
        id: 'idx-4',
        employmentId: 'emp-4',
        fullName: 'Backend Employee 2',
        departmentName: 'Backend',
      }),
      makeDirectoryItem({
        id: 'idx-5',
        employmentId: 'emp-5',
        fullName: 'Backend Employee 3',
        departmentName: 'Backend',
      }),
      makeDirectoryItem({
        id: 'idx-6',
        employmentId: 'emp-6',
        fullName: 'API Employee 1',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-7',
        employmentId: 'emp-7',
        fullName: 'API Employee 2',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-8',
        employmentId: 'emp-8',
        fullName: 'API Employee 3',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-9',
        employmentId: 'emp-9',
        fullName: 'API Employee 4',
        departmentName: 'API',
      }),
    ]

    vi.mocked(searchRepo.list).mockResolvedValue({ items: mockItems, total: 7 })

    const result = await handler.execute(
      new ListDirectoryQuery(TENANT_ID, { departmentId: BACKEND_DEPT_ID }, 100, 0),
    )

    expect(result.items).toHaveLength(7)
    expect(result.total).toBe(7)
    // Ensure NO Engineering employees are returned
    expect(result.items.every((item) => item.departmentName !== 'Engineering')).toBe(true)
  })

  it('filters by leaf "API" returns only that level (4 employees)', async () => {
    // Mock: when filtering by API dept ID, return 4 employees
    const mockItems = [
      makeDirectoryItem({
        id: 'idx-6',
        employmentId: 'emp-6',
        fullName: 'API Employee 1',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-7',
        employmentId: 'emp-7',
        fullName: 'API Employee 2',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-8',
        employmentId: 'emp-8',
        fullName: 'API Employee 3',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-9',
        employmentId: 'emp-9',
        fullName: 'API Employee 4',
        departmentName: 'API',
      }),
    ]

    vi.mocked(searchRepo.list).mockResolvedValue({ items: mockItems, total: 4 })

    const result = await handler.execute(
      new ListDirectoryQuery(TENANT_ID, { departmentId: API_DEPT_ID }, 100, 0),
    )

    expect(result.items).toHaveLength(4)
    expect(result.total).toBe(4)
    expect(result.items.every((item) => item.departmentName === 'API')).toBe(true)
  })

  it('filters by leaf with no sub-departments returns only that department (4 employees)', async () => {
    // Test that filtering by a leaf node (API with no children) works correctly
    const mockItems = [
      makeDirectoryItem({
        id: 'idx-6',
        employmentId: 'emp-6',
        fullName: 'API Employee 1',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-7',
        employmentId: 'emp-7',
        fullName: 'API Employee 2',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-8',
        employmentId: 'emp-8',
        fullName: 'API Employee 3',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-9',
        employmentId: 'emp-9',
        fullName: 'API Employee 4',
        departmentName: 'API',
      }),
    ]

    vi.mocked(searchRepo.list).mockResolvedValue({ items: mockItems, total: 4 })

    const result = await handler.execute(
      new ListDirectoryQuery(TENANT_ID, { departmentId: API_DEPT_ID }, 100, 0),
    )

    expect(result.items).toHaveLength(4)
    expect(result.total).toBe(4)
  })

  it('with no department filter returns all employees (9 total)', async () => {
    // Test existing behavior: when no departmentId filter is provided, all employees are returned
    const mockItems = [
      makeDirectoryItem({
        id: 'idx-1',
        employmentId: 'emp-1',
        fullName: 'Eng Employee 1',
        departmentName: 'Engineering',
      }),
      makeDirectoryItem({
        id: 'idx-2',
        employmentId: 'emp-2',
        fullName: 'Eng Employee 2',
        departmentName: 'Engineering',
      }),
      makeDirectoryItem({
        id: 'idx-3',
        employmentId: 'emp-3',
        fullName: 'Backend Employee 1',
        departmentName: 'Backend',
      }),
      makeDirectoryItem({
        id: 'idx-4',
        employmentId: 'emp-4',
        fullName: 'Backend Employee 2',
        departmentName: 'Backend',
      }),
      makeDirectoryItem({
        id: 'idx-5',
        employmentId: 'emp-5',
        fullName: 'Backend Employee 3',
        departmentName: 'Backend',
      }),
      makeDirectoryItem({
        id: 'idx-6',
        employmentId: 'emp-6',
        fullName: 'API Employee 1',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-7',
        employmentId: 'emp-7',
        fullName: 'API Employee 2',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-8',
        employmentId: 'emp-8',
        fullName: 'API Employee 3',
        departmentName: 'API',
      }),
      makeDirectoryItem({
        id: 'idx-9',
        employmentId: 'emp-9',
        fullName: 'API Employee 4',
        departmentName: 'API',
      }),
    ]

    vi.mocked(searchRepo.list).mockResolvedValue({ items: mockItems, total: 9 })

    const result = await handler.execute(
      new ListDirectoryQuery(TENANT_ID, { departmentId: undefined }, 100, 0),
    )

    expect(result.items).toHaveLength(9)
    expect(result.total).toBe(9)
  })
})
