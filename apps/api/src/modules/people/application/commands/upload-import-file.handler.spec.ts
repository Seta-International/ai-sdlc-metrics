import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UploadImportFileCommand } from './upload-import-file.command'
import { UploadImportFileHandler } from './upload-import-file.handler'
import type { IImportJobRepository } from '../../domain/repositories/import-job.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('UploadImportFileHandler', () => {
  let handler: UploadImportFileHandler
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
    handler = new UploadImportFileHandler(importJobRepo)
  })

  it('creates import job with uploaded status', async () => {
    vi.mocked(importJobRepo.insert).mockImplementation(
      async (data) => ({ id: 'job-1', ...data }) as any,
    )

    const result = await handler.execute(
      new UploadImportFileCommand(TENANT_ID, 'doc-1', 'employees.csv', 100, ACTOR_ID),
    )

    expect(importJobRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        fileDocumentId: 'doc-1',
        fileName: 'employees.csv',
        rowCount: 100,
        status: 'uploaded',
        columnMapping: null,
        requestedBy: ACTOR_ID,
      }),
    )
    expect(result.status).toBe('uploaded')
  })
})
