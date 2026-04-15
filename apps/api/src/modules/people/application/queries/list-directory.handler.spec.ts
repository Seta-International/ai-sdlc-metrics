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
