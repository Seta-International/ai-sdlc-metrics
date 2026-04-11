import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateProfileDirectCommand } from './update-profile-direct.command'
import { UpdateProfileDirectHandler } from './update-profile-direct.handler'
import { EmploymentProfileNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'
import type { IEmploymentProfileDetailRepository } from '../../domain/repositories/employment-profile-detail.repository'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeProfile = {
  id: PROFILE_ID,
  tenantId: TENANT_ID,
  actorId: '01900000-0000-7000-8000-000000000002',
  employeeCode: 'SETA-001',
  companyEmail: 'test@seta.vn',
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
}

describe('UpdateProfileDirectHandler', () => {
  let handler: UpdateProfileDirectHandler
  let profileRepo: IEmploymentProfileRepository
  let detailRepo: IEmploymentProfileDetailRepository
  let auditRepo: IAuditEventRepository

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
    detailRepo = {
      findByProfileId: vi.fn(),
      upsert: vi.fn(),
      updateField: vi.fn(),
    }
    auditRepo = { insert: vi.fn() }
    handler = new UpdateProfileDirectHandler(profileRepo, detailRepo, auditRepo)
  })

  it('updates non-sensitive profile fields directly', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(fakeProfile)
    vi.mocked(profileRepo.update).mockResolvedValue({ ...fakeProfile, jobTitle: 'Senior Engineer' })

    await handler.execute(
      new UpdateProfileDirectCommand(TENANT_ID, PROFILE_ID, ACTOR_ID, {
        jobTitle: 'Senior Engineer',
        currentAddress: '123 Main St',
      }),
    )

    expect(profileRepo.update).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID, {
      jobTitle: 'Senior Engineer',
    })
    expect(detailRepo.updateField).toHaveBeenCalledWith(
      PROFILE_ID,
      TENANT_ID,
      'currentAddress',
      '123 Main St',
    )
    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'profile_updated_direct',
        module: 'people',
      }),
    )
  })

  it('throws EmploymentProfileNotFoundException when profile not found', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new UpdateProfileDirectCommand(TENANT_ID, PROFILE_ID, ACTOR_ID, { jobTitle: 'Engineer' }),
      ),
    ).rejects.toThrow(EmploymentProfileNotFoundException)
  })

  it('only calls profileRepo.update when all fields are profile-level', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(fakeProfile)
    vi.mocked(profileRepo.update).mockResolvedValue({ ...fakeProfile, jobTitle: 'Lead' })

    await handler.execute(
      new UpdateProfileDirectCommand(TENANT_ID, PROFILE_ID, ACTOR_ID, {
        jobTitle: 'Lead',
        costCenter: 'CC-01',
      }),
    )

    expect(profileRepo.update).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID, {
      jobTitle: 'Lead',
      costCenter: 'CC-01',
    })
    expect(detailRepo.updateField).not.toHaveBeenCalled()
  })

  it('only calls detailRepo.updateField when all fields are detail-level', async () => {
    vi.mocked(profileRepo.findById).mockResolvedValue(fakeProfile)

    await handler.execute(
      new UpdateProfileDirectCommand(TENANT_ID, PROFILE_ID, ACTOR_ID, {
        currentAddress: '123 Main St',
        emergencyContactName: 'Jane Doe',
      }),
    )

    expect(profileRepo.update).not.toHaveBeenCalled()
    expect(detailRepo.updateField).toHaveBeenCalledTimes(2)
  })
})
