import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IJobHistoryRepository } from '../../domain/repositories/job-history.repository'
import type { JobHistoryEntry } from '../../domain/entities/job-history-entry.entity'
import { GetJobHistoryQuery } from './get-job-history.query'
import { GetJobHistoryHandler } from './get-job-history.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID = '01900000-0000-7000-8000-000000000002'

const makeEntry = (overrides: Partial<JobHistoryEntry> = {}): JobHistoryEntry => ({
  id: '01900000-0000-7000-8000-000000000010',
  tenantId: TENANT_ID,
  profileId: PROFILE_ID,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  jobTitle: 'Engineer',
  departmentId: null,
  managerProfileId: null,
  changeType: 'hire',
  changeReason: null,
  recordedAt: new Date('2026-01-01'),
  recordedBy: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
})

describe('GetJobHistoryHandler', () => {
  let handler: GetJobHistoryHandler
  let repo: IJobHistoryRepository

  beforeEach(() => {
    repo = {
      findByProfile: vi.fn(),
      findAsOf: vi.fn(),
      findLatest: vi.fn(),
      recordChange: vi.fn(),
      closeOpenEntry: vi.fn(),
    } as unknown as IJobHistoryRepository

    handler = new GetJobHistoryHandler(repo)
  })

  it('returns empty array when profile has no history', async () => {
    vi.mocked(repo.findByProfile).mockResolvedValue([])
    const result = await handler.execute(new GetJobHistoryQuery(PROFILE_ID, TENANT_ID))
    expect(result).toEqual([])
    expect(repo.findByProfile).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID)
  })

  it('returns entries sorted by effectiveFrom DESC (passthrough from repo)', async () => {
    const entries = [
      makeEntry({ id: 'e2', effectiveFrom: new Date('2026-06-01') }),
      makeEntry({ id: 'e1', effectiveFrom: new Date('2026-01-01') }),
    ]
    vi.mocked(repo.findByProfile).mockResolvedValue(entries)
    const result = await handler.execute(new GetJobHistoryQuery(PROFILE_ID, TENANT_ID))
    expect(result).toEqual(entries)
    expect(result[0].id).toBe('e2')
  })
})
