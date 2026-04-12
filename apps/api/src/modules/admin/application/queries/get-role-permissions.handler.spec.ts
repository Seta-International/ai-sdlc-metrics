import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetRolePermissionsQuery } from './get-role-permissions.query'
import { GetRolePermissionsHandler } from './get-role-permissions.handler'
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
]

describe('GetRolePermissionsHandler', () => {
  let handler: GetRolePermissionsHandler
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
    handler = new GetRolePermissionsHandler(permissionRepo)
  })

  it('returns permissions for a role grouped by module', async () => {
    vi.mocked(permissionRepo.findByRoleKey).mockResolvedValue(fakePermissions)

    const result = await handler.execute(new GetRolePermissionsQuery(TENANT_ID, 'employee'))

    expect(result).toEqual({
      roleKey: 'employee',
      permissions: [
        { permissionKey: 'people:profile:self:read', isLocked: true, module: 'people' },
        { permissionKey: 'planner:task:self:manage', isLocked: false, module: 'planner' },
      ],
    })
  })

  it('returns empty permissions for unknown role', async () => {
    vi.mocked(permissionRepo.findByRoleKey).mockResolvedValue([])

    const result = await handler.execute(new GetRolePermissionsQuery(TENANT_ID, 'unknown_role'))

    expect(result).toEqual({ roleKey: 'unknown_role', permissions: [] })
  })
})
