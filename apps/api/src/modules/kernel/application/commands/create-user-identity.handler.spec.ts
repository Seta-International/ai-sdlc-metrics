import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateUserIdentityCommand } from './create-user-identity.command'
import { CreateUserIdentityHandler } from './create-user-identity.handler'
import {
  ActorArchivedException,
  ActorNotFoundException,
} from '../../domain/exceptions/actor.exceptions'
import { DuplicateSsoSubjectException } from '../../domain/exceptions/user-identity.exceptions'
import type { Actor } from '../../domain/entities/actor.entity'
import type { UserIdentity } from '../../domain/entities/user-identity.entity'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'
import type { IUserIdentityRepository } from '../../domain/repositories/user-identity.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const IDENTITY_ID = '01900000-0000-7000-8000-000000000003'
const SSO_SUBJECT = 'entra-oid-abc123'

const fakeActor: Actor = {
  id: ACTOR_ID,
  tenantId: TENANT_ID,
  type: 'person',
  displayName: 'Canh Ta',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeIdentity: UserIdentity = {
  id: IDENTITY_ID,
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  email: 'canh@seta.com',
  ssoSubject: SSO_SUBJECT,
  provider: 'microsoft',
  status: 'active',
  lastLoginAt: null,
  createdAt: new Date(),
}

describe('CreateUserIdentityHandler', () => {
  let handler: CreateUserIdentityHandler
  let actorRepo: IActorRepository
  let identityRepo: IUserIdentityRepository

  beforeEach(() => {
    actorRepo = { findById: vi.fn(), insert: vi.fn(), updateStatus: vi.fn() }
    identityRepo = {
      findById: vi.fn(),
      findBySsoSubject: vi.fn(),
      insert: vi.fn(),
      deprovisionByActorId: vi.fn(),
    }
    handler = new CreateUserIdentityHandler(actorRepo, identityRepo)
  })

  it('returns the new identity id when actor exists and sso subject is unique', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    vi.mocked(identityRepo.findBySsoSubject).mockResolvedValue(null)
    vi.mocked(identityRepo.insert).mockResolvedValue(fakeIdentity)

    const result = await handler.execute(
      new CreateUserIdentityCommand(TENANT_ID, ACTOR_ID, 'canh@seta.com', SSO_SUBJECT, 'microsoft'),
    )

    expect(result).toBe(IDENTITY_ID)
    expect(identityRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'canh@seta.com',
      ssoSubject: SSO_SUBJECT,
      provider: 'microsoft',
    })
  })

  it('throws ActorNotFoundException when actor does not exist', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateUserIdentityCommand(
          TENANT_ID,
          ACTOR_ID,
          'canh@seta.com',
          SSO_SUBJECT,
          'microsoft',
        ),
      ),
    ).rejects.toThrow(ActorNotFoundException)

    expect(identityRepo.insert).not.toHaveBeenCalled()
  })

  it('throws ActorArchivedException when actor is archived', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue({ ...fakeActor, status: 'archived' })

    await expect(
      handler.execute(
        new CreateUserIdentityCommand(
          TENANT_ID,
          ACTOR_ID,
          'canh@seta.com',
          SSO_SUBJECT,
          'microsoft',
        ),
      ),
    ).rejects.toThrow(ActorArchivedException)
  })

  it('throws DuplicateSsoSubjectException when sso subject already exists for tenant', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    vi.mocked(identityRepo.findBySsoSubject).mockResolvedValue(fakeIdentity)

    await expect(
      handler.execute(
        new CreateUserIdentityCommand(
          TENANT_ID,
          ACTOR_ID,
          'canh@seta.com',
          SSO_SUBJECT,
          'microsoft',
        ),
      ),
    ).rejects.toThrow(DuplicateSsoSubjectException)

    expect(identityRepo.insert).not.toHaveBeenCalled()
  })
})
