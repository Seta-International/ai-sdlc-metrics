import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateTemplateHandler } from './create-template.handler'
import { CreateTemplateCommand } from './create-template.command'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'

const mockRepo: ITemplateRepository = {
  findBySlugAndTenant: vi.fn(),
  findById: vi.fn(),
  findByTenant: vi.fn(),
  listByTenant: vi.fn(),
  insert: vi.fn(),
}

describe('CreateTemplateHandler', () => {
  let handler: CreateTemplateHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new CreateTemplateHandler(mockRepo)
  })

  it('inserts template and returns id', async () => {
    vi.mocked(mockRepo.findBySlugAndTenant).mockResolvedValue(null)
    vi.mocked(mockRepo.insert).mockResolvedValue({
      id: 'tmpl-1',
      tenantId: 'tenant-1',
      slug: 'payslip',
      name: 'Payslip',
      format: 'pdf',
      content: '<html></html>',
      version: 1,
      isDefault: false,
      createdBy: 'actor-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const id = await handler.execute(
      new CreateTemplateCommand(
        'tenant-1',
        'actor-1',
        'payslip',
        'Payslip',
        'pdf',
        '<html></html>',
      ),
    )

    expect(id).toBe('tmpl-1')
    expect(mockRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'payslip', format: 'pdf', version: 1 }),
    )
  })

  it('throws if slug already exists for tenant', async () => {
    vi.mocked(mockRepo.findBySlugAndTenant).mockResolvedValue({
      id: 'existing',
      tenantId: 'tenant-1',
      slug: 'payslip',
      name: 'Payslip',
      format: 'pdf',
      content: '',
      version: 1,
      isDefault: false,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await expect(
      handler.execute(
        new CreateTemplateCommand('tenant-1', 'actor-1', 'payslip', 'Payslip', 'pdf', ''),
      ),
    ).rejects.toThrow('Template slug already exists: payslip')
  })
})
