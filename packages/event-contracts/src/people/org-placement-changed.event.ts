export class OrgPlacementChangedEvent {
  static readonly eventName = 'people.org-placement-changed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly newManagerId: string,
    public readonly newDepartmentId: string,
  ) {}
}
