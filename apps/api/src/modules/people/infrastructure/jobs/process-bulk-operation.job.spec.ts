import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProcessBulkOperationJob } from './process-bulk-operation.job'
import type { IBulkOperationRepository } from '../../domain/repositories/bulk-operation.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { JobHistoryRecorderService } from '../../application/services/job-history-recorder.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const OP_ID = '01900000-0000-7000-8000-000000000002'
const JOB_PROFILE_ID = '01900000-0000-7000-8000-000000000099'
const PROFILE_ID = '01900000-0000-7000-8000-000000000050'

const makeOp = (overrides = {}) => ({
  id: OP_ID,
  tenantId: TENANT_ID,
  operationType: 'department_transfer',
  employmentIds: ['emp-1', 'emp-2'],
  payload: { newDepartmentId: 'dept-new', effectiveFrom: new Date(), reason: 'reorg' },
  totalCount: 2,
  requestedBy: 'actor-1',
  ...overrides,
})

describe('ProcessBulkOperationJob', () => {
  let job: ProcessBulkOperationJob
  let bulkOpRepo: IBulkOperationRepository
  let jobAssignmentRepo: IJobAssignmentRepository
  let commandBus: { execute: ReturnType<typeof vi.fn> }
  let employmentRepo: IEmploymentRepository
  let recorder: { recordDepartmentTransfer: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    bulkOpRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      updateProgress: vi.fn(),
    }
    jobAssignmentRepo = {
      findById: vi.fn(),
      findCurrent: vi.fn(),
      findAsOf: vi.fn(),
      findHistory: vi.fn(),
      insert: vi.fn(),
      closeAssignment: vi.fn(),
      delete: vi.fn(),
    }
    commandBus = { execute: vi.fn() }
    employmentRepo = {
      findById: vi.fn().mockResolvedValue({ personProfileId: PROFILE_ID }),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
    } as unknown as IEmploymentRepository
    recorder = { recordDepartmentTransfer: vi.fn().mockResolvedValue(undefined) }
    job = new ProcessBulkOperationJob(
      bulkOpRepo,
      jobAssignmentRepo,
      commandBus as never,
      employmentRepo,
      recorder as unknown as JobHistoryRecorderService,
    )
  })

  it('returns early when operation not found', async () => {
    vi.mocked(bulkOpRepo.findById).mockResolvedValue(null)

    await job.handle({ bulkOperationId: OP_ID, tenantId: TENANT_ID })

    expect(bulkOpRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('marks operation as completed when all succeed', async () => {
    vi.mocked(bulkOpRepo.findById).mockResolvedValue(makeOp() as never)
    vi.mocked(jobAssignmentRepo.findCurrent).mockResolvedValue({
      jobProfileId: JOB_PROFILE_ID,
    } as never)
    commandBus.execute.mockResolvedValue({})

    await job.handle({ bulkOperationId: OP_ID, tenantId: TENANT_ID })

    expect(bulkOpRepo.updateStatus).toHaveBeenLastCalledWith(OP_ID, TENANT_ID, 'completed')
    expect(bulkOpRepo.updateProgress).toHaveBeenCalledWith(OP_ID, TENANT_ID, 2, 0, null)
  })

  it('marks operation as partially_completed when some fail', async () => {
    vi.mocked(bulkOpRepo.findById).mockResolvedValue(makeOp() as never)
    vi.mocked(jobAssignmentRepo.findCurrent).mockResolvedValue({
      jobProfileId: JOB_PROFILE_ID,
    } as never)
    // First succeeds, second fails
    commandBus.execute.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('not found'))

    await job.handle({ bulkOperationId: OP_ID, tenantId: TENANT_ID })

    expect(bulkOpRepo.updateStatus).toHaveBeenLastCalledWith(
      OP_ID,
      TENANT_ID,
      'partially_completed',
    )
  })

  it('counts as failure when no current job assignment found', async () => {
    vi.mocked(bulkOpRepo.findById).mockResolvedValue(makeOp() as never)
    vi.mocked(jobAssignmentRepo.findCurrent).mockResolvedValue(null)

    await job.handle({ bulkOperationId: OP_ID, tenantId: TENANT_ID })

    // Both employments fail due to missing job assignment
    expect(bulkOpRepo.updateProgress).toHaveBeenCalledWith(
      OP_ID,
      TENANT_ID,
      0,
      2,
      expect.any(Object),
    )
    expect(bulkOpRepo.updateStatus).toHaveBeenLastCalledWith(OP_ID, TENANT_ID, 'failed')
  })

  it('records department transfer history for each successful transfer', async () => {
    const op = makeOp()
    vi.mocked(bulkOpRepo.findById).mockResolvedValue(op as never)
    vi.mocked(jobAssignmentRepo.findCurrent).mockResolvedValue({
      jobProfileId: JOB_PROFILE_ID,
    } as never)
    commandBus.execute.mockResolvedValue({})

    await job.handle({ bulkOperationId: OP_ID, tenantId: TENANT_ID })

    expect(recorder.recordDepartmentTransfer).toHaveBeenCalledTimes(2)
    expect(recorder.recordDepartmentTransfer).toHaveBeenCalledWith({
      profileId: PROFILE_ID,
      tenantId: TENANT_ID,
      effectiveFrom: op.payload.effectiveFrom,
      jobTitle: null,
      departmentId: op.payload.newDepartmentId,
      managerProfileId: null,
      changeReason: op.payload.reason,
      recordedBy: op.requestedBy,
    })
  })

  it('does not record department transfer history when job assignment execute fails', async () => {
    vi.mocked(bulkOpRepo.findById).mockResolvedValue(makeOp() as never)
    vi.mocked(jobAssignmentRepo.findCurrent).mockResolvedValue({
      jobProfileId: JOB_PROFILE_ID,
    } as never)
    commandBus.execute.mockRejectedValue(new Error('command failed'))

    await job.handle({ bulkOperationId: OP_ID, tenantId: TENANT_ID })

    expect(recorder.recordDepartmentTransfer).not.toHaveBeenCalled()
  })
})
