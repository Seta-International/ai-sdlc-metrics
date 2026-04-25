import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { and, gte, lt, sum as drizzleSum } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { CostReconciliationJob } from '../../application/services/cost-reconciliation-job'
import { agentCostEvents } from '../schema/agents.schema'

export const COST_RECONCILIATION_JOB = 'agent.cost-reconciliation-weekly'
/** Every Monday at 08:00 UTC */
const CRON = '0 8 * * 1'

@Injectable()
export class CostReconciliationWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(CostReconciliationWorker.name)

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly job: CostReconciliationJob,
    @Inject(DB_TOKEN) private readonly db: Db,
  ) {}

  /**
   * Compute the Monday-to-Monday bounds for the PREVIOUS ISO week.
   * Called on Mondays (cron: `0 8 * * 1`), so "last week" = the 7-day span
   * that ended at the start of today (this Monday 00:00 UTC).
   *
   * Strategy: find "this week's Monday" by subtracting (dayOfWeek + 6) % 7 days,
   * then subtract another 7 days to get "last week's Monday".
   */
  private getLastWeekBounds(): { weekStart: Date; weekEnd: Date } {
    const now = new Date()
    const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon, …, 6=Sat
    // Days back to reach the Monday that opened the CURRENT week
    const daysToThisMonday = (dayOfWeek + 6) % 7
    const thisMonday = new Date(now)
    thisMonday.setUTCDate(now.getUTCDate() - daysToThisMonday)
    thisMonday.setUTCHours(0, 0, 0, 0)
    const lastMonday = new Date(thisMonday)
    lastMonday.setUTCDate(thisMonday.getUTCDate() - 7)
    return { weekStart: lastMonday, weekEnd: thisMonday }
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.pgBoss.schedule(COST_RECONCILIATION_JOB, CRON)

    this.pgBoss.registerScheduledWorker<Record<string, never>>(
      COST_RECONCILIATION_JOB,
      async () => {
        try {
          const { weekStart, weekEnd } = this.getLastWeekBounds()

          const rows = await this.db
            .select({ total: drizzleSum(agentCostEvents.costUsd) })
            .from(agentCostEvents)
            .where(
              and(
                gte(agentCostEvents.createdAt, weekStart),
                lt(agentCostEvents.createdAt, weekEnd),
              ),
            )

          const agentSum = rows[0]?.total ?? '0'

          // MVP: vendor invoice ingestion deferred; using agentSum as vendor proxy produces 0% divergence
          const result = await this.job.runWeekly({
            weekStart: weekStart.toISOString().slice(0, 10), // YYYY-MM-DD
            agentCostEventSumUsd: String(agentSum),
            vendorInvoiceSumUsd: String(agentSum), // MVP stub
          })
          if (result.divergenceOverThreshold) {
            this.logger.warn(
              `Cost reconciliation divergence exceeded threshold: ${result.divergencePct}% for week ${result.weekStart}`,
            )
          }
        } catch (err) {
          this.logger.error('Weekly cost reconciliation failed', err)
          throw err
        }
      },
      { localConcurrency: 1 },
    )
  }
}
