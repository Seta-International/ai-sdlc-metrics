import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleOnboardingCaseRepository } from './drizzle-onboarding.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const CASE_ID_1 = '01900000-0000-7000-8000-000000000010'
const CASE_ID_2 = '01900000-0000-7000-8000-000000000011'

describe('DrizzleOnboardingCaseRepository — new methods', () => {
  let repo: DrizzleOnboardingCaseRepository
  let mockDb: {
    select: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new DrizzleOnboardingCaseRepository(mockDb as any)
  })

  describe('updateStage', () => {
    it('calls db.update and sets the new stage', async () => {
      await repo.updateStage('case-id-1', TENANT_ID, 'paperwork')
      expect(mockDb.update).toHaveBeenCalled()
      const setCalls = mockDb.update.mock.results[0].value.set.mock.calls
      expect(setCalls[0][0]).toMatchObject({ stage: 'paperwork' })
    })
  })

  describe('getTaskAggregates', () => {
    it('returns [] without hitting DB when caseIds is empty', async () => {
      const result = await repo.getTaskAggregates([], TENANT_ID)
      expect(result).toEqual([])
      expect(mockDb.select).not.toHaveBeenCalled()
    })

    it('aggregates tasks: 1 completed, 1 overdue required pending, 1 non-required pending', async () => {
      const now = new Date()
      const past = new Date(now.getTime() - 1000 * 60 * 60 * 24)
      const future = new Date(now.getTime() + 1000 * 60 * 60 * 24)

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { caseId: CASE_ID_1, status: 'completed', isRequired: true, dueDate: past },
            { caseId: CASE_ID_1, status: 'pending', isRequired: true, dueDate: past },
            { caseId: CASE_ID_1, status: 'pending', isRequired: false, dueDate: future },
          ]),
        }),
      })

      const result = await repo.getTaskAggregates([CASE_ID_1], TENANT_ID)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        caseId: CASE_ID_1,
        tasksTotal: 3,
        tasksCompleted: 1,
        blockers: 1,
      })
    })

    it('initialises aggregates for all caseIds even when no tasks exist', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })

      const result = await repo.getTaskAggregates([CASE_ID_1, CASE_ID_2], TENANT_ID)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        caseId: CASE_ID_1,
        tasksTotal: 0,
        tasksCompleted: 0,
        blockers: 0,
      })
      expect(result[1]).toEqual({
        caseId: CASE_ID_2,
        tasksTotal: 0,
        tasksCompleted: 0,
        blockers: 0,
      })
    })
  })

  describe('findAllActive', () => {
    it('calls db.select and returns rows as OnboardingCase[]', async () => {
      const fakeRow = {
        id: 'case-id-1',
        tenantId: TENANT_ID,
        employmentId: 'emp-1',
        templateId: null,
        status: 'in_progress',
        stage: 'offer_accepted',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([fakeRow]),
        }),
      })

      const result = await repo.findAllActive(TENANT_ID)

      expect(mockDb.select).toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0].stage).toBe('offer_accepted')
    })
  })
})
