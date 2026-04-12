import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RevokeAllRoleGrantsCommand } from './revoke-all-role-grants.command'
import { RevokeAllRoleGrantsHandler } from './revoke-all-role-grants.handler'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('RevokeAllRoleGrantsHandler', () => {
  let handler: RevokeAllRoleGrantsHandler
  let roleGrantRepo: IRoleGrantRepository

  beforeEach(() => {
    roleGrantRepo = {
      findByActorId: vi.fn(),
      insert: vi.fn(),
      revokeAllForActor: vi.fn(),
      revokeBySource: vi.fn(),
    }
    handler = new RevokeAllRoleGrantsHandler(roleGrantRepo)
  })

  it('revokes all role grants for actor', async () => {
    vi.mocked(roleGrantRepo.revokeAllForActor).mockResolvedValue(undefined)

    await handler.execute(new RevokeAllRoleGrantsCommand(TENANT_ID, ACTOR_ID))

    expect(roleGrantRepo.revokeAllForActor).toHaveBeenCalledWith(
      ACTOR_ID,
      TENANT_ID,
      expect.any(Date),
    )
  })

  it('propagates repository errors', async () => {
    vi.mocked(roleGrantRepo.revokeAllForActor).mockRejectedValue(new Error('DB error'))

    await expect(
      handler.execute(new RevokeAllRoleGrantsCommand(TENANT_ID, ACTOR_ID)),
    ).rejects.toThrow('DB error')
  })
})
