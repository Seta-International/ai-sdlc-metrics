import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListJobProfilesQuery } from './list-job-profiles.query'
import { ListJobProfilesHandler } from './list-job-profiles.handler'
import type { IJobProfileRepository } from '../../domain/repositories/job-profile.repository'
import type { JobProfile } from '../../domain/entities/job-profile.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const FAMILY_ID_1 = '01900000-0000-7000-8000-000000000010'
const FAMILY_ID_2 = '01900000-0000-7000-8000-000000000011'

const mockJobProfiles: JobProfile[] = [
  {
    id: '01900000-0000-7000-8000-000000000020',
    tenantId: TENANT_ID,
    jobFamilyId: FAMILY_ID_1,
    title: 'Software Engineer',
    level: 'L3',
    description: null,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '01900000-0000-7000-8000-000000000021',
    tenantId: TENANT_ID,
    jobFamilyId: FAMILY_ID_1,
    title: 'Senior Software Engineer',
    level: 'L4',
    description: null,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '01900000-0000-7000-8000-000000000022',
    tenantId: TENANT_ID,
    jobFamilyId: FAMILY_ID_2,
    title: 'Product Manager',
    level: 'M1',
    description: null,
    isActive: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
]

describe('ListJobProfilesHandler', () => {
  let handler: ListJobProfilesHandler
  let jobProfileRepo: IJobProfileRepository

  beforeEach(() => {
    jobProfileRepo = {
      findById: vi.fn(),
      listByTenant: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      countByJobFamilyId: vi.fn(),
    }

    handler = new ListJobProfilesHandler(jobProfileRepo)
  })

  it('returns all job profiles for tenant', async () => {
    vi.mocked(jobProfileRepo.listByTenant).mockResolvedValue(mockJobProfiles)

    const result = await handler.execute(new ListJobProfilesQuery(TENANT_ID))

    expect(jobProfileRepo.listByTenant).toHaveBeenCalledWith(TENANT_ID, {
      familyId: undefined,
      isActive: undefined,
    })
    expect(result).toEqual(mockJobProfiles)
  })

  it('filters by family id when provided', async () => {
    const family1Profiles = mockJobProfiles.filter((p) => p.jobFamilyId === FAMILY_ID_1)
    vi.mocked(jobProfileRepo.listByTenant).mockResolvedValue(family1Profiles)

    const result = await handler.execute(new ListJobProfilesQuery(TENANT_ID, FAMILY_ID_1))

    expect(jobProfileRepo.listByTenant).toHaveBeenCalledWith(TENANT_ID, {
      familyId: FAMILY_ID_1,
      isActive: undefined,
    })
    expect(result).toEqual(family1Profiles)
    expect(result).toHaveLength(2)
  })

  it('filters by isActive when provided', async () => {
    const activeProfiles = mockJobProfiles.filter((p) => p.isActive)
    vi.mocked(jobProfileRepo.listByTenant).mockResolvedValue(activeProfiles)

    const result = await handler.execute(new ListJobProfilesQuery(TENANT_ID, undefined, true))

    expect(jobProfileRepo.listByTenant).toHaveBeenCalledWith(TENANT_ID, {
      familyId: undefined,
      isActive: true,
    })
    expect(result).toEqual(activeProfiles)
    expect(result).toHaveLength(2)
  })

  it('returns empty array when no profiles exist', async () => {
    vi.mocked(jobProfileRepo.listByTenant).mockResolvedValue([])

    const result = await handler.execute(new ListJobProfilesQuery(TENANT_ID))

    expect(result).toEqual([])
  })
})
