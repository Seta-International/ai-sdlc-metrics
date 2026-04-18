import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IUserIdentityRepository } from '../../domain/repositories/user-identity.repository.port'
import type { UserIdentity } from '../../domain/entities/user-identity.entity'
import { GetUserIdentityByActorIdHandler } from './get-user-identity-by-actor-id.handler'
import { GetUserIdentityByActorIdQuery } from './get-user-identity-by-actor-id.query'

describe('GetUserIdentityByActorIdHandler', () => {
  let handler: GetUserIdentityByActorIdHandler
  let identityRepo: { findByActorId: ReturnType<typeof vi.fn> }

  const mockIdentity: UserIdentity = {
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
    identityRepo = {
      findByActorId: vi.fn().mockResolvedValue(mockIdentity),
    }
    handler = new GetUserIdentityByActorIdHandler(
      identityRepo as unknown as IUserIdentityRepository,
    )
  })

  it('returns UserIdentity when user identity is found', async () => {
    const query = new GetUserIdentityByActorIdQuery('actor-1', 'tenant-1')
    const result = await handler.execute(query)
    expect(result).toEqual(mockIdentity)
    expect(identityRepo.findByActorId).toHaveBeenCalledWith('actor-1', 'tenant-1')
  })

  it('returns null when user identity is not found', async () => {
    identityRepo.findByActorId = vi.fn().mockResolvedValue(null)
    handler = new GetUserIdentityByActorIdHandler(
      identityRepo as unknown as IUserIdentityRepository,
    )

    const query = new GetUserIdentityByActorIdQuery('unknown-actor', 'tenant-1')
    const result = await handler.execute(query)
    expect(result).toBeNull()
  })
})
