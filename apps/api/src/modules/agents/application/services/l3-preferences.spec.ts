/**
 * l3-preferences.spec.ts — unit tests for L3PreferenceService (R-04.16 to R-04.19)
 *
 * Covers:
 *  1. set() with allowlisted key succeeds + emits audit event
 *  2. set() with unknown key throws validation error (R-04.19)
 *  3. get() returns stored value
 *  4. getAll() returns all preferences as a Record
 *  5. delete() with key removes specific preference
 *  6. delete() without key removes all preferences
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { L3PreferenceService } from './l3-preferences'
import type { L3PreferenceRepository } from '../../domain/repositories/l3-preference.repository'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

const TENANT_ID = '01900000-0000-7fff-8000-000000000001'
const USER_ID = '01900000-0000-7fff-8000-000000000002'
const UPDATED_BY = USER_ID

function makeRepo(): L3PreferenceRepository {
  return {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

function makeAudit(): KernelAuditFacade {
  return {
    recordEvent: vi.fn().mockResolvedValue(undefined),
    publishOutboxEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as KernelAuditFacade
}

describe('L3PreferenceService', () => {
  let repo: L3PreferenceRepository
  let audit: KernelAuditFacade
  let service: L3PreferenceService

  beforeEach(() => {
    repo = makeRepo()
    audit = makeAudit()
    service = new L3PreferenceService(repo, audit)
  })

  describe('set()', () => {
    it('succeeds for an allowlisted key and emits kernel audit event', async () => {
      await service.set({
        tenantId: TENANT_ID,
        userId: USER_ID,
        key: 'display_format',
        value: 'table',
        updatedBy: UPDATED_BY,
      })

      expect(repo.set).toHaveBeenCalledOnce()
      expect(repo.set).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        userId: USER_ID,
        key: 'display_format',
        value: 'table',
        updatedBy: UPDATED_BY,
      })

      expect(audit.recordEvent).toHaveBeenCalledOnce()
      expect(audit.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.l3_preference_set',
          module: 'agents',
          tenantId: TENANT_ID,
          actorId: UPDATED_BY,
          subjectId: USER_ID,
          payload: expect.objectContaining({ key: 'display_format' }),
        }),
      )
    })

    it('succeeds for all allowlisted keys', async () => {
      const allowlistedKeys = [
        'display_format',
        'currency_display',
        'date_format',
        'timezone_display',
        'language',
        'theme',
      ]

      for (const key of allowlistedKeys) {
        vi.clearAllMocks()
        await expect(
          service.set({
            tenantId: TENANT_ID,
            userId: USER_ID,
            key,
            value: 'some-value',
            updatedBy: UPDATED_BY,
          }),
        ).resolves.toBeUndefined()
        expect(repo.set).toHaveBeenCalledOnce()
      }
    })

    it('throws a validation error for an unknown key (R-04.19)', async () => {
      await expect(
        service.set({
          tenantId: TENANT_ID,
          userId: USER_ID,
          key: 'skip_confirmations',
          value: true,
          updatedBy: UPDATED_BY,
        }),
      ).rejects.toThrow(/unknown.*preference key|not.*allowlist|invalid.*key/i)

      expect(repo.set).not.toHaveBeenCalled()
      expect(audit.recordEvent).not.toHaveBeenCalled()
    })

    it('throws a validation error for security-adjacent key "approve_all" (R-04.18)', async () => {
      await expect(
        service.set({
          tenantId: TENANT_ID,
          userId: USER_ID,
          key: 'approve_all',
          value: true,
          updatedBy: UPDATED_BY,
        }),
      ).rejects.toThrow(/unknown.*preference key|not.*allowlist|invalid.*key/i)

      expect(repo.set).not.toHaveBeenCalled()
    })

    it('throws a validation error for an arbitrary unknown key', async () => {
      await expect(
        service.set({
          tenantId: TENANT_ID,
          userId: USER_ID,
          key: 'totally_unknown_key',
          value: 'anything',
          updatedBy: UPDATED_BY,
        }),
      ).rejects.toThrow()

      expect(repo.set).not.toHaveBeenCalled()
    })
  })

  describe('get()', () => {
    it('returns the stored value when present', async () => {
      vi.mocked(repo.get).mockResolvedValue('dark')

      const result = await service.get({ tenantId: TENANT_ID, userId: USER_ID, key: 'theme' })

      expect(result).toBe('dark')
      expect(repo.get).toHaveBeenCalledWith({ tenantId: TENANT_ID, userId: USER_ID, key: 'theme' })
    })

    it('returns null when key is absent', async () => {
      vi.mocked(repo.get).mockResolvedValue(null)

      const result = await service.get({ tenantId: TENANT_ID, userId: USER_ID, key: 'language' })

      expect(result).toBeNull()
    })
  })

  describe('getAll()', () => {
    it('returns all preferences as a Record', async () => {
      const stored: Record<string, unknown> = {
        theme: 'dark',
        language: 'en',
      }
      vi.mocked(repo.getAll).mockResolvedValue(stored)

      const result = await service.getAll({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result).toEqual(stored)
      expect(repo.getAll).toHaveBeenCalledWith({ tenantId: TENANT_ID, userId: USER_ID })
    })

    it('returns empty record when no preferences set', async () => {
      vi.mocked(repo.getAll).mockResolvedValue({})

      const result = await service.getAll({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result).toEqual({})
    })
  })

  describe('delete()', () => {
    it('deletes a specific preference key when key is provided', async () => {
      await service.delete({ tenantId: TENANT_ID, userId: USER_ID, key: 'theme' })

      expect(repo.delete).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        userId: USER_ID,
        key: 'theme',
      })
    })

    it('deletes all preferences when key is absent', async () => {
      await service.delete({ tenantId: TENANT_ID, userId: USER_ID })

      expect(repo.delete).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        userId: USER_ID,
        key: undefined,
      })
    })
  })
})
