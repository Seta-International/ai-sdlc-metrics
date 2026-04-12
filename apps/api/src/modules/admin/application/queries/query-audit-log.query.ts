export class QueryAuditLogQuery {
  constructor(
    readonly tenantId: string,
    readonly actorId?: string,
    readonly eventType?: string,
    readonly module?: string,
    readonly dateFrom?: Date,
    readonly dateTo?: Date,
    readonly limit: number = 50,
    readonly offset: number = 0,
  ) {}
}
