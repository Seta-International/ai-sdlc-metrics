export class KpiScoreSubmittedEvent {
  static readonly eventName = 'goals.kpi-score-submitted'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly kpiId: string,
    public readonly score: number,
    public readonly period: string,
  ) {}
}
