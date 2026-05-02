import { Inject, Injectable } from '@nestjs/common'
import {
  COST_RECONCILIATION_REPOSITORY,
  type CostReconciliationRepository,
  type CostReconciliationEntity,
} from '../../domain/repositories/cost-reconciliation.repository'

/** Alert when divergence exceeds 2%. */
const DIVERGENCE_THRESHOLD_PCT = 2

@Injectable()
export class CostReconciliationJob {
  constructor(
    @Inject(COST_RECONCILIATION_REPOSITORY)
    private readonly repo: CostReconciliationRepository,
  ) {}

  /**
   * Runs the weekly cost reconciliation between internal cost events and
   * vendor invoices. Persists the result and sets `divergenceOverThreshold`
   * when the divergence exceeds 2%.
   *
   * The caller (Task 8 worker) is responsible for fetching `agent_cost_event`
   * totals and vendor invoice data before invoking this method — the sums are
   * passed in as string arguments and this method only computes and persists.
   * The caller is also responsible for logging a warning when
   * `divergenceOverThreshold` is true.
   */
  async runWeekly(opts: {
    weekStart: string
    agentCostEventSumUsd: string
    vendorInvoiceSumUsd: string
  }): Promise<CostReconciliationEntity> {
    const agentSum = Number(opts.agentCostEventSumUsd)
    const vendorSum = Number(opts.vendorInvoiceSumUsd)

    // |agent - vendor| / vendor * 100; guard division-by-zero
    const divergencePct = vendorSum === 0 ? 0 : (Math.abs(agentSum - vendorSum) / vendorSum) * 100
    const divergenceOverThreshold = divergencePct > DIVERGENCE_THRESHOLD_PCT

    const rec = await this.repo.insert({
      weekStart: opts.weekStart,
      agentCostEventSumUsd: opts.agentCostEventSumUsd,
      vendorInvoiceSumUsd: opts.vendorInvoiceSumUsd,
      divergencePct: divergencePct.toFixed(4),
      divergenceOverThreshold,
      computedAt: new Date(),
    })

    return rec
  }

  /**
   * Returns true if the most recent reconciliation row has
   * `divergenceOverThreshold = true`. Used by the Task 8 worker to gate alerts.
   */
  async checkLastWeekAlert(): Promise<boolean> {
    const recent = await this.repo.findRecent({ limit: 1 })
    return recent[0]?.divergenceOverThreshold ?? false
  }
}
