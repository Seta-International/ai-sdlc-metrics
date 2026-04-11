import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListEmployeesQuery } from './list-employees.query'
import { ListEmployeesHandler } from './list-employees.handler'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const makeProfile = (id: string) => ({
  id,
  tenantId: TENANT_ID,
  actorId: `actor-${id}`,
  employeeCode: `CODE-${id}`,
  companyEmail: `${id}@seta.vn`,
  employmentType: 'permanent' as const,
  employmentStatus: 'active' as const,
  workArrangement: 'onsite' as const,
  hireDate: new Date('2026-01-01'),
  terminationDate: null,
  jobTitle: 'Engineer',
  jobLevel: null,
  costCenter: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('ListEmployeesHandler', () => {
  let handler: ListEmployeesHandler
  let profileRepo: IEmploymentProfileRepository

  beforeEach(() => {
    profileRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      findByEmployeeCode: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
    }
    handler = new ListEmployeesHandler(profileRepo)
  })

  it('returns paginated items and total count', async () => {
    const allProfiles = [makeProfile('001'), makeProfile('002'), makeProfile('003')]
    const pagedProfiles = [makeProfile('001'), makeProfile('002')]

    vi.mocked(profileRepo.listByTenant)
      .mockResolvedValueOnce(pagedProfiles) // first call: paginated
      .mockResolvedValueOnce(allProfiles) // second call: all for total

    const result = await handler.execute(new ListEmployeesQuery(TENANT_ID, 2, 0))

    expect(profileRepo.listByTenant).toHaveBeenCalledWith(TENANT_ID, { limit: 2, offset: 0 })
    expect(profileRepo.listByTenant).toHaveBeenCalledWith(TENANT_ID)
    expect(result).toEqual({
      items: pagedProfiles,
      total: 3,
    })
  })

  it('returns empty items and zero total when no profiles exist', async () => {
    vi.mocked(profileRepo.listByTenant).mockResolvedValue([])

    const result = await handler.execute(new ListEmployeesQuery(TENANT_ID, 10, 0))

    expect(result).toEqual({
      items: [],
      total: 0,
    })
  })
})
