import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetRolePermissionsQuery } from './get-role-permissions.query'
import { GetRolePermissionsHandler } from './get-role-permissions.handler'
import type { IRolePermissionRepository } from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { RolePermission } from '../../../kernel/domain/entities/role-permission.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

function makePermission(overrides: Partial<RolePermission> = {}): RolePermission {
  return {
    id: '01900000-0000-7000-8000-000000000050',
    tenantId: TENANT_ID,
    roleKey: 'employee',
    permissionKey: 'people:profile:self:read',
    isLocked: true,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('GetRolePermissionsHandler', () => {
  let handler: GetRolePermissionsHandler
  let rolePermissionRepo: IRolePermissionRepository

  beforeEach(() => {
    rolePermissionRepo = {
      findByRoleKey: vi.fn().mockResolvedValue([]),
      findByRoleKeys: vi.fn(),
      insert: vi.fn(),
      remove: vi.fn(),
      findAll: vi.fn(),
      findByTenantId: vi.fn(),
      findByRoleKeyAndPermissionKey: vi.fn(),
      removeById: vi.fn(),
      removeAllForRole: vi.fn(),
      insertMany: vi.fn(),
    }
    handler = new GetRolePermissionsHandler(rolePermissionRepo)
  })

  it('returns DTO with module field derived from permissionKey', async () => {
    vi.mocked(rolePermissionRepo.findByRoleKey).mockResolvedValue([
      makePermission({ permissionKey: 'people:profile:self:read', isLocked: true }),
      makePermission({ permissionKey: 'time:leave:self:submit', isLocked: true }),
    ])

    const result = await handler.execute(new GetRolePermissionsQuery(TENANT_ID, 'employee'))

    expect(result.roleKey).toBe('employee')
    expect(result.permissions).toHaveLength(2)
    expect(result.permissions[0]).toMatchObject({
      permissionKey: 'people:profile:self:read',
      isLocked: true,
      module: 'people',
    })
    expect(result.permissions[1]).toMatchObject({
      permissionKey: 'time:leave:self:submit',
      isLocked: true,
      module: 'time',
    })
  })

  it('returns empty permissions for unknown role', async () => {
    vi.mocked(rolePermissionRepo.findByRoleKey).mockResolvedValue([])

    const result = await handler.execute(new GetRolePermissionsQuery(TENANT_ID, 'unknown_role'))

    expect(result.roleKey).toBe('unknown_role')
    expect(result.permissions).toEqual([])
  })

  it('calls findByRoleKey with correct arguments', async () => {
    await handler.execute(new GetRolePermissionsQuery(TENANT_ID, 'hr_ops'))

    expect(rolePermissionRepo.findByRoleKey).toHaveBeenCalledWith('hr_ops', TENANT_ID)
  })
})
