export class StaffingRequestCreatedEvent {
  static readonly eventName = 'projects.staffing-request-created'
  constructor(
    public readonly tenantId: string,
    public readonly projectRoleId: string,
    public readonly projectId: string,
    public readonly roleName: string,
    public readonly skillsRequired: string[],
  ) {}
}
