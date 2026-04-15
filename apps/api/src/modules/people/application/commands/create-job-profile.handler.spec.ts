import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateJobProfileCommand } from './create-job-profile.command'
import { CreateJobProfileHandler } from './create-job-profile.handler'
import { JobFamilyNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IJobFamilyRepository } from '../../domain/repositories/job-family.repository'
import type { IJobProfileRepository } from '../../domain/repositories/job-profile.repository'
import type { JobFamily } from '../../domain/entities/job-family.entity'
import type { JobProfile } from '../../domain/entities/job-profile.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const JOB_FAMILY_ID = '01900000-0000-7000-8000-000000000050'
const JOB_PROFILE_ID = '01900000-0000-7000-8000-000000000030'
const CREATED_BY = '01900000-0000-7000-8000-000000000005'

function makeJobFamily(): JobFamily {
  return {
    id: JOB_FAMILY_ID,
    tenantId: TENANT_ID,
    name: 'Engineering',
    description: null,
    parentId: null,
    isActive: true,
    createdAt: new Date('2026-01-01'),
  }
}

function makeJobProfile(overrides: Partial<JobProfile> = {}): JobProfile {
  return {
    id: JOB_PROFILE_ID,
    tenantId: TENANT_ID,
    jobFamilyId: JOB_FAMILY_ID,
    title: 'Software Engineer',
    level: 'L3',
    description: null,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('CreateJobProfileHandler', () => {
  let handler: CreateJobProfileHandler
  let jobFamilyRepo: IJobFamilyRepository
  let jobProfileRepo: IJobProfileRepository

  beforeEach(() => {
    jobFamilyRepo = {
      findById: vi.fn().mockResolvedValue(makeJobFamily()),
      listByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    } as unknown as IJobFamilyRepository

    jobProfileRepo = {
      findById: vi.fn(),
      listByTenant: vi.fn(),
      insert: vi.fn().mockResolvedValue(makeJobProfile()),
      update: vi.fn(),
      countByJobFamilyId: vi.fn(),
    } as unknown as IJobProfileRepository

    handler = new CreateJobProfileHandler(jobFamilyRepo, jobProfileRepo)
  })

  it('creates job profile with level', async () => {
    vi.mocked(jobProfileRepo.insert).mockResolvedValue(
      makeJobProfile({ title: 'Software Engineer', level: 'L3' }),
    )

    const result = await handler.execute(
      new CreateJobProfileCommand(TENANT_ID, JOB_FAMILY_ID, 'Software Engineer', CREATED_BY, 'L3'),
    )

    expect(jobProfileRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        jobFamilyId: JOB_FAMILY_ID,
        title: 'Software Engineer',
        level: 'L3',
        isActive: true,
      }),
    )
    expect(result.level).toBe('L3')
  })

  it('creates job profile without level', async () => {
    vi.mocked(jobProfileRepo.insert).mockResolvedValue(makeJobProfile({ level: null }))

    const result = await handler.execute(
      new CreateJobProfileCommand(TENANT_ID, JOB_FAMILY_ID, 'HR Generalist', CREATED_BY),
    )

    expect(jobProfileRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'HR Generalist',
        level: null,
      }),
    )
    expect(result.level).toBeNull()
  })

  it('throws JobFamilyNotFoundException when job family does not exist', async () => {
    vi.mocked(jobFamilyRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateJobProfileCommand(TENANT_ID, JOB_FAMILY_ID, 'Software Engineer', CREATED_BY),
      ),
    ).rejects.toThrow(JobFamilyNotFoundException)

    expect(jobProfileRepo.insert).not.toHaveBeenCalled()
  })
})
