import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchApproveChangesCommand } from './batch-approve-changes.command'
import { BatchApproveChangesHandler } from './batch-approve-changes.handler'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const BATCH_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('BatchApproveChangesHandler', () => {
  let handler: BatchApproveChangesHandler
  let changeRepo: IProfileChangeRequestRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    changeRepo = {
      findById: vi.fn(),
      findByBatchId: vi.fn(),
      findByEmploymentId: vi.fn(),
      findPendingByFieldPath: vi.fn(),
      findScheduledBeforeDate: vi.fn(),
      insertMany: vi.fn(),
      updateStatus: vi.fn(),
      updateStatusByBatchId: vi.fn(),
    }
    eventBus = { publish: vi.fn() }
    handler = new BatchApproveChangesHandler(changeRepo, eventBus as any)
  })

  it('approves all pending changes in batch atomically', async () => {
    vi.mocked(changeRepo.findByBatchId).mockResolvedValue([
      {
        id: 'cr-1',
        status: 'pending',
        fieldPath: 'person_profile.family_name',
        effectiveDate: null,
        employmentId: 'emp-1',
        oldValue: 'Old',
        newValue: 'New',
      } as any,
      {
        id: 'cr-2',
        status: 'pending',
        fieldPath: 'person_profile.given_name',
        effectiveDate: null,
        employmentId: 'emp-1',
        oldValue: 'OldGiven',
        newValue: 'NewGiven',
      } as any,
    ])

    await handler.execute(
      new BatchApproveChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID, 'Looks good'),
    )

    expect(changeRepo.updateStatusByBatchId).toHaveBeenCalledWith(
      BATCH_ID,
      TENANT_ID,
      'approved',
      ACTOR_ID,
      'Looks good',
    )
    expect(eventBus.publish).toHaveBeenCalled()
  })

  it('throws when batch has no pending changes', async () => {
    vi.mocked(changeRepo.findByBatchId).mockResolvedValue([
      { id: 'cr-1', status: 'applied' } as any,
    ])

    await expect(
      handler.execute(new BatchApproveChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID)),
    ).rejects.toThrow()
  })

  it('does not emit events for future-dated changes', async () => {
    vi.mocked(changeRepo.findByBatchId).mockResolvedValue([
      {
        id: 'cr-1',
        status: 'pending',
        fieldPath: 'person_profile.preferred_name',
        effectiveDate: new Date('2026-07-01'),
        employmentId: 'emp-1',
        oldValue: 'A',
        newValue: 'B',
      } as any,
    ])

    await handler.execute(new BatchApproveChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID))

    expect(changeRepo.updateStatusByBatchId).toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
