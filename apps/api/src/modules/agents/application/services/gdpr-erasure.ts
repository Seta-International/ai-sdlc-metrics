/**
 * GDPRErasurePipeline — full GDPR erasure for a single user.
 *
 * Steps:
 *   a. Kernel audit event `user_erased_start`
 *   b. MessageStore.hardDeleteContent → nulls content + summary
 *   c. L3Preferences.delete({ userId, tenantId })
 *   d. ScratchpadRepository.deleteForUser(tenantId, userId)
 *   e. SemanticIndex.purgeForUser
 *   f. user_erased_complete (full success) | user_erased_partial (DB failure)
 */

import { randomUUID } from 'node:crypto'
import type { ConversationMessageRepository } from '../../domain/repositories/conversation-message.repository'
import type { L3PreferenceRepository } from '../../domain/repositories/l3-preference.repository'
import type { ScratchpadRepository } from '../../domain/repositories/scratchpad.repository'
import type { SemanticIndexRepository } from '../../domain/repositories/semantic-index.repository'

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
  auditEventId: string
}

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
    private readonly semanticIndex: SemanticIndexRepository,
    private readonly kernelAudit: KernelAuditFacadeLike,
  ) {}

  async erase(opts: EraseOpts): Promise<EraseResult> {
    const { userId, tenantId } = opts

    const auditEventId = randomUUID()

    await this.kernelAudit.recordEvent({
      eventType: 'user_erased_start',
      userId,
      tenantId,
    })

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
        auditEventId,
      }
    }

    // L3 preferences — count keys first, then delete all.
    let l3Deleted = 0
    const l3All = await this.l3Repo.getAll({ userId, tenantId })
    l3Deleted = Object.keys(l3All).length
    await this.l3Repo.delete({ userId, tenantId })

    const { count: l35ScratchpadDeleted } = await this.scratchpadRepo.deleteForUser(
      tenantId,
      userId,
    )

    const { count: semanticIndexPurged } = await this.semanticIndex.purgeForUser({
      tenantId,
      userId,
    })

    await this.kernelAudit.recordEvent({
      eventType: 'user_erased_complete',
      userId,
      tenantId,
      metadata: { dbMessagesScrubbed, l3Deleted, l35ScratchpadDeleted, semanticIndexPurged },
    })

    return {
      dbMessagesScrubbed,
      l3Deleted,
      l35ScratchpadDeleted,
      semanticIndexPurged,
      auditEventId,
    }
  }
}
