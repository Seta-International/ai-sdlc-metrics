import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CloseAllocationCommand } from './close-allocation.command'
import { CloseAllocationHandler } from './close-allocation.handler'
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
  position: 'Tech Lead',
  hoursPerDay: '8.00',
  billingType: 'billable',
  memberType: 'core',
  status: 'confirmed',
  startedAt: new Date('2026-01-01'),
  endedAt: null,
  note: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('CloseAllocationHandler', () => {
  let handler: CloseAllocationHandler
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
    handler = new CloseAllocationHandler(allocRepo)
  })

  it('closes an existing allocation by setting ended_at', async () => {
    vi.mocked(allocRepo.findById).mockResolvedValue(fakeAllocation)
    const endDate = new Date('2026-06-30')

    await handler.execute(new CloseAllocationCommand(TENANT_ID, ALLOC_ID, endDate))

    expect(allocRepo.close).toHaveBeenCalledWith(ALLOC_ID, TENANT_ID, endDate)
  })

  it('throws AllocationNotFoundException when not found', async () => {
    vi.mocked(allocRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new CloseAllocationCommand(TENANT_ID, ALLOC_ID, new Date())),
    ).rejects.toThrow(AllocationNotFoundException)
  })
})
