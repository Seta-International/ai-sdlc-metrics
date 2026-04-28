export class GetDirectReportsQuery {
  constructor(
    public readonly employmentId: string,
    public readonly tenantId: string,
  ) {}
}
