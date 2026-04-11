import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListPeriodicReviewsQuery } from './list-periodic-reviews.query'
import { ListPeriodicReviewsHandler } from './list-periodic-reviews.handler'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'
import type { IPeriodicProfileReviewRepository } from '../../domain/repositories/periodic-profile-review.repository'

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

const makeReview = (id: string, profileId: string) => ({
  id,
  tenantId: TENANT_ID,
  profileId,
  dueDate: new Date('2026-04-01'),
  status: 'pending' as const,
  completedAt: null,
})

describe('ListPeriodicReviewsHandler', () => {
  let handler: ListPeriodicReviewsHandler
  let profileRepo: IEmploymentProfileRepository
  let periodicReviewRepo: IPeriodicProfileReviewRepository

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
    periodicReviewRepo = {
      findById: vi.fn(),
      findPendingByProfileId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
    }
    handler = new ListPeriodicReviewsHandler(periodicReviewRepo, profileRepo)
  })

  it('returns all pending reviews for all profiles', async () => {
    vi.mocked(profileRepo.listByTenant).mockResolvedValue([
      makeProfile(PROFILE_ID_1),
      makeProfile(PROFILE_ID_2),
    ])
    vi.mocked(periodicReviewRepo.findPendingByProfileId)
      .mockResolvedValueOnce([makeReview('review-001', PROFILE_ID_1)])
      .mockResolvedValueOnce([makeReview('review-002', PROFILE_ID_2)])

    const result = await handler.execute(new ListPeriodicReviewsQuery(TENANT_ID))

    expect(profileRepo.listByTenant).toHaveBeenCalledWith(TENANT_ID)
    expect(periodicReviewRepo.findPendingByProfileId).toHaveBeenCalledWith(PROFILE_ID_1, TENANT_ID)
    expect(periodicReviewRepo.findPendingByProfileId).toHaveBeenCalledWith(PROFILE_ID_2, TENANT_ID)
    expect(result).toHaveLength(2)
    expect(result[0]!.id).toBe('review-001')
    expect(result[1]!.id).toBe('review-002')
  })

  it('returns empty array when no profiles exist', async () => {
    vi.mocked(profileRepo.listByTenant).mockResolvedValue([])

    const result = await handler.execute(new ListPeriodicReviewsQuery(TENANT_ID))

    expect(result).toEqual([])
  })

  it('returns empty array when profiles have no pending reviews', async () => {
    vi.mocked(profileRepo.listByTenant).mockResolvedValue([makeProfile(PROFILE_ID_1)])
    vi.mocked(periodicReviewRepo.findPendingByProfileId).mockResolvedValue([])

    const result = await handler.execute(new ListPeriodicReviewsQuery(TENANT_ID))

    expect(result).toEqual([])
  })
})
