/**
 * gdpr-erasure.spec.ts — Plan 04 unit tests for GDPRErasurePipeline (R-04.27..R-04.30)
 *
 * Covers:
 *  1. Full success: all steps complete → audit 'user_erased_complete'
 *  2. Partial failure on DB step: fires 'user_erased_partial' with failed step detail
 *  3. Returns correct counts: dbMessagesScrubbed, l3Deleted, semanticIndexPurged
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GDPRErasurePipeline } from './gdpr-erasure'
import type { ConversationMessageRepository } from '../../domain/repositories/conversation-message.repository'
import type { L3PreferenceRepository } from '../../domain/repositories/l3-preference.repository'
import type { ScratchpadRepository } from '../../domain/repositories/scratchpad.repository'
import type { SemanticIndexRepository } from '../../domain/repositories/semantic-index.repository'

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-00000000-0000-0000-0000-000000000001'
const USER_ID = 'user-00000000-0000-0000-0000-000000000001'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMessageRepo(): ConversationMessageRepository {
  return {
    persist: vi.fn(),
    persistMany: vi.fn(),
    listForWindow: vi.fn(),
    updateSummary: vi.fn(),
    hardDeleteContent: vi.fn().mockResolvedValue({ count: 42 }),
    search: vi.fn(),
  }
}

function makeL3Repo(): L3PreferenceRepository {
  return {
    set: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn().mockResolvedValue({ display_format: 'table', currency_display: 'USD' }),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

function makeScratchpadRepo(): ScratchpadRepository {
  return {
    read: vi.fn(),
    write: vi.fn(),
    deleteForUser: vi.fn().mockResolvedValue(undefined),
  }
}

function makeKernelAudit() {
  return {
    recordEvent: vi.fn().mockResolvedValue(undefined),
    publishOutboxEvent: vi.fn().mockResolvedValue(undefined),
  }
}

function makeSemanticIndexRepo(): SemanticIndexRepository {
  return {
    index: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    purgeForUser: vi.fn().mockResolvedValue({ count: 7 }),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GDPRErasurePipeline', () => {
  let messageRepo: ConversationMessageRepository
  let l3Repo: L3PreferenceRepository
  let scratchpadRepo: ScratchpadRepository
  let semanticIndexRepo: SemanticIndexRepository
  let kernelAudit: ReturnType<typeof makeKernelAudit>
  let pipeline: GDPRErasurePipeline

  beforeEach(() => {
    messageRepo = makeMessageRepo()
    l3Repo = makeL3Repo()
    scratchpadRepo = makeScratchpadRepo()
    semanticIndexRepo = makeSemanticIndexRepo()
    kernelAudit = makeKernelAudit()
    pipeline = new GDPRErasurePipeline(
      messageRepo,
      l3Repo,
      scratchpadRepo,
      semanticIndexRepo,
      kernelAudit,
    )
  })

  // ─── 1. Full success ────────────────────────────────────────────────────────

  describe('full success path', () => {
    it('fires user_erased_complete audit event on full success', async () => {
      await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      const recordedEvents = (kernelAudit.recordEvent as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0].eventType ?? call[0].type ?? call[0],
      )
      expect(recordedEvents.some((e: string) => e === 'user_erased_complete')).toBe(true)
    })

    it('fires user_erased_start audit event before any steps', async () => {
      const callOrder: string[] = []
      ;(kernelAudit.recordEvent as ReturnType<typeof vi.fn>).mockImplementation(
        (evt: { eventType: string }) => {
          callOrder.push(evt.eventType)
          return Promise.resolve(undefined)
        },
      )
      ;(messageRepo.hardDeleteContent as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callOrder.push('hardDeleteContent')
        return Promise.resolve({ count: 5 })
      })

      await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(callOrder[0]).toBe('user_erased_start')
      expect(callOrder.indexOf('hardDeleteContent')).toBeGreaterThan(
        callOrder.indexOf('user_erased_start'),
      )
    })

    it('calls hardDeleteContent, L3 delete, and scratchpad deleteForUser', async () => {
      await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(messageRepo.hardDeleteContent).toHaveBeenCalledWith({
        userId: USER_ID,
        tenantId: TENANT_ID,
      })
      expect(l3Repo.delete).toHaveBeenCalledWith({ userId: USER_ID, tenantId: TENANT_ID })
      expect(scratchpadRepo.deleteForUser).toHaveBeenCalledWith(TENANT_ID, USER_ID)
    })

    it('returns an auditEventId string', async () => {
      const result = await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(typeof result.auditEventId).toBe('string')
      expect(result.auditEventId).toBeTruthy()
    })
  })

  // ─── 2. Partial failure on DB step ──────────────────────────────────────────

  describe('partial failure on DB step', () => {
    it('fires user_erased_partial when hardDeleteContent throws', async () => {
      ;(messageRepo.hardDeleteContent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB connection lost'),
      )

      await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      const eventTypes = (kernelAudit.recordEvent as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0].eventType,
      )
      expect(eventTypes).toContain('user_erased_partial')
    })

    it('includes the failed step detail in the partial audit event', async () => {
      ;(messageRepo.hardDeleteContent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB connection lost'),
      )

      await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      const auditCalls = (kernelAudit.recordEvent as ReturnType<typeof vi.fn>).mock.calls
      const partialEvent = auditCalls.find((call) => call[0].eventType === 'user_erased_partial')
      expect(partialEvent).toBeDefined()
      const eventPayload = partialEvent?.[0]
      expect(
        eventPayload?.failedStep ??
          eventPayload?.metadata?.failedStep ??
          JSON.stringify(eventPayload),
      ).toMatch(/db|message|content/i)
    })

    it('does not call L3/scratchpad/semanticIndex when DB step fails (pipeline aborts early)', async () => {
      ;(messageRepo.hardDeleteContent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB error'),
      )

      await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(l3Repo.delete).not.toHaveBeenCalled()
      expect(scratchpadRepo.deleteForUser).not.toHaveBeenCalled()
      expect(semanticIndexRepo.purgeForUser).not.toHaveBeenCalled()
    })
  })

  // ─── 3. Correct counts ──────────────────────────────────────────────────────

  describe('return value counts', () => {
    it('dbMessagesScrubbed matches count from hardDeleteContent', async () => {
      ;(messageRepo.hardDeleteContent as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 17 })

      const result = await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(result.dbMessagesScrubbed).toBe(17)
    })

    it('l3Deleted reflects the number of preference keys deleted', async () => {
      ;(l3Repo.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
        display_format: 'table',
        currency_display: 'USD',
        timezone_display: 'UTC',
      })

      const result = await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(result.l3Deleted).toBe(3)
    })

    it('l35ScratchpadDeleted is 1 when scratchpad deletion succeeds', async () => {
      const result = await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(result.l35ScratchpadDeleted).toBe(1)
    })

    it('returns zero counts when all repos return zero', async () => {
      ;(messageRepo.hardDeleteContent as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })
      ;(l3Repo.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({})

      const result = await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(result.dbMessagesScrubbed).toBe(0)
      expect(result.l3Deleted).toBe(0)
    })

    it('semanticIndexPurged matches count from purgeForUser', async () => {
      ;(semanticIndexRepo.purgeForUser as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 7 })

      const result = await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(result.semanticIndexPurged).toBe(7)
    })

    it('calls semanticIndexRepo.purgeForUser with correct tenant + user', async () => {
      await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(semanticIndexRepo.purgeForUser).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        userId: USER_ID,
      })
    })

    it('semanticIndexPurged is 0 when purgeForUser returns 0', async () => {
      ;(semanticIndexRepo.purgeForUser as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })

      const result = await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(result.semanticIndexPurged).toBe(0)
    })
  })
})
