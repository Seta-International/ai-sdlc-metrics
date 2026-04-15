export class EmploymentTerminatedEvent {
  static readonly eventName = 'people.employment-terminated'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly actorId: string,
    public readonly terminationReason: string,
    public readonly terminationDate: Date,
  ) {}
}
