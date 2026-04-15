export class EmploymentActivatedEvent {
  static readonly eventName = 'people.employment-activated'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly actorId: string,
    public readonly effectiveDate: Date,
  ) {}
}
