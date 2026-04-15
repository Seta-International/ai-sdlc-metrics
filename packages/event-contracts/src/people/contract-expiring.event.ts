export class ContractExpiringEvent {
  static readonly eventName = 'people.contract-expiring'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly contractVersionId: string,
    public readonly endDate: Date,
    public readonly daysRemaining: number,
  ) {}
}
