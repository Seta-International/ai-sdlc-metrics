import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommitImportCommand } from './commit-import.command'
import { CommitImportHandler } from './commit-import.handler'
import type { IImportJobRepository } from '../../domain/repositories/import-job.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const JOB_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('CommitImportHandler', () => {
  let handler: CommitImportHandler
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
    handler = new CommitImportHandler(importJobRepo)
  })

  it('commits a validated import job', async () => {
    vi.mocked(importJobRepo.findById).mockResolvedValue({
      id: JOB_ID,
      status: 'validated',
      rowCount: 10,
    } as any)
    vi.mocked(importJobRepo.updateStatus).mockResolvedValue(undefined)

    await handler.execute(new CommitImportCommand(TENANT_ID, JOB_ID, ACTOR_ID))

    expect(importJobRepo.updateStatus).toHaveBeenCalledWith(JOB_ID, TENANT_ID, 'committed')
  })

  it('throws when job not in validated/previewed status', async () => {
    vi.mocked(importJobRepo.findById).mockResolvedValue({ id: JOB_ID, status: 'uploaded' } as any)

    await expect(
      handler.execute(new CommitImportCommand(TENANT_ID, JOB_ID, ACTOR_ID)),
    ).rejects.toThrow()
  })

  it('throws when job not found', async () => {
    vi.mocked(importJobRepo.findById).mockResolvedValue(null)
    await expect(
      handler.execute(new CommitImportCommand(TENANT_ID, JOB_ID, ACTOR_ID)),
    ).rejects.toThrow()
  })
})
