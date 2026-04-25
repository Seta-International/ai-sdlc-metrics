import { Injectable } from '@nestjs/common'
import type { MetricsQueryPort } from '../../domain/ports/metrics-query.port'

/**
 * MVP stub for MetricsQueryPort.
 * Returns null (unable to evaluate) for all queries.
 * Replace with a real Prometheus/OTel adapter once the metrics backend is live.
 */
@Injectable()
export class StubMetricsQuery implements MetricsQueryPort {
  async sumCounter(): Promise<number | null> {
    return null
  }
}
