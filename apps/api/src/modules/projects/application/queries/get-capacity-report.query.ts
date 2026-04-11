export class GetCapacityReportQuery {
  constructor(
    readonly tenantId: string,
    readonly startDate: Date,
    readonly endDate: Date,
  ) {}
}
