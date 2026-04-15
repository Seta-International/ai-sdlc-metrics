import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListEmploymentsQuery } from './list-employments.query'
import { ListEmploymentsHandler } from './list-employments.handler'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { Employment } from '../../domain/entities/employment.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'

const mockEmployments: Employment[] = [
  {
    id: '01900000-0000-7000-8000-000000000004',
    tenantId: TENANT_ID,
    personProfileId: PROFILE_ID,
    employeeCode: 'EMP001',
    companyEmail: 'john.doe@example.com',
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'SG',
    employmentStatus: 'active',
    terminationDate: null,
    terminationReason: null,
    hireDate: new Date('2024-01-01'),
    originalHireDate: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '01900000-0000-7000-8000-000000000005',
    tenantId: TENANT_ID,
    personProfileId: PROFILE_ID,
    employeeCode: 'EMP002',
    companyEmail: 'jane.doe@example.com',
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'VN',
    employmentStatus: 'active',
    terminationDate: null,
    terminationReason: null,
    hireDate: new Date('2024-02-01'),
    originalHireDate: null,
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-02-01'),
  },
]

describe('ListEmploymentsHandler', () => {
  let handler: ListEmploymentsHandler
  let employmentRepo: IEmploymentRepository

  beforeEach(() => {
    employmentRepo = {
      findById: vi.fn(),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
    }

    handler = new ListEmploymentsHandler(employmentRepo)
  })

  it('returns items and total', async () => {
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue(mockEmployments)
    vi.mocked(employmentRepo.countByTenant).mockResolvedValue(2)

    const result = await handler.execute(new ListEmploymentsQuery(TENANT_ID, 10, 0))

    expect(employmentRepo.listByTenant).toHaveBeenCalledWith(TENANT_ID, {
      status: undefined,
      countryCode: undefined,
      limit: 10,
      offset: 0,
    })
    expect(employmentRepo.countByTenant).toHaveBeenCalledWith(TENANT_ID, {
      status: undefined,
      countryCode: undefined,
    })
    expect(result.items).toEqual(mockEmployments)
    expect(result.total).toBe(2)
  })

  it('passes filters when provided', async () => {
    const sgEmployments = mockEmployments.filter((e) => e.countryCode === 'SG')
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue(sgEmployments)
    vi.mocked(employmentRepo.countByTenant).mockResolvedValue(1)

    const result = await handler.execute(new ListEmploymentsQuery(TENANT_ID, 20, 0, 'active', 'SG'))

    expect(employmentRepo.listByTenant).toHaveBeenCalledWith(TENANT_ID, {
      status: 'active',
      countryCode: 'SG',
      limit: 20,
      offset: 0,
    })
    expect(employmentRepo.countByTenant).toHaveBeenCalledWith(TENANT_ID, {
      status: 'active',
      countryCode: 'SG',
    })
    expect(result.items).toEqual(sgEmployments)
    expect(result.total).toBe(1)
  })

  it('returns empty items and zero total when no employments exist', async () => {
    vi.mocked(employmentRepo.listByTenant).mockResolvedValue([])
    vi.mocked(employmentRepo.countByTenant).mockResolvedValue(0)

    const result = await handler.execute(new ListEmploymentsQuery(TENANT_ID, 10, 0))

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })
})
