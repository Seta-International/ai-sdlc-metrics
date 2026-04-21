export class TerminationInitiatedEvent {
  static readonly eventName = 'people.termination.initiated'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly profileId: string,
    public readonly actorId: string,
    public readonly terminationDate: Date,
    public readonly terminationReason: string,
    public readonly initiatedBy: string,
  ) {}
}
