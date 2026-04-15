import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetSharedProfileQuery } from './get-shared-profile.query'
import { GetSharedProfileHandler } from './get-shared-profile.handler'
import type { IProfileShareLinkRepository } from '../../domain/repositories/profile-share-link.repository'
import type { IDirectorySearchIndexRepository } from '../../domain/repositories/directory-search-index.repository'

describe('GetSharedProfileHandler', () => {
  let handler: GetSharedProfileHandler
  let shareLinkRepo: IProfileShareLinkRepository
  let searchIndexRepo: IDirectorySearchIndexRepository

  beforeEach(() => {
    shareLinkRepo = {
      findById: vi.fn(),
      findByToken: vi.fn(),
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      incrementViewCount: vi.fn(),
      revoke: vi.fn(),
    }
    searchIndexRepo = {
      upsert: vi.fn(),
      deleteByEmploymentId: vi.fn(),
      search: vi.fn(),
      list: vi.fn(),
      rebuildAll: vi.fn(),
      countByTenant: vi.fn(),
      listCompanyEmails: vi.fn(),
    }
    handler = new GetSharedProfileHandler(shareLinkRepo, searchIndexRepo)
  })

  it('returns public-tier profile data and increments view count', async () => {
    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue({
      id: 'share-1',
      tenantId: 'tenant-1',
      employmentId: 'emp-1',
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 86400000),
      maxViews: null,
      viewCount: 5,
      status: 'active',
      createdBy: 'actor-1',
      createdAt: new Date(),
      revokedAt: null,
    })
    vi.mocked(searchIndexRepo.list).mockResolvedValue({
      items: [
        {
          id: 'idx-1',
          tenantId: 'tenant-1',
          employmentId: 'emp-1',
          fullName: 'Nguyễn Văn An',
          fullNameUnaccented: 'Nguyen Van An',
          companyEmail: 'an.nguyen@seta.vn',
          jobTitle: 'Software Engineer',
          jobLevel: 'L4',
          departmentName: 'Engineering',
          locationName: 'HCMC',
          managerName: null,
          workArrangement: 'hybrid',
          employmentStatus: 'active',
          hireDate: new Date(),
          skills: ['typescript'],
          countryCode: 'VN',
          updatedAt: new Date(),
        },
      ],
      total: 1,
    })

    const result = await handler.execute(new GetSharedProfileQuery('valid-token'))

    expect(result).not.toBeNull()
    expect(result!.fullName).toBe('Nguyễn Văn An')
    expect(shareLinkRepo.incrementViewCount).toHaveBeenCalledWith('share-1')
    expect(searchIndexRepo.list).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ employmentId: 'emp-1' }),
      1,
      0,
    )
  })

  it('returns null for expired token', async () => {
    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue({
      id: 'share-1',
      tenantId: 'tenant-1',
      employmentId: 'emp-1',
      token: 'expired',
      expiresAt: new Date(Date.now() - 86400000),
      maxViews: null,
      viewCount: 0,
      status: 'active',
      createdBy: 'actor-1',
      createdAt: new Date(),
      revokedAt: null,
    })
    expect(await handler.execute(new GetSharedProfileQuery('expired'))).toBeNull()
  })

  it('returns null for revoked link', async () => {
    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue({
      id: 'share-1',
      tenantId: 'tenant-1',
      employmentId: 'emp-1',
      token: 'revoked',
      expiresAt: new Date(Date.now() + 86400000),
      maxViews: null,
      viewCount: 0,
      status: 'revoked',
      createdBy: 'actor-1',
      createdAt: new Date(),
      revokedAt: new Date(),
    })
    expect(await handler.execute(new GetSharedProfileQuery('revoked'))).toBeNull()
  })

  it('returns null when max views exceeded', async () => {
    vi.mocked(shareLinkRepo.findByToken).mockResolvedValue({
      id: 'share-1',
      tenantId: 'tenant-1',
      employmentId: 'emp-1',
      token: 'maxed',
      expiresAt: new Date(Date.now() + 86400000),
      maxViews: 10,
      viewCount: 10,
      status: 'active',
      createdBy: 'actor-1',
      createdAt: new Date(),
      revokedAt: null,
    })
    expect(await handler.execute(new GetSharedProfileQuery('maxed'))).toBeNull()
  })
})
