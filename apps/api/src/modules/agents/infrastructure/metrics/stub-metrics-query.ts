import { Injectable } from '@nestjs/common'
import type { MetricsQueryPort } from '../../domain/ports/metrics-query.port'

/**
 * Explicit-disabled stub for MetricsQueryPort.
 * The metrics backend is not yet deployed — Phase 2 will replace this with
 * a real Prometheus/OTel adapter.
 *
 * Consumers MUST call isEnabled() before invoking query methods.
 *
 * DEFERRED: emit `metrics_query_disabled_invocation_total` counter on blocked
 * calls. Skipped today because the metrics backend that would receive the
 * counter is the same backend this stub stands in for (chicken-and-egg).
 * Wire the counter when the real adapter replaces this stub.
 */
@Injectable()
export class StubMetricsQuery implements MetricsQueryPort {
  isEnabled(): boolean {
    return false
  }

  async sumCounter(): Promise<number | null> {
    throw new Error('MetricsQueryPort is disabled — backend not yet deployed')
  }
}
