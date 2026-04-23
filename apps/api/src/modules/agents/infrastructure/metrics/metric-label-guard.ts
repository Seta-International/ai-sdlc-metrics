export const DEFAULT_BLOCKED_LABELS: readonly string[] = [
  'user_id',
  'conversation_id',
  'trace_id',
  'delegation_id',
  'schedule_id',
]

export class MetricCardinalityError extends Error {
  constructor(offending: string[]) {
    super(`Metric cardinality violation: blocked labels detected: ${offending.join(', ')}`)
    this.name = 'MetricCardinalityError'
  }
}

export class MetricLabelGuard {
  static sanitize(
    labels: Record<string, string>,
    blocked: readonly string[] = DEFAULT_BLOCKED_LABELS,
  ): Record<string, string> {
    const blockedSet = new Set(blocked)
    return Object.fromEntries(Object.entries(labels).filter(([key]) => !blockedSet.has(key)))
  }

  static hasBlockedLabel(
    labels: Record<string, string>,
    blocked: readonly string[] = DEFAULT_BLOCKED_LABELS,
  ): boolean {
    const blockedSet = new Set(blocked)
    return Object.keys(labels).some((key) => blockedSet.has(key))
  }

  static assertNoBlockedLabels(
    labels: Record<string, string>,
    blocked: readonly string[] = DEFAULT_BLOCKED_LABELS,
  ): void {
    const blockedSet = new Set(blocked)
    const offending = Object.keys(labels).filter((key) => blockedSet.has(key))
    if (offending.length > 0) {
      throw new MetricCardinalityError(offending)
    }
  }
}
