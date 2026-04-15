import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetCurrentJobAssignmentQuery } from './get-current-job-assignment.query'
import { GetCurrentJobAssignmentHandler } from './get-current-job-assignment.handler'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000004'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

const mockAssignment: JobAssignment = {
  id: '01900000-0000-7000-8000-000000000010',
  tenantId: TENANT_ID,
  employmentId: EMPLOYMENT_ID,
  effectiveFrom: new Date('2024-01-01'),
  effectiveTo: null,
  jobProfileId: '01900000-0000-7000-8000-000000000020',
  departmentId: null,
  locationId: null,
  costCenterId: null,
  workArrangement: 'hybrid',
  managerId: null,
  eventType: 'hire',
  reason: null,
  createdBy: ACTOR_ID,
  createdAt: new Date('2024-01-01'),
}

describe('GetCurrentJobAssignmentHandler', () => {
  let handler: GetCurrentJobAssignmentHandler
  let assignmentRepo: IJobAssignmentRepository

  beforeEach(() => {
    assignmentRepo = {
      findById: vi.fn(),
      findCurrent: vi.fn(),
      findAsOf: vi.fn(),
      findHistory: vi.fn(),
      insert: vi.fn(),
      closeAssignment: vi.fn(),
      delete: vi.fn(),
    }

    handler = new GetCurrentJobAssignmentHandler(assignmentRepo)
  })

  it('returns current job assignment when found', async () => {
    vi.mocked(assignmentRepo.findCurrent).mockResolvedValue(mockAssignment)

    const result = await handler.execute(new GetCurrentJobAssignmentQuery(EMPLOYMENT_ID, TENANT_ID))

    expect(assignmentRepo.findCurrent).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
    expect(result).toEqual(mockAssignment)
  })

  it('returns null when no current assignment exists', async () => {
    vi.mocked(assignmentRepo.findCurrent).mockResolvedValue(null)

    const result = await handler.execute(new GetCurrentJobAssignmentQuery(EMPLOYMENT_ID, TENANT_ID))

    expect(assignmentRepo.findCurrent).toHaveBeenCalledWith(EMPLOYMENT_ID, TENANT_ID)
    expect(result).toBeNull()
  })
})
