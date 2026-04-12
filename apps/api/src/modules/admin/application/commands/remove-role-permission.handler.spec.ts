import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoveRolePermissionCommand } from './remove-role-permission.command'
import { RemoveRolePermissionHandler } from './remove-role-permission.handler'
import type { IRolePermissionRepository } from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PERMISSION_ID = '01900000-0000-7000-8000-000000000040'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

describe('RemoveRolePermissionHandler', () => {
  let handler: RemoveRolePermissionHandler
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
    handler = new RemoveRolePermissionHandler(permissionRepo, auditRepo)
  })

  it('removes a non-locked permission from a role', async () => {
    vi.mocked(permissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue({
      id: PERMISSION_ID,
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'planner:task:self:manage',
      isLocked: false,
      createdAt: new Date(),
    })
    vi.mocked(permissionRepo.remove).mockResolvedValue(undefined)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    await handler.execute(
      new RemoveRolePermissionCommand(TENANT_ID, 'employee', 'planner:task:self:manage', ACTOR_ID),
    )

    expect(permissionRepo.remove).toHaveBeenCalledWith(PERMISSION_ID, TENANT_ID)
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'role_permission.removed',
      module: 'admin',
      subjectId: PERMISSION_ID,
      payload: { roleKey: 'employee', permissionKey: 'planner:task:self:manage' },
    })
  })

  it('throws when permission not found', async () => {
    vi.mocked(permissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue(null)

    await expect(
      handler.execute(
        new RemoveRolePermissionCommand(TENANT_ID, 'employee', 'nonexistent:perm', ACTOR_ID),
      ),
    ).rejects.toThrow('Permission not found')
  })

  it('throws when trying to remove a locked permission', async () => {
    vi.mocked(permissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue({
      id: PERMISSION_ID,
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'people:profile:self:read',
      isLocked: true,
      createdAt: new Date(),
    })

    await expect(
      handler.execute(
        new RemoveRolePermissionCommand(
          TENANT_ID,
          'employee',
          'people:profile:self:read',
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow('Cannot remove locked permission')
  })
})
