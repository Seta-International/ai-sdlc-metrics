import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListOnboardingTasksQuery } from './list-onboarding-tasks.query'
import { ListOnboardingTasksHandler } from './list-onboarding-tasks.handler'
import type { IOnboardingCaseRepository } from '../../domain/repositories/onboarding-case.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const CASE_ID = '01900000-0000-7000-8000-000000000002'

describe('ListOnboardingTasksHandler', () => {
  let handler: ListOnboardingTasksHandler
  let onboardingCaseRepo: IOnboardingCaseRepository

  beforeEach(() => {
    onboardingCaseRepo = {
      findById: vi.fn(),
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      insertTask: vi.fn(),
      getRequiredTasks: vi.fn(),
      updateTaskStatus: vi.fn(),
      findTaskById: vi.fn(),
    }
    handler = new ListOnboardingTasksHandler(onboardingCaseRepo)
  })

  it('returns tasks from the onboarding case', async () => {
    const tasks = [
      { id: 'task-001', status: 'pending', isRequired: true },
      { id: 'task-002', status: 'completed', isRequired: false },
    ]
    vi.mocked(onboardingCaseRepo.getRequiredTasks).mockResolvedValue(tasks)

    const result = await handler.execute(new ListOnboardingTasksQuery(TENANT_ID, CASE_ID))

    expect(onboardingCaseRepo.getRequiredTasks).toHaveBeenCalledWith(CASE_ID, TENANT_ID)
    expect(result).toEqual(tasks)
  })

  it('returns empty array when no tasks exist', async () => {
    vi.mocked(onboardingCaseRepo.getRequiredTasks).mockResolvedValue([])

    const result = await handler.execute(new ListOnboardingTasksQuery(TENANT_ID, CASE_ID))

    expect(result).toEqual([])
  })
})
