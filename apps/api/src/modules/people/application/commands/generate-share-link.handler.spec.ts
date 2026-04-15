import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateShareLinkCommand } from './generate-share-link.command'
import { GenerateShareLinkHandler } from './generate-share-link.handler'
import type { IProfileShareLinkRepository } from '../../domain/repositories/profile-share-link.repository'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('GenerateShareLinkHandler', () => {
  let handler: GenerateShareLinkHandler
  let shareLinkRepo: IProfileShareLinkRepository
  let employmentRepo: IEmploymentRepository

  beforeEach(() => {
    shareLinkRepo = {
      findById: vi.fn(),
      findByToken: vi.fn(),
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      incrementViewCount: vi.fn(),
      revoke: vi.fn(),
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
    handler = new GenerateShareLinkHandler(shareLinkRepo, employmentRepo)
  })

  it('creates share link with token and expiry', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as any)
    vi.mocked(shareLinkRepo.insert).mockImplementation(
      async (data) => ({ id: 'share-1', ...data }) as any,
    )

    const result = await handler.execute(
      new GenerateShareLinkCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID, 7, 100),
    )

    expect(shareLinkRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        employmentId: EMPLOYMENT_ID,
        createdBy: ACTOR_ID,
        maxViews: 100,
        viewCount: 0,
        status: 'active',
      }),
    )
    expect(result.token).toBeDefined()
    expect(result.token.length).toBeGreaterThan(20)
  })

  it('throws EmploymentNotFoundException when employment missing', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new GenerateShareLinkCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID)),
    ).rejects.toThrow(EmploymentNotFoundException)
  })

  it('caps expiry at 90 days', async () => {
    vi.mocked(employmentRepo.findById).mockResolvedValue({
      id: EMPLOYMENT_ID,
      tenantId: TENANT_ID,
    } as any)
    vi.mocked(shareLinkRepo.insert).mockImplementation(
      async (data) => ({ id: 'share-1', ...data }) as any,
    )

    await handler.execute(new GenerateShareLinkCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID, 365))

    const insertCall = vi.mocked(shareLinkRepo.insert).mock.calls[0][0]
    const expiresAt = insertCall.expiresAt
    const maxExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000 + 60000)
    expect(expiresAt.getTime()).toBeLessThanOrEqual(maxExpiry.getTime())
  })
})
