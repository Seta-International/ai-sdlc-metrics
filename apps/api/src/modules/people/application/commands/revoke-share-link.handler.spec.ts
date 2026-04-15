import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RevokeShareLinkCommand } from './revoke-share-link.command'
import { RevokeShareLinkHandler } from './revoke-share-link.handler'
import type { IProfileShareLinkRepository } from '../../domain/repositories/profile-share-link.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const SHARE_LINK_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('RevokeShareLinkHandler', () => {
  let handler: RevokeShareLinkHandler
  let shareLinkRepo: IProfileShareLinkRepository

  beforeEach(() => {
    shareLinkRepo = {
      findById: vi.fn(),
      findByToken: vi.fn(),
      findByEmploymentId: vi.fn(),
      insert: vi.fn(),
      incrementViewCount: vi.fn(),
      revoke: vi.fn(),
    }
    handler = new RevokeShareLinkHandler(shareLinkRepo)
  })

  it('revokes an active share link', async () => {
    vi.mocked(shareLinkRepo.findById).mockResolvedValue({
      id: SHARE_LINK_ID,
      tenantId: TENANT_ID,
      status: 'active',
    } as any)

    await handler.execute(new RevokeShareLinkCommand(TENANT_ID, SHARE_LINK_ID, ACTOR_ID))

    expect(shareLinkRepo.revoke).toHaveBeenCalledWith(SHARE_LINK_ID, TENANT_ID)
  })

  it('throws when share link not found', async () => {
    vi.mocked(shareLinkRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new RevokeShareLinkCommand(TENANT_ID, SHARE_LINK_ID, ACTOR_ID)),
    ).rejects.toThrow()
  })
})
