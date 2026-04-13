import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { KernelPermissionFacade } from './kernel-permission.facade'
import { AddRolePermissionCommand } from '../commands/add-role-permission.command'
import { RemoveRolePermissionCommand } from '../commands/remove-role-permission.command'
import { ResetRolePermissionsCommand } from '../commands/reset-role-permissions.command'

describe('KernelPermissionFacade', () => {
  let facade: KernelPermissionFacade
  let commandBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    commandBus = { execute: vi.fn() }
    facade = new KernelPermissionFacade(commandBus as unknown as CommandBus)
  })

  describe('addRolePermission', () => {
    it('dispatches AddRolePermissionCommand', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.addRolePermission('tenant-1', 'hr_ops', 'people:employee:read', 'actor-1')

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(AddRolePermissionCommand))
    })

    it('passes all parameters correctly', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.addRolePermission('tenant-abc', 'tenant_admin', 'admin:role:manage', 'admin-1')

      const cmd = commandBus.execute.mock.calls[0][0] as AddRolePermissionCommand
      expect(cmd.tenantId).toBe('tenant-abc')
      expect(cmd.roleKey).toBe('tenant_admin')
      expect(cmd.permissionKey).toBe('admin:role:manage')
      expect(cmd.addedBy).toBe('admin-1')
    })
  })

  describe('removeRolePermission', () => {
    it('dispatches RemoveRolePermissionCommand', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.removeRolePermission('tenant-1', 'hr_ops', 'people:employee:read', 'actor-1')

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(RemoveRolePermissionCommand))
    })

    it('passes all parameters correctly', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.removeRolePermission('tenant-abc', 'employee', 'admin:role:manage', 'admin-1')

      const cmd = commandBus.execute.mock.calls[0][0] as RemoveRolePermissionCommand
      expect(cmd.tenantId).toBe('tenant-abc')
      expect(cmd.roleKey).toBe('employee')
      expect(cmd.permissionKey).toBe('admin:role:manage')
      expect(cmd.removedBy).toBe('admin-1')
    })
  })

  describe('resetRolePermissions', () => {
    it('dispatches ResetRolePermissionsCommand', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.resetRolePermissions('tenant-1', 'hr_ops', 'actor-1')

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(ResetRolePermissionsCommand))
    })

    it('passes all parameters correctly', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.resetRolePermissions('tenant-abc', 'tenant_admin', 'admin-1')

      const cmd = commandBus.execute.mock.calls[0][0] as ResetRolePermissionsCommand
      expect(cmd.tenantId).toBe('tenant-abc')
      expect(cmd.roleKey).toBe('tenant_admin')
      expect(cmd.resetBy).toBe('admin-1')
    })
  })
})
