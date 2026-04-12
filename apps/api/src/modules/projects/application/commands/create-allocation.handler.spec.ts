import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateAllocationCommand } from './create-allocation.command'
import { CreateAllocationHandler } from './create-allocation.handler'
import { ProjectRoleNotFoundException } from '../../domain/exceptions/projects.exceptions'
import type { IProjectRoleRepository } from '../../domain/repositories/project-role.repository.port'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ROLE_ID = '01900000-0000-7000-8000-000000000010'
const PROJECT_ID = '01900000-0000-7000-8000-000000000020'
const ACTOR_ID = '01900000-0000-7000-8000-000000000030'
const ALLOC_ID = '01900000-0000-7000-8000-000000000040'

describe('CreateAllocationHandler', () => {
  let handler: CreateAllocationHandler
  let roleRepo: IProjectRoleRepository
  let allocRepo: IAllocationRepository

  beforeEach(() => {
    roleRepo = {
      findById: vi.fn(),
      findByProjectId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      countActiveAllocations: vi.fn(),
    }
    allocRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      findActiveByActorId: vi.fn(),
      findConfirmedByActorId: vi.fn(),
      findByProjectRoleId: vi.fn(),
      findByAccountId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      close: vi.fn(),
      closeAllForActor: vi.fn(),
      flagTentativeForActor: vi.fn(),
      sumConfirmedHoursPerDay: vi.fn(),
    }
    handler = new CreateAllocationHandler(roleRepo, allocRepo)
  })

  it('creates a tentative allocation for a valid project role', async () => {
    vi.mocked(roleRepo.findById).mockResolvedValue({
      id: ROLE_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      roleName: 'Senior DevOps',
      skillsRequired: ['k8s'],
      headcount: 2,
      status: 'open',
      createdAt: new Date(),
    })
    vi.mocked(allocRepo.insert).mockResolvedValue({
      id: ALLOC_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      projectRoleId: ROLE_ID,
      actorId: ACTOR_ID,
      position: 'Tech Lead',
      hoursPerDay: '6.00',
      billingType: 'billable',
      memberType: 'core',
      status: 'tentative',
      startedAt: new Date('2026-03-01'),
      endedAt: null,
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new CreateAllocationCommand(
        TENANT_ID,
        ROLE_ID,
        ACTOR_ID,
        'Tech Lead',
        '6.00',
        'billable',
        'core',
        new Date('2026-03-01'),
        null,
        null,
      ),
    )

    expect(result).toBe(ALLOC_ID)
    expect(allocRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      projectRoleId: ROLE_ID,
      actorId: ACTOR_ID,
      position: 'Tech Lead',
      hoursPerDay: '6.00',
      billingType: 'billable',
      memberType: 'core',
      startedAt: new Date('2026-03-01'),
      endedAt: null,
      note: null,
    })
  })

  it('allows placeholder allocation with null actorId', async () => {
    vi.mocked(roleRepo.findById).mockResolvedValue({
      id: ROLE_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      roleName: 'BA',
      skillsRequired: null,
      headcount: 1,
      status: 'open',
      createdAt: new Date(),
    })
    vi.mocked(allocRepo.insert).mockResolvedValue({
      id: ALLOC_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      projectRoleId: ROLE_ID,
      actorId: null,
      position: null,
      hoursPerDay: '8.00',
      billingType: 'billable',
      memberType: 'core',
      status: 'tentative',
      startedAt: new Date('2026-04-01'),
      endedAt: null,
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new CreateAllocationCommand(
        TENANT_ID,
        ROLE_ID,
        null,
        null,
        '8.00',
        'billable',
        'core',
        new Date('2026-04-01'),
        null,
        null,
      ),
    )

    expect(result).toBe(ALLOC_ID)
    expect(allocRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
      }),
    )
  })

  it('throws ProjectRoleNotFoundException when role does not exist', async () => {
    vi.mocked(roleRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateAllocationCommand(
          TENANT_ID,
          ROLE_ID,
          ACTOR_ID,
          null,
          '8.00',
          'billable',
          'core',
          new Date('2026-03-01'),
          null,
          null,
        ),
      ),
    ).rejects.toThrow(ProjectRoleNotFoundException)
  })
})
