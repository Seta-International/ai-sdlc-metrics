import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApprovalExecutorDelegationMinter } from './approval-executor-delegation-minter'
import type { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'

describe('ApprovalExecutorDelegationMinter', () => {
  let minter: ApprovalExecutorDelegationMinter
  let kernelDelegationFacade: { createDelegation: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    kernelDelegationFacade = { createDelegation: vi.fn() }
    minter = new ApprovalExecutorDelegationMinter(
      kernelDelegationFacade as unknown as KernelDelegationFacade,
    )
  })

  describe('mintForDraft()', () => {
    const expiresAt = new Date('2026-04-25T00:00:00.000Z')
    const baseOpts = {
      draftId: 'draft-abc',
      tenantId: 'tenant-xyz',
      initiatorUserId: 'user-111',
      toolName: 'people.updateSalary',
      expiresAt,
    }

    it('calls KernelDelegationFacade.createDelegation with correct delegate type', async () => {
      kernelDelegationFacade.createDelegation.mockResolvedValue({ id: 'deleg-001' })

      await minter.mintForDraft(baseOpts)

      expect(kernelDelegationFacade.createDelegation).toHaveBeenCalledWith(
        expect.objectContaining({ delegate: 'agent:approval-executor' }),
      )
    })

    it('pins scope to { draftId, toolName }', async () => {
      kernelDelegationFacade.createDelegation.mockResolvedValue({ id: 'deleg-002' })

      await minter.mintForDraft(baseOpts)

      expect(kernelDelegationFacade.createDelegation).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { draftId: 'draft-abc', toolName: 'people.updateSalary' },
        }),
      )
    })

    it('passes expiresAt through unchanged', async () => {
      kernelDelegationFacade.createDelegation.mockResolvedValue({ id: 'deleg-003' })

      await minter.mintForDraft(baseOpts)

      expect(kernelDelegationFacade.createDelegation).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt }),
      )
    })

    it('returns { delegationId: string }', async () => {
      kernelDelegationFacade.createDelegation.mockResolvedValue({ id: 'deleg-004' })

      const result = await minter.mintForDraft(baseOpts)

      expect(result).toEqual({ delegationId: 'deleg-004' })
    })

    it('sets delegatorUserId to initiatorUserId', async () => {
      kernelDelegationFacade.createDelegation.mockResolvedValue({ id: 'deleg-005' })

      await minter.mintForDraft(baseOpts)

      expect(kernelDelegationFacade.createDelegation).toHaveBeenCalledWith(
        expect.objectContaining({ delegatorUserId: 'user-111' }),
      )
    })
  })
})
