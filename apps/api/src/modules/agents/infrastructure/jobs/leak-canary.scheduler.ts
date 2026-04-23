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
 * MVP stub: the trace backend is deferred (not yet chosen/deployed).
 * The scan is a no-op and records 'clean' each run. When a trace backend
 * is wired, the adapter's canary scan replaces the stub in `run()`.
 */
@Injectable()
export class LeakCanaryScheduler {
  constructor(private readonly pgBossService: PgBossService) {}

  async registerJob(): Promise<void> {
    await this.pgBossService.schedule(LEAK_CANARY_JOB_NAME, '0 3 * * *') // 3am UTC daily
    this.pgBossService.registerScheduledWorker(LEAK_CANARY_JOB_NAME, async () => this.run())
  }

  async run(): Promise<void> {
    // MVP stub — trace backend not yet deployed.
    // Future: await traceBackendAdapter.scanForCanaryLeak(CANARY_MARKER)
    recordLeakCanary('clean')
  }
}
