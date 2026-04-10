export class LeaveRejectedEvent {
  static readonly eventName = 'time.leave-rejected'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly leaveRequestId: string,
    public readonly reason: string,
  ) {}
}
