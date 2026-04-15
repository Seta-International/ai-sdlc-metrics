import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProcessImportJob } from './process-import.job'
import type { IImportJobRepository } from '../../domain/repositories/import-job.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const JOB_ID = '01900000-0000-7000-8000-000000000002'

describe('ProcessImportJob', () => {
  let job: ProcessImportJob
  let importJobRepo: IImportJobRepository

  beforeEach(() => {
    importJobRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      updateMapping: vi.fn(),
      updateValidation: vi.fn(),
      updateResults: vi.fn(),
    }
    job = new ProcessImportJob(importJobRepo)
  })

  it('returns early when job not found', async () => {
    vi.mocked(importJobRepo.findById).mockResolvedValue(null)

    await job.handle({ importJobId: JOB_ID, tenantId: TENANT_ID })

    expect(importJobRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('updates status to committed and calls updateResults', async () => {
    vi.mocked(importJobRepo.findById).mockResolvedValue({
      id: JOB_ID,
      tenantId: TENANT_ID,
      rowCount: 50,
    } as never)
    vi.mocked(importJobRepo.updateStatus).mockResolvedValue(undefined)
    vi.mocked(importJobRepo.updateResults).mockResolvedValue(undefined)

    await job.handle({ importJobId: JOB_ID, tenantId: TENANT_ID })

    expect(importJobRepo.updateStatus).toHaveBeenCalledWith(JOB_ID, TENANT_ID, 'committed')
    expect(importJobRepo.updateResults).toHaveBeenCalledWith(JOB_ID, TENANT_ID, 0, 0, 50, null)
  })
})
