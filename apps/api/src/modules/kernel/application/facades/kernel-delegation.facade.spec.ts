import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KernelDelegationFacade } from './kernel-delegation.facade'
import type { IAgentDelegationRepository } from '../../domain/repositories/agent-delegation.repository.port'

describe('KernelDelegationFacade', () => {
  let facade: KernelDelegationFacade
  let delegationRepo: {
    insert: ReturnType<typeof vi.fn>
    getById: ReturnType<typeof vi.fn>
    updateStatus: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    delegationRepo = {
      insert: vi.fn(),
      getById: vi.fn(),
      updateStatus: vi.fn(),
    }
    facade = new KernelDelegationFacade(delegationRepo as unknown as IAgentDelegationRepository)
  })

  const expiresAt = new Date('2026-04-25T00:00:00.000Z')

  describe('createDelegation()', () => {
    it('delegates to repo.insert and returns { id }', async () => {
      delegationRepo.insert.mockResolvedValue({ id: 'deleg-111' })

      const result = await facade.createDelegation({
        tenantId: 'tenant-a',
        delegatorUserId: 'user-1',
        delegate: 'agent:approval-executor',
        scope: { draftId: 'draft-x' },
        expiresAt,
      })

      expect(delegationRepo.insert).toHaveBeenCalledWith({
        tenantId: 'tenant-a',
        delegatorUserId: 'user-1',
        delegate: 'agent:approval-executor',
        scope: { draftId: 'draft-x' },
        expiresAt,
      })
      expect(result).toEqual({ id: 'deleg-111' })
    })

    it('accepts null delegatorUserId (tenant-wide delegation)', async () => {
      delegationRepo.insert.mockResolvedValue({ id: 'deleg-222' })

      await facade.createDelegation({
        tenantId: 'tenant-a',
        delegatorUserId: null,
        delegate: 'agent:scheduler',
        scope: {},
        expiresAt,
      })

      expect(delegationRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ delegatorUserId: null }),
      )
    })
  })

  describe('revokeDelegation()', () => {
    it('calls repo.updateStatus with revoked', async () => {
      delegationRepo.updateStatus.mockResolvedValue(undefined)

      await facade.revokeDelegation({
        tenantId: 'tenant-a',
        delegationId: 'deleg-333',
        reason: 'draft cancelled',
      })

      expect(delegationRepo.updateStatus).toHaveBeenCalledWith({
        tenantId: 'tenant-a',
        delegationId: 'deleg-333',
        status: 'revoked',
      })
    })
  })

  describe('getDelegation()', () => {
    it('delegates to repo.getById', async () => {
      const row = { id: 'deleg-444', tenantId: 'tenant-a' }
      delegationRepo.getById.mockResolvedValue(row)

      const result = await facade.getDelegation({ tenantId: 'tenant-a', delegationId: 'deleg-444' })

      expect(delegationRepo.getById).toHaveBeenCalledWith({
        tenantId: 'tenant-a',
        delegationId: 'deleg-444',
      })
      expect(result).toBe(row)
    })

    it('returns null when not found', async () => {
      delegationRepo.getById.mockResolvedValue(null)

      const result = await facade.getDelegation({ tenantId: 'tenant-a', delegationId: 'missing' })

      expect(result).toBeNull()
    })
  })
})
