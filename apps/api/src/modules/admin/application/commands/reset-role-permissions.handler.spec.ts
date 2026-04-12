import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResetRolePermissionsCommand } from './reset-role-permissions.command'
import {
  ResetRolePermissionsHandler,
  DEFAULT_ROLE_PERMISSIONS,
} from './reset-role-permissions.handler'
import type { IRolePermissionRepository } from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

describe('ResetRolePermissionsHandler', () => {
  let handler: ResetRolePermissionsHandler
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
    handler = new ResetRolePermissionsHandler(permissionRepo, auditRepo)
  })

  it('removes all permissions for role and re-inserts defaults', async () => {
    vi.mocked(permissionRepo.removeAllForRole).mockResolvedValue(undefined)
    vi.mocked(permissionRepo.insertMany).mockResolvedValue(undefined)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    await handler.execute(new ResetRolePermissionsCommand(TENANT_ID, 'employee', ACTOR_ID))

    expect(permissionRepo.removeAllForRole).toHaveBeenCalledWith('employee', TENANT_ID)
    expect(permissionRepo.insertMany).toHaveBeenCalledWith(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      DEFAULT_ROLE_PERMISSIONS['employee']!.map((p) => ({
        tenantId: TENANT_ID,
        roleKey: 'employee',
        permissionKey: p.permissionKey,
        isLocked: p.isLocked,
      })),
    )
    expect(auditRepo.insert).toHaveBeenCalled()
  })

  it('throws when role has no default permissions defined', async () => {
    await expect(
      handler.execute(new ResetRolePermissionsCommand(TENANT_ID, 'nonexistent_role', ACTOR_ID)),
    ).rejects.toThrow('No default permissions defined')
  })
})
