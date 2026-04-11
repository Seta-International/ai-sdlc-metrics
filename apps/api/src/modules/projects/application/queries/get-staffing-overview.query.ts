export class GetStaffingOverviewQuery {
  constructor(
    readonly tenantId: string,
    readonly startDate: Date,
    readonly endDate: Date,
  ) {}
}
