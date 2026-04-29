import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleJobAssignmentRepository } from './drizzle-job-assignment.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000010'
const MANAGER_ID = '01900000-0000-7000-8000-000000000020'

describe('DrizzleJobAssignmentRepository.updateManagerId', () => {
  let repo: DrizzleJobAssignmentRepository
  let mockDb: any

  beforeEach(() => {
    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'ja1', tenantId: TENANT_ID }]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    }
    repo = new DrizzleJobAssignmentRepository(mockDb)
  })

  it('updates managerId on the current job assignment', async () => {
    await repo.updateManagerId(EMPLOYMENT_ID, MANAGER_ID, TENANT_ID)
    expect(mockDb.update).toHaveBeenCalled()
  })

  it('is a no-op when no current job assignment exists', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    await repo.updateManagerId(EMPLOYMENT_ID, null, TENANT_ID)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
