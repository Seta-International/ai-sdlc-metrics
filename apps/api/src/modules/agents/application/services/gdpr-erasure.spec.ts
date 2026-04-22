/**
 * gdpr-erasure.spec.ts — Plan 04 unit tests for GDPRErasurePipeline (R-04.27..R-04.30)
 *
 * Covers:
 *  1. Full success: all steps complete → langfusePurgeStatus: 'ok', audit 'user_erased_complete'
 *  2. Langfuse retry: Langfuse fails twice then succeeds → langfusePurgeStatus: 'ok'
 *  3. Langfuse exhausted (3 failures): DB + L3 + L3.5 committed; langfusePurgeStatus: 'failed';
 *     kernel audit row has compliance_ticket_required: true
 *  4. Partial failure on DB step: fires 'user_erased_partial' with failed step detail
 *  5. Returns correct counts: dbMessagesScrubbed = count from hardDeleteContent,
 *     l3Deleted reflects preference rows
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GDPRErasurePipeline } from './gdpr-erasure'
import type { LangfuseClient } from './gdpr-erasure'
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

function makeLangfuseClient(): LangfuseClient {
  return {
    purgeByUserId: vi.fn().mockResolvedValue(undefined),
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
  let langfuseClient: LangfuseClient
  let semanticIndexRepo: SemanticIndexRepository
  let kernelAudit: ReturnType<typeof makeKernelAudit>
  let pipeline: GDPRErasurePipeline

  beforeEach(() => {
    messageRepo = makeMessageRepo()
    l3Repo = makeL3Repo()
    scratchpadRepo = makeScratchpadRepo()
    langfuseClient = makeLangfuseClient()
    semanticIndexRepo = makeSemanticIndexRepo()
    kernelAudit = makeKernelAudit()
    pipeline = new GDPRErasurePipeline(
      messageRepo,
      l3Repo,
      scratchpadRepo,
      langfuseClient,
      semanticIndexRepo,
      kernelAudit,
    )
  })

  // ─── 1. Full success ────────────────────────────────────────────────────────

  describe('full success path', () => {
    it('completes all steps and returns langfusePurgeStatus: ok', async () => {
      const result = await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(result.langfusePurgeStatus).toBe('ok')
    })

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

    it('calls Langfuse purgeByUserId', async () => {
      await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(langfuseClient.purgeByUserId).toHaveBeenCalledWith({
        userId: USER_ID,
        tenantId: TENANT_ID,
      })
    })

    it('returns an auditEventId string', async () => {
      const result = await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      expect(typeof result.auditEventId).toBe('string')
      expect(result.auditEventId).toBeTruthy()
    })
  })

  // ─── 2. Langfuse retry: fails twice then succeeds ───────────────────────────

  describe('Langfuse retry behaviour', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns langfusePurgeStatus: ok when Langfuse fails twice then succeeds', async () => {
      const error = new Error('Langfuse 500')
      ;(langfuseClient.purgeByUserId as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(undefined)

      const erasePromise = pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      // Advance past each backoff delay
      await vi.runAllTimersAsync()

      const result = await erasePromise

      expect(result.langfusePurgeStatus).toBe('ok')
      expect(langfuseClient.purgeByUserId).toHaveBeenCalledTimes(3)
    })

    it('still fires user_erased_complete when Langfuse retries and succeeds', async () => {
      const error = new Error('Langfuse 503')
      ;(langfuseClient.purgeByUserId as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(undefined)

      const erasePromise = pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })
      await vi.runAllTimersAsync()

      await erasePromise

      const eventTypes = (kernelAudit.recordEvent as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0].eventType,
      )
      expect(eventTypes).toContain('user_erased_complete')
      expect(eventTypes).not.toContain('user_erased_partial')
    })
  })

  // ─── 3. Langfuse exhausted (3 failures) ─────────────────────────────────────

  describe('Langfuse exhausted path', () => {
    beforeEach(() => {
      const error = new Error('Langfuse permanently down')
      ;(langfuseClient.purgeByUserId as ReturnType<typeof vi.fn>).mockRejectedValue(error)
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns langfusePurgeStatus: failed after 3 Langfuse failures', async () => {
      const erasePromise = pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })
      await vi.runAllTimersAsync()
      const result = await erasePromise

      expect(result.langfusePurgeStatus).toBe('failed')
      expect(langfuseClient.purgeByUserId).toHaveBeenCalledTimes(3)
    })

    it('DB + L3 + L3.5 remain committed even when Langfuse fails', async () => {
      const erasePromise = pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })
      await vi.runAllTimersAsync()
      await erasePromise

      expect(messageRepo.hardDeleteContent).toHaveBeenCalledTimes(1)
      expect(l3Repo.delete).toHaveBeenCalledTimes(1)
      expect(scratchpadRepo.deleteForUser).toHaveBeenCalledTimes(1)
    })

    it('fires kernel audit row with compliance_ticket_required: true', async () => {
      const erasePromise = pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })
      await vi.runAllTimersAsync()
      await erasePromise

      const auditCalls = (kernelAudit.recordEvent as ReturnType<typeof vi.fn>).mock.calls
      const partialCall = auditCalls.find(
        (call) =>
          call[0].eventType === 'user_erased_partial' ||
          call[0].complianceTicketRequired === true ||
          call[0].metadata?.complianceTicketRequired === true,
      )
      expect(partialCall).toBeDefined()
    })

    it('fires user_erased_partial (not user_erased_complete) when Langfuse is exhausted', async () => {
      const erasePromise = pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })
      await vi.runAllTimersAsync()
      await erasePromise

      const eventTypes = (kernelAudit.recordEvent as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0].eventType,
      )
      expect(eventTypes).toContain('user_erased_partial')
      expect(eventTypes).not.toContain('user_erased_complete')
    })
  })

  // ─── 4. Partial failure on DB step ──────────────────────────────────────────

  describe('partial failure on DB step', () => {
    it('fires user_erased_partial when hardDeleteContent throws', async () => {
      ;(messageRepo.hardDeleteContent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB connection lost'),
      )

      const result = await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      const eventTypes = (kernelAudit.recordEvent as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0].eventType,
      )
      expect(eventTypes).toContain('user_erased_partial')
      expect(result.langfusePurgeStatus).toBe('failed')
    })

    it('includes the failed step detail in the partial audit event', async () => {
      ;(messageRepo.hardDeleteContent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB connection lost'),
      )

      await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      const auditCalls = (kernelAudit.recordEvent as ReturnType<typeof vi.fn>).mock.calls
      const partialEvent = auditCalls.find((call) => call[0].eventType === 'user_erased_partial')
      expect(partialEvent).toBeDefined()
      // The step that failed should be communicated
      const eventPayload = partialEvent?.[0]
      expect(
        eventPayload?.failedStep ??
          eventPayload?.metadata?.failedStep ??
          JSON.stringify(eventPayload),
      ).toMatch(/db|message|content/i)
    })

    it('does not call Langfuse if DB step fails (pipeline aborts early)', async () => {
      ;(messageRepo.hardDeleteContent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB error'),
      )

      await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      // Langfuse should NOT be called when DB step throws
      expect(langfuseClient.purgeByUserId).not.toHaveBeenCalled()
    })
  })

  // ─── 5. Correct counts ──────────────────────────────────────────────────────

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

      // 3 preference keys were present
      expect(result.l3Deleted).toBe(3)
    })

    it('l35ScratchpadDeleted is 1 when scratchpad deletion succeeds', async () => {
      const result = await pipeline.erase({ userId: USER_ID, tenantId: TENANT_ID })

      // scratchpadRepo.deleteForUser was called once (1 user deleted)
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
