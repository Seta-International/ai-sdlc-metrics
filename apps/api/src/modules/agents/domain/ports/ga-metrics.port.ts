/**
 * ga-metrics.port.ts — Plan 13 Task 5
 *
 * Port for platform-level GA-readiness metrics:
 *   - tenant count (must be >= 3 to gate GA)
 *   - interactive turns/day (must be >= 1000 to gate GA)
 *
 * At MVP this is fulfilled by StubGaMetrics. Replace with a real
 * adapter (e.g. Athena / CloudWatch query) once the metrics backend is live.
 */

export interface GaMetricsPort {
  /** Returns false when the GA metrics backend is not yet deployed. Gate calls with this. */
  isEnabled(): boolean
  getTenantCount(): Promise<number>
  getInteractiveTurnsPerDay(): Promise<number>
}

export const GA_METRICS_PORT = Symbol('GA_METRICS_PORT')
