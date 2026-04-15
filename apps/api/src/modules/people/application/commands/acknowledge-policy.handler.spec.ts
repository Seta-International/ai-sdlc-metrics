import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AcknowledgePolicyCommand } from './acknowledge-policy.command'
import { AcknowledgePolicyHandler } from './acknowledge-policy.handler'
import type { IEmployeeDocumentRepository } from '../../domain/repositories/employee-document.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const DOC_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('AcknowledgePolicyHandler', () => {
  let handler: AcknowledgePolicyHandler
  let docRepo: IEmployeeDocumentRepository

  beforeEach(() => {
    docRepo = {
      findById: vi.fn(),
      findByEmploymentId: vi.fn(),
      findExpiringBefore: vi.fn(),
      findByCategory: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    handler = new AcknowledgePolicyHandler(docRepo)
  })

  it('acknowledges policy document', async () => {
    vi.mocked(docRepo.findById).mockResolvedValue({
      id: DOC_ID,
      tenantId: TENANT_ID,
      requiresAcknowledgment: true,
      acknowledgedAt: null,
    } as any)
    vi.mocked(docRepo.update).mockResolvedValue({} as any)

    await handler.execute(new AcknowledgePolicyCommand(TENANT_ID, DOC_ID, ACTOR_ID))

    expect(docRepo.update).toHaveBeenCalledWith(
      DOC_ID,
      TENANT_ID,
      expect.objectContaining({
        acknowledgedBy: ACTOR_ID,
        acknowledgedAt: expect.any(Date),
      }),
    )
  })

  it('throws when document not found', async () => {
    vi.mocked(docRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new AcknowledgePolicyCommand(TENANT_ID, DOC_ID, ACTOR_ID)),
    ).rejects.toThrow()
  })

  it('throws when document does not require acknowledgment', async () => {
    vi.mocked(docRepo.findById).mockResolvedValue({
      id: DOC_ID,
      tenantId: TENANT_ID,
      requiresAcknowledgment: false,
      acknowledgedAt: null,
    } as any)

    await expect(
      handler.execute(new AcknowledgePolicyCommand(TENANT_ID, DOC_ID, ACTOR_ID)),
    ).rejects.toThrow()
  })

  it('throws when already acknowledged (immutable)', async () => {
    vi.mocked(docRepo.findById).mockResolvedValue({
      id: DOC_ID,
      tenantId: TENANT_ID,
      requiresAcknowledgment: true,
      acknowledgedAt: new Date('2026-01-01'),
    } as any)

    await expect(
      handler.execute(new AcknowledgePolicyCommand(TENANT_ID, DOC_ID, ACTOR_ID)),
    ).rejects.toThrow()
  })
})
