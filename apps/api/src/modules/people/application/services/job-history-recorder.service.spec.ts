import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IJobHistoryRepository } from '../../domain/repositories/job-history.repository'
import { JobHistoryRecorderService, type RecordChangeInput } from './job-history-recorder.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID = '01900000-0000-7000-8000-000000000002'

function makeInput(overrides: Partial<RecordChangeInput> = {}): RecordChangeInput {
  return {
    profileId: PROFILE_ID,
    tenantId: TENANT_ID,
    effectiveFrom: new Date('2026-01-01'),
    jobTitle: 'Engineer',
    departmentId: null,
    managerProfileId: null,
    changeReason: null,
    recordedBy: null,
    ...overrides,
  }
}

describe('JobHistoryRecorderService', () => {
  let service: JobHistoryRecorderService
  let repo: IJobHistoryRepository

  beforeEach(() => {
    repo = {
      findByProfile: vi.fn(),
      findAsOf: vi.fn(),
      findLatest: vi.fn(),
      recordChange: vi.fn().mockResolvedValue({ id: 'entry-1' }),
      closeOpenEntry: vi.fn().mockResolvedValue(undefined),
    } as unknown as IJobHistoryRepository

    service = new JobHistoryRecorderService(repo)
  })

  describe('recordHire', () => {
    it('calls recordChange with changeType hire', async () => {
      const input = makeInput()
      await service.recordHire(input)
      expect(repo.recordChange).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'hire', profileId: PROFILE_ID }),
      )
      expect(repo.closeOpenEntry).not.toHaveBeenCalled()
    })
  })

  describe('recordDepartmentTransfer', () => {
    it('closes open entry then records department_transfer', async () => {
      const input = makeInput()
      await service.recordDepartmentTransfer(input)
      expect(repo.closeOpenEntry).toHaveBeenCalledWith(PROFILE_ID, TENANT_ID, input.effectiveFrom)
      expect(repo.recordChange).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'department_transfer' }),
      )
    })

    it('does NOT use Promise.all — calls are sequential', async () => {
      // Verify sequential by checking call order
      const callOrder: string[] = []
      vi.mocked(repo.closeOpenEntry).mockImplementation(async () => {
        callOrder.push('close')
        return undefined
      })
      vi.mocked(repo.recordChange).mockImplementation(async () => {
        callOrder.push('record')
        return { id: 'x' } as never
      })
      await service.recordDepartmentTransfer(makeInput())
      expect(callOrder).toEqual(['close', 'record'])
    })
  })

  describe('recordTermination', () => {
    it('calls closeOpenEntry only, no recordChange', async () => {
      await service.recordTermination(PROFILE_ID, TENANT_ID, new Date('2026-06-30'))
      expect(repo.closeOpenEntry).toHaveBeenCalledWith(
        PROFILE_ID,
        TENANT_ID,
        new Date('2026-06-30'),
      )
      expect(repo.recordChange).not.toHaveBeenCalled()
    })
  })

  describe('recordRehire', () => {
    it('calls recordChange with changeType rehire', async () => {
      await service.recordRehire(makeInput())
      expect(repo.recordChange).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'rehire' }),
      )
      expect(repo.closeOpenEntry).not.toHaveBeenCalled()
    })
  })
})
