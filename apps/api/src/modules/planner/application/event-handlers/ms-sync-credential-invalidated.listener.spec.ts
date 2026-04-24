import type { CommandBus } from '@nestjs/cqrs'
import {
  createMsSyncCredentialInvalidatedEvent,
  type MsSyncCredentialInvalidatedEvent,
} from '@future/event-contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { SendNotificationCommand } from '../../../notifications/application/commands/send-notification.command'
import { MsSyncCredentialInvalidatedListener } from './ms-sync-credential-invalidated.listener'

const mockCommandBus = { execute: vi.fn().mockResolvedValue('notif-1') } as unknown as CommandBus

function makeKernelFacade(overrides?: {
  listActorsWithRole?: ReturnType<typeof vi.fn>
  getLocalUsersWithActors?: ReturnType<typeof vi.fn>
  hasRole?: ReturnType<typeof vi.fn>
}): KernelQueryFacade {
  return {
    listActorsWithRole: overrides?.listActorsWithRole,
    getLocalUsersWithActors: overrides?.getLocalUsersWithActors ?? vi.fn().mockResolvedValue([]),
    hasRole: overrides?.hasRole ?? vi.fn().mockResolvedValue(false),
  } as unknown as KernelQueryFacade
}

function makeEvent(reason = 'token expired'): MsSyncCredentialInvalidatedEvent {
  return createMsSyncCredentialInvalidatedEvent({
    tenantId: 'tenant-1',
    reason,
    occurredAt: '2026-04-24T00:00:00.000Z',
  })
}

describe('MsSyncCredentialInvalidatedListener', () => {
  let handler: MsSyncCredentialInvalidatedListener

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prefers listActorsWithRole discovery and includes local/microsoft/google tenant_admins', async () => {
    const kernelQueryFacade = makeKernelFacade({
      listActorsWithRole: vi.fn().mockResolvedValue([
        { actorId: 'admin-local', email: 'local-admin@example.com', provider: 'local' },
        { actorId: 'admin-microsoft', email: 'aad-admin@example.com', provider: 'microsoft' },
        { actorId: 'admin-google', email: 'google-admin@example.com', provider: 'google' },
      ]),
    })

    handler = new MsSyncCredentialInvalidatedListener(mockCommandBus, kernelQueryFacade)

    await handler.handle(makeEvent('refresh token revoked'))

    expect(kernelQueryFacade.listActorsWithRole).toHaveBeenCalledWith('tenant-1', 'tenant_admin')
    expect(kernelQueryFacade.getLocalUsersWithActors).not.toHaveBeenCalled()
    expect(mockCommandBus.execute).toHaveBeenCalledTimes(3)
    expect(mockCommandBus.execute).toHaveBeenCalledWith(expect.any(SendNotificationCommand))

    const first = vi.mocked(mockCommandBus.execute).mock.calls[0][0] as SendNotificationCommand
    const second = vi.mocked(mockCommandBus.execute).mock.calls[1][0] as SendNotificationCommand
    const third = vi.mocked(mockCommandBus.execute).mock.calls[2][0] as SendNotificationCommand

    expect(first.recipientId).toBe('admin-local')
    expect(second.recipientId).toBe('admin-microsoft')
    expect(third.recipientId).toBe('admin-google')
  })

  it('no-ops for unrelated object events', async () => {
    const kernelQueryFacade = makeKernelFacade({
      listActorsWithRole: vi
        .fn()
        .mockResolvedValue([{ actorId: 'admin-1', email: 'admin@example.com' }]),
    })
    handler = new MsSyncCredentialInvalidatedListener(mockCommandBus, kernelQueryFacade)

    await handler.handle({
      type: 'planner.ms_sync.enabled',
      tenantId: 'tenant-1',
      occurredAt: '2026-04-24T00:00:00.000Z',
    })

    expect(kernelQueryFacade.listActorsWithRole).not.toHaveBeenCalled()
    expect(mockCommandBus.execute).not.toHaveBeenCalled()
  })

  it('skips rows without email safely and de-duplicates repeated actor identities', async () => {
    const kernelQueryFacade = makeKernelFacade({
      listActorsWithRole: vi.fn().mockResolvedValue([
        { actorId: 'admin-no-email', email: '' },
        { actorId: 'admin-with-email', email: 'admin@example.com' },
        { actorId: 'admin-with-email', email: 'admin-alt@example.com' },
      ]),
    })

    handler = new MsSyncCredentialInvalidatedListener(mockCommandBus, kernelQueryFacade)

    await handler.handle(makeEvent())

    expect(mockCommandBus.execute).toHaveBeenCalledTimes(1)
    const cmd = vi.mocked(mockCommandBus.execute).mock.calls[0][0] as SendNotificationCommand
    expect(cmd.recipientId).toBe('admin-with-email')
  })

  it('sends system notification payload that includes invalidation reason', async () => {
    const kernelQueryFacade = makeKernelFacade({
      listActorsWithRole: vi
        .fn()
        .mockResolvedValue([{ actorId: 'admin-1', email: 'admin-1@example.com' }]),
    })

    handler = new MsSyncCredentialInvalidatedListener(mockCommandBus, kernelQueryFacade)

    await handler.handle(makeEvent('access denied by Microsoft'))

    expect(mockCommandBus.execute).toHaveBeenCalledOnce()
    const cmd = vi.mocked(mockCommandBus.execute).mock.calls[0][0] as SendNotificationCommand

    expect(cmd.tenantId).toBe('tenant-1')
    expect(cmd.recipientId).toBe('admin-1')
    expect(cmd.senderId).toBe(null)
    expect(cmd.category).toBe('system')
    expect(cmd.title).toBe('Microsoft 365 Planner sync disconnected')
    expect(cmd.body).toContain('Microsoft 365')
    expect(cmd.body).toContain('disconnected')
    expect(cmd.body).toContain('access denied by Microsoft')
    expect(cmd.resourceType).toBe(null)
    expect(cmd.resourceId).toBe(null)
    expect(cmd.resourceUrl).toBe(null)
  })

  it('fails fast with clear error when all-admin discovery is unavailable and never sends partial notifications', async () => {
    const kernelQueryFacade = makeKernelFacade({
      listActorsWithRole: undefined,
      getLocalUsersWithActors: vi.fn().mockResolvedValue([
        {
          actorId: 'admin-local',
          email: 'admin-local@example.com',
          displayName: 'Admin Local',
          status: 'active',
          lastLoginAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          actorId: 'member-local',
          email: 'member-local@example.com',
          displayName: 'Member Local',
          status: 'active',
          lastLoginAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]),
      hasRole: vi.fn().mockImplementation(async (actorId: string) => actorId === 'admin-local'),
    })

    handler = new MsSyncCredentialInvalidatedListener(mockCommandBus, kernelQueryFacade)

    await expect(handler.handle(makeEvent())).rejects.toThrow(
      /KernelQueryFacade\.listActorsWithRole is required/i,
    )

    expect(kernelQueryFacade.getLocalUsersWithActors).toHaveBeenCalledWith('tenant-1')
    expect(kernelQueryFacade.hasRole).toHaveBeenCalledTimes(2)
    expect(kernelQueryFacade.hasRole).toHaveBeenCalledWith(
      'admin-local',
      'tenant_admin',
      'tenant-1',
    )
    expect(kernelQueryFacade.hasRole).toHaveBeenCalledWith(
      'member-local',
      'tenant_admin',
      'tenant-1',
    )
    expect(mockCommandBus.execute).toHaveBeenCalledTimes(0)
  })

  it('fails fast before sending even when fallback discovers local tenant_admin users', async () => {
    const kernelQueryFacade = makeKernelFacade({
      listActorsWithRole: undefined,
      getLocalUsersWithActors: vi.fn().mockResolvedValue([
        {
          actorId: 'admin-local',
          email: 'admin-local@example.com',
          displayName: 'Admin Local',
          status: 'active',
          lastLoginAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]),
      hasRole: vi.fn().mockResolvedValue(true),
    })

    handler = new MsSyncCredentialInvalidatedListener(mockCommandBus, kernelQueryFacade)

    await expect(handler.handle(makeEvent())).rejects.toThrow(/refusing local-only fallback/i)

    expect(mockCommandBus.execute).toHaveBeenCalledTimes(0)
    expect(kernelQueryFacade.hasRole).toHaveBeenCalledWith(
      'admin-local',
      'tenant_admin',
      'tenant-1',
    )
  })
})
