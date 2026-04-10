export class LeaveApprovedEvent {
  static readonly eventName = 'time.leave-approved'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly leaveRequestId: string,
    public readonly from: string,
    public readonly to: string,
  ) {}
}
