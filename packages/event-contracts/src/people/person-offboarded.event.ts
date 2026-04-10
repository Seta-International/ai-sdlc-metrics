export class PersonOffboardedEvent {
  static readonly eventName = 'people.person-offboarded'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly effectiveDate: string,
  ) {}
}
