export class AssignmentChangedEvent {
  static readonly eventName = 'projects.assignment-changed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly projectId: string,
    public readonly role: string,
    public readonly effectiveDate: string,
  ) {}
}
