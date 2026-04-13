import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { KernelDecisionFacade } from './kernel-decision.facade'
import { CreateDecisionCaseCommand } from '../commands/create-decision-case.command'
import { ResolveDecisionCaseCommand } from '../commands/resolve-decision-case.command'

describe('KernelDecisionFacade', () => {
  let facade: KernelDecisionFacade
  let commandBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    commandBus = { execute: vi.fn() }
    facade = new KernelDecisionFacade(commandBus as unknown as CommandBus)
  })

  describe('createDecisionCase', () => {
    it('dispatches CreateDecisionCaseCommand and returns the case id', async () => {
      commandBus.execute.mockResolvedValue('case-123')

      const result = await facade.createDecisionCase('tenant-1', 'people', 'subject-1', 'actor-1')

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreateDecisionCaseCommand))
      expect(result).toBe('case-123')
    })

    it('passes all parameters correctly', async () => {
      commandBus.execute.mockResolvedValue('case-456')

      await facade.createDecisionCase('tenant-abc', 'hiring', 'subject-xyz', 'requester-1')

      const cmd = commandBus.execute.mock.calls[0][0] as CreateDecisionCaseCommand
      expect(cmd.tenantId).toBe('tenant-abc')
      expect(cmd.module).toBe('hiring')
      expect(cmd.subjectId).toBe('subject-xyz')
      expect(cmd.requestedBy).toBe('requester-1')
    })
  })

  describe('resolveDecisionCase', () => {
    it('dispatches ResolveDecisionCaseCommand with approved action', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.resolveDecisionCase('tenant-1', 'case-123', 'approved', 'actor-1', null)

      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(ResolveDecisionCaseCommand))
    })

    it('dispatches ResolveDecisionCaseCommand with rejected action and comment', async () => {
      commandBus.execute.mockResolvedValue(undefined)

      await facade.resolveDecisionCase(
        'tenant-1',
        'case-123',
        'rejected',
        'actor-1',
        'Does not meet policy',
      )

      const cmd = commandBus.execute.mock.calls[0][0] as ResolveDecisionCaseCommand
      expect(cmd.tenantId).toBe('tenant-1')
      expect(cmd.caseId).toBe('case-123')
      expect(cmd.finalAction).toBe('rejected')
      expect(cmd.decidedBy).toBe('actor-1')
      expect(cmd.comment).toBe('Does not meet policy')
    })
  })
})
