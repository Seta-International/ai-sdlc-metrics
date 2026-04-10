export class PersonHiredEvent {
  static readonly eventName = 'people.person-hired'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly employmentId: string,
    public readonly effectiveDate: string,
  ) {}
}
