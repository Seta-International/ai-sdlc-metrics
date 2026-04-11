import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateEmploymentProfileCommand } from './create-employment-profile.command'
import { CreateEmploymentProfileHandler } from './create-employment-profile.handler'
import { EmploymentProfileAlreadyExistsException } from '../../domain/exceptions/people.exceptions'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'
import type { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const CREATOR_ID = '01900000-0000-7000-8000-000000000004'

describe('CreateEmploymentProfileHandler', () => {
  let handler: CreateEmploymentProfileHandler
  let profileRepo: IEmploymentProfileRepository
  let auditService: KernelAuditService

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
    auditService = { log: vi.fn() } as unknown as KernelAuditService
    handler = new CreateEmploymentProfileHandler(profileRepo, auditService)
  })

  it('creates a profile and writes an audit event', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue(null)
    vi.mocked(profileRepo.insert).mockResolvedValue({
      id: PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      employeeCode: 'SETA-001',
      companyEmail: 'test@seta.vn',
      employmentType: 'permanent',
      employmentStatus: 'pre_hire',
      workArrangement: 'onsite',
      hireDate: new Date('2026-01-01'),
      terminationDate: null,
      jobTitle: 'Engineer',
      jobLevel: null,
      costCenter: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new CreateEmploymentProfileCommand(
        TENANT_ID,
        ACTOR_ID,
        'SETA-001',
        'test@seta.vn',
        'permanent',
        new Date('2026-01-01'),
        'Engineer',
        CREATOR_ID,
      ),
    )

    expect(profileRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        employeeCode: 'SETA-001',
        employmentStatus: 'pre_hire',
      }),
    )
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'employment_profile_created',
        module: 'people',
      }),
    )
    expect(result.id).toBe(PROFILE_ID)
  })

  it('throws EmploymentProfileAlreadyExistsException when actor already has a profile', async () => {
    vi.mocked(profileRepo.findByActorId).mockResolvedValue({
      id: PROFILE_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      employeeCode: 'SETA-001',
      companyEmail: 'test@seta.vn',
      employmentType: 'permanent',
      employmentStatus: 'active',
      workArrangement: 'onsite',
      hireDate: new Date('2026-01-01'),
      terminationDate: null,
      jobTitle: 'Engineer',
      jobLevel: null,
      costCenter: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await expect(
      handler.execute(
        new CreateEmploymentProfileCommand(
          TENANT_ID,
          ACTOR_ID,
          'SETA-001',
          'test@seta.vn',
          'permanent',
          new Date('2026-01-01'),
          'Engineer',
          CREATOR_ID,
        ),
      ),
    ).rejects.toThrow(EmploymentProfileAlreadyExistsException)
  })
})
