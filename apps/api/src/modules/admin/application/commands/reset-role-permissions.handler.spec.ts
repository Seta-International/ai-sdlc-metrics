import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResetRolePermissionsCommand } from './reset-role-permissions.command'
import {
  ResetRolePermissionsHandler,
  DEFAULT_ROLE_PERMISSIONS,
} from './reset-role-permissions.handler'
import type { IRolePermissionRepository } from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('ResetRolePermissionsHandler', () => {
  let handler: ResetRolePermissionsHandler
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
      findByRoleKeyAndPermissionKey: vi.fn(),
      removeById: vi.fn(),
      removeAllForRole: vi.fn().mockResolvedValue(undefined),
      insertMany: vi.fn().mockResolvedValue(undefined),
    }
    auditRepo = {
      insert: vi.fn().mockResolvedValue(undefined),
    }
    handler = new ResetRolePermissionsHandler(rolePermissionRepo, auditRepo)
  })

  it('resets role and inserts defaults', async () => {
    await handler.execute(new ResetRolePermissionsCommand(TENANT_ID, 'employee', ACTOR_ID))

    expect(rolePermissionRepo.removeAllForRole).toHaveBeenCalledWith('employee', TENANT_ID)

    const employeeDefaults = DEFAULT_ROLE_PERMISSIONS['employee']
    expect(rolePermissionRepo.insertMany).toHaveBeenCalledWith(
      employeeDefaults.map((d) => ({
        tenantId: TENANT_ID,
        roleKey: 'employee',
        permissionKey: d.permissionKey,
        isLocked: d.isLocked,
      })),
    )

    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        eventType: 'role_permissions.reset',
        module: 'admin',
      }),
    )
  })

  it('throws for unknown role', async () => {
    await expect(
      handler.execute(new ResetRolePermissionsCommand(TENANT_ID, 'unknown_role', ACTOR_ID)),
    ).rejects.toThrow('No default permissions defined')
  })

  it('inserts correct number of defaults for tenant_admin', async () => {
    await handler.execute(new ResetRolePermissionsCommand(TENANT_ID, 'tenant_admin', ACTOR_ID))

    const tenantAdminDefaults = DEFAULT_ROLE_PERMISSIONS['tenant_admin']
    expect(rolePermissionRepo.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ roleKey: 'tenant_admin', tenantId: TENANT_ID }),
      ]),
    )

    const insertManyCall = vi.mocked(rolePermissionRepo.insertMany).mock.calls[0]?.[0]
    expect(insertManyCall).toHaveLength(tenantAdminDefaults?.length ?? 0)
  })
})
