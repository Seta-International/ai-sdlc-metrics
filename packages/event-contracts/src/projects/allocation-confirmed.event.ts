export class AllocationConfirmedEvent {
  static readonly eventName = 'projects.allocation-confirmed'
  constructor(
    public readonly tenantId: string,
    public readonly allocationId: string,
    public readonly actorId: string,
    public readonly projectId: string,
    public readonly hoursPerDay: number,
  ) {}
}
