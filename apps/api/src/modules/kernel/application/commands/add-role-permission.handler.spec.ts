import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddRolePermissionCommand } from './add-role-permission.command'
import { AddRolePermissionHandler } from './add-role-permission.handler'
import type { IRolePermissionRepository } from '../../domain/repositories/role-permission.repository.port'
import type { IAuditEventRepository } from '../../domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PERMISSION_ID = '01900000-0000-7000-8000-000000000040'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

describe('AddRolePermissionHandler', () => {
  let handler: AddRolePermissionHandler
  let permissionRepo: IRolePermissionRepository
  let auditRepo: IAuditEventRepository

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
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new AddRolePermissionHandler(permissionRepo, auditRepo)
  })

  it('adds a permission to a role', async () => {
    vi.mocked(permissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue(null)
    vi.mocked(permissionRepo.insert).mockResolvedValue({
      id: PERMISSION_ID,
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'time:attendance:self:read',
      isLocked: false,
      createdAt: new Date(),
    })
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new AddRolePermissionCommand(TENANT_ID, 'employee', 'time:attendance:self:read', ACTOR_ID),
    )

    expect(result).toBe(PERMISSION_ID)
    expect(permissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'time:attendance:self:read',
      isLocked: false,
    })
  })

  it('throws when permission already exists for role', async () => {
    vi.mocked(permissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue({
      id: PERMISSION_ID,
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'time:attendance:self:read',
      isLocked: false,
      createdAt: new Date(),
    })

    await expect(
      handler.execute(
        new AddRolePermissionCommand(TENANT_ID, 'employee', 'time:attendance:self:read', ACTOR_ID),
      ),
    ).rejects.toThrow('Permission already assigned')
  })
})
