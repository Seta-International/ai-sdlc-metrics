export interface MetricsQueryPort {
  /** Sum a counter metric over the window. Returns null if data unavailable. */
  sumCounter(opts: {
    metricName: string
    labels?: Record<string, string>
    window: { start: Date; end: Date }
  }): Promise<number | null>
}
export const METRICS_QUERY_PORT = Symbol('METRICS_QUERY_PORT')
