import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListRolesQuery } from './list-roles.query'
import { ListRolesHandler } from './list-roles.handler'
import type { IRolePermissionRepository } from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { RolePermission } from '../../../kernel/domain/entities/role-permission.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

function makePermission(overrides: Partial<RolePermission> = {}): RolePermission {
  return {
    id: '01900000-0000-7000-8000-000000000050',
    tenantId: TENANT_ID,
    roleKey: 'employee',
    permissionKey: 'people:profile:self:read',
    isLocked: false,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('ListRolesHandler', () => {
  let handler: ListRolesHandler
  let rolePermissionRepo: IRolePermissionRepository

  beforeEach(() => {
    rolePermissionRepo = {
      findByRoleKey: vi.fn(),
      findByRoleKeys: vi.fn(),
      insert: vi.fn(),
      remove: vi.fn(),
      findAll: vi.fn(),
      findByTenantId: vi.fn().mockResolvedValue([]),
      findByRoleKeyAndPermissionKey: vi.fn(),
      removeById: vi.fn(),
      removeAllForRole: vi.fn(),
      insertMany: vi.fn(),
    }
    handler = new ListRolesHandler(rolePermissionRepo)
  })

  it('returns empty array when no permissions exist', async () => {
    vi.mocked(rolePermissionRepo.findByTenantId).mockResolvedValue([])

    const result = await handler.execute(new ListRolesQuery(TENANT_ID))

    expect(result).toEqual([])
  })

  it('returns roles grouped with counts', async () => {
    vi.mocked(rolePermissionRepo.findByTenantId).mockResolvedValue([
      makePermission({
        roleKey: 'employee',
        permissionKey: 'people:profile:self:read',
        isLocked: true,
      }),
      makePermission({
        roleKey: 'employee',
        permissionKey: 'planner:task:self:manage',
        isLocked: false,
      }),
      makePermission({ roleKey: 'hr_ops', permissionKey: 'people:profile:read', isLocked: false }),
    ])

    const result = await handler.execute(new ListRolesQuery(TENANT_ID))

    const employeeRole = result.find((r) => r.roleKey === 'employee')
    const hrOpsRole = result.find((r) => r.roleKey === 'hr_ops')

    expect(employeeRole).toEqual({
      roleKey: 'employee',
      permissionCount: 2,
      lockedPermissionCount: 1,
    })
    expect(hrOpsRole).toEqual({
      roleKey: 'hr_ops',
      permissionCount: 1,
      lockedPermissionCount: 0,
    })
  })

  it('calls findByTenantId with correct tenantId', async () => {
    await handler.execute(new ListRolesQuery(TENANT_ID))

    expect(rolePermissionRepo.findByTenantId).toHaveBeenCalledWith(TENANT_ID)
  })
})
