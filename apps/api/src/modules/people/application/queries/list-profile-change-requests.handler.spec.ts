import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListProfileChangeRequestsQuery } from './list-profile-change-requests.query'
import { ListProfileChangeRequestsHandler } from './list-profile-change-requests.handler'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID_1 = '01900000-0000-7000-8000-000000000010'
const PROFILE_ID_2 = '01900000-0000-7000-8000-000000000011'

const makeProfile = (id: string) => ({
  id,
  tenantId: TENANT_ID,
  actorId: `actor-${id}`,
  employeeCode: null,
  companyEmail: null,
  employmentType: 'permanent' as const,
  employmentStatus: 'active' as const,
  workArrangement: 'onsite' as const,
  hireDate: new Date('2026-01-01'),
  terminationDate: null,
  jobTitle: null,
  jobLevel: null,
  costCenter: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const makeChangeRequest = (
  id: string,
  profileId: string,
  status: 'pending' | 'approved' | 'rejected',
) => ({
  id,
  tenantId: TENANT_ID,
  profileId,
  fieldPath: 'jobTitle',
  oldValue: 'Engineer',
  newValue: 'Senior Engineer',
  status,
  decisionCaseId: null,
  requestedBy: 'actor-1',
  reviewedBy: null,
  createdAt: new Date(),
})

describe('ListProfileChangeRequestsHandler', () => {
  let handler: ListProfileChangeRequestsHandler
  let profileRepo: IEmploymentProfileRepository
  let changeRequestRepo: IProfileChangeRequestRepository

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
    changeRequestRepo = {
      findById: vi.fn(),
      findPendingByProfileAndField: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      listByProfile: vi.fn(),
    }
    handler = new ListProfileChangeRequestsHandler(profileRepo, changeRequestRepo)
  })

  it('returns only pending change requests across all profiles', async () => {
    vi.mocked(profileRepo.listByTenant).mockResolvedValue([
      makeProfile(PROFILE_ID_1),
      makeProfile(PROFILE_ID_2),
    ])
    vi.mocked(changeRequestRepo.listByProfile)
      .mockResolvedValueOnce([
        makeChangeRequest('req-001', PROFILE_ID_1, 'pending'),
        makeChangeRequest('req-002', PROFILE_ID_1, 'approved'),
      ])
      .mockResolvedValueOnce([makeChangeRequest('req-003', PROFILE_ID_2, 'pending')])

    const result = await handler.execute(new ListProfileChangeRequestsQuery(TENANT_ID))

    expect(profileRepo.listByTenant).toHaveBeenCalledWith(TENANT_ID)
    expect(changeRequestRepo.listByProfile).toHaveBeenCalledWith(PROFILE_ID_1, TENANT_ID)
    expect(changeRequestRepo.listByProfile).toHaveBeenCalledWith(PROFILE_ID_2, TENANT_ID)
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.status === 'pending')).toBe(true)
  })

  it('returns empty array when no profiles exist', async () => {
    vi.mocked(profileRepo.listByTenant).mockResolvedValue([])

    const result = await handler.execute(new ListProfileChangeRequestsQuery(TENANT_ID))

    expect(result).toEqual([])
  })

  it('returns empty array when no pending requests exist', async () => {
    vi.mocked(profileRepo.listByTenant).mockResolvedValue([makeProfile(PROFILE_ID_1)])
    vi.mocked(changeRequestRepo.listByProfile).mockResolvedValue([
      makeChangeRequest('req-001', PROFILE_ID_1, 'approved'),
    ])

    const result = await handler.execute(new ListProfileChangeRequestsQuery(TENANT_ID))

    expect(result).toEqual([])
  })
})
