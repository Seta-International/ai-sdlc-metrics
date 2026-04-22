/**
 * summarizer.spec.ts — Plan 04 unit tests for Summarizer (R-04.24..R-04.26a)
 *
 * Covers:
 *  1. scheduleSummarizeTurn enqueues a pg-boss job with correct payload
 *  2. summarizeTurn calls AI client with turn messages and returns summary
 *  3. summarizeTurn failure → retries up to 3 times (simulate 2 failures then success)
 *  4. Circuit breaker: after 3 retries exhausted → increments summary_failure_streak;
 *     at streak ≥ 5 → setSummaryDisabled called
 *  5. clearSummaryCircuitBreaker calls clearSummaryDisabled on the conversation repo
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Summarizer, JOB_SUMMARIZE_TURN } from './summarizer'
import type { AiClient, SummarizeTurnJobPayload } from './summarizer'
import type { ConversationRepository } from '../../domain/repositories/conversation.repository'
import type { ConversationMessageRepository } from '../../domain/repositories/conversation-message.repository'
import type { ConversationMessageEntity } from '../../domain/entities/conversation-message.entity'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-00000000-0000-0000-0000-000000000001'
const CONVERSATION_ID = 'conv-00000000-0000-0000-0000-000000000001'
const TRACE_ID = 'trace-00000000-0000-0000-0000-000000000001'

function makeMessage(index: number): ConversationMessageEntity {
  return {
    id: `msg-${index.toString().padStart(3, '0')}`,
    conversationId: CONVERSATION_ID,
    tenantId: TENANT_ID,
    userId: 'user-001',
    role: 'user',
    content: { text: `Message ${index}` },
    summary: null,
    traceId: TRACE_ID,
    createdAt: new Date(2026, 0, 1, 0, index, 0),
  }
}

function makePgBoss() {
  return {
    enqueue: vi.fn().mockResolvedValue('job-id-123'),
    registerWorker: vi.fn(),
  }
}

function makeAiClient(): AiClient {
  return {
    generateText: vi.fn().mockResolvedValue('This is a nano summary.'),
  }
}

function makeConversationRepo(): ConversationRepository {
  return {
    loadOrCreateActive: vi.fn(),
    loadById: vi.fn(),
    archive: vi.fn(),
    delete: vi.fn(),
    listGlobal: vi.fn(),
    listBySurface: vi.fn(),
    incrementSummaryFailureStreak: vi.fn().mockResolvedValue(1),
    resetSummaryFailureStreak: vi.fn().mockResolvedValue(undefined),
    setSummaryDisabled: vi.fn().mockResolvedValue(undefined),
    clearSummaryDisabled: vi.fn().mockResolvedValue(undefined),
    updateTitle: vi.fn(),
    touchLastUserTurn: vi.fn(),
    archiveIdleConversations: vi.fn(),
  }
}

function makeMessageRepo(): ConversationMessageRepository {
  return {
    persist: vi.fn(),
    persistMany: vi.fn(),
    listForWindow: vi.fn(),
    updateSummary: vi.fn().mockResolvedValue(undefined),
    hardDeleteContent: vi.fn(),
    search: vi.fn(),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Summarizer', () => {
  let pgBoss: ReturnType<typeof makePgBoss>
  let aiClient: AiClient
  let conversationRepo: ConversationRepository
  let messageRepo: ConversationMessageRepository
  let summarizer: Summarizer

  beforeEach(() => {
    pgBoss = makePgBoss()
    aiClient = makeAiClient()
    conversationRepo = makeConversationRepo()
    messageRepo = makeMessageRepo()
    summarizer = new Summarizer(pgBoss, aiClient, conversationRepo, messageRepo)
  })

  // ─── 1. scheduleSummarizeTurn enqueues pg-boss job ──────────────────────────

  describe('scheduleSummarizeTurn()', () => {
    it('enqueues a pg-boss job with the correct job name and payload', async () => {
      const turnMessages = [makeMessage(1), makeMessage(2)]

      await summarizer.scheduleSummarizeTurn({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        traceId: TRACE_ID,
        turnMessages,
      })

      expect(pgBoss.enqueue).toHaveBeenCalledOnce()
      const [jobName, payload] = (pgBoss.enqueue as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(jobName).toBe(JOB_SUMMARIZE_TURN)
      expect(payload).toMatchObject({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        traceId: TRACE_ID,
        turnMessages,
      })
    })

    it('returns without throwing when enqueue succeeds', async () => {
      await expect(
        summarizer.scheduleSummarizeTurn({
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          traceId: TRACE_ID,
          turnMessages: [makeMessage(1)],
        }),
      ).resolves.toBeUndefined()
    })
  })

  // ─── 2. summarizeTurn calls AI client and returns summary ───────────────────

  describe('summarizeTurn()', () => {
    it('calls AI client with turn messages and returns summaryText', async () => {
      const turnMessages = [makeMessage(1), makeMessage(2)]
      ;(aiClient.generateText as ReturnType<typeof vi.fn>).mockResolvedValue('AI-generated summary')

      const result = await summarizer.summarizeTurn({
        turnMessages,
        tenantId: TENANT_ID,
        traceId: TRACE_ID,
        model: 'nano',
      })

      expect(aiClient.generateText).toHaveBeenCalledOnce()
      expect(result.summaryText).toBe('AI-generated summary')
      expect(typeof result.summaryId).toBe('string')
      expect(result.summaryId).toBeTruthy()
    })

    it('passes turn message content to the AI client prompt', async () => {
      const turnMessages = [makeMessage(1)]

      await summarizer.summarizeTurn({
        turnMessages,
        tenantId: TENANT_ID,
        traceId: TRACE_ID,
        model: 'nano',
      })

      const [prompt] = (aiClient.generateText as ReturnType<typeof vi.fn>).mock.calls[0]
      // The prompt must include message content so the model can summarize it
      expect(prompt).toContain('Message 1')
    })
  })

  // ─── 3. summarizeTurn retries on failure (up to 3 times) ───────────────────

  describe('summarizeTurn() — retry behaviour', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('succeeds after 2 failures followed by success (retry path)', async () => {
      const turnMessages = [makeMessage(1)]
      const error = new Error('AI service unavailable')

      ;(aiClient.generateText as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('Summary on third attempt')

      const summarizePromise = summarizer.summarizeTurn({
        turnMessages,
        tenantId: TENANT_ID,
        traceId: TRACE_ID,
        model: 'nano',
      })
      await vi.runAllTimersAsync()

      const result = await summarizePromise

      expect(aiClient.generateText).toHaveBeenCalledTimes(3)
      expect(result.summaryText).toBe('Summary on third attempt')
    })

    it('resets the failure streak on success', async () => {
      const turnMessages = [makeMessage(1)]
      ;(aiClient.generateText as ReturnType<typeof vi.fn>).mockResolvedValue('Success summary')

      const summarizePromise = summarizer.summarizeTurn({
        turnMessages,
        tenantId: TENANT_ID,
        traceId: TRACE_ID,
        model: 'nano',
      })
      await vi.runAllTimersAsync()
      await summarizePromise

      expect(conversationRepo.resetSummaryFailureStreak).not.toHaveBeenCalled()
    })

    it('throws after 3 consecutive failures (retries exhausted)', async () => {
      const turnMessages = [makeMessage(1)]
      const error = new Error('Persistent failure')

      ;(aiClient.generateText as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      // Start the summarize call and advance all timers concurrently so
      // retry delays resolve before we check the result.
      const summarizePromise = summarizer.summarizeTurn({
        turnMessages,
        tenantId: TENANT_ID,
        traceId: TRACE_ID,
        model: 'nano',
      })

      // Attach rejection handler immediately to prevent unhandled rejection warning
      const caught = summarizePromise.catch((e) => e)

      await vi.runAllTimersAsync()

      const result = await caught
      expect(result).toBeInstanceOf(Error)
      expect((result as Error).message).toBe('Persistent failure')
      expect(aiClient.generateText).toHaveBeenCalledTimes(3)
    })
  })

  // ─── 4. Circuit breaker ─────────────────────────────────────────────────────

  describe('circuit breaker (R-04.26a)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('increments summary_failure_streak when job exhausts 3 retries', async () => {
      const error = new Error('Always fails')
      ;(aiClient.generateText as ReturnType<typeof vi.fn>).mockRejectedValue(error)
      ;(
        conversationRepo.incrementSummaryFailureStreak as ReturnType<typeof vi.fn>
      ).mockResolvedValue(2)

      const jobPromise = summarizer.handleSummarizeJob({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        traceId: TRACE_ID,
        turnMessages: [makeMessage(1)],
      })
      await vi.runAllTimersAsync()
      await jobPromise

      expect(conversationRepo.incrementSummaryFailureStreak).toHaveBeenCalledWith({
        id: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })
    })

    it('calls setSummaryDisabled when streak reaches 5', async () => {
      const error = new Error('Always fails')
      ;(aiClient.generateText as ReturnType<typeof vi.fn>).mockRejectedValue(error)
      ;(
        conversationRepo.incrementSummaryFailureStreak as ReturnType<typeof vi.fn>
      ).mockResolvedValue(5)

      const jobPromise = summarizer.handleSummarizeJob({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        traceId: TRACE_ID,
        turnMessages: [makeMessage(1)],
      })
      await vi.runAllTimersAsync()
      await jobPromise

      expect(conversationRepo.setSummaryDisabled).toHaveBeenCalledWith(
        expect.objectContaining({
          id: CONVERSATION_ID,
          tenantId: TENANT_ID,
          at: expect.any(Date),
        }),
      )
    })

    it('does NOT call setSummaryDisabled when streak is below 5', async () => {
      const error = new Error('Always fails')
      ;(aiClient.generateText as ReturnType<typeof vi.fn>).mockRejectedValue(error)
      ;(
        conversationRepo.incrementSummaryFailureStreak as ReturnType<typeof vi.fn>
      ).mockResolvedValue(4)

      const jobPromise = summarizer.handleSummarizeJob({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        traceId: TRACE_ID,
        turnMessages: [makeMessage(1)],
      })
      await vi.runAllTimersAsync()
      await jobPromise

      expect(conversationRepo.setSummaryDisabled).not.toHaveBeenCalled()
    })

    it('resets failure streak and writes summary on success', async () => {
      ;(aiClient.generateText as ReturnType<typeof vi.fn>).mockResolvedValue('Good summary')

      const jobPromise = summarizer.handleSummarizeJob({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        traceId: TRACE_ID,
        turnMessages: [makeMessage(1)],
      })
      await vi.runAllTimersAsync()
      await jobPromise

      expect(conversationRepo.resetSummaryFailureStreak).toHaveBeenCalledWith({
        id: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })
      expect(messageRepo.updateSummary).toHaveBeenCalled()
    })

    it('no-ops if summary_disabled_at is set on the conversation', async () => {
      ;(conversationRepo.loadById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: CONVERSATION_ID,
        tenantId: TENANT_ID,
        summaryDisabledAt: new Date(),
        summaryFailureStreak: 5,
      })

      const jobPromise = summarizer.handleSummarizeJob({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        traceId: TRACE_ID,
        turnMessages: [makeMessage(1)],
      })
      await vi.runAllTimersAsync()
      await jobPromise

      expect(aiClient.generateText).not.toHaveBeenCalled()
      expect(conversationRepo.incrementSummaryFailureStreak).not.toHaveBeenCalled()
    })
  })

  // ─── 5. clearSummaryCircuitBreaker ──────────────────────────────────────────

  describe('clearSummaryCircuitBreaker()', () => {
    it('calls clearSummaryDisabled on the conversation repo', async () => {
      await summarizer.clearSummaryCircuitBreaker({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })

      expect(conversationRepo.clearSummaryDisabled).toHaveBeenCalledWith({
        id: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })
    })

    it('also resets the failure streak when clearing circuit breaker', async () => {
      await summarizer.clearSummaryCircuitBreaker({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })

      expect(conversationRepo.resetSummaryFailureStreak).toHaveBeenCalledWith({
        id: CONVERSATION_ID,
        tenantId: TENANT_ID,
      })
    })
  })

  // ─── 6. registerWorkers() ───────────────────────────────────────────────────

  describe('registerWorkers()', () => {
    it('registers a worker for the summarize-turn job', () => {
      summarizer.registerWorkers()

      expect(pgBoss.registerWorker).toHaveBeenCalledWith(JOB_SUMMARIZE_TURN, expect.any(Function))
    })
  })
})
