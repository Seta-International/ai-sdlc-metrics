import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DocumentGenerateWorker } from './document-generate.worker'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import type { ITenantBrandingRepository } from '../../domain/repositories/tenant-branding.repository.port'
import type { StorageClient } from '@future/storage'
import type { EventBus } from '@nestjs/cqrs'

const mockJobRepo: IGenerationJobRepository = {
  insert: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
  listByTenant: vi.fn(),
}
const mockTemplateRepo: ITemplateRepository = {
  findBySlugAndTenant: vi.fn(),
  findById: vi.fn(),
  findByTenant: vi.fn(),
  listByTenant: vi.fn(),
  insert: vi.fn(),
}
const mockBrandingRepo: ITenantBrandingRepository = {
  findByTenant: vi.fn(),
  upsert: vi.fn(),
}
const mockStorage: StorageClient = {
  getUploadUrl: vi.fn(),
  getDownloadUrl: vi.fn(),
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  headObject: vi.fn(),
}
const mockEventBus = { publish: vi.fn() } as unknown as EventBus

vi.mock('@future/documents', () => ({
  generatePdf: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
  generateExcel: vi.fn().mockResolvedValue(Buffer.from('xlsx-bytes')),
}))

describe('DocumentGenerateWorker', () => {
  let worker: DocumentGenerateWorker

  beforeEach(() => {
    vi.clearAllMocks()
    worker = new DocumentGenerateWorker(
      mockJobRepo,
      mockTemplateRepo,
      mockBrandingRepo,
      mockStorage,
      mockEventBus,
    )
  })

  it('generates PDF, uploads to S3, and marks job completed', async () => {
    vi.mocked(mockJobRepo.findById).mockResolvedValue({
      id: 'job-1',
      tenantId: 'tenant-1',
      templateId: 'tmpl-1',
      requestedBy: 'actor-1',
      status: 'pending',
      inputData: { name: 'Nguyen Van A' },
      outputFileKey: null,
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    })
    vi.mocked(mockTemplateRepo.findById).mockResolvedValue({
      id: 'tmpl-1',
      tenantId: 'tenant-1',
      slug: 'payslip',
      name: 'Payslip',
      format: 'pdf',
      content: '<html>{{name}}</html>',
      version: 1,
      isDefault: false,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(mockBrandingRepo.findByTenant).mockResolvedValue(null)
    vi.mocked(mockStorage.putObject).mockResolvedValue(undefined)

    await worker.handle({ data: { jobId: 'job-1', tenantId: 'tenant-1' } } as never)

    expect(mockJobRepo.updateStatus).toHaveBeenCalledWith(
      'job-1',
      'processing',
      undefined,
      undefined,
    )
    expect(mockStorage.putObject).toHaveBeenCalled()
    expect(mockJobRepo.updateStatus).toHaveBeenCalledWith(
      'job-1',
      'completed',
      expect.stringContaining('tenant-1'),
      undefined,
    )
    expect(mockEventBus.publish).toHaveBeenCalled()
  })

  it('marks job failed on error', async () => {
    vi.mocked(mockJobRepo.findById).mockResolvedValue({
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
    vi.mocked(mockTemplateRepo.findById).mockResolvedValue(null)

    await worker.handle({ data: { jobId: 'job-1', tenantId: 'tenant-1' } } as never)

    expect(mockJobRepo.updateStatus).toHaveBeenCalledWith(
      'job-1',
      'failed',
      undefined,
      expect.stringContaining('Template not found'),
    )
  })
})
