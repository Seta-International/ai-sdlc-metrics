import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Db } from '@future/db'
import { GetUserIdentityByActorIdHandler } from './get-user-identity-by-actor-id.handler'
import { GetUserIdentityByActorIdQuery } from './get-user-identity-by-actor-id.query'

describe('GetUserIdentityByActorIdHandler', () => {
  let handler: GetUserIdentityByActorIdHandler
  let db: { select: ReturnType<typeof vi.fn> }

  const mockRow = {
    id: 'identity-1',
    tenantId: 'tenant-1',
    actorId: 'actor-1',
    email: 'user@example.com',
    ssoSubject: 'aad-oid-abc123',
    provider: 'microsoft',
    status: 'active',
    lastLoginAt: null,
    createdAt: new Date(),
  }

  beforeEach(() => {
    db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockRow]),
          }),
        }),
      }),
    }
    handler = new GetUserIdentityByActorIdHandler(db as unknown as Db)
  })

  it('returns ssoSubject when user identity is found', async () => {
    const query = new GetUserIdentityByActorIdQuery('actor-1', 'tenant-1')
    const result = await handler.execute(query)
    expect(result).toBe('aad-oid-abc123')
  })

  it('returns null when user identity is not found', async () => {
    db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    handler = new GetUserIdentityByActorIdHandler(db as unknown as Db)

    const query = new GetUserIdentityByActorIdQuery('unknown-actor', 'tenant-1')
    const result = await handler.execute(query)
    expect(result).toBeNull()
  })
})
