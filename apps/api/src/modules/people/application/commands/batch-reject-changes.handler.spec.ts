import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchRejectChangesCommand } from './batch-reject-changes.command'
import { BatchRejectChangesHandler } from './batch-reject-changes.handler'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const BATCH_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('BatchRejectChangesHandler', () => {
  let handler: BatchRejectChangesHandler
  let changeRepo: IProfileChangeRequestRepository

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
    handler = new BatchRejectChangesHandler(changeRepo)
  })

  it('rejects all pending changes in batch atomically', async () => {
    vi.mocked(changeRepo.findByBatchId).mockResolvedValue([
      { id: 'cr-1', status: 'pending' } as any,
      { id: 'cr-2', status: 'pending' } as any,
    ])

    await handler.execute(
      new BatchRejectChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID, 'Incomplete info'),
    )

    expect(changeRepo.updateStatusByBatchId).toHaveBeenCalledWith(
      BATCH_ID,
      TENANT_ID,
      'rejected',
      ACTOR_ID,
      'Incomplete info',
    )
  })

  it('throws when batch has no pending changes', async () => {
    vi.mocked(changeRepo.findByBatchId).mockResolvedValue([
      { id: 'cr-1', status: 'approved' } as any,
    ])

    await expect(
      handler.execute(new BatchRejectChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID)),
    ).rejects.toThrow()
  })

  it('throws when batch is empty', async () => {
    vi.mocked(changeRepo.findByBatchId).mockResolvedValue([])

    await expect(
      handler.execute(new BatchRejectChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID)),
    ).rejects.toThrow()
  })
})
