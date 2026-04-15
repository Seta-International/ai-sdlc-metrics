import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UploadEmployeeDocumentCommand } from './upload-employee-document.command'
import { UploadEmployeeDocumentHandler } from './upload-employee-document.handler'
import type { IEmployeeDocumentRepository } from '../../domain/repositories/employee-document.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const DOCUMENT_ID = '01900000-0000-7000-8000-000000000003'
const ACTOR_ID = '01900000-0000-7000-8000-000000000004'
const EMPLOYEE_DOC_ID = '01900000-0000-7000-8000-000000000005'

describe('UploadEmployeeDocumentHandler', () => {
  let handler: UploadEmployeeDocumentHandler
  let docRepo: IEmployeeDocumentRepository
  let employmentRepo: IEmploymentRepository

  beforeEach(() => {
    docRepo = {
      findById: vi.fn(),
      findByEmploymentId: vi.fn(),
      findExpiringBefore: vi.fn(),
      findByCategory: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    employmentRepo = {
      findById: vi.fn(),
      findByPersonProfileId: vi.fn(),
      findActiveByActorId: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
      countByTenant: vi.fn(),
    }
    handler = new UploadEmployeeDocumentHandler(docRepo, employmentRepo)
  })

  it('creates document metadata for employment', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as any)
    vi.mocked(docRepo.insert).mockResolvedValue({
      id: EMPLOYEE_DOC_ID,
      tenantId: TENANT_ID,
      employmentId: EMPLOYMENT_ID,
      documentId: DOCUMENT_ID,
      category: 'identity',
      title: 'Citizen ID',
      version: 1,
      status: 'active',
    } as any)

    const result = await handler.execute(
      new UploadEmployeeDocumentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        DOCUMENT_ID,
        'identity',
        'Citizen ID',
        ACTOR_ID,
      ),
    )

    expect(result.id).toBe(EMPLOYEE_DOC_ID)
    expect(docRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        documentId: DOCUMENT_ID,
        category: 'identity',
        version: 1,
        status: 'active',
      }),
    )
  })

  it('throws when employment not found', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new UploadEmployeeDocumentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          DOCUMENT_ID,
          'identity',
          'Citizen ID',
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow()
  })

  it('increments version when parent document provided', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({ id: EMPLOYMENT_ID } as any)
    vi.mocked(docRepo.findById).mockResolvedValue({
      id: 'parent-doc',
      version: 2,
    } as any)
    vi.mocked(docRepo.update).mockResolvedValue({} as any)
    vi.mocked(docRepo.insert).mockResolvedValue({ id: EMPLOYEE_DOC_ID, version: 3 } as any)

    await handler.execute(
      new UploadEmployeeDocumentCommand(
        TENANT_ID,
        EMPLOYMENT_ID,
        DOCUMENT_ID,
        'identity',
        'Updated ID',
        ACTOR_ID,
        null,
        null,
        false,
        false,
        'parent-doc',
      ),
    )

    expect(docRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3, parentDocumentId: 'parent-doc' }),
    )
    expect(docRepo.update).toHaveBeenCalledWith(
      'parent-doc',
      TENANT_ID,
      expect.objectContaining({ status: 'archived' }),
    )
  })
})
