import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GrantRoleCommand } from './grant-role.command'
import { GrantRoleHandler } from './grant-role.handler'
import { ActorNotFoundException } from '../../domain/exceptions/actor.exceptions'
import { DomainException } from '../../domain/exceptions/domain.exception'
import type { Actor } from '../../domain/entities/actor.entity'
import type { RoleGrant } from '../../domain/entities/role-grant.entity'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const GRANTER_ID = '01900000-0000-7000-8000-000000000003'
const GRANT_ID = '01900000-0000-7000-8000-000000000004'
const DEPT_ID = '01900000-0000-7000-8000-000000000005'

const fakeActor: Actor = {
  id: ACTOR_ID,
  tenantId: TENANT_ID,
  type: 'person',
  displayName: 'Canh Ta',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeGrant: RoleGrant = {
  id: GRANT_ID,
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  roleKey: 'employee',
  scopeType: 'global',
  scopeId: null,
  grantedBy: GRANTER_ID,
  validFrom: new Date(),
  validUntil: null,
}

describe('GrantRoleHandler', () => {
  let handler: GrantRoleHandler
  let actorRepo: IActorRepository
  let roleGrantRepo: IRoleGrantRepository

  beforeEach(() => {
    actorRepo = { findById: vi.fn(), insert: vi.fn() }
    roleGrantRepo = { findByActorId: vi.fn(), insert: vi.fn() }
    handler = new GrantRoleHandler(actorRepo, roleGrantRepo)
  })

  it('returns the new grant id for a global scope role', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    vi.mocked(roleGrantRepo.insert).mockResolvedValue(fakeGrant)

    const result = await handler.execute(
      new GrantRoleCommand(TENANT_ID, ACTOR_ID, 'employee', 'global', null, GRANTER_ID),
    )

    expect(result).toBe(GRANT_ID)
    expect(roleGrantRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      roleKey: 'employee',
      scopeType: 'global',
      scopeId: null,
      grantedBy: GRANTER_ID,
    })
  })

  it('returns the new grant id for a scoped role with scopeId', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    vi.mocked(roleGrantRepo.insert).mockResolvedValue({
      ...fakeGrant,
      scopeType: 'department',
      scopeId: DEPT_ID,
    })

    const result = await handler.execute(
      new GrantRoleCommand(TENANT_ID, ACTOR_ID, 'line_manager', 'department', DEPT_ID, GRANTER_ID),
    )

    expect(result).toBe(GRANT_ID)
  })

  it('throws ActorNotFoundException when actor does not exist', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new GrantRoleCommand(TENANT_ID, ACTOR_ID, 'employee', 'global', null, GRANTER_ID),
      ),
    ).rejects.toThrow(ActorNotFoundException)

    expect(roleGrantRepo.insert).not.toHaveBeenCalled()
  })

  it('throws when scopeType is not global but scopeId is null', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)

    await expect(
      handler.execute(
        new GrantRoleCommand(TENANT_ID, ACTOR_ID, 'line_manager', 'department', null, GRANTER_ID),
      ),
    ).rejects.toThrow(DomainException)

    expect(roleGrantRepo.insert).not.toHaveBeenCalled()
  })
})
