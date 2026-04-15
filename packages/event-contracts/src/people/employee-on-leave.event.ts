export class EmployeeOnLeaveEvent {
  static readonly eventName = 'people.employee-on-leave'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly leaveType: string,
    public readonly expectedReturnDate: Date,
  ) {}
}
