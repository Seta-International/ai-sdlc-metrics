export class ExportAuditLogQuery {
  constructor(
    readonly tenantId: string,
    readonly actorId?: string,
    readonly eventType?: string,
    readonly module?: string,
    readonly dateFrom?: Date,
    readonly dateTo?: Date,
  ) {}
}
