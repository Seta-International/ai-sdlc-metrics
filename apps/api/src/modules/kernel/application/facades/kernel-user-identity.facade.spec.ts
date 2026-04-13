import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { KernelUserIdentityFacade } from './kernel-user-identity.facade'
import { CreateUserIdentityCommand } from '../commands/create-user-identity.command'
import { DeprovisionUserIdentityCommand } from '../commands/deprovision-user-identity.command'

describe('KernelUserIdentityFacade', () => {
  let facade: KernelUserIdentityFacade
  let commandBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    commandBus = { execute: vi.fn() }
    facade = new KernelUserIdentityFacade(commandBus as unknown as CommandBus)
  })

  describe('createUserIdentity', () => {
    it('dispatches CreateUserIdentityCommand with all parameters', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.createUserIdentity(
        'tenant-1',
        'actor-1',
        'user@example.com',
        'local:user@example.com',
        'local',
      )

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreateUserIdentityCommand))
    })

    it('returns the result from the command bus', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      const result = await facade.createUserIdentity(
        'tenant-1',
        'actor-1',
        'user@example.com',
        'sso-subject-123',
        'microsoft',
      )

      expect(result).toBeUndefined()
    })
  })

  describe('deprovisionUserIdentity', () => {
    it('dispatches DeprovisionUserIdentityCommand', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.deprovisionUserIdentity('tenant-1', 'actor-1')

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(DeprovisionUserIdentityCommand))
    })

    it('passes tenantId and actorId correctly', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.deprovisionUserIdentity('tenant-abc', 'actor-xyz')

      const cmd = commandBus.execute.mock.calls[0][0] as DeprovisionUserIdentityCommand
      expect(cmd.tenantId).toBe('tenant-abc')
      expect(cmd.actorId).toBe('actor-xyz')
    })
  })
})
