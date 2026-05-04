import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListProfileChangeRequestsQuery } from './list-profile-change-requests.query'
import { ListProfileChangeRequestsHandler } from './list-profile-change-requests.handler'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IPersonProfileRepository } from '../../domain/repositories/person-profile.repository'
import type { ProfileChangeRequest } from '../../domain/entities/profile-change-request.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000020'
const PROFILE_ID = '01900000-0000-7000-8000-000000000010'

function makePendingChange(overrides: Partial<ProfileChangeRequest> = {}): ProfileChangeRequest {
  return {
    id: '01900000-0000-7000-8000-000000000030',
    tenantId: TENANT_ID,
    employmentId: EMPLOYMENT_ID,
    batchId: '01900000-0000-7000-8000-000000000099',
    reason: 'Post-promotion update',
    fieldPath: 'person_profile.preferred_name',
    oldValue: 'Old',
    newValue: 'New',
    effectiveDate: null,
    status: 'pending',
    requestedBy: '01900000-0000-7000-8000-000000000002',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    decisionCaseId: null,
    createdAt: new Date('2026-05-01'),
    ...overrides,
  }
}

describe('ListProfileChangeRequestsHandler', () => {
  let changeRepo: IProfileChangeRequestRepository
  let employmentRepo: IEmploymentRepository
  let profileRepo: IPersonProfileRepository

  beforeEach(() => {
    changeRepo = {
      findByEmploymentId: vi.fn().mockResolvedValue([makePendingChange()]),
      findByTenant: vi.fn().mockResolvedValue([makePendingChange()]),
    } as unknown as IProfileChangeRequestRepository

    employmentRepo = {
      findById: vi.fn().mockResolvedValue({ personProfileId: PROFILE_ID }),
    } as unknown as IEmploymentRepository

    profileRepo = {
      findById: vi.fn().mockResolvedValue({ fullName: 'Nguyễn An' }),
    } as unknown as IPersonProfileRepository
  })

  it('byEmployment mode: calls findByEmploymentId without status filter', async () => {
    const handler = new ListProfileChangeRequestsHandler(changeRepo, employmentRepo, profileRepo)
    const result = await handler.execute(
      new ListProfileChangeRequestsQuery(TENANT_ID, 'byEmployment', EMPLOYMENT_ID, null, 20, 0),
    )
    expect(changeRepo.findByEmploymentId).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID, undefined)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.reason).toBe('Post-promotion update')
    expect(result.items[0]!.employeeName).toBeNull()
  })

  it('byEmployment mode: passes status filter when provided', async () => {
    const handler = new ListProfileChangeRequestsHandler(changeRepo, employmentRepo, profileRepo)
    await handler.execute(
      new ListProfileChangeRequestsQuery(
        TENANT_ID,
        'byEmployment',
        EMPLOYMENT_ID,
        'pending',
        20,
        0,
      ),
    )
    expect(changeRepo.findByEmploymentId).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID, 'pending')
  })

  it('queue mode: enriches results with employeeName', async () => {
    const handler = new ListProfileChangeRequestsHandler(changeRepo, employmentRepo, profileRepo)
    const result = await handler.execute(
      new ListProfileChangeRequestsQuery(TENANT_ID, 'queue', null, 'pending', 20, 0),
    )
    expect(changeRepo.findByTenant).toHaveBeenCalledWith(TENANT_ID, 'pending', 20, 0)
    expect(result.items[0]!.employeeName).toBe('Nguyễn An')
  })

  it('queue mode: employeeName is null when employment not found', async () => {
    employmentRepo = {
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as IEmploymentRepository

    const handler = new ListProfileChangeRequestsHandler(changeRepo, employmentRepo, profileRepo)
    const result = await handler.execute(
      new ListProfileChangeRequestsQuery(TENANT_ID, 'queue', null, 'pending', 20, 0),
    )
    expect(result.items[0]!.employeeName).toBeNull()
  })

  it('queue mode: employeeName is null when profile not found', async () => {
    profileRepo = {
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as IPersonProfileRepository

    const handler = new ListProfileChangeRequestsHandler(changeRepo, employmentRepo, profileRepo)
    const result = await handler.execute(
      new ListProfileChangeRequestsQuery(TENANT_ID, 'queue', null, 'pending', 20, 0),
    )
    expect(result.items[0]!.employeeName).toBeNull()
  })
})
