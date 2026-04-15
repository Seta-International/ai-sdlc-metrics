import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MapImportColumnsCommand } from './map-import-columns.command'
import { MapImportColumnsHandler } from './map-import-columns.handler'
import type { IImportJobRepository } from '../../domain/repositories/import-job.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const JOB_ID = '01900000-0000-7000-8000-000000000002'

describe('MapImportColumnsHandler', () => {
  let handler: MapImportColumnsHandler
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
    handler = new MapImportColumnsHandler(importJobRepo)
  })

  it('applies column mapping to the import job', async () => {
    vi.mocked(importJobRepo.findById).mockResolvedValue({ id: JOB_ID, status: 'uploaded' } as never)
    vi.mocked(importJobRepo.updateMapping).mockResolvedValue(undefined)

    const mapping = { 'Full Name': 'person_profile.full_name', Email: 'employment.company_email' }
    await handler.execute(new MapImportColumnsCommand(TENANT_ID, JOB_ID, mapping, 'default'))

    expect(importJobRepo.updateMapping).toHaveBeenCalledWith(JOB_ID, TENANT_ID, mapping, 'default')
  })

  it('throws when import job not found', async () => {
    vi.mocked(importJobRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new MapImportColumnsCommand(TENANT_ID, JOB_ID, {}, null)),
    ).rejects.toThrow()
  })
})
