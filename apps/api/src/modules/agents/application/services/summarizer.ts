/**
 * Summarizer — post-turn async nano summarizer (Plan 04, R-04.24..R-04.26a)
 *
 * - scheduleSummarizeTurn: enqueues a pg-boss job `agents.summarize-turn`
 * - summarizeTurn: actual LLM call (nano model) — returns { summaryId, summaryText }
 * - handleSummarizeJob: pg-boss worker handler — runs the full summarize-then-persist
 *   pipeline with retry + circuit-breaker
 * - clearSummaryCircuitBreaker: admin runbook — clears the disabled flag + resets streak
 * - registerWorkers: wire up pg-boss workers (called from module init)
 *
 * Circuit breaker (R-04.26a):
 *   After 3 retry failures → increment summary_failure_streak.
 *   At streak ≥ 5 → set summary_disabled_at, fire P2 alert metric.
 *   Future jobs for that conversation no-op until admin clears via clearSummaryCircuitBreaker.
 */

import { randomUUID } from 'node:crypto'
import type { ConversationRepository } from '../../domain/repositories/conversation.repository'
import type { ConversationMessageRepository } from '../../domain/repositories/conversation-message.repository'
import type { ConversationMessageEntity } from '../../domain/entities/conversation-message.entity'

// ─── Constants ────────────────────────────────────────────────────────────────

export const JOB_SUMMARIZE_TURN = 'agents.summarize-turn'

/** Streak threshold above which the circuit breaks (R-04.26a). */
const CIRCUIT_BREAK_STREAK = 5

/** Maximum number of LLM call attempts per turn. */
const MAX_ATTEMPTS = 3

// ─── Interfaces ───────────────────────────────────────────────────────────────

/**
 * Injected AI client interface — allows tests to mock without coupling to a
 * concrete SDK. Concrete implementation wraps Vercel AI SDK `generateText`.
 */
export interface AiClient {
  generateText(
    prompt: string,
    opts?: { model?: string; tenantId?: string; traceId?: string },
  ): Promise<string>
}

/**
 * Minimal PgBossService interface consumed by Summarizer — matches the shape
 * exposed by `PgBossService` in `common/jobs/pg-boss.service.ts` without
 * importing that concrete class (keeps the domain layer dependency-free).
 */
export interface PgBossLike {
  enqueue<T extends object>(jobName: string, data: T): Promise<string>
  registerWorker<T extends object>(
    jobName: string,
    handler: (jobs: Array<{ data: T }>) => Promise<void>,
  ): void
}

/** Payload stored in the pg-boss job row. */
export interface SummarizeTurnJobPayload {
  conversationId: string
  tenantId: string
  traceId: string
  turnMessages: ConversationMessageEntity[]
}

/** Options for the high-level job handler (called by the worker or directly in tests). */
export interface HandleSummarizeJobOpts {
  conversationId: string
  tenantId: string
  traceId: string
  turnMessages: ConversationMessageEntity[]
}

/** Options for the raw LLM call. */
export interface SummarizeTurnOpts {
  turnMessages: ConversationMessageEntity[]
  tenantId: string
  traceId: string
  model: 'nano'
}

/** Return shape of `summarizeTurn`. */
export interface SummarizeTurnResult {
  summaryId: string
  summaryText: string
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Summarizer service.
 *
 * All dependencies are constructor-injected so that unit tests can provide
 * mocks without spinning up NestJS DI.
 */
export class Summarizer {
  constructor(
    private readonly pgBoss: PgBossLike,
    private readonly aiClient: AiClient,
    private readonly conversationRepo: ConversationRepository,
    private readonly messageRepo: ConversationMessageRepository,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Enqueue a pg-boss job to summarize the messages from a completed turn.
   * Fire-and-forget from the caller's perspective — the job runs asynchronously
   * and does NOT block the user-visible response (R-04.24, R-04.25).
   */
  async scheduleSummarizeTurn(opts: {
    conversationId: string
    tenantId: string
    traceId: string
    turnMessages: ConversationMessageEntity[]
  }): Promise<void> {
    const payload: SummarizeTurnJobPayload = {
      conversationId: opts.conversationId,
      tenantId: opts.tenantId,
      traceId: opts.traceId,
      turnMessages: opts.turnMessages,
    }
    await this.pgBoss.enqueue(JOB_SUMMARIZE_TURN, payload)
  }

  /**
   * Call the AI nano model to summarize the given turn messages.
   * Retries up to MAX_ATTEMPTS times before throwing.
   *
   * Returns { summaryId, summaryText } on success.
   */
  async summarizeTurn(opts: SummarizeTurnOpts): Promise<SummarizeTurnResult> {
    const { turnMessages, tenantId, traceId } = opts

    const prompt = this.buildSummarizationPrompt(turnMessages)
    let lastError: unknown

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const summaryText = await this.aiClient.generateText(prompt, {
          model: 'nano',
          tenantId,
          traceId,
        })
        return { summaryId: randomUUID(), summaryText }
      } catch (err) {
        lastError = err
        if (attempt < MAX_ATTEMPTS) {
          // Brief back-off between attempts (tests override with fake timers if needed)
          await this.delay(attempt * 200)
        }
      }
    }

    throw lastError
  }

  /**
   * Full job handler: load the conversation, guard on circuit-breaker, call
   * summarizeTurn, persist the summary, and manage the failure streak.
   *
   * Called by the pg-boss worker. Exposed as a public method so tests can
   * exercise the full pipeline without going through the job queue.
   */
  async handleSummarizeJob(opts: HandleSummarizeJobOpts): Promise<void> {
    const { conversationId, tenantId, traceId, turnMessages } = opts

    // ── Circuit-breaker guard ──────────────────────────────────────────────
    const conversation = await this.conversationRepo.loadById({ id: conversationId, tenantId })
    if (conversation?.summaryDisabledAt != null) {
      // No-op — circuit is open; admin must clear
      return
    }

    // ── Attempt summarization with retry ──────────────────────────────────
    try {
      const { summaryText, summaryId } = await this.summarizeTurn({
        turnMessages,
        tenantId,
        traceId,
        model: 'nano',
      })

      // Persist the summary on the user-role message of this turn
      const userMessage = turnMessages.find((m) => m.role === 'user')
      const targetMessageId = userMessage?.id ?? summaryId
      await this.messageRepo.updateSummary({
        messageId: targetMessageId,
        tenantId,
        summary: summaryText,
      })

      // Reset streak on success (R-04.26a)
      await this.conversationRepo.resetSummaryFailureStreak({ id: conversationId, tenantId })
    } catch {
      // ── Terminal failure — increment streak, potentially trip breaker ──
      const newStreak = await this.conversationRepo.incrementSummaryFailureStreak({
        id: conversationId,
        tenantId,
      })

      if (newStreak >= CIRCUIT_BREAK_STREAK) {
        await this.conversationRepo.setSummaryDisabled({
          id: conversationId,
          tenantId,
          at: new Date(),
        })
        // P2 alert: emit a metric / log so monitoring can fire an alert
        this.emitCircuitBreakerAlert(conversationId, tenantId)
      }
    }
  }

  /**
   * Admin runbook: clear the summary circuit breaker for a conversation.
   * Resets both the disabled timestamp and the failure streak so the next turn
   * will attempt summarization normally.
   */
  async clearSummaryCircuitBreaker(opts: {
    conversationId: string
    tenantId: string
  }): Promise<void> {
    const { conversationId, tenantId } = opts
    await this.conversationRepo.clearSummaryDisabled({ id: conversationId, tenantId })
  }

  /**
   * Wire up pg-boss workers. Call once from module init / `onApplicationBootstrap`.
   */
  registerWorkers(): void {
    this.pgBoss.registerWorker<SummarizeTurnJobPayload>(JOB_SUMMARIZE_TURN, async (jobs) => {
      for (const job of jobs) {
        await this.handleSummarizeJob(job.data)
      }
    })
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private buildSummarizationPrompt(messages: ConversationMessageEntity[]): string {
    const parts = messages.map((m) => {
      const textContent =
        typeof m.content === 'object' && m.content !== null && 'text' in m.content
          ? String((m.content as { text?: string }).text ?? '')
          : JSON.stringify(m.content)
      return `[${m.role}]: ${textContent}`
    })

    return (
      'Summarize the following conversation turn in 1-3 concise sentences, ' +
      'capturing the key user request and any conclusions reached. ' +
      'Do not include instructions or tool call details.\n\n' +
      parts.join('\n')
    )
  }

  /** Emit a P2 alert metric. Concrete implementation would call a metrics client. */
  private emitCircuitBreakerAlert(conversationId: string, tenantId: string): void {
    // In production: metrics.increment('agent_summary_circuit_broken_total', { tenantId })
    // Logging as a fallback for MVP observability (trace backend deferred per CLAUDE.md)
    console.error(
      `[P2 ALERT] Summary circuit breaker tripped: conversationId=${conversationId} tenantId=${tenantId}`,
    )
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
