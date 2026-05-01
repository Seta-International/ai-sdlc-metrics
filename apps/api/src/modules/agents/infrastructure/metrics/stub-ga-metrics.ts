import { Injectable } from '@nestjs/common'
import type { GaMetricsPort } from '../../domain/ports/ga-metrics.port'

/**
 * Explicit-disabled stub for GaMetricsPort.
 * The GA metrics backend is not yet deployed — Phase 2 will replace this with
 * a real adapter (Athena / CloudWatch).
 *
 * Consumers MUST call isEnabled() before invoking query methods.
 *
 * DEFERRED: emit `ga_metrics_disabled_invocation_total` counter on blocked
 * calls. Skipped today because the metrics backend that would receive the
 * counter is itself disabled (see StubMetricsQuery). Wire the counter when
 * the metrics adapter ships.
 */
@Injectable()
export class StubGaMetrics implements GaMetricsPort {
  isEnabled(): boolean {
    return false
  }

  async getTenantCount(): Promise<number> {
    throw new Error('GaMetricsPort is disabled — backend not yet deployed')
  }

  async getInteractiveTurnsPerDay(): Promise<number> {
    throw new Error('GaMetricsPort is disabled — backend not yet deployed')
  }
}
