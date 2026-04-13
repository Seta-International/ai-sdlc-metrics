import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetTemplateByIdHandler } from './get-template-by-id.handler'
import { GetTemplateByIdQuery } from './get-template-by-id.query'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'

const mockTemplate = {
  id: 'tmpl-1',
  tenantId: 'tenant-1',
  slug: 'payslip',
  name: 'Payslip',
  format: 'pdf' as const,
  content: '<html></html>',
  version: 1,
  isDefault: false,
  createdBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockRepo: ITemplateRepository = {
  findBySlugAndTenant: vi.fn(),
  findById: vi.fn(),
  findByTenant: vi.fn(),
  listByTenant: vi.fn(),
  insert: vi.fn(),
}

describe('GetTemplateByIdHandler', () => {
  let handler: GetTemplateByIdHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new GetTemplateByIdHandler(mockRepo)
  })

  it('returns template when found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(mockTemplate)
    const result = await handler.execute(new GetTemplateByIdQuery('tenant-1', 'tmpl-1'))
    expect(result).toEqual(mockTemplate)
    expect(mockRepo.findById).toHaveBeenCalledWith('tenant-1', 'tmpl-1')
  })

  it('throws when template not found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null)
    await expect(handler.execute(new GetTemplateByIdQuery('tenant-1', 'missing'))).rejects.toThrow(
      'Template not found: missing',
    )
  })
})
