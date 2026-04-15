import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportDirectoryQuery } from './export-directory.query'
import { ExportDirectoryHandler } from './export-directory.handler'
import type { IDirectorySearchIndexRepository } from '../../domain/repositories/directory-search-index.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

const makeItem = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'idx-1',
  tenantId: TENANT_ID,
  employmentId: 'emp-1',
  fullName: 'Nguyen Van An',
  fullNameUnaccented: 'Nguyen Van An',
  companyEmail: 'an.nguyen@seta.vn',
  jobTitle: 'Software Engineer',
  jobLevel: 'L4',
  departmentName: 'Engineering',
  locationName: 'HCMC',
  managerName: null,
  workArrangement: 'hybrid',
  employmentStatus: 'active',
  hireDate: new Date('2025-01-15'),
  skills: [],
  countryCode: 'VN',
  updatedAt: new Date(),
  ...overrides,
})

describe('ExportDirectoryHandler', () => {
  let handler: ExportDirectoryHandler
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
    handler = new ExportDirectoryHandler(searchRepo)
  })

  it('produces CSV with UTF-8 BOM and header row', async () => {
    vi.mocked(searchRepo.list).mockResolvedValue({ items: [makeItem()], total: 1 })

    const result = await handler.execute(new ExportDirectoryQuery(TENANT_ID, ACTOR_ID, {}, 'csv'))

    const csv = result.data.toString('utf-8')
    expect(csv.charCodeAt(0)).toBe(0xfeff) // UTF-8 BOM
    expect(csv).toContain('fullName,companyEmail,jobTitle')
    expect(result.mimeType).toBe('text/csv; charset=utf-8')
    expect(result.filename).toMatch(/^directory-export-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('includes data rows in CSV output', async () => {
    vi.mocked(searchRepo.list).mockResolvedValue({ items: [makeItem()], total: 1 })

    const result = await handler.execute(new ExportDirectoryQuery(TENANT_ID, ACTOR_ID, {}, 'csv'))

    const csv = result.data.toString('utf-8')
    expect(csv).toContain('Nguyen Van An')
    expect(csv).toContain('an.nguyen@seta.vn')
  })

  it('escapes commas and double-quotes in CSV values', async () => {
    vi.mocked(searchRepo.list).mockResolvedValue({
      items: [makeItem({ fullName: 'Smith, John "Jr"' })],
      total: 1,
    })

    const result = await handler.execute(
      new ExportDirectoryQuery(TENANT_ID, ACTOR_ID, {}, 'csv', ['fullName']),
    )

    const csv = result.data.toString('utf-8')
    // Must be wrapped in quotes and inner quotes doubled
    expect(csv).toContain('"Smith, John ""Jr"""')
  })

  it('outputs empty string for null values', async () => {
    vi.mocked(searchRepo.list).mockResolvedValue({
      items: [makeItem({ jobTitle: null })],
      total: 1,
    })

    const result = await handler.execute(
      new ExportDirectoryQuery(TENANT_ID, ACTOR_ID, {}, 'csv', ['fullName', 'jobTitle']),
    )

    const csv = result.data.toString('utf-8')
    const lines = csv.replace(/^\uFEFF/, '').split('\n')
    // data row: fullName,<empty>
    expect(lines[1]).toBe('Nguyen Van An,')
  })

  it('throws for xlsx format', async () => {
    vi.mocked(searchRepo.list).mockResolvedValue({ items: [], total: 0 })

    await expect(
      handler.execute(new ExportDirectoryQuery(TENANT_ID, ACTOR_ID, {}, 'xlsx')),
    ).rejects.toThrow('XLSX export not implemented yet')
  })
})
