import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BulkUpdateDepartmentCommand } from './bulk-update-department.command'
import { BulkUpdateDepartmentHandler } from './bulk-update-department.handler'
import type { IBulkOperationRepository } from '../../domain/repositories/bulk-operation.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('BulkUpdateDepartmentHandler', () => {
  let handler: BulkUpdateDepartmentHandler
  let bulkOpRepo: IBulkOperationRepository

  beforeEach(() => {
    bulkOpRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      updateProgress: vi.fn(),
    }
    handler = new BulkUpdateDepartmentHandler(bulkOpRepo)
  })

  it('creates a bulk operation record for async processing', async () => {
    vi.mocked(bulkOpRepo.insert).mockImplementation(
      async (data) => ({ id: 'bulk-1', ...data }) as never,
    )

    await handler.execute(
      new BulkUpdateDepartmentCommand(
        TENANT_ID,
        ['emp-1', 'emp-2', 'emp-3'],
        'dept-new',
        new Date('2026-05-01'),
        'Department restructuring',
        ACTOR_ID,
      ),
    )

    expect(bulkOpRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        operationType: 'department_transfer',
        employmentIds: ['emp-1', 'emp-2', 'emp-3'],
        totalCount: 3,
        status: 'pending',
        payload: expect.objectContaining({
          newDepartmentId: 'dept-new',
          effectiveFrom: expect.any(Date),
          reason: 'Department restructuring',
        }),
      }),
    )
  })

  it('validates at least one employment ID is provided', async () => {
    await expect(
      handler.execute(
        new BulkUpdateDepartmentCommand(TENANT_ID, [], 'dept-new', new Date(), 'reason', ACTOR_ID),
      ),
    ).rejects.toThrow()
  })
})
