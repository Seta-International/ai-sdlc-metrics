import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddRolePermissionCommand } from './add-role-permission.command'
import { AddRolePermissionHandler } from './add-role-permission.handler'
import type { IRolePermissionRepository } from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { RolePermission } from '../../../kernel/domain/entities/role-permission.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PERMISSION_ID = '01900000-0000-7000-8000-000000000050'

function makePermission(overrides: Partial<RolePermission> = {}): RolePermission {
  return {
    id: PERMISSION_ID,
    tenantId: TENANT_ID,
    roleKey: 'employee',
    permissionKey: 'people:profile:self:read',
    isLocked: false,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('AddRolePermissionHandler', () => {
  let handler: AddRolePermissionHandler
  let rolePermissionRepo: IRolePermissionRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    rolePermissionRepo = {
      findByRoleKey: vi.fn(),
      findByRoleKeys: vi.fn(),
      insert: vi.fn(),
      remove: vi.fn(),
      findAll: vi.fn(),
      findByTenantId: vi.fn(),
      findByRoleKeyAndPermissionKey: vi.fn().mockResolvedValue(null),
      removeById: vi.fn(),
      removeAllForRole: vi.fn(),
      insertMany: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn().mockResolvedValue(undefined),
    }
    handler = new AddRolePermissionHandler(rolePermissionRepo, auditRepo)
  })

  it('adds permission and returns id', async () => {
    const newPerm = makePermission({ permissionKey: 'time:leave:approve' })
    vi.mocked(rolePermissionRepo.insert).mockResolvedValue(newPerm)

    const result = await handler.execute(
      new AddRolePermissionCommand(TENANT_ID, 'employee', 'time:leave:approve', ACTOR_ID),
    )

    expect(result).toBe(PERMISSION_ID)
    expect(rolePermissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'time:leave:approve',
      isLocked: false,
    })
    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        eventType: 'role_permission.added',
        module: 'admin',
      }),
    )
  })

  it('throws when permission already exists', async () => {
    vi.mocked(rolePermissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue(
      makePermission({ permissionKey: 'time:leave:approve' }),
    )

    await expect(
      handler.execute(
        new AddRolePermissionCommand(TENANT_ID, 'employee', 'time:leave:approve', ACTOR_ID),
      ),
    ).rejects.toThrow('Permission already assigned')
  })

  it('throws when insert returns null', async () => {
    vi.mocked(rolePermissionRepo.insert).mockResolvedValue(null)

    await expect(
      handler.execute(
        new AddRolePermissionCommand(TENANT_ID, 'employee', 'time:leave:approve', ACTOR_ID),
      ),
    ).rejects.toThrow('Failed to insert permission')
  })
})
