import { Inject, Injectable, Logger } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { setApprovalInboxDepth } from '../../infrastructure/observability/cost-metrics'

export interface EligibilityResult {
  eligible: boolean
  reason?: 'initiator_pair_threshold' | 'approver_aggregate_threshold'
  pendingCounts: { initiatorPair: number; approverAggregate: number }
}

const INITIATOR_PAIR_LIMIT = 20
const APPROVER_AGGREGATE_LIMIT = 50

/**
 * Checks whether a new draft is eligible to surface as an approval card, or
 * should enter held-queue status.
 *
 * Fail-soft: any DB error returns `{ eligible: true }` to avoid blocking
 * approval flows on infrastructure failures.
 */
@Injectable()
export class ApprovalInboxThrottle {
  private readonly logger = new Logger(ApprovalInboxThrottle.name)

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async checkEligibility(opts: {
    tenantId: string
    initiatorUserId: string
    approverUserId: string
  }): Promise<EligibilityResult> {
    try {
      const pairResult = await this.db.execute<{ count: string }>(
        sql`
          SELECT COUNT(*)::text AS count
          FROM agents.agent_approval_drafts
          WHERE tenant_id = ${opts.tenantId}::uuid
            AND initiator_user_id = ${opts.initiatorUserId}::uuid
            AND approver_user_id = ${opts.approverUserId}::uuid
            AND status = 'pending'
        `,
      )

      const approverResult = await this.db.execute<{ count: string }>(
        sql`
          SELECT COUNT(*)::text AS count
          FROM agents.agent_approval_drafts
          WHERE tenant_id = ${opts.tenantId}::uuid
            AND approver_user_id = ${opts.approverUserId}::uuid
            AND status = 'pending'
        `,
      )

      const initiatorPair = parseInt(pairResult.rows[0]?.count ?? '0', 10)
      const approverAggregate = parseInt(approverResult.rows[0]?.count ?? '0', 10)
      const pendingCounts = { initiatorPair, approverAggregate }

      // No user_id label — aggregate only.
      setApprovalInboxDepth(opts.tenantId, approverAggregate)

      // Initiator pair threshold checked first.
      if (initiatorPair >= INITIATOR_PAIR_LIMIT) {
        return { eligible: false, reason: 'initiator_pair_threshold', pendingCounts }
      }

      if (approverAggregate >= APPROVER_AGGREGATE_LIMIT) {
        return { eligible: false, reason: 'approver_aggregate_threshold', pendingCounts }
      }

      return { eligible: true, pendingCounts }
    } catch (err) {
      // Fail-soft: never block approval flows on infra failures
      this.logger.warn(`ApprovalInboxThrottle DB failure tenant=${opts.tenantId}: ${err}`)
      return { eligible: true, pendingCounts: { initiatorPair: 0, approverAggregate: 0 } }
    }
  }
}
