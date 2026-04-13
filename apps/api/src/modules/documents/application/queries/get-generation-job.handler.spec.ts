import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetGenerationJobHandler } from './get-generation-job.handler'
import { GetGenerationJobQuery } from './get-generation-job.query'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import type { GenerationJob } from '../../domain/entities/generation-job.entity'

const mockJob: GenerationJob = {
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
}

const mockRepo: IGenerationJobRepository = {
  insert: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
  listByTenant: vi.fn(),
}

describe('GetGenerationJobHandler', () => {
  let handler: GetGenerationJobHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new GetGenerationJobHandler(mockRepo)
  })

  it('returns job when found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(mockJob)
    const result = await handler.execute(new GetGenerationJobQuery('tenant-1', 'job-1'))
    expect(result).toEqual(mockJob)
  })

  it('throws when job not found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null)
    await expect(handler.execute(new GetGenerationJobQuery('tenant-1', 'missing'))).rejects.toThrow(
      'Job not found: missing',
    )
  })
})
