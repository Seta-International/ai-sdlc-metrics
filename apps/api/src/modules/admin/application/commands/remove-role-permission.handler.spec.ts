import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoveRolePermissionCommand } from './remove-role-permission.command'
import { RemoveRolePermissionHandler } from './remove-role-permission.handler'
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
    permissionKey: 'planner:task:self:manage',
    isLocked: false,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('RemoveRolePermissionHandler', () => {
  let handler: RemoveRolePermissionHandler
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
      removeById: vi.fn().mockResolvedValue(undefined),
      removeAllForRole: vi.fn(),
      insertMany: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn().mockResolvedValue(undefined),
    }
    handler = new RemoveRolePermissionHandler(rolePermissionRepo, auditRepo)
  })

  it('removes non-locked permission and logs audit', async () => {
    vi.mocked(rolePermissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue(
      makePermission({ isLocked: false }),
    )

    await handler.execute(
      new RemoveRolePermissionCommand(TENANT_ID, 'employee', 'planner:task:self:manage', ACTOR_ID),
    )

    expect(rolePermissionRepo.removeById).toHaveBeenCalledWith(PERMISSION_ID, TENANT_ID)
    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        eventType: 'role_permission.removed',
        module: 'admin',
      }),
    )
  })

  it('throws when permission not found', async () => {
    vi.mocked(rolePermissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue(null)

    await expect(
      handler.execute(
        new RemoveRolePermissionCommand(
          TENANT_ID,
          'employee',
          'planner:task:self:manage',
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow('Permission not found')
  })

  it('throws when permission is locked', async () => {
    vi.mocked(rolePermissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue(
      makePermission({ isLocked: true }),
    )

    await expect(
      handler.execute(
        new RemoveRolePermissionCommand(
          TENANT_ID,
          'employee',
          'planner:task:self:manage',
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow('Cannot remove locked permission')
  })
})
