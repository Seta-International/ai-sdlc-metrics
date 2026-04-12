import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetEffectivePermissionsQuery } from './get-effective-permissions.query'
import { GetEffectivePermissionsHandler } from './get-effective-permissions.handler'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'
import type { IRolePermissionRepository } from '../../domain/repositories/role-permission.repository.port'
import type { IDelegationRepository } from '../../domain/repositories/delegation.repository.port'
import type { RoleGrant } from '../../domain/entities/role-grant.entity'
import type { RolePermission } from '../../domain/entities/role-permission.entity'
import type { Delegation } from '../../domain/entities/delegation.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const GRANTER_ID = '01900000-0000-7000-8000-000000000003'
const DELEGATOR_ID = '01900000-0000-7000-8000-000000000020'

function makeGrant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return {
    id: '01900000-0000-7000-8000-000000000099',
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    roleKey: 'employee',
    scopeType: 'global',
    scopeId: null,
    grantedBy: GRANTER_ID,
    source: 'manual',
    validFrom: new Date(),
    validUntil: null,
    ...overrides,
  }
}

function makePermission(overrides: Partial<RolePermission> = {}): RolePermission {
  return {
    id: '01900000-0000-7000-8000-000000000098',
    tenantId: TENANT_ID,
    roleKey: 'employee',
    permissionKey: 'people:profile:self:read',
    isLocked: true,
    createdAt: new Date(),
    ...overrides,
  }
}

function makeDelegation(overrides: Partial<Delegation> = {}): Delegation {
  const now = new Date()
  return {
    id: '01900000-0000-7000-8000-000000000097',
    tenantId: TENANT_ID,
    delegatorId: DELEGATOR_ID,
    delegateeId: ACTOR_ID,
    role: 'line_manager',
    validFrom: new Date(now.getTime() - 86400000),
    validUntil: new Date(now.getTime() + 86400000),
    ...overrides,
  }
}

describe('GetEffectivePermissionsHandler', () => {
  let handler: GetEffectivePermissionsHandler
  let roleGrantRepo: IRoleGrantRepository
  let rolePermissionRepo: IRolePermissionRepository
  let delegationRepo: IDelegationRepository

  beforeEach(() => {
    roleGrantRepo = {
      findByActorId: vi.fn().mockResolvedValue([]),
      insert: vi.fn(),
      revokeAllForActor: vi.fn(),
      revokeBySource: vi.fn(),
    }
    rolePermissionRepo = {
      findByRoleKey: vi.fn(),
      findByRoleKeys: vi.fn().mockResolvedValue([]),
      insert: vi.fn(),
      remove: vi.fn(),
      findAll: vi.fn(),
    }
    delegationRepo = {
      findActiveDelegationsForDelegatee: vi.fn().mockResolvedValue([]),
    }
    handler = new GetEffectivePermissionsHandler(roleGrantRepo, rolePermissionRepo, delegationRepo)
  })

  it('returns permissions from direct role grants', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([makeGrant({ roleKey: 'employee' })])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({ permissionKey: 'people:profile:self:read' }),
      makePermission({ permissionKey: 'time:leave:self:submit' }),
    ])

    const result = await handler.execute(new GetEffectivePermissionsQuery(ACTOR_ID, TENANT_ID))

    expect(result).toEqual(
      expect.arrayContaining(['people:profile:self:read', 'time:leave:self:submit']),
    )
    expect(result).toHaveLength(2)
  })

  it('includes permissions from delegated roles', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([makeGrant({ roleKey: 'employee' })])
    vi.mocked(delegationRepo.findActiveDelegationsForDelegatee).mockResolvedValue([
      makeDelegation({ role: 'line_manager' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({ roleKey: 'employee', permissionKey: 'people:profile:self:read' }),
      makePermission({ roleKey: 'line_manager', permissionKey: 'time:leave:approve' }),
    ])

    const result = await handler.execute(new GetEffectivePermissionsQuery(ACTOR_ID, TENANT_ID))

    expect(result).toEqual(
      expect.arrayContaining(['people:profile:self:read', 'time:leave:approve']),
    )
  })

  it('returns unique permissions when multiple roles grant same permission', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee' }),
      makeGrant({ roleKey: 'hr_ops' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({ roleKey: 'employee', permissionKey: 'people:profile:self:read' }),
      makePermission({ roleKey: 'hr_ops', permissionKey: 'people:profile:self:read' }),
      makePermission({ roleKey: 'hr_ops', permissionKey: 'people:profile:read' }),
    ])

    const result = await handler.execute(new GetEffectivePermissionsQuery(ACTOR_ID, TENANT_ID))

    expect(result).toHaveLength(2)
    expect(result).toEqual(
      expect.arrayContaining(['people:profile:self:read', 'people:profile:read']),
    )
  })

  it('returns empty array when actor has no grants or delegations', async () => {
    const result = await handler.execute(new GetEffectivePermissionsQuery(ACTOR_ID, TENANT_ID))

    expect(result).toEqual([])
    expect(rolePermissionRepo.findByRoleKeys).not.toHaveBeenCalled()
  })
})
