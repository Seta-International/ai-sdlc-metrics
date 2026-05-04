import { Injectable } from '@nestjs/common'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { recordLeakCanary } from '../observability/observability-metrics'

export const LEAK_CANARY_JOB_NAME = 'observability-leak-canary'

/**
 * Synthetic canary marker stamped on synthetic turns (future use).
 * When a trace backend is wired, the canary scan will look for this value
 * to detect cross-tenant leaks in the trace store.
 */
export const CANARY_MARKER = 'obs-canary-marker'

/**
 * Daily scheduled pg-boss job that checks for cross-tenant trace leaks.
 *
 * Status: DEFERRED — Plan 07 §1 out-of-scope.
 *
 * The scan requires querying every tenant's trace-read surface for a
 * synthetic fixture-tenant span (carrying `canary_marker: true`). This
 * surface is provided by the trace backend exporter adapter, which has
 * not yet been selected or deployed (Plan 07 §17: "Trace backend selection,
 * deployment, and ops — deferred per CLAUDE.md").
 *
 * Runbook: when the trace backend is deployed, replace `run()` with:
 *   1. Emit a synthetic turn with `canary_marker: true` on the fixture tenant.
 *   2. Query the trace-read surface across all other tenants for any span
 *      carrying `canary_marker` or the fixture `tenant_id`.
 *   3. Non-zero match → `recordLeakCanary('leak_detected')` → P0 incident;
 *      disable the exporter read plane for investigation.
 *   4. No match → `recordLeakCanary('clean')`.
 *
 * Until then, this job records 'deferred' to make the gap visible in the
 * `agent_cross_tenant_leak_canary_total{result="deferred"}` counter rather
 * than silently recording 'clean' (which gave false confidence).
 */
@Injectable()
export class LeakCanaryScheduler {
  constructor(private readonly pgBossService: PgBossService) {}

  async registerJob(): Promise<void> {
    await this.pgBossService.schedule(LEAK_CANARY_JOB_NAME, '0 3 * * *') // 3am UTC daily
    this.pgBossService.registerScheduledWorker(LEAK_CANARY_JOB_NAME, async () => this.run())
  }

  async run(): Promise<void> {
    // Scan is deferred until the trace backend exporter adapter is deployed.
    // Recording 'deferred' keeps the gap observable in dashboards.
    // See class-level JSDoc for the runbook to implement the real scan.
    recordLeakCanary('deferred')
  }
}
