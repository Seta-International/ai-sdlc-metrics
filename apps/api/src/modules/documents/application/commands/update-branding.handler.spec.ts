import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UpdateBrandingHandler } from './update-branding.handler'
import { UpdateBrandingCommand } from './update-branding.command'
import type { ITenantBrandingRepository } from '../../domain/repositories/tenant-branding.repository.port'

const mockRepo: ITenantBrandingRepository = {
  findByTenant: vi.fn(),
  upsert: vi.fn(),
}

describe('UpdateBrandingHandler', () => {
  let handler: UpdateBrandingHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new UpdateBrandingHandler(mockRepo)
  })

  it('upserts branding and returns tenantId', async () => {
    vi.mocked(mockRepo.upsert).mockResolvedValue({
      id: 'brand-1',
      tenantId: 'tenant-1',
      companyName: 'SETA',
      logoFileKey: null,
      primaryColor: '#1D4ED8',
      fontFamily: null,
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new UpdateBrandingCommand('tenant-1', 'SETA', null, '#1D4ED8', null),
    )

    expect(result).toBe('tenant-1')
    expect(mockRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', companyName: 'SETA' }),
    )
  })
})
