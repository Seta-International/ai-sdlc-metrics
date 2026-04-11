import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CanDoQuery } from './can-do.query'
import { CanDoHandler } from './can-do.handler'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'
import type { IRolePermissionRepository } from '../../domain/repositories/role-permission.repository.port'
import type { IDelegationRepository } from '../../domain/repositories/delegation.repository.port'
import type { RoleGrant } from '../../domain/entities/role-grant.entity'
import type { RolePermission } from '../../domain/entities/role-permission.entity'
import type { Delegation } from '../../domain/entities/delegation.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const GRANTER_ID = '01900000-0000-7000-8000-000000000003'
const DEPT_A = '01900000-0000-7000-8000-000000000010'
const DEPT_B = '01900000-0000-7000-8000-000000000011'
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

describe('CanDoHandler', () => {
  let handler: CanDoHandler
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
      findByTenantId: vi.fn(),
      findByRoleKeyAndPermissionKey: vi.fn(),
      removeById: vi.fn(),
      removeAllForRole: vi.fn(),
      insertMany: vi.fn(),
    }
    delegationRepo = {
      findActiveDelegationsForDelegatee: vi.fn().mockResolvedValue([]),
    }
    handler = new CanDoHandler(roleGrantRepo, rolePermissionRepo, delegationRepo)
  })

  it('returns true when actor has a global grant with matching permission', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee', scopeType: 'global' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({ roleKey: 'employee', permissionKey: 'people:profile:self:read' }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'people:profile:self:read', { tenantId: TENANT_ID }),
    )

    expect(result).toBe(true)
  })

  it('returns true when grant scope matches requested scope', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({
        roleKey: 'line_manager',
        scopeType: 'department',
        scopeId: DEPT_A,
      }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'line_manager',
        permissionKey: 'time:leave:approve',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'time:leave:approve', {
        tenantId: TENANT_ID,
        scopeType: 'department',
        scopeId: DEPT_A,
      }),
    )

    expect(result).toBe(true)
  })

  it('returns false when grant scope does not match requested scope', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({
        roleKey: 'line_manager',
        scopeType: 'department',
        scopeId: DEPT_A,
      }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'line_manager',
        permissionKey: 'time:leave:approve',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'time:leave:approve', {
        tenantId: TENANT_ID,
        scopeType: 'department',
        scopeId: DEPT_B,
      }),
    )

    expect(result).toBe(false)
  })

  it('returns true for self permission when actorId matches resourceOwnerId', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee', scopeType: 'global' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'employee',
        permissionKey: 'people:profile:self:read',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'people:profile:self:read', {
        tenantId: TENANT_ID,
        resourceOwnerId: ACTOR_ID,
      }),
    )

    expect(result).toBe(true)
  })

  it('returns false for self permission when actorId does not match resourceOwnerId', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee', scopeType: 'global' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'employee',
        permissionKey: 'people:profile:self:read',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'people:profile:self:read', {
        tenantId: TENANT_ID,
        resourceOwnerId: '01900000-0000-7000-8000-999999999999',
      }),
    )

    expect(result).toBe(false)
  })

  it('returns true when permission comes from a delegation', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([])
    vi.mocked(delegationRepo.findActiveDelegationsForDelegatee).mockResolvedValue([
      makeDelegation({ role: 'line_manager' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'line_manager',
        permissionKey: 'time:leave:approve',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'time:leave:approve', { tenantId: TENANT_ID }),
    )

    expect(result).toBe(true)
  })

  it('returns false when no matching permission exists', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee', scopeType: 'global' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'employee',
        permissionKey: 'people:profile:self:read',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'admin:tenant:manage', { tenantId: TENANT_ID }),
    )

    expect(result).toBe(false)
  })

  it('returns false when actor has no grants and no delegations', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([])
    vi.mocked(delegationRepo.findActiveDelegationsForDelegatee).mockResolvedValue([])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'people:profile:read', { tenantId: TENANT_ID }),
    )

    expect(result).toBe(false)
    expect(rolePermissionRepo.findByRoleKeys).not.toHaveBeenCalled()
  })

  it('unions direct grants and delegated roles for permission lookup', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee', scopeType: 'global' }),
    ])
    vi.mocked(delegationRepo.findActiveDelegationsForDelegatee).mockResolvedValue([
      makeDelegation({ role: 'line_manager' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({ roleKey: 'employee', permissionKey: 'people:profile:self:read' }),
      makePermission({ roleKey: 'line_manager', permissionKey: 'time:leave:approve' }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'time:leave:approve', { tenantId: TENANT_ID }),
    )

    expect(result).toBe(true)
    expect(rolePermissionRepo.findByRoleKeys).toHaveBeenCalledWith(
      expect.arrayContaining(['employee', 'line_manager']),
      TENANT_ID,
    )
  })

  it('global grant scope passes any requested scope', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'hr_ops', scopeType: 'global' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({ roleKey: 'hr_ops', permissionKey: 'people:profile:read' }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'people:profile:read', {
        tenantId: TENANT_ID,
        scopeType: 'department',
        scopeId: DEPT_A,
      }),
    )

    expect(result).toBe(true)
  })

  it('self permission passes without resourceOwnerId when not provided', async () => {
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      makeGrant({ roleKey: 'employee', scopeType: 'global' }),
    ])
    vi.mocked(rolePermissionRepo.findByRoleKeys).mockResolvedValue([
      makePermission({
        roleKey: 'employee',
        permissionKey: 'people:profile:self:read',
      }),
    ])

    const result = await handler.execute(
      new CanDoQuery(ACTOR_ID, 'people:profile:self:read', {
        tenantId: TENANT_ID,
      }),
    )

    expect(result).toBe(true)
  })
})
