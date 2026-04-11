import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeprovisionUserIdentityCommand } from './deprovision-user-identity.command'
import { DeprovisionUserIdentityHandler } from './deprovision-user-identity.handler'
import type { IUserIdentityRepository } from '../../domain/repositories/user-identity.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('DeprovisionUserIdentityHandler', () => {
  let handler: DeprovisionUserIdentityHandler
  let userIdentityRepo: IUserIdentityRepository

  beforeEach(() => {
    userIdentityRepo = {
      findById: vi.fn(),
      findBySsoSubject: vi.fn(),
      insert: vi.fn(),
      deprovisionByActorId: vi.fn(),
    }
    handler = new DeprovisionUserIdentityHandler(userIdentityRepo)
  })

  it('deprovisions user identity for actor', async () => {
    vi.mocked(userIdentityRepo.deprovisionByActorId).mockResolvedValue(undefined)

    await handler.execute(new DeprovisionUserIdentityCommand(TENANT_ID, ACTOR_ID))

    expect(userIdentityRepo.deprovisionByActorId).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
  })

  it('propagates repository errors', async () => {
    vi.mocked(userIdentityRepo.deprovisionByActorId).mockRejectedValue(new Error('DB error'))

    await expect(
      handler.execute(new DeprovisionUserIdentityCommand(TENANT_ID, ACTOR_ID)),
    ).rejects.toThrow('DB error')
  })
})
