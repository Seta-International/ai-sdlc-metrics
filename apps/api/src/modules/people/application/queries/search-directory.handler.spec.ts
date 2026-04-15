import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchDirectoryQuery } from './search-directory.query'
import { SearchDirectoryHandler } from './search-directory.handler'
import type { IDirectorySearchIndexRepository } from '../../domain/repositories/directory-search-index.repository'
import { computeFullNameUnaccented } from '../../domain/value-objects/name-display-order'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('SearchDirectoryHandler', () => {
  let handler: SearchDirectoryHandler
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
    handler = new SearchDirectoryHandler(searchRepo)
  })

  it('normalizes Vietnamese diacritics in search query', async () => {
    vi.mocked(searchRepo.search).mockResolvedValue({ items: [], total: 0 })

    await handler.execute(new SearchDirectoryQuery(TENANT_ID, 'Nguyễn Văn', {}, 25, 0))

    expect(searchRepo.search).toHaveBeenCalledWith(TENANT_ID, 'nguyen van', {}, 25, 0)
  })

  it('passes filters through to repository', async () => {
    vi.mocked(searchRepo.search).mockResolvedValue({ items: [], total: 0 })

    const filters = { countryCode: 'VN', employmentStatus: 'active' }
    await handler.execute(new SearchDirectoryQuery(TENANT_ID, 'engineer', filters, 50, 10))

    expect(searchRepo.search).toHaveBeenCalledWith(TENANT_ID, 'engineer', filters, 50, 10)
  })

  it('returns items and total count', async () => {
    const mockItems = [
      {
        id: 'idx-1',
        tenantId: TENANT_ID,
        employmentId: 'emp-1',
        fullName: 'Nguyễn Văn An',
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
        skills: ['typescript', 'nestjs'],
        countryCode: 'VN',
        updatedAt: new Date(),
      },
    ]
    vi.mocked(searchRepo.search).mockResolvedValue({ items: mockItems, total: 1 })

    const result = await handler.execute(new SearchDirectoryQuery(TENANT_ID, 'nguyen', {}, 25, 0))

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.items[0].fullName).toBe('Nguyễn Văn An')
  })
})
