import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListRolesQuery } from './list-roles.query'
import { ListRolesHandler } from './list-roles.handler'
import type { IRolePermissionRepository } from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { RolePermission } from '../../../kernel/domain/entities/role-permission.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakePermissions: RolePermission[] = [
  {
    id: '01900000-0000-7000-8000-000000000030',
    tenantId: TENANT_ID,
    roleKey: 'employee',
    permissionKey: 'people:profile:self:read',
    isLocked: true,
    createdAt: new Date(),
  },
  {
    id: '01900000-0000-7000-8000-000000000031',
    tenantId: TENANT_ID,
    roleKey: 'employee',
    permissionKey: 'planner:task:self:manage',
    isLocked: false,
    createdAt: new Date(),
  },
  {
    id: '01900000-0000-7000-8000-000000000032',
    tenantId: TENANT_ID,
    roleKey: 'hr_ops',
    permissionKey: 'people:profile:read',
    isLocked: false,
    createdAt: new Date(),
  },
]

describe('ListRolesHandler', () => {
  let handler: ListRolesHandler
  let permissionRepo: IRolePermissionRepository

  beforeEach(() => {
    permissionRepo = {
      findByRoleKey: vi.fn(),
      findByRoleKeys: vi.fn(),
      findByTenantId: vi.fn(),
      findByRoleKeyAndPermissionKey: vi.fn(),
      insert: vi.fn(),
      remove: vi.fn(),
      removeAllForRole: vi.fn(),
      insertMany: vi.fn(),
      findAll: vi.fn(),
    }
    handler = new ListRolesHandler(permissionRepo)
  })

  it('returns roles grouped with their permission counts', async () => {
    vi.mocked(permissionRepo.findByTenantId).mockResolvedValue(fakePermissions)

    const result = await handler.execute(new ListRolesQuery(TENANT_ID))

    expect(result).toEqual([
      {
        roleKey: 'employee',
        permissionCount: 2,
        lockedPermissionCount: 1,
      },
      {
        roleKey: 'hr_ops',
        permissionCount: 1,
        lockedPermissionCount: 0,
      },
    ])
  })

  it('returns empty array when no permissions exist', async () => {
    vi.mocked(permissionRepo.findByTenantId).mockResolvedValue([])

    const result = await handler.execute(new ListRolesQuery(TENANT_ID))

    expect(result).toEqual([])
  })
})
