import { Injectable } from '@nestjs/common'
import type { GaMetricsPort } from '../../domain/ports/ga-metrics.port'

/**
 * MVP stub for GaMetricsPort.
 * Returns 0 for both tenant count and interactive turns/day.
 * Replace with a real adapter (Athena / CloudWatch) once the metrics backend is live.
 */
@Injectable()
export class StubGaMetrics implements GaMetricsPort {
  async getTenantCount(): Promise<number> {
    return 0
  }

  async getInteractiveTurnsPerDay(): Promise<number> {
    return 0
  }
}
