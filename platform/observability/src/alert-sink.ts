export type AlertSeverity = 'info' | 'warning' | 'critical'

export type AlertInput = {
  severity: AlertSeverity
  summary: string
  details?: Record<string, unknown>
  tenantId?: string
  connectorId?: string
}

export interface AlertSink {
  alert(input: AlertInput): Promise<void>
}

/** Fan-out to N sinks; per-sink errors logged but not thrown. */
export class MultiSink implements AlertSink {
  constructor(
    private sinks: AlertSink[],
    private logger?: { warn(o: unknown, msg: string): void },
  ) {}
  async alert(input: AlertInput): Promise<void> {
    const results = await Promise.allSettled(this.sinks.map((s) => s.alert(input)))
    for (const r of results) {
      if (r.status === 'rejected') this.logger?.warn({ err: r.reason }, 'alert sink failed')
    }
  }
}
