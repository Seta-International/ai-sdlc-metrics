import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { KernelActorFacade } from './kernel-actor.facade'
import { CreateActorCommand } from '../commands/create-actor.command'
import { UpdateActorStatusCommand } from '../commands/update-actor-status.command'
import { GrantRoleCommand } from '../commands/grant-role.command'

describe('KernelActorFacade', () => {
  let facade: KernelActorFacade
  let commandBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    commandBus = { execute: vi.fn() }
    facade = new KernelActorFacade(commandBus as unknown as CommandBus)
  })

  describe('createActor', () => {
    it('dispatches CreateActorCommand and returns actorId', async () => {
      commandBus.execute.mockResolvedValue('actor-123')

      const result = await facade.createActor('tenant-1', 'system', 'Bot User', 'admin-1')

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreateActorCommand))
      expect(result).toBe('actor-123')
    })
  })

  describe('deactivateActor', () => {
    it('dispatches UpdateActorStatusCommand with inactive status', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.deactivateActor('actor-1', 'tenant-1')

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(UpdateActorStatusCommand))
    })
  })

  describe('grantRole', () => {
    it('dispatches GrantRoleCommand', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.grantRole('actor-1', 'employee', 'global', null, 'tenant-1', 'admin-1')

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(GrantRoleCommand))
    })
  })
})
