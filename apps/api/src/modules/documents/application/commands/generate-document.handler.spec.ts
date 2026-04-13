import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateDocumentCommand } from './generate-document.command'
import { GenerateDocumentHandler } from './generate-document.handler'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import type { Template } from '../../domain/entities/template.entity'
import type { GenerationJob } from '../../domain/entities/generation-job.entity'
import { PgBossService, JOB_DOCUMENTS_GENERATE } from '../../../../common/jobs/pg-boss.service'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeTemplate: Template = {
  id: 'tmpl-1',
  tenantId: TENANT_ID,
  slug: 'payslip',
  name: 'Monthly Payslip',
  format: 'pdf',
  content: '<h1>{{month}} Payslip</h1>',
  version: 1,
  isDefault: true,
  createdBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeJob: GenerationJob = {
  id: 'job-1',
  tenantId: TENANT_ID,
  templateId: 'tmpl-1',
  requestedBy: 'actor-1',
  status: 'pending',
  inputData: { month: 'April' },
  outputFileKey: null,
  errorMessage: null,
  createdAt: new Date(),
  completedAt: null,
}

const mockPgBoss = { enqueue: vi.fn().mockResolvedValue('boss-job-id') }

describe('GenerateDocumentHandler', () => {
  let handler: GenerateDocumentHandler
  let templateRepo: ITemplateRepository
  let jobRepo: IGenerationJobRepository

  beforeEach(() => {
    vi.clearAllMocks()
    templateRepo = {
      findBySlugAndTenant: vi.fn().mockResolvedValue(fakeTemplate),
      findById: vi.fn(),
      findByTenant: vi.fn(),
      listByTenant: vi.fn(),
      insert: vi.fn(),
    }
    jobRepo = {
      insert: vi.fn().mockResolvedValue(fakeJob),
      findById: vi.fn(),
      updateStatus: vi.fn(),
      listByTenant: vi.fn(),
    }
    handler = new GenerateDocumentHandler(
      templateRepo,
      jobRepo,
      mockPgBoss as unknown as PgBossService,
    )
  })

  it('creates a generation job when template exists', async () => {
    const result = await handler.execute(
      new GenerateDocumentCommand(TENANT_ID, 'actor-1', 'payslip', { month: 'April' }),
    )

    expect(result).toBe('job-1')
    expect(templateRepo.findBySlugAndTenant).toHaveBeenCalledWith(TENANT_ID, 'payslip')
    expect(jobRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        templateId: 'tmpl-1',
        requestedBy: 'actor-1',
        status: 'pending',
        inputData: { month: 'April' },
      }),
    )
    expect(mockPgBoss.enqueue).toHaveBeenCalledWith(JOB_DOCUMENTS_GENERATE, {
      jobId: 'job-1',
      tenantId: TENANT_ID,
    })
  })

  it('throws when template is not found', async () => {
    vi.mocked(templateRepo.findBySlugAndTenant).mockResolvedValue(null)

    await expect(
      handler.execute(new GenerateDocumentCommand(TENANT_ID, 'actor-1', 'missing', {})),
    ).rejects.toThrow('Template not found: missing')
  })
})
