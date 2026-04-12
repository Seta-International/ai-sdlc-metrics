import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateAllocationCommand } from './update-allocation.command'
import { UpdateAllocationHandler } from './update-allocation.handler'
import { AllocationNotFoundException } from '../../domain/exceptions/projects.exceptions'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'
import type { Allocation } from '../../domain/entities/allocation.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ALLOC_ID = '01900000-0000-7000-8000-000000000040'

const fakeAllocation: Allocation = {
  id: ALLOC_ID,
  tenantId: TENANT_ID,
  projectId: '01900000-0000-7000-8000-000000000020',
  projectRoleId: '01900000-0000-7000-8000-000000000010',
  actorId: '01900000-0000-7000-8000-000000000030',
  position: 'Dev',
  hoursPerDay: '8.00',
  billingType: 'billable',
  memberType: 'core',
  status: 'tentative',
  startedAt: new Date('2026-01-01'),
  endedAt: null,
  note: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('UpdateAllocationHandler', () => {
  let handler: UpdateAllocationHandler
  let allocRepo: IAllocationRepository

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
    handler = new UpdateAllocationHandler(allocRepo)
  })

  it('updates an existing allocation', async () => {
    vi.mocked(allocRepo.findById).mockResolvedValue(fakeAllocation)

    await handler.execute(
      new UpdateAllocationCommand(TENANT_ID, ALLOC_ID, {
        hoursPerDay: '6.00',
        position: 'Senior Dev',
      }),
    )

    expect(allocRepo.update).toHaveBeenCalledWith(ALLOC_ID, TENANT_ID, {
      hoursPerDay: '6.00',
      position: 'Senior Dev',
    })
  })

  it('throws AllocationNotFoundException when not found', async () => {
    vi.mocked(allocRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new UpdateAllocationCommand(TENANT_ID, ALLOC_ID, { hoursPerDay: '4.00' })),
    ).rejects.toThrow(AllocationNotFoundException)
  })
})
