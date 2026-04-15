import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProcessBulkOperationJob } from './process-bulk-operation.job'
import type { IBulkOperationRepository } from '../../domain/repositories/bulk-operation.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const OP_ID = '01900000-0000-7000-8000-000000000002'

describe('ProcessBulkOperationJob', () => {
  let job: ProcessBulkOperationJob
  let bulkOpRepo: IBulkOperationRepository
  let commandBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    bulkOpRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      updateProgress: vi.fn(),
    }
    commandBus = { execute: vi.fn() }
    job = new ProcessBulkOperationJob(bulkOpRepo, commandBus as any)
  })

  it('returns early when operation not found', async () => {
    vi.mocked(bulkOpRepo.findById).mockResolvedValue(null)

    await job.handle({ bulkOperationId: OP_ID, tenantId: TENANT_ID })

    expect(bulkOpRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('marks operation as completed when all succeed', async () => {
    vi.mocked(bulkOpRepo.findById).mockResolvedValue({
      id: OP_ID,
      tenantId: TENANT_ID,
      operationType: 'department_transfer',
      employmentIds: ['emp-1', 'emp-2'],
      payload: { newDepartmentId: 'dept-new', effectiveFrom: new Date(), reason: 'reorg' },
      totalCount: 2,
      requestedBy: 'actor-1',
    } as any)
    commandBus.execute.mockResolvedValue({})

    await job.handle({ bulkOperationId: OP_ID, tenantId: TENANT_ID })

    expect(bulkOpRepo.updateStatus).toHaveBeenLastCalledWith(OP_ID, TENANT_ID, 'completed')
    expect(bulkOpRepo.updateProgress).toHaveBeenCalledWith(OP_ID, TENANT_ID, 2, 0, null)
  })

  it('marks operation as partially_completed when some fail', async () => {
    vi.mocked(bulkOpRepo.findById).mockResolvedValue({
      id: OP_ID,
      tenantId: TENANT_ID,
      operationType: 'department_transfer',
      employmentIds: ['emp-1', 'emp-2'],
      payload: { newDepartmentId: 'dept-new', effectiveFrom: new Date(), reason: 'reorg' },
      totalCount: 2,
      requestedBy: 'actor-1',
    } as any)
    // First succeeds, second fails
    commandBus.execute.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('not found'))

    await job.handle({ bulkOperationId: OP_ID, tenantId: TENANT_ID })

    expect(bulkOpRepo.updateStatus).toHaveBeenLastCalledWith(
      OP_ID,
      TENANT_ID,
      'partially_completed',
    )
  })
})
