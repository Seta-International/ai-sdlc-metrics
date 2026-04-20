export type TrendRange = '7d' | '30d' | '90d'

export class GetTaskTrendsQuery {
  constructor(
    public readonly planId: string,
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly range: TrendRange,
  ) {}
}
