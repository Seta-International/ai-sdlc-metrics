/**
 * runbook-dry-run.repository.ts — Plan 13 Task 2
 *
 * Domain repository interface for operator dry-run executions of production runbooks.
 * Covers the 8 mandatory runbooks tracked by the GA readiness harness.
 */

export type RunbookId =
  | 'provider_outage'
  | 'budget_exhaustion_midflight'
  | 'quality_canary_degradation'
  | 'cross_tenant_leak_alert'
  | 'content_hash_store_miss'
  | 'adapter_dropped_cache_fields'
  | 'approval_inbox_flood'
  | 'gdpr_erasure_partial_success'

export type RunbookOutcome = 'pass' | 'pass_with_notes' | 'fail'

export interface RunbookDryRunEntity {
  id: string
  tenantId: string
  runbookId: RunbookId
  executedAt: Date
  executedBy: string
  outcome: RunbookOutcome
  postMortemUrl: string | null
  timeToRecoveryMinutes: number | null
}

export type RunbookCoverageStatus = { lastPassAt: Date | null; passCount: number }

export interface RunbookDryRunRepository {
  insert(run: Omit<RunbookDryRunEntity, 'id'>): Promise<RunbookDryRunEntity>
  findByRunbookId(runbookId: RunbookId, opts?: { limit?: number }): Promise<RunbookDryRunEntity[]>
  getLastPassByRunbookId(runbookId: RunbookId): Promise<RunbookDryRunEntity | null>
  /**
   * For each of the 8 known runbook IDs, count rows in the lookback window where
   * outcome is 'pass' or 'pass_with_notes', and find the most recent such row.
   */
  getCoverage(opts: { lookbackDays: number }): Promise<Record<RunbookId, RunbookCoverageStatus>>
}

export const RUNBOOK_DRY_RUN_REPOSITORY = Symbol('RUNBOOK_DRY_RUN_REPOSITORY')
