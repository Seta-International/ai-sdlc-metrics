import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnEmployeeTerminatedHandler } from './on-employee-terminated.handler'
import { EmploymentTerminatedEvent } from '@future/event-contracts'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'
import type { IProjectRoleRepository } from '../../domain/repositories/project-role.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('OnEmployeeTerminatedHandler', () => {
  let handler: OnEmployeeTerminatedHandler
  let allocRepo: IAllocationRepository
  let roleRepo: IProjectRoleRepository

  beforeEach(() => {
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
    roleRepo = {
      findById: vi.fn(),
      findByProjectId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      countActiveAllocations: vi.fn(),
    }
    handler = new OnEmployeeTerminatedHandler(allocRepo, roleRepo)
  })

  it('closes all allocations and reopens project role when no remaining allocations', async () => {
    vi.mocked(allocRepo.findByActorId).mockResolvedValue([
      {
        id: 'alloc-1',
        tenantId: TENANT_ID,
        projectId: 'proj-1',
        projectRoleId: 'role-1',
        actorId: ACTOR_ID,
        position: null,
        hoursPerDay: '8.00',
        billingType: 'billable',
        memberType: 'core',
        status: 'tentative',
        startedAt: new Date(),
        endedAt: null,
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    // After closing this actor's allocation, no remaining active allocations for this role
    vi.mocked(roleRepo.countActiveAllocations).mockResolvedValue(0)
    vi.mocked(roleRepo.findById).mockResolvedValue({
      id: 'role-1',
      tenantId: TENANT_ID,
      projectId: 'proj-1',
      roleName: 'DevOps',
      skillsRequired: null,
      headcount: 1,
      status: 'filled',
      createdAt: new Date(),
    })

    await handler.handle(
      new EmploymentTerminatedEvent(
        TENANT_ID,
        ACTOR_ID,
        'hr-actor-id',
        'resigned',
        new Date('2026-05-01'),
      ),
    )

    expect(allocRepo.closeAllForActor).toHaveBeenCalledWith(
      ACTOR_ID,
      TENANT_ID,
      new Date('2026-05-01'),
    )
    expect(roleRepo.updateStatus).toHaveBeenCalledWith('role-1', TENANT_ID, 'open')
  })

  it('does NOT reopen project role when other actors still fill it', async () => {
    vi.mocked(allocRepo.findByActorId).mockResolvedValue([
      {
        id: 'alloc-1',
        tenantId: TENANT_ID,
        projectId: 'proj-1',
        projectRoleId: 'role-1',
        actorId: ACTOR_ID,
        position: null,
        hoursPerDay: '8.00',
        billingType: 'billable',
        memberType: 'core',
        status: 'confirmed',
        startedAt: new Date(),
        endedAt: null,
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    // After closing this actor, 1 remaining active allocation still fills headcount of 1
    vi.mocked(roleRepo.countActiveAllocations).mockResolvedValue(1)
    vi.mocked(roleRepo.findById).mockResolvedValue({
      id: 'role-1',
      tenantId: TENANT_ID,
      projectId: 'proj-1',
      roleName: 'DevOps',
      skillsRequired: null,
      headcount: 1,
      status: 'filled',
      createdAt: new Date(),
    })

    await handler.handle(
      new EmploymentTerminatedEvent(
        TENANT_ID,
        ACTOR_ID,
        'hr-actor-id',
        'resigned',
        new Date('2026-05-01'),
      ),
    )

    expect(allocRepo.closeAllForActor).toHaveBeenCalled()
    // Role should NOT be reopened because remaining allocations >= headcount
    expect(roleRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('reopens role when remaining allocations drop below headcount', async () => {
    vi.mocked(allocRepo.findByActorId).mockResolvedValue([
      {
        id: 'alloc-1',
        tenantId: TENANT_ID,
        projectId: 'proj-1',
        projectRoleId: 'role-1',
        actorId: ACTOR_ID,
        position: null,
        hoursPerDay: '8.00',
        billingType: 'billable',
        memberType: 'core',
        status: 'confirmed',
        startedAt: new Date(),
        endedAt: null,
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    // Headcount is 3, but only 1 remaining after closing this actor's allocation
    vi.mocked(roleRepo.countActiveAllocations).mockResolvedValue(1)
    vi.mocked(roleRepo.findById).mockResolvedValue({
      id: 'role-1',
      tenantId: TENANT_ID,
      projectId: 'proj-1',
      roleName: 'DevOps',
      skillsRequired: null,
      headcount: 3,
      status: 'filled',
      createdAt: new Date(),
    })

    await handler.handle(
      new EmploymentTerminatedEvent(
        TENANT_ID,
        ACTOR_ID,
        'hr-actor-id',
        'resigned',
        new Date('2026-05-01'),
      ),
    )

    // Role should be reopened because remaining (1) < headcount (3)
    expect(roleRepo.updateStatus).toHaveBeenCalledWith('role-1', TENANT_ID, 'open')
  })
})
