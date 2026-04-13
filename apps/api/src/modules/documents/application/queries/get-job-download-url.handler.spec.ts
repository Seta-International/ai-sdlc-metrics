import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetJobDownloadUrlHandler } from './get-job-download-url.handler'
import { GetJobDownloadUrlQuery } from './get-job-download-url.query'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import type { StorageClient } from '@future/storage'

const mockRepo: IGenerationJobRepository = {
  insert: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
  listByTenant: vi.fn(),
}

const mockStorage: StorageClient = {
  getUploadUrl: vi.fn(),
  getDownloadUrl: vi.fn(),
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  headObject: vi.fn(),
}

describe('GetJobDownloadUrlHandler', () => {
  let handler: GetJobDownloadUrlHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new GetJobDownloadUrlHandler(mockRepo, mockStorage)
  })

  it('returns presigned URL for a completed job', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue({
      id: 'job-1',
      tenantId: 'tenant-1',
      templateId: 'tmpl-1',
      requestedBy: 'actor-1',
      status: 'completed',
      inputData: {},
      outputFileKey: 'tenants/t1/docs/file.pdf',
      errorMessage: null,
      createdAt: new Date(),
      completedAt: new Date(),
    })
    vi.mocked(mockStorage.getDownloadUrl).mockResolvedValue({
      url: 'https://s3.example.com/signed',
      expiresAt: new Date(),
    })

    const result = await handler.execute(new GetJobDownloadUrlQuery('tenant-1', 'job-1'))
    expect(result.url).toBe('https://s3.example.com/signed')
    expect(mockStorage.getDownloadUrl).toHaveBeenCalledWith('tenants/t1/docs/file.pdf')
  })

  it('throws when job is not completed', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue({
      id: 'job-1',
      tenantId: 'tenant-1',
      templateId: 'tmpl-1',
      requestedBy: 'actor-1',
      status: 'pending',
      inputData: {},
      outputFileKey: null,
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    })

    await expect(handler.execute(new GetJobDownloadUrlQuery('tenant-1', 'job-1'))).rejects.toThrow(
      'Job not completed: job-1',
    )
  })
})
