export class ContractVersionCreatedEvent {
  static readonly eventName = 'people.contract-version-created'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly contractVersionId: string,
    public readonly contractType: string,
    public readonly startDate: Date,
    public readonly endDate: Date | null,
    public readonly baseSalary: number | null,
    public readonly salaryCurrency: string | null,
  ) {}
}
