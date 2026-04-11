import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { ConfirmAllocationCommand } from './confirm-allocation.command'
import { ConfirmAllocationHandler } from './confirm-allocation.handler'
import {
  AllocationNotFoundException,
  AllocationAlreadyConfirmedException,
} from '../../domain/exceptions/projects.exceptions'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'
import type { Allocation } from '../../domain/entities/allocation.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ALLOC_ID = '01900000-0000-7000-8000-000000000040'
const ACTOR_ID = '01900000-0000-7000-8000-000000000030'
const PROJECT_ID = '01900000-0000-7000-8000-000000000020'

const tentativeAllocation: Allocation = {
  id: ALLOC_ID,
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  projectRoleId: '01900000-0000-7000-8000-000000000010',
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
}

describe('ConfirmAllocationHandler', () => {
  let handler: ConfirmAllocationHandler
  let allocRepo: IAllocationRepository
  let eventBus: EventBus

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
    eventBus = { publish: vi.fn() } as unknown as EventBus
    handler = new ConfirmAllocationHandler(allocRepo, eventBus)
  })

  it('confirms a tentative allocation and publishes AllocationConfirmedEvent', async () => {
    vi.mocked(allocRepo.findById).mockResolvedValue(tentativeAllocation)

    await handler.execute(new ConfirmAllocationCommand(TENANT_ID, ALLOC_ID))

    expect(allocRepo.updateStatus).toHaveBeenCalledWith(ALLOC_ID, TENANT_ID, 'confirmed')
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        allocationId: ALLOC_ID,
        actorId: ACTOR_ID,
        projectId: PROJECT_ID,
        hoursPerDay: 6,
      }),
    )
  })

  it('throws AllocationNotFoundException when not found', async () => {
    vi.mocked(allocRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new ConfirmAllocationCommand(TENANT_ID, ALLOC_ID)),
    ).rejects.toThrow(AllocationNotFoundException)
  })

  it('throws AllocationAlreadyConfirmedException when already confirmed', async () => {
    vi.mocked(allocRepo.findById).mockResolvedValue({
      ...tentativeAllocation,
      status: 'confirmed',
    })

    await expect(
      handler.execute(new ConfirmAllocationCommand(TENANT_ID, ALLOC_ID)),
    ).rejects.toThrow(AllocationAlreadyConfirmedException)
  })
})
