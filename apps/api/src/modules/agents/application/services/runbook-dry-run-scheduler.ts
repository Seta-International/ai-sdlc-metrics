import { Inject, Injectable } from '@nestjs/common'
import {
  RUNBOOK_DRY_RUN_REPOSITORY,
  type RunbookDryRunRepository,
  type RunbookId,
  type RunbookOutcome,
  type RunbookCoverageStatus,
} from '../../domain/repositories/runbook-dry-run.repository'

const ALL_RUNBOOK_IDS: ReadonlySet<RunbookId> = new Set<RunbookId>([
  'provider_outage',
  'budget_exhaustion_midflight',
  'quality_canary_degradation',
  'cross_tenant_leak_alert',
  'content_hash_store_miss',
  'adapter_dropped_cache_fields',
  'approval_inbox_flood',
  'gdpr_erasure_partial_success',
])

@Injectable()
export class RunbookDryRunScheduler {
  constructor(
    @Inject(RUNBOOK_DRY_RUN_REPOSITORY)
    private readonly runbookDryRunRepository: RunbookDryRunRepository,
  ) {}

  /**
   * Validates the runbookId and returns. Actual pg-boss job enqueueing is
   * deferred to Task 8.
   */
  async schedule(opts: {
    runbookId: RunbookId
    tenantId: string
    scheduledAt: Date
    assignedTo: string
  }): Promise<void> {
    if (!ALL_RUNBOOK_IDS.has(opts.runbookId)) {
      throw new Error(`unknown runbookId: ${opts.runbookId}`)
    }
    // scheduling mechanism wired in Task 8 (pg-boss)
    return Promise.resolve()
  }

  /**
   * Records a completed dry-run execution.
   */
  async logRun(opts: {
    runbookId: RunbookId
    tenantId: string
    executedBy: string
    outcome: RunbookOutcome
    timeToRecoveryMinutes?: number
    postMortemUrl?: string
  }): Promise<void> {
    await this.runbookDryRunRepository.insert({
      tenantId: opts.tenantId,
      runbookId: opts.runbookId,
      executedAt: new Date(),
      executedBy: opts.executedBy,
      outcome: opts.outcome,
      postMortemUrl: opts.postMortemUrl ?? null,
      timeToRecoveryMinutes: opts.timeToRecoveryMinutes ?? null,
    })
  }

  /**
   * Returns coverage status for all 8 runbooks within the lookback window.
   * Defaults to 180-day lookback for GA gate coverage when omitted.
   */
  async getCoverage(
    opts: {
      lookbackDays?: number
    } = {},
  ): Promise<Record<RunbookId, RunbookCoverageStatus>> {
    return this.runbookDryRunRepository.getCoverage({ lookbackDays: opts.lookbackDays ?? 180 })
  }
}
