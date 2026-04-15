import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateJobFamilyCommand } from './create-job-family.command'
import { CreateJobFamilyHandler } from './create-job-family.handler'
import { JobFamilyNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IJobFamilyRepository } from '../../domain/repositories/job-family.repository'
import type { JobFamily } from '../../domain/entities/job-family.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const FAMILY_ID = '01900000-0000-7000-8000-000000000050'
const PARENT_FAMILY_ID = '01900000-0000-7000-8000-000000000051'
const CREATED_BY = '01900000-0000-7000-8000-000000000005'

function makeJobFamily(overrides: Partial<JobFamily> = {}): JobFamily {
  return {
    id: FAMILY_ID,
    tenantId: TENANT_ID,
    name: 'Engineering',
    description: null,
    parentId: null,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('CreateJobFamilyHandler', () => {
  let handler: CreateJobFamilyHandler
  let jobFamilyRepo: IJobFamilyRepository

  beforeEach(() => {
    jobFamilyRepo = {
      findById: vi.fn().mockResolvedValue(null),
      listByTenant: vi.fn(),
      insert: vi.fn().mockResolvedValue(makeJobFamily()),
      update: vi.fn(),
    } as unknown as IJobFamilyRepository

    handler = new CreateJobFamilyHandler(jobFamilyRepo)
  })

  it('creates root job family (no parent)', async () => {
    vi.mocked(jobFamilyRepo.insert).mockResolvedValue(makeJobFamily({ name: 'Engineering' }))

    const result = await handler.execute(
      new CreateJobFamilyCommand(TENANT_ID, 'Engineering', CREATED_BY),
    )

    expect(jobFamilyRepo.findById).not.toHaveBeenCalled()
    expect(jobFamilyRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        name: 'Engineering',
        parentId: null,
        isActive: true,
      }),
    )
    expect(result.name).toBe('Engineering')
    expect(result.parentId).toBeNull()
  })

  it('creates child job family with valid parent', async () => {
    const parent = makeJobFamily({ id: PARENT_FAMILY_ID, name: 'Technology' })
    vi.mocked(jobFamilyRepo.findById).mockResolvedValue(parent)
    vi.mocked(jobFamilyRepo.insert).mockResolvedValue(
      makeJobFamily({ name: 'Backend', parentId: PARENT_FAMILY_ID }),
    )

    const result = await handler.execute(
      new CreateJobFamilyCommand(TENANT_ID, 'Backend', CREATED_BY, null, PARENT_FAMILY_ID),
    )

    expect(jobFamilyRepo.findById).toHaveBeenCalledWith(PARENT_FAMILY_ID, TENANT_ID)
    expect(jobFamilyRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Backend',
        parentId: PARENT_FAMILY_ID,
      }),
    )
    expect(result.parentId).toBe(PARENT_FAMILY_ID)
  })

  it('throws JobFamilyNotFoundException when parent does not exist', async () => {
    vi.mocked(jobFamilyRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateJobFamilyCommand(TENANT_ID, 'Backend', CREATED_BY, null, PARENT_FAMILY_ID),
      ),
    ).rejects.toThrow(JobFamilyNotFoundException)

    expect(jobFamilyRepo.insert).not.toHaveBeenCalled()
  })
})
