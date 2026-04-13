import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetBrandingHandler } from './get-branding.handler'
import { GetBrandingQuery } from './get-branding.query'
import type { ITenantBrandingRepository } from '../../domain/repositories/tenant-branding.repository.port'

const mockRepo: ITenantBrandingRepository = {
  findByTenant: vi.fn(),
  upsert: vi.fn(),
}

describe('GetBrandingHandler', () => {
  let handler: GetBrandingHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new GetBrandingHandler(mockRepo)
  })

  it('returns branding when found', async () => {
    const branding = {
      id: 'brand-1',
      tenantId: 'tenant-1',
      companyName: 'SETA',
      logoFileKey: null,
      primaryColor: '#1D4ED8',
      fontFamily: null,
      updatedAt: new Date(),
    }
    vi.mocked(mockRepo.findByTenant).mockResolvedValue(branding)
    const result = await handler.execute(new GetBrandingQuery('tenant-1'))
    expect(result).toEqual(branding)
  })

  it('returns null when no branding exists', async () => {
    vi.mocked(mockRepo.findByTenant).mockResolvedValue(null)
    const result = await handler.execute(new GetBrandingQuery('tenant-1'))
    expect(result).toBeNull()
  })
})
