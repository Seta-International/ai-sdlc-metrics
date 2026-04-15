export class ListExpiringDocumentsQuery {
  constructor(
    readonly tenantId: string,
    readonly daysAhead: number,
  ) {}
}
