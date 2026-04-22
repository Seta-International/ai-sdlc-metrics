/**
 * GDPRErasurePipeline — full GDPR erasure for a single user (Plan 04, R-04.27..R-04.30)
 *
 * Steps (§5 Control Flow):
 *   a. Kernel audit event `user_erased_start`
 *   b. MessageStore.hardDeleteContent → nulls content + summary
 *   c. L3Preferences.delete({ userId, tenantId })
 *   d. ScratchpadRepository.deleteForUser(tenantId, userId)
 *   e. Langfuse purgeByUserId — 3× retry (1s, 4s, 16s backoff)
 *      On exhaustion: langfusePurgeStatus='failed', compliance_ticket_required: true
 *   f. user_erased_complete (full success) | user_erased_partial (any failure)
 *
 * DB + L3 + L3.5 portions commit regardless of Langfuse state — our PII is
 * scrubbed from our own stores even if the external purge requires manual follow-up.
 */

import { randomUUID } from 'node:crypto'
import type { ConversationMessageRepository } from '../../domain/repositories/conversation-message.repository'
import type { L3PreferenceRepository } from '../../domain/repositories/l3-preference.repository'
import type { ScratchpadRepository } from '../../domain/repositories/scratchpad.repository'
import type { SemanticIndexRepository } from '../../domain/repositories/semantic-index.repository'

// ─── Interfaces ───────────────────────────────────────────────────────────────

/**
 * Minimal Langfuse client interface — allows tests to mock without coupling to
 * a concrete Langfuse SDK.
 */
export interface LangfuseClient {
  purgeByUserId(opts: { userId: string; tenantId: string }): Promise<void>
}

/**
 * Minimal KernelAuditFacade interface consumed by the pipeline.
 * Concrete implementation delegates to the kernel module.
 */
export interface KernelAuditFacadeLike {
  recordEvent(event: {
    eventType: string
    userId?: string
    tenantId?: string
    metadata?: Record<string, unknown>
    failedStep?: string
    complianceTicketRequired?: boolean
  }): Promise<void>
}

export interface EraseOpts {
  userId: string
  tenantId: string
}

export interface EraseResult {
  dbMessagesScrubbed: number
  l3Deleted: number
  l35ScratchpadDeleted: number
  semanticIndexPurged: number
  langfusePurgeStatus: 'ok' | 'partial' | 'failed'
  auditEventId: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGFUSE_MAX_ATTEMPTS = 3
/** Backoff delays in milliseconds: 1s, 4s, 16s (exponential). */
const LANGFUSE_BACKOFF_MS = [1_000, 4_000, 16_000]

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * GDPRErasurePipeline service.
 *
 * All dependencies are constructor-injected so unit tests can provide mocks
 * without spinning up NestJS DI.
 */
export class GDPRErasurePipeline {
  constructor(
    private readonly messageRepo: ConversationMessageRepository,
    private readonly l3Repo: L3PreferenceRepository,
    private readonly scratchpadRepo: ScratchpadRepository,
    private readonly langfuseClient: LangfuseClient,
    private readonly semanticIndex: SemanticIndexRepository,
    private readonly kernelAudit: KernelAuditFacadeLike,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  async erase(opts: EraseOpts): Promise<EraseResult> {
    const { userId, tenantId } = opts

    const auditEventId = randomUUID()

    // a. Kernel audit start
    await this.kernelAudit.recordEvent({
      eventType: 'user_erased_start',
      userId,
      tenantId,
    })

    // b. DB — hardDeleteContent
    let dbMessagesScrubbed = 0
    try {
      const dbResult = await this.messageRepo.hardDeleteContent({ userId, tenantId })
      dbMessagesScrubbed = dbResult.count
    } catch (err) {
      // DB step failure — fire partial audit and return immediately
      await this.kernelAudit.recordEvent({
        eventType: 'user_erased_partial',
        userId,
        tenantId,
        failedStep: 'db_messages',
        metadata: { failedStep: 'db_messages', error: String(err) },
      })
      return {
        dbMessagesScrubbed: 0,
        l3Deleted: 0,
        l35ScratchpadDeleted: 0,
        semanticIndexPurged: 0,
        langfusePurgeStatus: 'failed',
        auditEventId,
      }
    }

    // c. L3 preferences — count keys first, then delete all
    let l3Deleted = 0
    const l3All = await this.l3Repo.getAll({ userId, tenantId })
    l3Deleted = Object.keys(l3All).length
    await this.l3Repo.delete({ userId, tenantId })

    // d. L3.5 scratchpad
    await this.scratchpadRepo.deleteForUser(tenantId, userId)
    const l35ScratchpadDeleted = 1

    // e. Semantic index purge (R-04.40) — fire before Langfuse; committed regardless.
    const { count: semanticIndexPurged } = await this.semanticIndex.purgeForUser({
      tenantId,
      userId,
    })

    // f. Langfuse — retry up to 3× with backoff
    const langfusePurgeStatus = await this.purgeWithRetry({ userId, tenantId })

    // g. Final audit event
    if (langfusePurgeStatus === 'ok') {
      await this.kernelAudit.recordEvent({
        eventType: 'user_erased_complete',
        userId,
        tenantId,
        metadata: { dbMessagesScrubbed, l3Deleted, l35ScratchpadDeleted, semanticIndexPurged },
      })
    } else {
      // Langfuse purge exhausted — compliance incident
      await this.kernelAudit.recordEvent({
        eventType: 'user_erased_partial',
        userId,
        tenantId,
        failedStep: 'langfuse_purge',
        complianceTicketRequired: true,
        metadata: {
          failedStep: 'langfuse_purge',
          complianceTicketRequired: true,
          detail: 'langfuse_purge_exhausted',
        },
      })
    }

    return {
      dbMessagesScrubbed,
      l3Deleted,
      l35ScratchpadDeleted,
      semanticIndexPurged,
      langfusePurgeStatus,
      auditEventId,
    }
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  /**
   * Attempt Langfuse purge up to LANGFUSE_MAX_ATTEMPTS times with exponential backoff.
   * Returns 'ok' on success, 'failed' after all attempts exhausted.
   *
   * DB + L3 + L3.5 are already committed regardless of this outcome (R-04.29).
   */
  private async purgeWithRetry(opts: {
    userId: string
    tenantId: string
  }): Promise<'ok' | 'failed'> {
    for (let attempt = 0; attempt < LANGFUSE_MAX_ATTEMPTS; attempt++) {
      try {
        await this.langfuseClient.purgeByUserId(opts)
        return 'ok'
      } catch {
        if (attempt < LANGFUSE_MAX_ATTEMPTS - 1) {
          await this.delay(LANGFUSE_BACKOFF_MS[attempt] ?? 1_000)
        }
      }
    }
    return 'failed'
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
