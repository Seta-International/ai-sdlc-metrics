import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidateImportCommand } from './validate-import.command'
import { ValidateImportHandler } from './validate-import.handler'
import type { IImportJobRepository } from '../../domain/repositories/import-job.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const JOB_ID = '01900000-0000-7000-8000-000000000002'

describe('ValidateImportHandler', () => {
  let handler: ValidateImportHandler
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
    handler = new ValidateImportHandler(importJobRepo)
  })

  it('validates a mapped import job', async () => {
    vi.mocked(importJobRepo.findById).mockResolvedValue({
      id: JOB_ID,
      status: 'mapped',
      rowCount: 50,
    } as any)
    vi.mocked(importJobRepo.updateValidation).mockResolvedValue(undefined)

    await handler.execute(new ValidateImportCommand(TENANT_ID, JOB_ID))

    expect(importJobRepo.updateValidation).toHaveBeenCalledWith(
      JOB_ID,
      TENANT_ID,
      50,
      0,
      0,
      expect.any(Object),
    )
  })

  it('throws when job not in mapped status', async () => {
    vi.mocked(importJobRepo.findById).mockResolvedValue({ id: JOB_ID, status: 'uploaded' } as any)

    await expect(handler.execute(new ValidateImportCommand(TENANT_ID, JOB_ID))).rejects.toThrow()
  })

  it('throws when job not found', async () => {
    vi.mocked(importJobRepo.findById).mockResolvedValue(null)
    await expect(handler.execute(new ValidateImportCommand(TENANT_ID, JOB_ID))).rejects.toThrow()
  })
})
