import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SeedRolePermissionsCommand } from './seed-role-permissions.command'
import { SeedRolePermissionsHandler } from './seed-role-permissions.handler'
import type { IRolePermissionRepository } from '../../domain/repositories/role-permission.repository.port'
import { DEFAULT_ROLE_PERMISSIONS } from '../../domain/constants/default-role-permissions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('SeedRolePermissionsHandler', () => {
  let handler: SeedRolePermissionsHandler
  let rolePermissionRepo: IRolePermissionRepository

  beforeEach(() => {
    rolePermissionRepo = {
      findByRoleKey: vi.fn(),
      findByRoleKeys: vi.fn(),
      insert: vi.fn().mockImplementation(async (data) => ({
        id: '01900000-0000-7000-8000-000000000050',
        tenantId: data.tenantId,
        roleKey: data.roleKey,
        permissionKey: data.permissionKey,
        isLocked: data.isLocked,
        createdAt: new Date(),
      })),
      remove: vi.fn(),
      findAll: vi.fn(),
    }
    handler = new SeedRolePermissionsHandler(rolePermissionRepo)
  })

  it('inserts all default permissions for every role', async () => {
    await handler.execute(new SeedRolePermissionsCommand(TENANT_ID))

    let expectedInsertCount = 0
    for (const entries of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      expectedInsertCount += entries.length
    }

    expect(rolePermissionRepo.insert).toHaveBeenCalledTimes(expectedInsertCount)
  })

  it('inserts employee locked permissions with isLocked true', async () => {
    await handler.execute(new SeedRolePermissionsCommand(TENANT_ID))

    expect(rolePermissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'people:profile:self:read',
      isLocked: true,
    })
  })

  it('inserts employee default permissions with isLocked false', async () => {
    await handler.execute(new SeedRolePermissionsCommand(TENANT_ID))

    expect(rolePermissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'planner:task:self:manage',
      isLocked: false,
    })
  })

  it('inserts tenant_admin locked permissions', async () => {
    await handler.execute(new SeedRolePermissionsCommand(TENANT_ID))

    expect(rolePermissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'tenant_admin',
      permissionKey: 'admin:role:manage',
      isLocked: true,
    })
    expect(rolePermissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'tenant_admin',
      permissionKey: 'admin:tenant:read',
      isLocked: true,
    })
  })

  it('inserts line_manager specific locked permissions', async () => {
    await handler.execute(new SeedRolePermissionsCommand(TENANT_ID))

    expect(rolePermissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'line_manager',
      permissionKey: 'people:profile:team:read',
      isLocked: true,
    })
  })

  it('inserts all roles defined in DEFAULT_ROLE_PERMISSIONS', async () => {
    await handler.execute(new SeedRolePermissionsCommand(TENANT_ID))

    const calledRoleKeys = vi
      .mocked(rolePermissionRepo.insert)
      .mock.calls.map((call) => call[0].roleKey)

    const expectedRoleKeys = Object.keys(DEFAULT_ROLE_PERMISSIONS)
    for (const roleKey of expectedRoleKeys) {
      expect(calledRoleKeys).toContain(roleKey)
    }
  })
})
